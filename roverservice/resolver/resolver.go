// Package resolver implements a lightweight concurrent DNS resolver.
// Supports DoH, DoT, TCP, and UDP upstreams with SOCKS5 proxy support.
//
// Design:
//   - Multiple upstreams queried concurrently
//   - Returns the first successful response
//   - Each upstream can use direct or proxy (SOCKS5) connection
//   - No system DNS dependency → no DNS loops
//   - Bootstrap and Fallback also support multiple protocols
package resolver

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"io"
	"math/big"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/miekg/dns"
	"golang.org/x/net/proxy"
)

// ---------------------------------------------------------------
// Dialer abstraction
// ---------------------------------------------------------------

// Dialer establishes network connections (direct or through proxy).
type Dialer interface {
	DialContext(ctx context.Context, network, address string) (net.Conn, error)
}

// directDialer connects directly to the target using pre-resolved IP.
type directDialer struct {
	d *net.Dialer
}

func newDirectDialer() Dialer {
	return &directDialer{d: &net.Dialer{Timeout: 10 * time.Second}}
}

func (dd *directDialer) DialContext(ctx context.Context, network, address string) (net.Conn, error) {
	return dd.d.DialContext(ctx, network, address)
}

// socks5Dialer connects through a SOCKS5 proxy.
type socks5Dialer struct {
	forward proxy.Dialer
}

func newSocks5Dialer(proxyAddr, user, pass string) (Dialer, error) {
	var auth *proxy.Auth
	if user != "" {
		auth = &proxy.Auth{User: user, Password: pass}
	}
	d, err := proxy.SOCKS5("tcp", proxyAddr, auth, &net.Dialer{Timeout: 10 * time.Second})
	if err != nil {
		return nil, fmt.Errorf("socks5: %w", err)
	}
	return &socks5Dialer{forward: d}, nil
}

func (sd *socks5Dialer) DialContext(ctx context.Context, network, address string) (net.Conn, error) {
	type res struct {
		c   net.Conn
		err error
	}
	ch := make(chan res, 1)
	go func() {
		c, err := sd.forward.Dial(network, address)
		ch <- res{c: c, err: err}
	}()
	select {
	case r := <-ch:
		return r.c, r.err
	case <-ctx.Done():
		go func() {
			if r := <-ch; r.c != nil {
				r.c.Close()
			}
		}()
		return nil, ctx.Err()
	}
}

// ---------------------------------------------------------------
// Address parsing
// ---------------------------------------------------------------

// AddrInfo holds parsed protocol information from a DNS server address string.
type AddrInfo struct {
	Protocol string // "udp", "tcp", "tls", "https"
	Host     string // hostname or IP
	Port     string // port number
	Path     string // URL path (only for https)
}

// parseUpstreamAddr parses a DNS server address string into its protocol components.
//
// Supported formats:
//   - "8.8.8.8"                       → udp, 8.8.8.8, 53
//   - "8.8.8.8:53"                    → udp, 8.8.8.8, 53
//   - "udp://8.8.8.8:53"              → udp, 8.8.8.8, 53
//   - "tcp://8.8.8.8"                 → tcp, 8.8.8.8, 53
//   - "tcp://8.8.8.8:53"              → tcp, 8.8.8.8, 53
//   - "tls://dns.google"              → tls, dns.google, 853
//   - "tls://dns.google:853"          → tls, dns.google, 853
//   - "https://dns.google/dns-query"  → https, dns.google, 443, /dns-query
//   - "https://8.8.8.8/dns-query"    → https, 8.8.8.8, 443, /dns-query
func parseUpstreamAddr(addr string) AddrInfo {
	addr = strings.TrimSpace(addr)
	info := AddrInfo{}

	// https:// → DoH
	if strings.HasPrefix(addr, "https://") {
		info.Protocol = "https"
		parsed, err := url.Parse(addr)
		if err != nil {
			info.Host = addr
			info.Port = "443"
			info.Path = "/dns-query"
			return info
		}
		info.Host = parsed.Hostname()
		info.Port = parsed.Port()
		if info.Port == "" {
			info.Port = "443"
		}
		info.Path = parsed.Path
		if info.Path == "" {
			info.Path = "/dns-query"
		}
		return info
	}

	// tls:// → DoT
	if strings.HasPrefix(addr, "tls://") {
		info.Protocol = "tls"
		rest := strings.TrimPrefix(addr, "tls://")
		host, port, err := net.SplitHostPort(rest)
		if err != nil {
			info.Host = rest
			info.Port = "853"
		} else {
			info.Host = host
			info.Port = port
		}
		return info
	}

	// tcp:// → TCP
	if strings.HasPrefix(addr, "tcp://") {
		info.Protocol = "tcp"
		rest := strings.TrimPrefix(addr, "tcp://")
		host, port, err := net.SplitHostPort(rest)
		if err != nil {
			info.Host = rest
			info.Port = "53"
		} else {
			info.Host = host
			info.Port = port
		}
		return info
	}

	// udp:// → explicit UDP
	if strings.HasPrefix(addr, "udp://") {
		info.Protocol = "udp"
		rest := strings.TrimPrefix(addr, "udp://")
		host, port, err := net.SplitHostPort(rest)
		if err != nil {
			info.Host = rest
			info.Port = "53"
		} else {
			info.Host = host
			info.Port = port
		}
		return info
	}

	// Plain IP or IP:port → default UDP
	info.Protocol = "udp"
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		info.Host = addr
		info.Port = "53"
	} else {
		info.Host = host
		info.Port = port
	}
	return info
}

// isIPAddr returns true if the host part is a raw IP address (not a domain).
func isIPAddr(host string) bool {
	return net.ParseIP(host) != nil
}

// ---------------------------------------------------------------
// Upstream interface
// ---------------------------------------------------------------

// upstream is the common interface for all DNS upstream types.
type upstream interface {
	exchange(ctx context.Context, req *dns.Msg) (*dns.Msg, error)
	String() string
}

// ---------------------------------------------------------------
// DoH upstream (https://)
// ---------------------------------------------------------------

// UpstreamConfig defines one DoH upstream.
type UpstreamConfig struct {
	URL       string `json:"url"`        // e.g. "https://cloudflare-dns.com/dns-query"
	Proxy     string `json:"proxy"`      // proxy type: "" | "socks5"
	ProxyAddr string `json:"proxy_addr"` // e.g. "127.0.0.1:1080"
	ProxyUser string `json:"proxy_user"`
	ProxyPass string `json:"proxy_pass"`
	Timeout   int    `json:"timeout"` // milliseconds, 0 = 10000
	// dialAddr is the address passed to DialContext.
	// For DIRECT mode: IP:port (pre-resolved via bootstrap DNS).
	// For SOCKS5 mode: empty (uses URL hostname, proxy does remote resolve).
	DialAddr string `json:"-"`
}

