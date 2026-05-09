// Package resolver implements unit tests for the DNS resolver.
package resolver

import (
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
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/miekg/dns"
)

// ======================================================================
// Test helpers
// ======================================================================

// testCertPool holds the CA cert pool from generateTestCert, used by all TLS tests.
var testCertPool *x509.CertPool

func init() {
	pool, err := generateTestCA()
	if err != nil {
		panic(err)
	}
	testCertPool = pool
}

// generateTestCA creates a self-signed CA certificate and returns its cert pool.
// The CA is generated once (init) and reused across all tests.
func generateTestCA() (*x509.CertPool, error) {
	caKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, err
	}
	serial, _ := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	caTmpl := &x509.Certificate{
		SerialNumber:          serial,
		IsCA:                  true,
		BasicConstraintsValid: true,
		Subject:               pkix.Name{CommonName: "Test CA"},
		NotBefore:             time.Now().Add(-1 * time.Hour),
		NotAfter:              time.Now().Add(24 * time.Hour),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageCRLSign,
	}
	caCertDER, err := x509.CreateCertificate(rand.Reader, caTmpl, caTmpl, &caKey.PublicKey, caKey)
	if err != nil {
		return nil, err
	}
	pool := x509.NewCertPool()
	caCertPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: caCertDER})
	pool.AppendCertsFromPEM(caCertPEM)

	// Store CA key+cert for generateTestServerCert
	caCert, _ := x509.ParseCertificate(caCertDER)
	testCA = &caBundle{key: caKey, cert: caCert}
	return pool, nil
}

type caBundle struct {
	key  *ecdsa.PrivateKey
	cert *x509.Certificate
}

var testCA *caBundle

// generateTestServerCert creates a server certificate signed by the test CA.
func generateTestServerCert() (tls.Certificate, error) {
	srvKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return tls.Certificate{}, err
	}
	serial, _ := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	srvTmpl := &x509.Certificate{
		SerialNumber: serial, IsCA: false,
		Subject:     pkix.Name{CommonName: "Test DNS"},
		NotBefore:   time.Now().Add(-1 * time.Hour),
		NotAfter:    time.Now().Add(24 * time.Hour),
		KeyUsage:    x509.KeyUsageDigitalSignature,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		DNSNames:    []string{"localhost", "dns.test"},
		IPAddresses: []net.IP{net.ParseIP("127.0.0.1"), net.ParseIP("::1")},
	}
	srvCertDER, err := x509.CreateCertificate(rand.Reader, srvTmpl, testCA.cert, &srvKey.PublicKey, testCA.key)
	if err != nil {
		return tls.Certificate{}, err
	}
	srvCertPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: srvCertDER})
	srvKeyDER, _ := x509.MarshalECPrivateKey(srvKey)
	srvKeyPEM := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: srvKeyDER})
	return tls.X509KeyPair(srvCertPEM, srvKeyPEM)
}

// makeDNSResponse builds a DNS response with the given A/AAAA answers.
func makeDNSResponse(req *dns.Msg, qtype uint16, answers []string) *dns.Msg {
	m := new(dns.Msg)
	m.SetReply(req)
	m.RecursionAvailable = true
	for _, ans := range answers {
		switch qtype {
		case dns.TypeA:
			m.Answer = append(m.Answer, &dns.A{
				Hdr: dns.RR_Header{Name: req.Question[0].Name, Rrtype: dns.TypeA, Class: dns.ClassINET, Ttl: 300},
				A:   net.ParseIP(ans),
			})
		case dns.TypeAAAA:
			m.Answer = append(m.Answer, &dns.AAAA{
				Hdr: dns.RR_Header{Name: req.Question[0].Name, Rrtype: dns.TypeAAAA, Class: dns.ClassINET, Ttl: 300},
				AAAA: net.ParseIP(ans),
			})
		}
	}
	return m
}

// simpleDNSHandler returns a dns.HandlerFunc that answers queries for the given domain.
func simpleDNSHandler(domain string, ips []string) dns.HandlerFunc {
	return func(w dns.ResponseWriter, r *dns.Msg) {
		m := new(dns.Msg)
		m.SetReply(r)
		m.RecursionAvailable = true
		for _, q := range r.Question {
			if q.Name == dns.Fqdn(domain) {
				for _, ip := range ips {
					if q.Qtype == dns.TypeA {
						m.Answer = append(m.Answer, &dns.A{
							Hdr: dns.RR_Header{Name: q.Name, Rrtype: dns.TypeA, Class: dns.ClassINET, Ttl: 300},
							A:   net.ParseIP(ip),
						})
					}
					if q.Qtype == dns.TypeAAAA {
						m.Answer = append(m.Answer, &dns.AAAA{
							Hdr: dns.RR_Header{Name: q.Name, Rrtype: dns.TypeAAAA, Class: dns.ClassINET, Ttl: 300},
							AAAA: net.ParseIP(ip),
						})
					}
				}
			}
		}
		w.WriteMsg(m)
	}
}

// startMockUDPServer starts a UDP DNS server on a random port.
func startMockUDPServer(t *testing.T, handler dns.HandlerFunc) (string, func()) {
	t.Helper()
	srv := &dns.Server{Addr: "127.0.0.1:0", Net: "udp", Handler: handler}
	wait := make(chan struct{})
	srv.NotifyStartedFunc = func() { close(wait) }
	go srv.ListenAndServe()
	<-wait
	return srv.PacketConn.LocalAddr().String(), func() { srv.Shutdown() }
}

// startMockTCPServer starts a TCP DNS server on a random port.
func startMockTCPServer(t *testing.T, handler dns.HandlerFunc) (string, func()) {
	t.Helper()
	srv := &dns.Server{Addr: "127.0.0.1:0", Net: "tcp", Handler: handler}
	wait := make(chan struct{})
	srv.NotifyStartedFunc = func() { close(wait) }
	go srv.ListenAndServe()
	<-wait
	return srv.Listener.Addr().String(), func() { srv.Shutdown() }
}

// startMockDoTServer starts a DNS-over-TLS server on a random port.
func startMockDoTServer(t *testing.T, handler dns.HandlerFunc) (string, func()) {
	t.Helper()
	cert, err := generateTestServerCert()
	if err != nil {
		t.Fatalf("generate cert: %v", err)
	}
	tlsConfig := &tls.Config{Certificates: []tls.Certificate{cert}}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	tlsLn := tls.NewListener(ln, tlsConfig)
	srv := &dns.Server{Listener: tlsLn, Net: "tcp-tls", Handler: handler, TLSConfig: tlsConfig}
	wait := make(chan struct{})
	srv.NotifyStartedFunc = func() { close(wait) }
	go srv.ActivateAndServe()
	<-wait
	return ln.Addr().String(), func() { srv.Shutdown() }
}

// mockResponseWriter captures DNS responses written via miekg/dns API.
type mockResponseWriter struct {
	dns.ResponseWriter
	msg *dns.Msg
}