// dohUpstream is a single DoH upstream with its own HTTP client.
type dohUpstream struct {
	url    string
	client *http.Client
}

func newDoHUpstream(cfg UpstreamConfig) (*dohUpstream, error) {
	if cfg.URL == "" {
		return nil, fmt.Errorf("upstream URL is required")
	}
	timeout := time.Duration(cfg.Timeout) * time.Millisecond
	if timeout == 0 {
		timeout = 3000 * time.Millisecond
	}

	// Parse URL to extract hostname for TLS SNI
	parsedURL, err := url.Parse(cfg.URL)
	if err != nil {
		return nil, fmt.Errorf("invalid upstream URL: %w", err)
	}
	hostname := parsedURL.Hostname()

	// Build dialer
	var dialer Dialer
	switch cfg.Proxy {
	case "socks5":
		var err error
		dialer, err = newSocks5Dialer(cfg.ProxyAddr, cfg.ProxyUser, cfg.ProxyPass)
		if err != nil {
			return nil, err
		}
	default:
		dialer = newDirectDialer()
	}

	// Build HTTP client with custom transport using the dialer
	tlsConfig := &tls.Config{
		InsecureSkipVerify: false,
		ServerName:         hostname,
	}
	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			if cfg.DialAddr != "" {
				return dialer.DialContext(ctx, network, cfg.DialAddr)
			}
			return dialer.DialContext(ctx, network, address)
		},
		TLSClientConfig:    tlsConfig,
		MaxIdleConns:       10,
		IdleConnTimeout:    30 * time.Second,
		DisableCompression: true,
	}

	client := &http.Client{
		Transport: transport,
		Timeout:   timeout,
	}

	return &dohUpstream{
		url:    cfg.URL,
		client: client,
	}, nil
}

func (u *dohUpstream) exchange(ctx context.Context, req *dns.Msg) (*dns.Msg, error) {
	start := time.Now()

	pack, err := req.Pack()
	if err != nil {
		logf("[DNS Resolver] Upstream %s: pack error in %s: %v", u.url, time.Since(start), err)
		return nil, fmt.Errorf("pack: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", u.url, bytes.NewReader(pack))
	if err != nil {
		logf("[DNS Resolver] Upstream %s: create request error in %s: %v", u.url, time.Since(start), err)
		return nil, fmt.Errorf("http request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/dns-message")
	httpReq.Header.Set("Accept", "application/dns-message")

	logf("[DNS Resolver] Upstream %s: sending query...", u.url)
	httpResp, err := u.client.Do(httpReq)
	if err != nil {
		logf("[DNS Resolver] Upstream %s: HTTP error in %s: %v", u.url, time.Since(start), err)
		return nil, fmt.Errorf("http do: %w", err)
	}
	defer httpResp.Body.Close()

	if httpResp.StatusCode != http.StatusOK {
		logf("[DNS Resolver] Upstream %s: HTTP status %d in %s", u.url, httpResp.StatusCode, time.Since(start))
		return nil, fmt.Errorf("http status %d", httpResp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(httpResp.Body, 65535))
	if err != nil {
		logf("[DNS Resolver] Upstream %s: read body error in %s: %v", u.url, time.Since(start), err)
		return nil, fmt.Errorf("read body: %w", err)
	}

	resp := new(dns.Msg)
	if err := resp.Unpack(body); err != nil {
		logf("[DNS Resolver] Upstream %s: unpack error in %s: %v", u.url, time.Since(start), err)
		return nil, fmt.Errorf("unpack: %w", err)
	}

	logf("[DNS Resolver] Upstream %s: success in %s (rcode=%s, answers=%d)",
		u.url, time.Since(start), dns.RcodeToString[resp.Rcode], len(resp.Answer))
	return resp, nil
}

func (u *dohUpstream) String() string { return u.url }

// ---------------------------------------------------------------
// Plain upstream (UDP / TCP)
// ---------------------------------------------------------------

// plainUpstream handles UDP and TCP DNS queries.
type plainUpstream struct {
	addr    string // IP:port for direct, or host:port for SOCKS5
	network string // "udp" or "tcp"
	tag     string // display string
	dialer  Dialer // nil means use miekg/dns Client directly
}

func newPlainUpstream(info AddrInfo, dialer Dialer) *plainUpstream {
	network := info.Protocol // "udp" or "tcp"
	if network != "tcp" {
		network = "udp"
	}
	addr := net.JoinHostPort(info.Host, info.Port)
	tag := fmt.Sprintf("%s://%s", network, addr)

	return &plainUpstream{
		addr:    addr,
		network: network,
		tag:     tag,
		dialer:  dialer,
	}
}

func (u *plainUpstream) exchange(ctx context.Context, req *dns.Msg) (*dns.Msg, error) {
	start := time.Now()

	// For directDialer + UDP: use miekg/dns Client natively (no TCP wrapping)
	// For directDialer + TCP: use miekg/dns Client natively (efficient)
	// For socks5Dialer (any network): go through SOCKS5 TCP tunnel
	if _, ok := u.dialer.(*socks5Dialer); ok {
		// SOCKS5 CONNECT gives us a TCP stream, so always use "tcp" network
		conn, err := u.dialer.DialContext(ctx, "tcp", u.addr)
		if err != nil {
			logf("[DNS Resolver] Upstream %s: dial error in %s: %v", u.tag, time.Since(start), err)
			return nil, fmt.Errorf("dial %s: %w", u.tag, err)
		}
		defer conn.Close()

		dnsConn := &dns.Conn{Conn: conn}
		defer dnsConn.Close()

		if err := dnsConn.WriteMsg(req); err != nil {
			logf("[DNS Resolver] Upstream %s: write error in %s: %v", u.tag, time.Since(start), err)
			return nil, fmt.Errorf("write %s: %w", u.tag, err)
		}

		resp, err := dnsConn.ReadMsg()
		if err != nil {
			logf("[DNS Resolver] Upstream %s: read error in %s: %v", u.tag, time.Since(start), err)
			return nil, fmt.Errorf("read %s: %w", u.tag, err)
		}

		logf("[DNS Resolver] Upstream %s: success in %s (rcode=%s, answers=%d)",
			u.tag, time.Since(start), dns.RcodeToString[resp.Rcode], len(resp.Answer))
		return resp, nil
	}

	// Direct mode (dialer is nil or directDialer): use miekg/dns Client
	client := &dns.Client{
		Net:     u.network,
		Timeout: 5 * time.Second,
	}
	resp, _, err := client.ExchangeContext(ctx, req, u.addr)
	if err != nil {
		logf("[DNS Resolver] Upstream %s: query error in %s: %v", u.tag, time.Since(start), err)
		return nil, fmt.Errorf("query %s: %w", u.tag, err)
	}

	logf("[DNS Resolver] Upstream %s: success in %s (rcode=%s, answers=%d)",
		u.tag, time.Since(start), dns.RcodeToString[resp.Rcode], len(resp.Answer))
	return resp, nil
}

func (u *plainUpstream) String() string { return u.tag }

// ---------------------------------------------------------------
// TLS upstream (DoT)
// ---------------------------------------------------------------

// tlsUpstream handles DNS over TLS (DoT) queries.
type tlsUpstream struct {
	addr    string // IP:port for direct, or host:port for SOCKS5
	host    string // hostname for TLS SNI
	port    string // port string
	tag     string // display string
	dialer  Dialer // nil means use direct connection
	timeout time.Duration
}

func newTLSUpstream(info AddrInfo, dialer Dialer, timeout time.Duration) *tlsUpstream {
	addr := net.JoinHostPort(info.Host, info.Port)
	tag := fmt.Sprintf("tls://%s:%s", info.Host, info.Port)

	return &tlsUpstream{
		addr:    addr,
		host:    info.Host,
		port:    info.Port,
		tag:     tag,
		dialer:  dialer,
		timeout: timeout,
	}
}

func (u *tlsUpstream) exchange(ctx context.Context, req *dns.Msg) (*dns.Msg, error) {
	start := time.Now()

	var conn net.Conn
	var err error

	if u.dialer != nil {
		// Use custom dialer (supports SOCKS5 proxy)
		conn, err = u.dialer.DialContext(ctx, "tcp", u.addr)
		if err != nil {
			logf("[DNS Resolver] Upstream %s: dial error in %s: %v", u.tag, time.Since(start), err)
			return nil, fmt.Errorf("dial %s: %w", u.tag, err)
		}
	} else {
		// Direct TLS connection
		dialer := &net.Dialer{Timeout: u.timeout}
		conn, err = dialer.DialContext(ctx, "tcp", u.addr)
		if err != nil {
			logf("[DNS Resolver] Upstream %s: dial error in %s: %v", u.tag, time.Since(start), err)
			return nil, fmt.Errorf("dial %s: %w", u.tag, err)
		}
	}

	// Wrap in TLS
	tlsConn := tls.Client(conn, &tls.Config{
		ServerName:         u.host,
		InsecureSkipVerify: false,
	})
	defer tlsConn.Close()

	if err := tlsConn.HandshakeContext(ctx); err != nil {
		conn.Close()
		logf("[DNS Resolver] Upstream %s: TLS handshake error in %s: %v", u.tag, time.Since(start), err)
		return nil, fmt.Errorf("tls handshake %s: %w", u.tag, err)
	}

	// Send DNS query over TLS
	dnsConn := &dns.Conn{Conn: tlsConn}
	defer dnsConn.Close()

	if err := dnsConn.WriteMsg(req); err != nil {
		logf("[DNS Resolver] Upstream %s: write error in %s: %v", u.tag, time.Since(start), err)
		return nil, fmt.Errorf("write %s: %w", u.tag, err)
	}

	resp, err := dnsConn.ReadMsg()
	if err != nil {
		logf("[DNS Resolver] Upstream %s: read error in %s: %v", u.tag, time.Since(start), err)
		return nil, fmt.Errorf("read %s: %w", u.tag, err)
	}

	logf("[DNS Resolver] Upstream %s: success in %s (rcode=%s, answers=%d)",
		u.tag, time.Since(start), dns.RcodeToString[resp.Rcode], len(resp.Answer))
	return resp, nil
}

func (u *tlsUpstream) String() string { return u.tag }

// ---------------------------------------------------------------
// Bootstrap / Fallback DNS query (multi-protocol)
// ---------------------------------------------------------------

// dnsQuery sends a DNS query to a single server address.
// The addr format supports: IP:port (UDP), tcp://IP:port, tls://host:port, https://host/dns-query
// If bootstrapAddrs is provided, domain names in the server address are pre-resolved
// via bootstrap DNS to avoid system DNS dependency.
func dnsQuery(ctx context.Context, req *dns.Msg, addr string, timeout time.Duration, bootstrapAddrs []string) (*dns.Msg, error) {
	info := parseUpstreamAddr(addr)

	// Pre-resolve domain to IP via bootstrap DNS for direct connections
	// (same logic as buildUpstreamFromAddr for upstreams)
	if len(bootstrapAddrs) > 0 && !isIPAddr(info.Host) {
		switch info.Protocol {
		case "https":
			ip, err := resolveHost(info.Host, bootstrapAddrs)
			if err == nil {
				logf("[DNS Bootstrap] Fallback DIRECT mode: resolved %s -> %s (dial addr for DoH)", info.Host, ip)
				info.Host = ip
			} else {
				logf("[DNS Bootstrap] Fallback DIRECT mode: failed to resolve %s: %v", info.Host, err)
			}
		case "tls":
			ip, err := resolveHost(info.Host, bootstrapAddrs)
			if err == nil {
				logf("[DNS Bootstrap] Fallback DIRECT mode: resolved %s -> %s (dial addr for DoT)", info.Host, ip)
				info.Host = ip
			} else {
				logf("[DNS Bootstrap] Fallback DIRECT mode: failed to resolve %s: %v", info.Host, err)
			}
		case "tcp":
			ip, err := resolveHost(info.Host, bootstrapAddrs)
			if err == nil {
				logf("[DNS Bootstrap] Fallback DIRECT mode: resolved %s -> %s (dial addr for TCP)", info.Host, ip)
				info.Host = ip
			} else {
				logf("[DNS Bootstrap] Fallback DIRECT mode: failed to resolve %s: %v", info.Host, err)
			}
		default:
			// UDP
			ip, err := resolveHost(info.Host, bootstrapAddrs)
			if err == nil {
				logf("[DNS Bootstrap] Fallback DIRECT mode: resolved %s -> %s (dial addr for UDP)", info.Host, ip)
				info.Host = ip
			} else {
				logf("[DNS Bootstrap] Fallback DIRECT mode: failed to resolve %s: %v", info.Host, err)
			}
		}
	}

	// Extract original hostname for TLS SNI before we possibly replace info.Host with IP
	originalHost := info.Host

	switch info.Protocol {
	case "https":
		// DoH query
		pack, err := req.Pack()
		if err != nil {
			return nil, fmt.Errorf("pack: %w", err)
		}

		dohURL := addr
		if !strings.HasPrefix(dohURL, "https://") {
			dohURL = "https://" + dohURL
		}

		parsedURL, _ := url.Parse(dohURL)
		hostname := ""
		if parsedURL != nil {
			hostname = parsedURL.Hostname()
		}

		transport := &http.Transport{
			TLSClientConfig: &tls.Config{
				ServerName: hostname,
			},
		}
		client := &http.Client{Transport: transport, Timeout: timeout}

		httpReq, err := http.NewRequestWithContext(ctx, "POST", dohURL, bytes.NewReader(pack))
		if err != nil {
			return nil, fmt.Errorf("http request: %w", err)
		}
		httpReq.Header.Set("Content-Type", "application/dns-message")
		httpReq.Header.Set("Accept", "application/dns-message")

		httpResp, err := client.Do(httpReq)
		if err != nil {
			return nil, fmt.Errorf("http do: %w", err)
		}
		defer httpResp.Body.Close()

		if httpResp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("http status %d", httpResp.StatusCode)
		}

		body, err := io.ReadAll(io.LimitReader(httpResp.Body, 65535))
		if err != nil {
			return nil, fmt.Errorf("read body: %w", err)
		}

		resp := new(dns.Msg)
		if err := resp.Unpack(body); err != nil {
			return nil, fmt.Errorf("unpack: %w", err)
		}
		return resp, nil

	case "tls":
		// DoT query
		dialer := &net.Dialer{Timeout: timeout}
		conn, err := dialer.DialContext(ctx, "tcp", net.JoinHostPort(info.Host, info.Port))
		if err != nil {
			return nil, fmt.Errorf("dial: %w", err)
		}
		defer conn.Close()

		tlsConn := tls.Client(conn, &tls.Config{
			ServerName: originalHost,
		})
		defer tlsConn.Close()

		if err := tlsConn.HandshakeContext(ctx); err != nil {
			return nil, fmt.Errorf("tls handshake: %w", err)
		}

		dnsConn := &dns.Conn{Conn: tlsConn}
		defer dnsConn.Close()

		if err := dnsConn.WriteMsg(req); err != nil {
			return nil, fmt.Errorf("write: %w", err)
		}
		return dnsConn.ReadMsg()

	case "tcp":
		// TCP query
		client := &dns.Client{Net: "tcp", Timeout: timeout}
		resp, _, err := client.ExchangeContext(ctx, req, net.JoinHostPort(info.Host, info.Port))
		return resp, err

	default:
		// UDP query (default)
		client := &dns.Client{Net: "udp", Timeout: timeout}
		resp, _, err := client.ExchangeContext(ctx, req, net.JoinHostPort(info.Host, info.Port))
		return resp, err
	}
}

// ---------------------------------------------------------------
// Bootstrap DNS cache
// ---------------------------------------------------------------

// bootstrapCacheEntry holds a cached DNS resolution result.
type bootstrapCacheEntry struct {
	ip        string
	expiresAt time.Time
}

// bootstrapCache caches hostname→IP resolutions from bootstrap DNS
// to avoid repeated queries for the same hostname.
var (
	bsCache   = make(map[string]bootstrapCacheEntry)
	bsCacheMu sync.RWMutex
)

// Default TTL for bootstrap DNS cache entries (5 minutes).
const bootstrapCacheTTL = 5 * time.Minute

// getCachedIP returns a cached IP for the given hostname if it exists and hasn't expired.
func getCachedIP(hostname string) (string, bool) {
	bsCacheMu.RLock()
	defer bsCacheMu.RUnlock()

	entry, ok := bsCache[hostname]
	if !ok {
		return "", false
	}
	if time.Now().After(entry.expiresAt) {
		return "", false
	}
	return entry.ip, true
}

// setCachedIP stores a hostname→IP mapping in the bootstrap cache.
func setCachedIP(hostname, ip string, ttl time.Duration) {
	bsCacheMu.Lock()
	defer bsCacheMu.Unlock()

	bsCache[hostname] = bootstrapCacheEntry{
		ip:        ip,
		expiresAt: time.Now().Add(ttl),
	}
}

// plainDNSResolve resolves a hostname using bootstrap DNS servers.
// It does NOT use the system resolver, avoiding DNS loops.
func plainDNSResolve(hostname string, bootstrapAddrs []string, qtype uint16) (string, error) {
	if len(bootstrapAddrs) == 0 {
		return "", fmt.Errorf("no bootstrap DNS configured")
	}

	req := new(dns.Msg)
	req.SetQuestion(dns.Fqdn(hostname), qtype)
	req.RecursionDesired = true

	qtypeStr := dns.TypeToString[qtype]
	if qtypeStr == "" {
		qtypeStr = fmt.Sprintf("TYPE%d", qtype)
	}
	logf("[DNS Bootstrap] Resolving %s %s via %v", qtypeStr, hostname, bootstrapAddrs)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	for _, addr := range bootstrapAddrs {
		start := time.Now()
		resp, err := dnsQuery(ctx, req, addr, 3*time.Second, nil)
		if err != nil {
			logf("[DNS Bootstrap] %s: query failed in %s: %v", addr, time.Since(start), err)
			continue
		}
		if resp.Rcode != dns.RcodeSuccess {
			logf("[DNS Bootstrap] %s: rcode=%s in %s", addr, dns.RcodeToString[resp.Rcode], time.Since(start))
			continue
		}
		for _, ans := range resp.Answer {
			switch v := ans.(type) {
			case *dns.A:
				logf("[DNS Bootstrap] %s: resolved %s -> %s in %s", addr, hostname, v.A.String(), time.Since(start))
				return v.A.String(), nil
			case *dns.AAAA:
				logf("[DNS Bootstrap] %s: resolved %s -> %s in %s", addr, hostname, v.AAAA.String(), time.Since(start))
				return v.AAAA.String(), nil
			}
		}
		logf("[DNS Bootstrap] %s: no usable answer in %s", addr, time.Since(start))
	}
	return "", fmt.Errorf("bootstrap resolve failed for %s", hostname)
}

// resolveHost resolves a hostname to an IP address using bootstrap DNS.
// If the host is already an IP, returns it unchanged.
// Results are cached with a TTL to avoid repeated bootstrap queries.
func resolveHost(host string, bootstrapAddrs []string) (string, error) {
	if net.ParseIP(host) != nil {
		return host, nil
	}

	// Check cache first
	if ip, ok := getCachedIP(host); ok {
		logf("[DNS Bootstrap] Cache hit: %s -> %s", host, ip)
		return ip, nil
	}

	if len(bootstrapAddrs) == 0 {
		return "", fmt.Errorf("no bootstrap DNS to resolve %s", host)
	}

	ip, err := plainDNSResolve(host, bootstrapAddrs, dns.TypeA)
	if err != nil {
		ip, err = plainDNSResolve(host, bootstrapAddrs, dns.TypeAAAA)
		if err != nil {
			return "", fmt.Errorf("failed to resolve %s: %w", host, err)
		}
	}

	// Cache the result
	setCachedIP(host, ip, bootstrapCacheTTL)
	logf("[DNS Bootstrap] Cached: %s -> %s (TTL=%s)", host, ip, bootstrapCacheTTL)

	return ip, nil
}

// resolveDoHURL resolves the hostname in a DoH URL via bootstrap DNS,
// then returns an IP-based URL and the original hostname for SNI.
func resolveDoHURL(dohURL string, bootstrapAddrs []string) (resolvedURL, sniHost string, err error) {
	u, err := url.Parse(dohURL)
	if err != nil {
		return "", "", fmt.Errorf("invalid DoH URL: %w", err)
	}

	host := u.Hostname()
	port := u.Port()
	if port == "" {
		port = "443"
	}

	if net.ParseIP(host) != nil {
		return dohURL, "", nil
	}

	ip, err := resolveHost(host, bootstrapAddrs)
	if err != nil {
		return "", "", err
	}

	u.Host = net.JoinHostPort(ip, port)
	return u.String(), host, nil
}

// ---------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------

// Resolver performs concurrent DNS queries across multiple upstreams.
type Resolver struct {
	upstreams      []upstream // heterogeneous: DoH, DoT, TCP, UDP
	fallbackAddrs  []string   // fallback DNS addresses (any supported format)
	bootstrapAddrs []string   // bootstrap DNS addresses for resolving fallback hostnames
}

// ResolverOption configures optional resolver behavior.
type ResolverOption func(*Resolver)

// WithFallback sets fallback DNS addresses used when all upstreams fail.
func WithFallback(addrs []string) ResolverOption {
	return func(r *Resolver) {
		r.fallbackAddrs = addrs
	}
}

// WithBootstrap sets bootstrap DNS addresses for resolving fallback server hostnames.
func WithBootstrap(addrs []string) ResolverOption {
	return func(r *Resolver) {
		r.bootstrapAddrs = addrs
	}
}

// buildUpstreamFromAddr creates the appropriate upstream type based on the address format.
func buildUpstreamFromAddr(addr string, dialer Dialer, proxyType, proxyAddr, proxyUser, proxyPass string, bootstrapAddrs []string) (upstream, error) {
	info := parseUpstreamAddr(addr)

	switch info.Protocol {
	case "https":
		// DoH upstream
		cfg := UpstreamConfig{URL: addr}

		// Apply dialer settings if SOCKS5
		if proxyType == "socks5" {
			cfg.Proxy = "socks5"
			cfg.ProxyAddr = proxyAddr
			cfg.ProxyUser = proxyUser
			cfg.ProxyPass = proxyPass
		}

		// DIRECT mode: pre-resolve domain to IP via bootstrap DNS
		if _, ok := dialer.(*directDialer); ok && len(bootstrapAddrs) > 0 {
			if !isIPAddr(info.Host) {
				ip, err := resolveHost(info.Host, bootstrapAddrs)
				if err == nil {
					cfg.DialAddr = net.JoinHostPort(ip, info.Port)
					logf("[DNS Bootstrap] DIRECT mode: resolved %s -> %s (dial addr)", info.Host, cfg.DialAddr)
				} else {
					logf("[DNS Bootstrap] DIRECT mode: failed to resolve %s: %v", info.Host, err)
				}
			}
		}

		return newDoHUpstream(cfg)

	case "tls":
		// DoT upstream
		timeout := 10 * time.Second

		// DIRECT mode: pre-resolve domain to IP via bootstrap DNS for dialing
		if _, ok := dialer.(*directDialer); ok && !isIPAddr(info.Host) {
			if len(bootstrapAddrs) > 0 {
				ip, err := resolveHost(info.Host, bootstrapAddrs)
				if err == nil {
					logf("[DNS Bootstrap] DIRECT mode: resolved %s -> %s (dial addr for DoT)", info.Host, ip)
					// Store original host for SNI, use IP for dialing
					originalHost := info.Host
					info.Host = ip
					up := newTLSUpstream(info, dialer, timeout)
					up.host = originalHost // restore original hostname for SNI
					return up, nil
				}
				logf("[DNS Bootstrap] DIRECT mode: failed to resolve %s: %v", info.Host, err)
			}
		}

		// For SOCKS5: no pre-resolution needed (proxy resolves remotely)
		if _, ok := dialer.(*socks5Dialer); ok {
			logf("[DNS Bootstrap] SOCKS5 mode: skipping bootstrap for %s (proxy remote resolve)", addr)
		}

		return newTLSUpstream(info, dialer, timeout), nil

	case "tcp":
		// TCP upstream
		// DIRECT mode: pre-resolve domain to IP
		if _, ok := dialer.(*directDialer); ok && !isIPAddr(info.Host) {
			if len(bootstrapAddrs) > 0 {
				ip, err := resolveHost(info.Host, bootstrapAddrs)
				if err == nil {
					logf("[DNS Bootstrap] DIRECT mode: resolved %s -> %s (dial addr for TCP)", info.Host, ip)
					info.Host = ip
				} else {
					logf("[DNS Bootstrap] DIRECT mode: failed to resolve %s: %v", info.Host, err)
				}
			}
		}

		if _, ok := dialer.(*socks5Dialer); ok {
			logf("[DNS Bootstrap] SOCKS5 mode: skipping bootstrap for %s (proxy remote resolve)", addr)
		}

		return newPlainUpstream(info, dialer), nil

	default:
		// UDP upstream (default)
		// DIRECT mode: must use IP:port (UDP requires IP address)
		if _, ok := dialer.(*directDialer); ok && !isIPAddr(info.Host) {
			if len(bootstrapAddrs) > 0 {
				ip, err := resolveHost(info.Host, bootstrapAddrs)
				if err == nil {
					logf("[DNS Bootstrap] DIRECT mode: resolved %s -> %s (dial addr for UDP)", info.Host, ip)
					info.Host = ip
				} else {
					logf("[DNS Bootstrap] DIRECT mode: failed to resolve %s: %v", info.Host, err)
				}
			}
		}

		if _, ok := dialer.(*socks5Dialer); ok {
			logf("[DNS Bootstrap] SOCKS5 mode: skipping bootstrap for %s (proxy remote resolve)", addr)
		}

		return newPlainUpstream(info, dialer), nil
	}
}

// buildUpstreams creates upstream instances from raw address strings.
func buildUpstreams(addrs []string, proxyType, proxyAddr, proxyUser, proxyPass string, bootstrapAddrs []string) ([]upstream, error) {
	var upstreams []upstream

	// Build dialer
	var dialer Dialer
	switch proxyType {
	case "socks5":
		var err error
		dialer, err = newSocks5Dialer(proxyAddr, proxyUser, proxyPass)
		if err != nil {
			return nil, err
		}
	default:
		dialer = newDirectDialer()
	}

	for _, addr := range addrs {
		addr = strings.TrimSpace(addr)
		if addr == "" {
			continue
		}

		up, err := buildUpstreamFromAddr(addr, dialer, proxyType, proxyAddr, proxyUser, proxyPass, bootstrapAddrs)
		if err != nil {
			logf("[DNS Bootstrap] Failed to build upstream %s: %v", addr, err)
			continue
		}
		upstreams = append(upstreams, up)
	}

	logf("[DNS Bootstrap] Built %d upstream config(s)", len(upstreams))
	return upstreams, nil
}

// NewResolver creates a resolver from upstream addresses.
func NewResolver(upstreams []upstream, opts ...ResolverOption) (*Resolver, error) {
	if len(upstreams) == 0 {
		return nil, fmt.Errorf("at least one upstream is required")
	}

	r := &Resolver{upstreams: upstreams}
	for _, opt := range opts {
		opt(r)
	}
	return r, nil
}

// Lookup performs a concurrent DNS query.
// All upstreams are queried simultaneously; the first successful response wins.
// Remaining queries are cancelled via context.
// If all upstreams fail and fallback DNS is configured, it tries fallback.
func (r *Resolver) Lookup(ctx context.Context, req *dns.Msg) (*dns.Msg, error) {
	if len(r.upstreams) == 0 {
		return nil, fmt.Errorf("no upstreams")
	}

	// Log query name
	if len(req.Question) > 0 {
		q := req.Question[0]
		logf("[DNS Resolver] Lookup: %s %s (id=%d), %d upstream(s)",
			dns.TypeToString[q.Qtype], q.Name, req.Id, len(r.upstreams))
	}

	start := time.Now()
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	type result struct {
		resp     *dns.Msg
		err      error
		upstream string
	}
	ch := make(chan result, len(r.upstreams))

	for _, u := range r.upstreams {
		go func(up upstream) {
			resp, err := up.exchange(ctx, req)
			select {
			case ch <- result{resp: resp, err: err, upstream: up.String()}:
			case <-ctx.Done():
			}
		}(u)
	}

	// Wait for first success or all failures
	var lastErr error
	for i := 0; i < len(r.upstreams); i++ {
		select {
		case res := <-ch:
			if res.err == nil && res.resp != nil {
				logf("[DNS Resolver] First success from %s in %s, cancelling remaining",
					res.upstream, time.Since(start))
				cancel()
				return res.resp, nil
			}
			logf("[DNS Resolver] Upstream %s failed: %v", res.upstream, res.err)
			lastErr = res.err
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}

	logf("[DNS Resolver] All %d upstreams failed in %s", len(r.upstreams), time.Since(start))

	// All upstreams failed; try fallback DNS if configured
	if len(r.fallbackAddrs) > 0 {
		logf("[DNS Resolver] Trying fallback DNS: %v", r.fallbackAddrs)
		fallbackResp, fallbackErr := r.lookupFallback(ctx, req)
		if fallbackErr == nil && fallbackResp != nil {
			logf("[DNS Resolver] Fallback DNS succeeded in %s", time.Since(start))
			return fallbackResp, nil
		}
		logf("[DNS Resolver] Fallback DNS also failed: %v", fallbackErr)
		if lastErr == nil {
			lastErr = fallbackErr
		}
	}

	if lastErr != nil {
		return nil, lastErr
	}
	return nil, fmt.Errorf("all upstreams failed")
}

// lookupFallback queries fallback DNS servers (supports all protocol formats).
func (r *Resolver) lookupFallback(ctx context.Context, req *dns.Msg) (*dns.Msg, error) {
	for _, addr := range r.fallbackAddrs {
		start := time.Now()
		resp, err := dnsQuery(ctx, req, addr, 3*time.Second, r.bootstrapAddrs)
		if err == nil && resp != nil && resp.Rcode == dns.RcodeSuccess {
			logf("[DNS Resolver] Fallback %s: success in %s", addr, time.Since(start))
			return resp, nil
		}
		if err != nil {
			logf("[DNS Resolver] Fallback %s: failed in %s: %v", addr, time.Since(start), err)
		} else {
			logf("[DNS Resolver] Fallback %s: rcode=%s in %s", addr, dns.RcodeToString[resp.Rcode], time.Since(start))
		}
	}
	return nil, fmt.Errorf("all fallback DNS servers failed")
}

// Query is a convenience method that builds a dns.Msg from name and type.
func (r *Resolver) Query(ctx context.Context, name string, qtype uint16) (*dns.Msg, error) {
	req := new(dns.Msg)
	req.SetQuestion(dns.Fqdn(name), qtype)
	req.RecursionDesired = true
	return r.Lookup(ctx, req)
}

// ---------------------------------------------------------------
// TLS Certificate Generation
// ---------------------------------------------------------------

// EnsureCert generates a self-signed TLS certificate for localhost DNS.
func EnsureCert(dir string) (certFile, keyFile string, err error) {
	if dir == "" {
		dir = os.TempDir()
	}
	certFile = filepath.Join(dir, "rover-dns-cert.pem")
	keyFile = filepath.Join(dir, "rover-dns-key.pem")

	// Try loading existing cert
	if _, loadErr := tls.LoadX509KeyPair(certFile, keyFile); loadErr == nil {
		pemData, _ := os.ReadFile(certFile)
		block, _ := pem.Decode(pemData)
		if block != nil {
			if x509Cert, parseErr := x509.ParseCertificate(block.Bytes); parseErr == nil {
				if time.Until(x509Cert.NotAfter) > 7*24*time.Hour {
					return certFile, keyFile, nil
				}
			}
		}
	}

	// Generate new self-signed cert
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", "", fmt.Errorf("mkdir: %w", err)
	}

	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return "", "", fmt.Errorf("generate key: %w", err)
	}

	serialNumber, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return "", "", fmt.Errorf("generate serial number: %w", err)
	}
	template := &x509.Certificate{
		SerialNumber: serialNumber,
		IsCA:         false,
		Subject:      pkix.Name{CommonName: "Rover DNS Resolver"},
		NotBefore:    time.Now().Add(-1 * time.Hour),
		NotAfter:     time.Now().Add(365 * 24 * time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		DNSNames:     []string{"localhost"},
		IPAddresses:  []net.IP{net.ParseIP("127.0.0.1"), net.ParseIP("::1")},
	}

	certDER, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		return "", "", fmt.Errorf("create cert: %w", err)
	}

	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})
	if err := os.WriteFile(certFile, certPEM, 0644); err != nil {
		return "", "", fmt.Errorf("write cert: %w", err)
	}

	keyDER, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		return "", "", fmt.Errorf("marshal key: %w", err)
	}
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER})
	if err := os.WriteFile(keyFile, keyPEM, 0600); err != nil {
		return "", "", fmt.Errorf("write key: %w", err)
	}

	return certFile, keyFile, nil
}