func (w *mockResponseWriter) WriteMsg(msg *dns.Msg) error {
	w.msg = msg
	return nil
}

// startMockDoHServer starts a DNS-over-HTTPS server on a random port.
func startMockDoHServer(t *testing.T, handler dns.HandlerFunc) (string, func()) {
	t.Helper()
	cert, err := generateTestServerCert()
	if err != nil {
		t.Fatalf("generate cert: %v", err)
	}
	tlsConfig := &tls.Config{Certificates: []tls.Certificate{cert}}
	mux := http.NewServeMux()
	mux.HandleFunc("/dns-query", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if r.Header.Get("Content-Type") != "application/dns-message" {
			http.Error(w, "unsupported content type", http.StatusUnsupportedMediaType)
			return
		}
		body, _ := io.ReadAll(io.LimitReader(r.Body, 65535))
		msg := new(dns.Msg)
		msg.Unpack(body)
		rw := &mockResponseWriter{}
		handler.ServeDNS(rw, msg)
		if rw.msg == nil {
			http.Error(w, "no response", http.StatusInternalServerError)
			return
		}
		packed, _ := rw.msg.Pack()
		w.Header().Set("Content-Type", "application/dns-message")
		w.Write(packed)
	})

	srv := &http.Server{Addr: "127.0.0.1:0", Handler: mux, TLSConfig: tlsConfig}
	ln, _ := net.Listen("tcp", "127.0.0.1:0")
	tlsLn := tls.NewListener(ln, tlsConfig)
	go srv.Serve(tlsLn)
	time.Sleep(100 * time.Millisecond)
	return ln.Addr().String(), func() { srv.Close() }
}

// mockUpstream is a controllable upstream for testing.
type mockUpstream struct {
	tag   string
	resp  *dns.Msg
	err   error
	delay time.Duration
}

func (m *mockUpstream) exchange(ctx context.Context, req *dns.Msg) (*dns.Msg, error) {
	if m.delay > 0 {
		select {
		case <-time.After(m.delay):
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	if m.err != nil {
		return nil, m.err
	}
	return m.resp, nil
}

func (m *mockUpstream) String() string { return m.tag }

// clearBootstrapCache clears the global bootstrap DNS cache.
func clearBootstrapCache() {
	bsCacheMu.Lock()
	bsCache = make(map[string]bootstrapCacheEntry)
	bsCacheMu.Unlock()
}

// newTestTLSClient returns an http.Client that trusts the test CA.
func newTestTLSClient(timeout time.Duration) *http.Client {
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{
			ServerName: "dns.test",
			RootCAs:    testCertPool,
		},
	}
	return &http.Client{Transport: transport, Timeout: timeout}
}

// ======================================================================
// 1. parseUpstreamAddr tests
// ======================================================================

func TestParseUpstreamAddr(t *testing.T) {
	tests := []struct {
		input     string
		wantProto string
		wantHost  string
		wantPort  string
		wantPath  string
	}{
		{"8.8.8.8", "udp", "8.8.8.8", "53", ""},
		{"8.8.8.8:53", "udp", "8.8.8.8", "53", ""},
		{"1.1.1.1:5353", "udp", "1.1.1.1", "5353", ""},
		{"udp://8.8.8.8", "udp", "8.8.8.8", "53", ""},
		{"udp://8.8.8.8:53", "udp", "8.8.8.8", "53", ""},
		{"udp://9.9.9.9:9953", "udp", "9.9.9.9", "9953", ""},
		{"tcp://8.8.8.8", "tcp", "8.8.8.8", "53", ""},
		{"tcp://8.8.8.8:53", "tcp", "8.8.8.8", "53", ""},
		{"tcp://1.1.1.1:5353", "tcp", "1.1.1.1", "5353", ""},
		{"tls://dns.google", "tls", "dns.google", "853", ""},
		{"tls://dns.google:853", "tls", "dns.google", "853", ""},
		{"tls://9.9.9.9:8530", "tls", "9.9.9.9", "8530", ""},
		{"https://dns.google/dns-query", "https", "dns.google", "443", "/dns-query"},
		{"https://cloudflare-dns.com/dns-query", "https", "cloudflare-dns.com", "443", "/dns-query"},
		{"https://8.8.8.8/dns-query", "https", "8.8.8.8", "443", "/dns-query"},
		{"https://dns.example.com:8443/query", "https", "dns.example.com", "8443", "/query"},
		{"  8.8.4.4  ", "udp", "8.8.4.4", "53", ""},
		{"  tcp://1.0.0.1:53  ", "tcp", "1.0.0.1", "53", ""},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := parseUpstreamAddr(tt.input)
			if got.Protocol != tt.wantProto {
				t.Errorf("Protocol = %q, want %q", got.Protocol, tt.wantProto)
			}
			if got.Host != tt.wantHost {
				t.Errorf("Host = %q, want %q", got.Host, tt.wantHost)
			}
			if got.Port != tt.wantPort {
				t.Errorf("Port = %q, want %q", got.Port, tt.wantPort)
			}
			if got.Path != tt.wantPath {
				t.Errorf("Path = %q, want %q", got.Path, tt.wantPath)
			}
		})
	}
}

// ======================================================================
// 2. isIPAddr tests
// ======================================================================

func TestIsIPAddr(t *testing.T) {
	tests := []struct {
		input string
		want  bool
	}{
		{"8.8.8.8", true},
		{"::1", true},
		{"2001:4860:4860::8888", true},
		{"dns.google", false},
		{"example.com", false},
		{"", false},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			if got := isIPAddr(tt.input); got != tt.want {
				t.Errorf("isIPAddr(%q) = %v, want %v", tt.input, got, tt.want)
			}
		})
	}
}

// ======================================================================
// 3. Bootstrap DNS cache tests
// ======================================================================

func TestBootstrapCacheSetGet(t *testing.T) {
	clearBootstrapCache()
	setCachedIP("example.com", "93.184.216.34", 5*time.Minute)
	ip, ok := getCachedIP("example.com")
	if !ok {
		t.Fatal("expected cache hit, got miss")
	}
	if ip != "93.184.216.34" {
		t.Errorf("got IP %q, want %q", ip, "93.184.216.34")
	}
}

func TestBootstrapCacheMiss(t *testing.T) {
	clearBootstrapCache()
	_, ok := getCachedIP("nonexistent.example")
	if ok {
		t.Fatal("expected cache miss, got hit")
	}
}

func TestBootstrapCacheExpiry(t *testing.T) {
	clearBootstrapCache()
	setCachedIP("expired.example", "1.2.3.4", -1*time.Second)
	_, ok := getCachedIP("expired.example")
	if ok {
		t.Fatal("expected cache miss for expired entry, got hit")
	}
}

func TestBootstrapCacheOverwrite(t *testing.T) {
	clearBootstrapCache()
	setCachedIP("update.example", "1.1.1.1", 5*time.Minute)
	setCachedIP("update.example", "2.2.2.2", 5*time.Minute)
	ip, ok := getCachedIP("update.example")
	if !ok {
		t.Fatal("expected cache hit, got miss")
	}
	if ip != "2.2.2.2" {
		t.Errorf("got IP %q, want %q", ip, "2.2.2.2")
	}
}