// ---------------------------------------------------------------
// DNS Server (HTTPS DoH mode)
// ---------------------------------------------------------------

// Server is a local HTTPS DoH server that forwards queries to the concurrent resolver.
type Server struct {
	httpServer *http.Server
	addr       string
	certDir    string
	certFile   string
	keyFile    string
	logEnabled bool
	running    bool
	mu         sync.Mutex
}

var (
	dnsLogFile    *os.File
	dnsLogMu      sync.Mutex
	dnsLogEnabled bool
)

func dnsLogInit(dir string) {
	if dir == "" {
		return
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		return
	}
	logPath := filepath.Join(dir, "dns-query.log")
	f, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return
	}
	dnsLogMu.Lock()
	old := dnsLogFile
	dnsLogFile = f
	dnsLogMu.Unlock()
	if old != nil {
		old.Close()
	}
}

func dnsLogClose() {
	dnsLogMu.Lock()
	defer dnsLogMu.Unlock()
	if dnsLogFile != nil {
		dnsLogFile.Close()
		dnsLogFile = nil
	}
}

func logf(format string, args ...interface{}) {
	if !dnsLogEnabled {
		return
	}
	msg := fmt.Sprintf(format, args...)
	ts := time.Now().Format("2006-01-02 15:04:05")
	line := fmt.Sprintf("%s %s\n", ts, msg)

	dnsLogMu.Lock()
	if dnsLogFile != nil {
		dnsLogFile.WriteString(line)
	}
	dnsLogMu.Unlock()

	fmt.Print("[DNS] ", msg, "\n")
}

// buildResolverFromRequest builds a resolver from request headers.
func buildResolverFromRequest(r *http.Request) (*Resolver, *resolverConfig, error) {
	upstreamsParam := r.Header.Get("X-Upstreams")
	if upstreamsParam == "" {
		return nil, nil, fmt.Errorf("X-Upstreams header is required")
	}

	proxyType := r.Header.Get("X-Proxy")
	proxyAddr := r.Header.Get("X-Proxy-Addr")
	proxyUser := r.Header.Get("X-Proxy-User")
	proxyPass := r.Header.Get("X-Proxy-Pass")

	bootstrapParam := r.Header.Get("X-Bootstrap-Addrs")
	fallbackParam := r.Header.Get("X-Fallback-Addrs")

	var bootstrapAddrs []string
	if bootstrapParam != "" {
		bootstrapAddrs = strings.Split(bootstrapParam, ",")
		for i := range bootstrapAddrs {
			bootstrapAddrs[i] = strings.TrimSpace(bootstrapAddrs[i])
		}
	}
	var fallbackAddrs []string
	if fallbackParam != "" {
		fallbackAddrs = strings.Split(fallbackParam, ",")
		for i := range fallbackAddrs {
			fallbackAddrs[i] = strings.TrimSpace(fallbackAddrs[i])
		}
	}

	logf("[DNS DoH] Config: upstreams=%s", upstreamsParam)
	if proxyType != "" {
		logf("[DNS DoH] Config: proxy=%s addr=%s", proxyType, proxyAddr)
	}
	if len(bootstrapAddrs) > 0 {
		logf("[DNS DoH] Config: bootstrap=%v", bootstrapAddrs)
	}
	if len(fallbackAddrs) > 0 {
		logf("[DNS DoH] Config: fallback=%v", fallbackAddrs)
	}

	upstreamAddrs := strings.Split(upstreamsParam, ",")
	for i := range upstreamAddrs {
		upstreamAddrs[i] = strings.TrimSpace(upstreamAddrs[i])
	}

	upstreams, err := buildUpstreams(upstreamAddrs, proxyType, proxyAddr, proxyUser, proxyPass, bootstrapAddrs)
	if err != nil || len(upstreams) == 0 {
		return nil, nil, fmt.Errorf("no valid upstreams configured: %w", err)
	}

	var opts []ResolverOption
	if len(fallbackAddrs) > 0 {
		opts = append(opts, WithFallback(fallbackAddrs))
	}
	if len(bootstrapAddrs) > 0 {
		opts = append(opts, WithBootstrap(bootstrapAddrs))
	}

	res, err := NewResolver(upstreams, opts...)
	if err != nil {
		return nil, nil, err
	}

	cfg := &resolverConfig{
		upstreams: upstreamsParam,
		proxyType: proxyType,
		proxyAddr: proxyAddr,
	}

	return res, cfg, nil
}