func TestBootstrapCacheConcurrent(t *testing.T) {
	clearBootstrapCache()
	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			host := fmt.Sprintf("host%d.example", i%10)
			ip := fmt.Sprintf("10.0.0.%d", i%256)
			setCachedIP(host, ip, 5*time.Minute)
			getCachedIP(host)
		}(i)
	}
	wg.Wait()
}

// ======================================================================
// 4. resolveHost tests
// ======================================================================

func TestResolveHost_IPInput(t *testing.T) {
	ip, err := resolveHost("8.8.8.8", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ip != "8.8.8.8" {
		t.Errorf("got %q, want %q", ip, "8.8.8.8")
	}
}

func TestResolveHost_IPv6Input(t *testing.T) {
	ip, err := resolveHost("::1", nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ip != "::1" {
		t.Errorf("got %q, want %q", ip, "::1")
	}
}

func TestResolveHost_NoBootstrap(t *testing.T) {
	clearBootstrapCache()
	_, err := resolveHost("dns.google", nil)
	if err == nil {
		t.Fatal("expected error for hostname without bootstrap, got nil")
	}
}

func TestResolveHost_WithBootstrap(t *testing.T) {
	clearBootstrapCache()
	bootstrapAddr, cleanup := startMockUDPServer(t, simpleDNSHandler("dns.google", []string{"8.8.8.8"}))
	defer cleanup()

	ip, err := resolveHost("dns.google", []string{bootstrapAddr})
	if err != nil {
		t.Fatalf("resolveHost failed: %v", err)
	}
	if ip != "8.8.8.8" {
		t.Errorf("got IP %q, want %q", ip, "8.8.8.8")
	}
}

func TestResolveHost_CacheHit(t *testing.T) {
	clearBootstrapCache()
	setCachedIP("cached.example", "10.20.30.40", 5*time.Minute)

	ip, err := resolveHost("cached.example", nil)
	if err != nil {
		t.Fatalf("resolveHost failed: %v", err)
	}
	if ip != "10.20.30.40" {
		t.Errorf("got IP %q, want %q", ip, "10.20.30.40")
	}
}

// ======================================================================
// 5. plainDNSResolve tests
// ======================================================================

func TestPlainDNSResolve_UDP(t *testing.T) {
	addr, cleanup := startMockUDPServer(t, simpleDNSHandler("example.com", []string{"93.184.216.34"}))
	defer cleanup()
	ip, err := plainDNSResolve("example.com", []string{addr}, dns.TypeA)
	if err != nil {
		t.Fatalf("plainDNSResolve failed: %v", err)
	}
	if ip != "93.184.216.34" {
		t.Errorf("got IP %q, want %q", ip, "93.184.216.34")
	}
}

func TestPlainDNSResolve_TCP(t *testing.T) {
	addr, cleanup := startMockTCPServer(t, simpleDNSHandler("example.com", []string{"93.184.216.34"}))
	defer cleanup()
	ip, err := plainDNSResolve("example.com", []string{"tcp://" + addr}, dns.TypeA)
	if err != nil {
		t.Fatalf("plainDNSResolve failed: %v", err)
	}
	if ip != "93.184.216.34" {
		t.Errorf("got IP %q, want %q", ip, "93.184.216.34")
	}
}

func TestPlainDNSResolve_NoBootstrap(t *testing.T) {
	_, err := plainDNSResolve("example.com", []string{}, dns.TypeA)
	if err == nil {
		t.Fatal("expected error with no bootstrap, got nil")
	}
}

func TestPlainDNSResolve_AllFail(t *testing.T) {
	_, err := plainDNSResolve("example.com", []string{"0.0.0.0:1"}, dns.TypeA)
	if err == nil {
		t.Fatal("expected error when all bootstrap servers fail, got nil")
	}
}

func TestPlainDNSResolve_FallbackToNext(t *testing.T) {
	goodAddr, cleanup := startMockUDPServer(t, simpleDNSHandler("test.com", []string{"10.0.0.1"}))
	defer cleanup()
	ip, err := plainDNSResolve("test.com", []string{"0.0.0.0:1", goodAddr}, dns.TypeA)
	if err != nil {
		t.Fatalf("plainDNSResolve failed: %v", err)
	}
	if ip != "10.0.0.1" {
		t.Errorf("got IP %q, want %q", ip, "10.0.0.1")
	}
}

// ======================================================================
// 6. resolveDoHURL tests
// ======================================================================

func TestResolveDoHURL_IPInput(t *testing.T) {
	resolvedURL, sniHost, err := resolveDoHURL("https://8.8.8.8/dns-query", nil)
	if err != nil {
		t.Fatalf("resolveDoHURL failed: %v", err)
	}
	if resolvedURL != "https://8.8.8.8/dns-query" {
		t.Errorf("resolvedURL = %q, want %q", resolvedURL, "https://8.8.8.8/dns-query")
	}
	if sniHost != "" {
		t.Errorf("sniHost = %q, want empty", sniHost)
	}
}

func TestResolveDoHURL_DomainWithBootstrap(t *testing.T) {
	clearBootstrapCache()
	bootstrapAddr, cleanup := startMockUDPServer(t, simpleDNSHandler("dns.google", []string{"8.8.8.8"}))
	defer cleanup()

	resolvedURL, sniHost, err := resolveDoHURL("https://dns.google/dns-query", []string{bootstrapAddr})
	if err != nil {
		t.Fatalf("resolveDoHURL failed: %v", err)
	}
	if !strings.Contains(resolvedURL, "8.8.8.8") {
		t.Errorf("resolvedURL should contain 8.8.8.8, got %q", resolvedURL)
	}
	if sniHost != "dns.google" {
		t.Errorf("sniHost = %q, want %q", sniHost, "dns.google")
	}
}

func TestResolveDoHURL_InvalidURL(t *testing.T) {
	_, _, err := resolveDoHURL("://invalid", nil)
	if err == nil {
		t.Fatal("expected error for invalid URL, got nil")
	}
}

func TestResolveDoHURL_WithPort(t *testing.T) {
	clearBootstrapCache()
	bootstrapAddr, cleanup := startMockUDPServer(t, simpleDNSHandler("dns.example", []string{"8.8.4.4"}))
	defer cleanup()

	resolvedURL, sniHost, err := resolveDoHURL("https://dns.example:8443/dns-query", []string{bootstrapAddr})
	if err != nil {
		t.Fatalf("resolveDoHURL failed: %v", err)
	}
	if !strings.Contains(resolvedURL, "8.8.4.4") {
		t.Errorf("resolvedURL should contain 8.8.4.4, got %q", resolvedURL)
	}
	if !strings.Contains(resolvedURL, "8443") {
		t.Errorf("resolvedURL should contain port 8443, got %q", resolvedURL)
	}
	if sniHost != "dns.example" {
		t.Errorf("sniHost = %q, want %q", sniHost, "dns.example")
	}
}

// ======================================================================
// 7. dnsQuery tests (used by bootstrap and fallback)
// ======================================================================

func TestDNSQuery_UDP(t *testing.T) {
	addr, cleanup := startMockUDPServer(t, simpleDNSHandler("test.com", []string{"10.0.0.1"}))
	defer cleanup()
	req := new(dns.Msg)
	req.SetQuestion("test.com.", dns.TypeA)
	req.RecursionDesired = true
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp, err := dnsQuery(ctx, req, addr, 3*time.Second, nil)
	if err != nil {
		t.Fatalf("dnsQuery UDP failed: %v", err)
	}
	if len(resp.Answer) == 0 {
		t.Fatal("expected answers, got none")
	}
}

func TestDNSQuery_TCP(t *testing.T) {
	addr, cleanup := startMockTCPServer(t, simpleDNSHandler("test.com", []string{"10.0.0.2"}))
	defer cleanup()
	req := new(dns.Msg)
	req.SetQuestion("test.com.", dns.TypeA)
	req.RecursionDesired = true
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp, err := dnsQuery(ctx, req, "tcp://"+addr, 3*time.Second, nil)
	if err != nil {
		t.Fatalf("dnsQuery TCP failed: %v", err)
	}
	if len(resp.Answer) == 0 {
		t.Fatal("expected answers, got none")
	}
}

// ======================================================================
// 8. Direct upstream tests (no proxy)
// ======================================================================

func TestDirectUDPUpstream(t *testing.T) {
	addr, cleanup := startMockUDPServer(t, simpleDNSHandler("example.com", []string{"93.184.216.34"}))
	defer cleanup()

	up := &plainUpstream{addr: addr, network: "udp", tag: fmt.Sprintf("udp://%s", addr)}
	req := new(dns.Msg)
	req.SetQuestion("example.com.", dns.TypeA)
	req.RecursionDesired = true

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp, err := up.exchange(ctx, req)
	if err != nil {
		t.Fatalf("exchange failed: %v", err)
	}
	if len(resp.Answer) == 0 {
		t.Fatal("expected answers, got none")
	}
	a := resp.Answer[0].(*dns.A)
	if a.A.String() != "93.184.216.34" {
		t.Errorf("got IP %s, want 93.184.216.34", a.A.String())
	}
}

func TestDirectTCPUpstream(t *testing.T) {
	addr, cleanup := startMockTCPServer(t, simpleDNSHandler("example.com", []string{"93.184.216.34"}))
	defer cleanup()

	up := &plainUpstream{addr: addr, network: "tcp", tag: fmt.Sprintf("tcp://%s", addr)}
	req := new(dns.Msg)
	req.SetQuestion("example.com.", dns.TypeA)
	req.RecursionDesired = true

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp, err := up.exchange(ctx, req)
	if err != nil {
		t.Fatalf("exchange failed: %v", err)
	}
	if len(resp.Answer) == 0 {
		t.Fatal("expected answers, got none")
	}
	a := resp.Answer[0].(*dns.A)
	if a.A.String() != "93.184.216.34" {
		t.Errorf("got IP %s, want 93.184.216.34", a.A.String())
	}
}

func TestDirectDoTUpstream(t *testing.T) {
	handler := simpleDNSHandler("example.com", []string{"93.184.216.34"})
	addr, cleanup := startMockDoTServer(t, handler)
	defer cleanup()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	dialer := &net.Dialer{Timeout: 5 * time.Second}
	conn, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		t.Fatalf("dial failed: %v", err)
	}
	defer conn.Close()

	// Verify certificate against test CA
	tlsConn := tls.Client(conn, &tls.Config{
		ServerName: "dns.test",
		RootCAs:    testCertPool,
	})
	defer tlsConn.Close()

	if err := tlsConn.HandshakeContext(ctx); err != nil {
		t.Fatalf("TLS handshake failed: %v", err)
	}

	req := new(dns.Msg)
	req.SetQuestion("example.com.", dns.TypeA)
	req.RecursionDesired = true

	dnsConn := &dns.Conn{Conn: tlsConn}
	defer dnsConn.Close()
	if err := dnsConn.WriteMsg(req); err != nil {
		t.Fatalf("write failed: %v", err)
	}
	resp, err := dnsConn.ReadMsg()
	if err != nil {
		t.Fatalf("read failed: %v", err)
	}
	if len(resp.Answer) == 0 {
		t.Fatal("expected answers, got none")
	}
}

func TestDirectDoHUpstream(t *testing.T) {
	dohAddr, cleanup := startMockDoHServer(t, simpleDNSHandler("example.com", []string{"93.184.216.34"}))
	defer cleanup()

	host, port, _ := net.SplitHostPort(dohAddr)
	dohURL := fmt.Sprintf("https://%s:%s/dns-query", host, port)

	client := newTestTLSClient(5 * time.Second)
	up := &dohUpstream{url: dohURL, client: client}

	req := new(dns.Msg)
	req.SetQuestion("example.com.", dns.TypeA)
	req.RecursionDesired = true

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp, err := up.exchange(ctx, req)
	if err != nil {
		t.Fatalf("exchange failed: %v", err)
	}
	if len(resp.Answer) == 0 {
		t.Fatal("expected answers, got none")
	}
	a := resp.Answer[0].(*dns.A)
	if a.A.String() != "93.184.216.34" {
		t.Errorf("got IP %s, want 93.184.216.34", a.A.String())
	}
}

// ======================================================================
// 9. Resolver Lookup tests (no proxy)
// ======================================================================

func TestResolverLookup_SingleUDP(t *testing.T) {
	addr, cleanup := startMockUDPServer(t, simpleDNSHandler("example.com", []string{"93.184.216.34"}))
	defer cleanup()

	up := &plainUpstream{addr: addr, network: "udp", tag: "udp-test"}
	r, _ := NewResolver([]upstream{up})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp, err := r.Query(ctx, "example.com", dns.TypeA)
	if err != nil {
		t.Fatalf("Query failed: %v", err)
	}
	if len(resp.Answer) == 0 {
		t.Fatal("expected answers, got none")
	}
}

func TestResolverLookup_MultipleFirstWins(t *testing.T) {
	fastAddr, fastCleanup := startMockUDPServer(t, simpleDNSHandler("fast.com", []string{"1.1.1.1"}))
	defer fastCleanup()

	slowAddr, slowCleanup := startMockUDPServer(t, func(w dns.ResponseWriter, r *dns.Msg) {
		time.Sleep(500 * time.Millisecond)
		simpleDNSHandler("slow.com", []string{"2.2.2.2"})(w, r)
	})
	defer slowCleanup()

	r, _ := NewResolver([]upstream{
		&plainUpstream{addr: fastAddr, network: "udp", tag: "fast"},
		&plainUpstream{addr: slowAddr, network: "udp", tag: "slow"},
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp, err := r.Query(ctx, "fast.com", dns.TypeA)
	if err != nil {
		t.Fatalf("Query failed: %v", err)
	}
	a := resp.Answer[0].(*dns.A)
	if a.A.String() != "1.1.1.1" {
		t.Errorf("got IP %s, want 1.1.1.1 (from fast server)", a.A.String())
	}
}

func TestResolverLookup_AllFail_NoFallback(t *testing.T) {
	r, _ := NewResolver([]upstream{
		&mockUpstream{tag: "fail1", err: fmt.Errorf("connection refused")},
		&mockUpstream{tag: "fail2", err: fmt.Errorf("timeout")},
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := r.Query(ctx, "example.com", dns.TypeA)
	if err == nil {
		t.Fatal("expected error when all upstreams fail, got nil")
	}
}

func TestResolverLookup_AllFail_WithFallback(t *testing.T) {
	fallbackAddr, cleanup := startMockUDPServer(t, simpleDNSHandler("example.com", []string{"1.2.3.4"}))
	defer cleanup()

	r, _ := NewResolver(
		[]upstream{&mockUpstream{tag: "fail", err: fmt.Errorf("connection refused")}},
		WithFallback([]string{fallbackAddr}),
	)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp, err := r.Query(ctx, "example.com", dns.TypeA)
	if err != nil {
		t.Fatalf("Query failed: %v", err)
	}
	a := resp.Answer[0].(*dns.A)
	if a.A.String() != "1.2.3.4" {
		t.Errorf("got IP %s, want 1.2.3.4 (from fallback)", a.A.String())
	}
}

func TestResolverLookup_CancelledContext(t *testing.T) {
	r, _ := NewResolver([]upstream{
		&mockUpstream{tag: "slow", delay: 10 * time.Second, resp: new(dns.Msg)},
	})

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(100 * time.Millisecond)
		cancel()
	}()

	_, err := r.Query(ctx, "example.com", dns.TypeA)
	if err == nil {
		t.Fatal("expected error from cancelled context, got nil")
	}
}

func TestResolverLookup_MixedUpstreams(t *testing.T) {
	udpAddr, udpCleanup := startMockUDPServer(t, simpleDNSHandler("mixed.com", []string{"1.1.1.1"}))
	defer udpCleanup()
	tcpAddr, tcpCleanup := startMockTCPServer(t, simpleDNSHandler("mixed.com", []string{"2.2.2.2"}))
	defer tcpCleanup()

	r, _ := NewResolver([]upstream{
		&plainUpstream{addr: udpAddr, network: "udp", tag: "udp"},
		&plainUpstream{addr: tcpAddr, network: "tcp", tag: "tcp"},
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp, err := r.Query(ctx, "mixed.com", dns.TypeA)
	if err != nil {
		t.Fatalf("Query failed: %v", err)
	}
	a := resp.Answer[0].(*dns.A)
	ip := a.A.String()
	if ip != "1.1.1.1" && ip != "2.2.2.2" {
		t.Errorf("got unexpected IP %s", ip)
	}
}

// ======================================================================
// 10. Fallback DNS tests
// ======================================================================

func TestFallbackDNS_UDP(t *testing.T) {
	fbAddr, cleanup := startMockUDPServer(t, simpleDNSHandler("fallback.com", []string{"5.5.5.5"}))
	defer cleanup()

	r, _ := NewResolver(
		[]upstream{&mockUpstream{tag: "fail", err: fmt.Errorf("always fails")}},
		WithFallback([]string{fbAddr}),
	)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp, err := r.Query(ctx, "fallback.com", dns.TypeA)
	if err != nil {
		t.Fatalf("Query failed: %v", err)
	}
	a := resp.Answer[0].(*dns.A)
	if a.A.String() != "5.5.5.5" {
		t.Errorf("got IP %s, want 5.5.5.5", a.A.String())
	}
}

func TestFallbackDNS_TCP(t *testing.T) {
	fbAddr, cleanup := startMockTCPServer(t, simpleDNSHandler("fallback.com", []string{"6.6.6.6"}))
	defer cleanup()

	r, _ := NewResolver(
		[]upstream{&mockUpstream{tag: "fail", err: fmt.Errorf("always fails")}},
		WithFallback([]string{"tcp://" + fbAddr}),
	)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp, err := r.Query(ctx, "fallback.com", dns.TypeA)
	if err != nil {
		t.Fatalf("Query failed: %v", err)
	}
	if len(resp.Answer) == 0 {
		t.Fatal("expected answers from fallback, got none")
	}
}

func TestFallbackDNS_AllFail(t *testing.T) {
	r, _ := NewResolver(
		[]upstream{&mockUpstream{tag: "fail", err: fmt.Errorf("always fails")}},
		WithFallback([]string{"0.0.0.0:1"}),
	)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_, err := r.Query(ctx, "example.com", dns.TypeA)
	if err == nil {
		t.Fatal("expected error when all fallbacks fail, got nil")
	}
}

// ======================================================================
// 11. buildUpstreamFromAddr tests (direct mode)
// ======================================================================

func TestBuildUpstreamFromAddr_UDP_IP(t *testing.T) {
	up, err := buildUpstreamFromAddr("8.8.8.8", newDirectDialer(), "", "", "", "", nil)
	if err != nil {
		t.Fatalf("buildUpstreamFromAddr failed: %v", err)
	}
	pu := up.(*plainUpstream)
	if pu.network != "udp" {
		t.Errorf("network = %q, want %q", pu.network, "udp")
	}
}

func TestBuildUpstreamFromAddr_TCP_IP(t *testing.T) {
	up, err := buildUpstreamFromAddr("tcp://8.8.8.8:53", newDirectDialer(), "", "", "", "", nil)
	if err != nil {
		t.Fatalf("buildUpstreamFromAddr failed: %v", err)
	}
	pu := up.(*plainUpstream)
	if pu.network != "tcp" {
		t.Errorf("network = %q, want %q", pu.network, "tcp")
	}
}

func TestBuildUpstreamFromAddr_DoH(t *testing.T) {
	up, err := buildUpstreamFromAddr("https://dns.google/dns-query", newDirectDialer(), "", "", "", "", nil)
	if err != nil {
		t.Fatalf("buildUpstreamFromAddr failed: %v", err)
	}
	if _, ok := up.(*dohUpstream); !ok {
		t.Fatalf("expected *dohUpstream, got %T", up)
	}
}

func TestBuildUpstreamFromAddr_DoT(t *testing.T) {
	up, err := buildUpstreamFromAddr("tls://dns.google:853", newDirectDialer(), "", "", "", "", nil)
	if err != nil {
		t.Fatalf("buildUpstreamFromAddr failed: %v", err)
	}
	if _, ok := up.(*tlsUpstream); !ok {
		t.Fatalf("expected *tlsUpstream, got %T", up)
	}
}

func TestBuildUpstreamFromAddr_UDP_DomainWithBootstrap(t *testing.T) {
	clearBootstrapCache()
	setCachedIP("dns.example", "8.8.4.4", 5*time.Minute)

	up, err := buildUpstreamFromAddr("udp://dns.example", newDirectDialer(), "", "", "", "", []string{"8.8.8.8"})
	if err != nil {
		t.Fatalf("buildUpstreamFromAddr failed: %v", err)
	}
	pu := up.(*plainUpstream)
	if !strings.Contains(pu.addr, "8.8.4.4") {
		t.Errorf("expected addr to contain 8.8.4.4, got %q", pu.addr)
	}
}

// ======================================================================
// 12. buildUpstreams tests
// ======================================================================

func TestBuildUpstreams_DirectMode(t *testing.T) {
	clearBootstrapCache()
	upstreams, err := buildUpstreams([]string{"8.8.8.8", "tcp://1.1.1.1:53"}, "", "", "", "", nil)
	if err != nil {
		t.Fatalf("buildUpstreams failed: %v", err)
	}
	if len(upstreams) != 2 {
		t.Fatalf("expected 2 upstreams, got %d", len(upstreams))
	}
}

func TestBuildUpstreams_EmptyAddrs(t *testing.T) {
	upstreams, err := buildUpstreams([]string{}, "", "", "", "", nil)
	if err != nil {
		t.Fatalf("buildUpstreams failed: %v", err)
	}
	if len(upstreams) != 0 {
		t.Fatalf("expected 0 upstreams, got %d", len(upstreams))
	}
}

func TestBuildUpstreams_SkipsEmpty(t *testing.T) {
	clearBootstrapCache()
	upstreams, err := buildUpstreams([]string{"8.8.8.8", "", "  ", "tcp://1.1.1.1:53"}, "", "", "", "", nil)
	if err != nil {
		t.Fatalf("buildUpstreams failed: %v", err)
	}
	if len(upstreams) != 2 {
		t.Fatalf("expected 2 upstreams (skipping empty), got %d", len(upstreams))
	}
}

// ======================================================================
// 13. NewResolver validation
// ======================================================================

func TestNewResolver_NoUpstreams(t *testing.T) {
	_, err := NewResolver(nil)
	if err == nil {
		t.Fatal("expected error with no upstreams, got nil")
	}
}

func TestNewResolver_EmptyUpstreams(t *testing.T) {
	_, err := NewResolver([]upstream{})
	if err == nil {
		t.Fatal("expected error with empty upstreams, got nil")
	}
}

// ======================================================================
// 14. UpstreamConfig tests
// ======================================================================

func TestNewDoHUpstream_EmptyURL(t *testing.T) {
	_, err := newDoHUpstream(UpstreamConfig{URL: ""})
	if err == nil {
		t.Fatal("expected error with empty URL, got nil")
	}
}

func TestNewDoHUpstream_InvalidURL(t *testing.T) {
	_, err := newDoHUpstream(UpstreamConfig{URL: "://invalid"})
	if err == nil {
		t.Fatal("expected error with invalid URL, got nil")
	}
}

func TestNewDoHUpstream_ValidURL(t *testing.T) {
	up, err := newDoHUpstream(UpstreamConfig{URL: "https://dns.google/dns-query"})
	if err != nil {
		t.Fatalf("newDoHUpstream failed: %v", err)
	}
	if up.url != "https://dns.google/dns-query" {
		t.Errorf("url = %q, want %q", up.url, "https://dns.google/dns-query")
	}
}

func TestNewDoHUpstream_CustomTimeout(t *testing.T) {
	up, err := newDoHUpstream(UpstreamConfig{URL: "https://dns.google/dns-query", Timeout: 5000})
	if err != nil {
		t.Fatalf("newDoHUpstream failed: %v", err)
	}
	if up.client.Timeout != 5*time.Second {
		t.Errorf("timeout = %v, want %v", up.client.Timeout, 5*time.Second)
	}
}

// ======================================================================
// 15. Upstream String() tests
// ======================================================================

func TestUpstreamString(t *testing.T) {
	tests := []struct {
		up  upstream
		str string
	}{
		{&plainUpstream{tag: "udp://8.8.8.8:53"}, "udp://8.8.8.8:53"},
		{&plainUpstream{tag: "tcp://1.1.1.1:53"}, "tcp://1.1.1.1:53"},
		{&tlsUpstream{tag: "tls://dns.google:853"}, "tls://dns.google:853"},
		{&dohUpstream{url: "https://dns.google/dns-query"}, "https://dns.google/dns-query"},
	}
	for _, tt := range tests {
		if got := tt.up.String(); got != tt.str {
			t.Errorf("String() = %q, want %q", got, tt.str)
		}
	}
}

// ======================================================================
// 16. SOCKS5 Proxy infrastructure
// ======================================================================

// startSOCKS5Proxy starts a minimal SOCKS5 proxy for testing.
func startSOCKS5Proxy(t *testing.T) (string, func()) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	var closed bool
	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			conn, err := ln.Accept()
			if err != nil {
				if !closed {
					t.Logf("SOCKS5 proxy accept error: %v", err)
				}
				return
			}
			go handleSOCKS5Connect(t, conn)
		}
	}()
	return ln.Addr().String(), func() {
		closed = true
		ln.Close()
		<-done
	}
}

// handleSOCKS5Connect handles a SOCKS5 CONNECT request.
func handleSOCKS5Connect(t *testing.T, conn net.Conn) {
	defer conn.Close()

	buf := make([]byte, 2)
	if _, err := io.ReadFull(conn, buf); err != nil {
		return
	}
	if buf[0] != 0x05 {
		return
	}
	nMethods := int(buf[1])
	methods := make([]byte, nMethods)
	if _, err := io.ReadFull(conn, methods); err != nil {
		return
	}
	conn.Write([]byte{0x05, 0x00})

	reqBuf := make([]byte, 4)
	if _, err := io.ReadFull(conn, reqBuf); err != nil {
		return
	}
	if reqBuf[0] != 0x05 || reqBuf[1] != 0x01 {
		conn.Write([]byte{0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0})
		return
	}

	var targetAddr string
	switch reqBuf[3] {
	case 0x01:
		ipBuf := make([]byte, 4)
		if _, err := io.ReadFull(conn, ipBuf); err != nil {
			return
		}
		targetAddr = net.IP(ipBuf).String()
	case 0x03:
		domainLen := make([]byte, 1)
		if _, err := io.ReadFull(conn, domainLen); err != nil {
			return
		}
		domain := make([]byte, domainLen[0])
		if _, err := io.ReadFull(conn, domain); err != nil {
			return
		}
		targetAddr = string(domain)
	case 0x04:
		ipBuf := make([]byte, 16)
		if _, err := io.ReadFull(conn, ipBuf); err != nil {
			return
		}
		targetAddr = net.IP(ipBuf).String()
	default:
		conn.Write([]byte{0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0})
		return
	}

	portBuf := make([]byte, 2)
	if _, err := io.ReadFull(conn, portBuf); err != nil {
		return
	}
	port := int(portBuf[0])<<8 | int(portBuf[1])
	target := net.JoinHostPort(targetAddr, fmt.Sprintf("%d", port))

	targetConn, err := net.DialTimeout("tcp", target, 5*time.Second)
	if err != nil {
		conn.Write([]byte{0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0})
		return
	}

	localAddr := targetConn.LocalAddr().(*net.TCPAddr)
	bindIP := localAddr.IP.To4()
	bindPort := localAddr.Port
	reply := []byte{0x05, 0x00, 0x00, 0x01}
	reply = append(reply, bindIP...)
	reply = append(reply, byte(bindPort>>8), byte(bindPort))
	conn.Write(reply)

	go io.Copy(targetConn, conn)
	io.Copy(conn, targetConn)
	targetConn.Close()
}

// ======================================================================
// 17. SOCKS5 Proxy tests
// ======================================================================

func TestSOCKS5Proxy_TCP(t *testing.T) {
	dnsAddr, dnsCleanup := startMockTCPServer(t, simpleDNSHandler("example.com", []string{"93.184.216.34"}))
	defer dnsCleanup()

	proxyAddr, proxyCleanup := startSOCKS5Proxy(t)
	defer proxyCleanup()

	dialer, err := newSocks5Dialer(proxyAddr, "", "")
	if err != nil {
		t.Fatalf("newSocks5Dialer failed: %v", err)
	}

	info := parseUpstreamAddr("tcp://" + dnsAddr)
	up := newPlainUpstream(info, dialer)

	req := new(dns.Msg)
	req.SetQuestion("example.com.", dns.TypeA)
	req.RecursionDesired = true

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	resp, err := up.exchange(ctx, req)
	if err != nil {
		t.Fatalf("TCP exchange via SOCKS5 failed: %v", err)
	}
	if len(resp.Answer) == 0 {
		t.Fatal("expected answers via SOCKS5, got none")
	}
	a := resp.Answer[0].(*dns.A)
	if a.A.String() != "93.184.216.34" {
		t.Errorf("got IP %s, want 93.184.216.34", a.A.String())
	}
}

func TestSOCKS5Proxy_UDP(t *testing.T) {
	// UDP via SOCKS5 always uses TCP transport (SOCKS5 CONNECT gives TCP)
	dnsAddr, dnsCleanup := startMockTCPServer(t, simpleDNSHandler("example.com", []string{"10.0.0.1"}))
	defer dnsCleanup()

	proxyAddr, proxyCleanup := startSOCKS5Proxy(t)
	defer proxyCleanup()

	dialer, err := newSocks5Dialer(proxyAddr, "", "")
	if err != nil {
		t.Fatalf("newSocks5Dialer failed: %v", err)
	}

	info := parseUpstreamAddr("tcp://" + dnsAddr)
	up := newPlainUpstream(info, dialer)

	req := new(dns.Msg)
	req.SetQuestion("example.com.", dns.TypeA)
	req.RecursionDesired = true

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	resp, err := up.exchange(ctx, req)
	if err != nil {
		t.Fatalf("UDP-over-SOCKS5 exchange failed: %v", err)
	}
	a := resp.Answer[0].(*dns.A)
	if a.A.String() != "10.0.0.1" {
		t.Errorf("got IP %s, want 10.0.0.1", a.A.String())
	}
}

func TestSOCKS5Proxy_DoT(t *testing.T) {
	handler := simpleDNSHandler("example.com", []string{"93.184.216.34"})
	dotAddr, dotCleanup := startMockDoTServer(t, handler)
	defer dotCleanup()

	proxyAddr, proxyCleanup := startSOCKS5Proxy(t)
	defer proxyCleanup()

	dialer, err := newSocks5Dialer(proxyAddr, "", "")
	if err != nil {
		t.Fatalf("newSocks5Dialer failed: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	conn, err := dialer.DialContext(ctx, "tcp", dotAddr)
	if err != nil {
		t.Fatalf("SOCKS5 dial failed: %v", err)
	}
	defer conn.Close()

	// Verify certificate against test CA
	tlsConn := tls.Client(conn, &tls.Config{
		ServerName: "dns.test",
		RootCAs:    testCertPool,
	})
	defer tlsConn.Close()

	if err := tlsConn.HandshakeContext(ctx); err != nil {
		t.Fatalf("TLS handshake via SOCKS5 failed: %v", err)
	}

	req := new(dns.Msg)
	req.SetQuestion("example.com.", dns.TypeA)
	req.RecursionDesired = true

	dnsConn := &dns.Conn{Conn: tlsConn}
	defer dnsConn.Close()
	if err := dnsConn.WriteMsg(req); err != nil {
		t.Fatalf("write failed: %v", err)
	}
	resp, err := dnsConn.ReadMsg()
	if err != nil {
		t.Fatalf("read failed: %v", err)
	}
	if len(resp.Answer) == 0 {
		t.Fatal("expected answers, got none")
	}
}

func TestSOCKS5Proxy_DoH(t *testing.T) {
	dohAddr, dohCleanup := startMockDoHServer(t, simpleDNSHandler("example.com", []string{"93.184.216.34"}))
	defer dohCleanup()

	proxyAddr, proxyCleanup := startSOCKS5Proxy(t)
	defer proxyCleanup()

	dialer, err := newSocks5Dialer(proxyAddr, "", "")
	if err != nil {
		t.Fatalf("newSocks5Dialer failed: %v", err)
	}

	host, port, _ := net.SplitHostPort(dohAddr)
	dohURL := fmt.Sprintf("https://%s:%s/dns-query", host, port)

	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
			return dialer.DialContext(ctx, network, address)
		},
		TLSClientConfig: &tls.Config{
			ServerName: "dns.test",
			RootCAs:    testCertPool,
		},
	}
	client := &http.Client{Transport: transport, Timeout: 10 * time.Second}
	up := &dohUpstream{url: dohURL, client: client}

	req := new(dns.Msg)
	req.SetQuestion("example.com.", dns.TypeA)
	req.RecursionDesired = true

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	resp, err := up.exchange(ctx, req)
	if err != nil {
		t.Fatalf("DoH exchange via SOCKS5 failed: %v", err)
	}
	a := resp.Answer[0].(*dns.A)
	if a.A.String() != "93.184.216.34" {
		t.Errorf("got IP %s, want 93.184.216.34", a.A.String())
	}
}

func TestBuildUpstreams_SOCKS5Proxy(t *testing.T) {
	clearBootstrapCache()
	proxyAddr, proxyCleanup := startSOCKS5Proxy(t)
	defer proxyCleanup()

	upstreams, err := buildUpstreams(
		[]string{"8.8.8.8", "tcp://1.1.1.1:53"},
		"socks5", proxyAddr, "", "", nil,
	)
	if err != nil {
		t.Fatalf("buildUpstreams with SOCKS5 failed: %v", err)
	}
	if len(upstreams) != 2 {
		t.Fatalf("expected 2 upstreams, got %d", len(upstreams))
	}
}

// ======================================================================
// 18. buildResolverFromRequest tests
// ======================================================================

func TestBuildResolverFromRequest_MissingUpstreams(t *testing.T) {
	req, _ := http.NewRequest("POST", "/dns-query", nil)
	_, _, err := buildResolverFromRequest(req)
	if err == nil {
		t.Fatal("expected error with missing X-Upstreams header, got nil")
	}
}

func TestBuildResolverFromRequest_ValidHeaders(t *testing.T) {
	clearBootstrapCache()
	req, _ := http.NewRequest("POST", "/dns-query", nil)
	req.Header.Set("X-Upstreams", "8.8.8.8,1.1.1.1")
	req.Header.Set("X-Bootstrap-Addrs", "8.8.4.4")
	req.Header.Set("X-Fallback-Addrs", "9.9.9.9")

	resolver, cfg, err := buildResolverFromRequest(req)
	if err != nil {
		t.Fatalf("buildResolverFromRequest failed: %v", err)
	}
	if resolver == nil {
		t.Fatal("expected non-nil resolver")
	}
	if cfg.upstreams != "8.8.8.8,1.1.1.1" {
		t.Errorf("config.upstreams = %q, want %q", cfg.upstreams, "8.8.8.8,1.1.1.1")
	}
}

func TestBuildResolverFromRequest_WithProxy(t *testing.T) {
	clearBootstrapCache()
	proxyAddr, proxyCleanup := startSOCKS5Proxy(t)
	defer proxyCleanup()

	req, _ := http.NewRequest("POST", "/dns-query", nil)
	req.Header.Set("X-Upstreams", "8.8.8.8")
	req.Header.Set("X-Proxy", "socks5")
	req.Header.Set("X-Proxy-Addr", proxyAddr)

	resolver, _, err := buildResolverFromRequest(req)
	if err != nil {
		t.Fatalf("buildResolverFromRequest with proxy failed: %v", err)
	}
	if resolver == nil {
		t.Fatal("expected non-nil resolver")
	}
}

// ======================================================================
// 19. Full integration tests
// ======================================================================

func TestIntegration_DirectUDP_FullPipeline(t *testing.T) {
	clearBootstrapCache()
	dnsAddr, cleanup := startMockUDPServer(t, simpleDNSHandler("integration.com", []string{"10.20.30.40"}))
	defer cleanup()

	upstreams, err := buildUpstreams([]string{dnsAddr}, "", "", "", "", nil)
	if err != nil {
		t.Fatalf("buildUpstreams failed: %v", err)
	}
	r, _ := NewResolver(upstreams)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp, err := r.Query(ctx, "integration.com", dns.TypeA)
	if err != nil {
		t.Fatalf("Query failed: %v", err)
	}
	a := resp.Answer[0].(*dns.A)
	if a.A.String() != "10.20.30.40" {
		t.Errorf("got IP %s, want 10.20.30.40", a.A.String())
	}
}

func TestIntegration_DirectTCP_FullPipeline(t *testing.T) {
	clearBootstrapCache()
	dnsAddr, cleanup := startMockTCPServer(t, simpleDNSHandler("integration.com", []string{"10.20.30.41"}))
	defer cleanup()

	upstreams, err := buildUpstreams([]string{"tcp://" + dnsAddr}, "", "", "", "", nil)
	if err != nil {
		t.Fatalf("buildUpstreams failed: %v", err)
	}
	r, _ := NewResolver(upstreams)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp, err := r.Query(ctx, "integration.com", dns.TypeA)
	if err != nil {
		t.Fatalf("Query failed: %v", err)
	}
	a := resp.Answer[0].(*dns.A)
	if a.A.String() != "10.20.30.41" {
		t.Errorf("got IP %s, want 10.20.30.41", a.A.String())
	}
}

func TestIntegration_SOCKS5_TCP_FullPipeline(t *testing.T) {
	clearBootstrapCache()
	dnsAddr, dnsCleanup := startMockTCPServer(t, simpleDNSHandler("socks5-test.com", []string{"10.20.30.42"}))
	defer dnsCleanup()

	proxyAddr, proxyCleanup := startSOCKS5Proxy(t)
	defer proxyCleanup()

	upstreams, err := buildUpstreams(
		[]string{"tcp://" + dnsAddr},
		"socks5", proxyAddr, "", "", nil,
	)
	if err != nil {
		t.Fatalf("buildUpstreams failed: %v", err)
	}
	r, _ := NewResolver(upstreams)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	resp, err := r.Query(ctx, "socks5-test.com", dns.TypeA)
	if err != nil {
		t.Fatalf("Query failed: %v", err)
	}
	a := resp.Answer[0].(*dns.A)
	if a.A.String() != "10.20.30.42" {
		t.Errorf("got IP %s, want 10.20.30.42", a.A.String())
	}
}

func TestIntegration_FallbackAfterUpstreamFail(t *testing.T) {
	clearBootstrapCache()
	fbAddr, fbCleanup := startMockUDPServer(t, simpleDNSHandler("fallback-int.com", []string{"10.20.30.43"}))
	defer fbCleanup()

	upstreams, _ := buildUpstreams([]string{"0.0.0.0:1"}, "", "", "", "", nil)
	r, _ := NewResolver(upstreams, WithFallback([]string{fbAddr}))

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	resp, err := r.Query(ctx, "fallback-int.com", dns.TypeA)
	if err != nil {
		t.Fatalf("Query failed: %v", err)
	}
	a := resp.Answer[0].(*dns.A)
	if a.A.String() != "10.20.30.43" {
		t.Errorf("got IP %s, want 10.20.30.43", a.A.String())
	}
}

func TestIntegration_BootstrapResolvesUpstreamDomain(t *testing.T) {
	clearBootstrapCache()
	bootstrapAddr, bsCleanup := startMockUDPServer(t, simpleDNSHandler("dns.upstream.test", []string{"127.0.0.1"}))
	defer bsCleanup()

	upstreamAddr, upCleanup := startMockUDPServer(t, simpleDNSHandler("final.example", []string{"10.30.40.50"}))
	defer upCleanup()

	host, port, _ := net.SplitHostPort(upstreamAddr)
	// Pre-set cache so buildUpstreamFromAddr can resolve the domain
	setCachedIP("dns.upstream.test", host, 5*time.Minute)

	upstreams, err := buildUpstreams(
		[]string{fmt.Sprintf("udp://dns.upstream.test:%s", port)},
		"", "", "", "",
		[]string{bootstrapAddr},
	)
	if err != nil {
		t.Fatalf("buildUpstreams failed: %v", err)
	}
	r, _ := NewResolver(upstreams)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp, err := r.Query(ctx, "final.example", dns.TypeA)
	if err != nil {
		t.Fatalf("Query failed: %v", err)
	}
	a := resp.Answer[0].(*dns.A)
	if a.A.String() != "10.30.40.50" {
		t.Errorf("got IP %s, want 10.30.40.50", a.A.String())
	}
}