// resolverConfig holds parsed resolver config info for logging.
type resolverConfig struct {
	upstreams string
	proxyType string
	proxyAddr string
}

// NewServer creates an HTTPS DoH server bound to the given address.
func NewServer(addr, certDir string, logEnabled bool) *Server {
	return &Server{
		addr:       addr,
		certDir:    certDir,
		logEnabled: logEnabled,
	}
}

// Start starts the HTTPS DoH server in a background goroutine.
func (s *Server) Start() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.running {
		return fmt.Errorf("server already running")
	}

	certFile, keyFile, err := EnsureCert(s.certDir)
	if err != nil {
		return fmt.Errorf("ensure cert: %w", err)
	}
	s.certFile = certFile
	s.keyFile = keyFile

	if s.logEnabled {
		dnsLogEnabled = true
		dnsLogInit(s.certDir)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/dns-query", s.serveDoH)

	s.httpServer = &http.Server{
		Addr:    s.addr,
		Handler: mux,
		TLSConfig: &tls.Config{
			MinVersion: tls.VersionTLS12,
		},
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	go func() {
		logf("[DNS Server] Starting HTTPS server on %s with cert=%s key=%s", s.addr, certFile, keyFile)
		if err := s.httpServer.ListenAndServeTLS(certFile, keyFile); err != nil && err != http.ErrServerClosed {
			logf("[DNS Server] HTTPS error: %v", err)
		} else {
			logf("[DNS Server] HTTPS server stopped")
		}
	}()

	s.running = true
	logf("[DNS Server] HTTPS DoH listening on https://%s/dns-query", s.addr)
	return nil
}

// Stop gracefully stops the HTTPS DoH server.
func (s *Server) Stop() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running {
		return nil
	}
	s.running = false
	logf("[DNS Server] Stopping HTTPS server on %s", s.addr)
	dnsLogClose()
	dnsLogEnabled = false
	if s.httpServer != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		err := s.httpServer.Shutdown(ctx)
		logf("[DNS Server] Server stopped")
		return err
	}
	return nil
}

// IsRunning returns whether the server is currently running.
func (s *Server) IsRunning() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.running
}

// Addr returns the server address.
func (s *Server) Addr() string {
	return s.addr
}

// CertPath returns the path to the TLS certificate.
func (s *Server) CertPath() string {
	return s.certFile
}

// ---------------------------------------------------------------
// HTTP Handlers
// ---------------------------------------------------------------

// ServeDNS returns an http.Handler that handles DoH DNS queries.
func (m *ServerManager) ServeDNS() http.Handler {
	m.mu.Lock()
	srv := m.server
	m.mu.Unlock()
	if srv != nil {
		return http.HandlerFunc(srv.serveDoH)
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "dns server not running", http.StatusServiceUnavailable)
	})
}

// serveDoH handles a single DoH request.
func (s *Server) serveDoH(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	logf("[DNS DoH] === New Request === from=%s method=%s", r.RemoteAddr, r.Method)

	if r.Method != http.MethodPost {
		logf("[DNS DoH] Rejected: method not allowed (%s)", r.Method)
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	contentType := r.Header.Get("Content-Type")
	if contentType != "application/dns-message" {
		logf("[DNS DoH] Rejected: unsupported content type (%s)", contentType)
		http.Error(w, "unsupported content type", http.StatusUnsupportedMediaType)
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 65535))
	if err != nil {
		logf("[DNS DoH] Error reading request body: %v", err)
		http.Error(w, "read error", http.StatusBadRequest)
		return
	}

	msg := new(dns.Msg)
	if err := msg.Unpack(body); err != nil {
		logf("[DNS DoH] Error unpacking DNS message: %v", err)
		http.Error(w, "invalid DNS message", http.StatusBadRequest)
		return
	}

	if len(msg.Question) > 0 {
		q := msg.Question[0]
		qtypeStr := dns.TypeToString[q.Qtype]
		if qtypeStr == "" {
			qtypeStr = fmt.Sprintf("TYPE%d", q.Qtype)
		}
		logf("[DNS DoH] Query: %s %s (id=%d)", qtypeStr, q.Name, msg.Id)
	}

	res, _, err := buildResolverFromRequest(r)
	if err != nil {
		logf("[DNS DoH] Failed to build resolver: %v", err)
		m := new(dns.Msg)
		m.SetRcode(msg, dns.RcodeServerFailure)
		packed, _ := m.Pack()
		w.Header().Set("Content-Type", "application/dns-message")
		w.WriteHeader(http.StatusOK)
		w.Write(packed)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	resp, err := res.Lookup(ctx, msg)
	elapsed := time.Since(start)

	if err != nil {
		logf("[DNS DoH] Lookup FAILED in %s: %v", elapsed, err)
		m := new(dns.Msg)
		m.SetRcode(msg, dns.RcodeServerFailure)
		packed, _ := m.Pack()
		w.Header().Set("Content-Type", "application/dns-message")
		w.WriteHeader(http.StatusOK)
		w.Write(packed)
		logf("[DNS DoH] === Request Done (SERVFAIL) %s ===", elapsed)
		return
	}

	rcodeStr := dns.RcodeToString[resp.Rcode]
	if rcodeStr == "" {
		rcodeStr = fmt.Sprintf("RCODE%d", resp.Rcode)
	}
	var answers []string
	for _, ans := range resp.Answer {
		answers = append(answers, ans.String())
	}
	logf("[DNS DoH] Response: rcode=%s answers=%d elapsed=%s", rcodeStr, len(resp.Answer), elapsed)
	for _, a := range answers {
		logf("[DNS DoH]   -> %s", a)
	}

	packed, err := resp.Pack()
	if err != nil {
		logf("[DNS DoH] Error packing response: %v", err)
		http.Error(w, "pack error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/dns-message")
	w.WriteHeader(http.StatusOK)
	w.Write(packed)
	logf("[DNS DoH] === Request Done %s ===", elapsed)
}

// ---------------------------------------------------------------
// DNS Server Manager
// ---------------------------------------------------------------

// ServerManager manages the global DNS server instance.
type ServerManager struct {
	server *Server
	mu     sync.Mutex
}

// NewServerManager creates a new DNS server manager.
func NewServerManager() *ServerManager {
	return &ServerManager{}
}

// StartRequest represents a DNS server start request.
type StartRequest struct {
	Address   string `json:"address"`
	CertDir   string `json:"cert_dir"`
	LogEnabled bool  `json:"enable_log"`
}

// Start starts the DNS server on the given address.
func (m *ServerManager) Start(address, certDir string, logEnabled bool) (*Server, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.server != nil && m.server.IsRunning() {
		m.server.Stop()
		m.server = nil
	}

	if address == "" {
		address = "127.0.0.1:5353"
	}

	srv := NewServer(address, certDir, logEnabled)

	if err := srv.Start(); err != nil {
		return nil, err
	}

	m.server = srv
	return srv, nil
}

// Stop stops the running DNS server.
func (m *ServerManager) Stop() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.server == nil || !m.server.IsRunning() {
		return nil
	}

	if err := m.server.Stop(); err != nil {
		return err
	}
	m.server = nil
	return nil
}

// Status returns the current DNS server status.
func (m *ServerManager) Status() (running bool, addr, certPath string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.server == nil || !m.server.IsRunning() {
		return false, "", ""
	}
	return true, m.server.Addr(), m.server.CertPath()
}

// Server returns the current server instance (nil if not running).
func (m *ServerManager) Server() *Server {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.server
}
