/** * Mihomo (Clash Meta) Configuration Definitions
 */
export interface MihomoConfig {
  // --- 基础字段 (全部设为可选，因为内核有默认值) ---
  'mixed-port'?: number;
  port?: number;
  'socks-port'?: number;
  'allow-lan'?: boolean;
  'bind-address'?: string;
  mode?: 'rule' | 'global' | 'direct';
  'log-level'?: 'info' | 'warning' | 'error' | 'debug' | 'silent';
  ipv6?: boolean;
  'external-controller'?: string;
  'external-ui'?: string;
  secret?: string;
  'unified-delay'?: boolean; // Meta 特有：统一延迟
  'tcp-concurrent'?: boolean; // Meta 特有：TCP 并发

  // --- 增强功能 ---
  sniffer?: SnifferConfig;
  dns?: MihomoDnsConfig;
  tun?: Record<string, any>;
  experimental?: {
    'ignore-resolve-fail'?: boolean;
    'udp-fallback-match'?: boolean;
  };

  // --- 代理与组 ---
  proxies?: ProxyNode[];
  'proxy-groups'?: ProxyGroup[];
  'proxy-providers'?: Record<string, ProxyProvider>;
  
  // --- 规则 ---
  rules?: string[];
  'rule-providers'?: Record<string, RuleProvider>;
  
  // --- 兼容字段 (GUI 专用) ---
  hosts?: Record<string, string>;
}

// --- 嗅探配置 (Meta 核心强项) ---
export interface SnifferConfig {
  enable: boolean;
  sniff?: {
    TLS?: { ports?: number[] };
    HTTP?: { ports?: number[]; 'dst-port-override'?: boolean };
    QUIC?: { ports?: number[] };
  };
  'force-domain'?: string[];
  'skip-domain'?: string[];
}

// --- DNS 配置 ---
export interface MihomoDnsConfig {
  enable: boolean;
  listen?: string;
  ipv6?: boolean;
  'enhanced-mode': 'fake-ip' | 'redir-host';
  'fake-ip-range'?: string;
  'fake-ip-filter'?: string[];
  'default-nameserver'?: (string | number)[];
  nameserver: (string | number)[];
  fallback?: (string | number)[];
  'nameserver-policy'?: Record<string, string | string[]>;
  'fallback-filter'?: {
    geoip?: boolean;
    geoip_code?: string;
    ipcidr?: string[];
    domain?: string[];
  };
}

// --- 代理节点联合类型 (Discriminated Unions) ---
export type ProxyNode = 
  | ShadowsocksProxy 
  | VMessProxy 
  | VLESSProxy 
  | Hysteria2Proxy 
  | TuicProxy 
  | TrojanProxy 
  | AnyTLSProxy;

interface BaseProxy {
  name: string;
  server: string;
  port: number;
  udp?: boolean;
  tfo?: boolean; // TCP Fast Open
  'skip-cert-verify'?: boolean;
}

export interface ShadowsocksProxy extends BaseProxy {
  type: 'ss';
  cipher: string;
  password?: string;
}

export interface VMessProxy extends BaseProxy {
  type: 'vmess';
  uuid: string;
  alterId: number;
  cipher: string;
  network?: 'ws' | 'tcp' | 'grpc' | 'h2';
  'ws-opts'?: { path: string; headers?: Record<string, string> };
  'grpc-opts'?: { 'grpc-service-name': string };
}

export interface VLESSProxy extends BaseProxy {
  type: 'vless';
  uuid: string;
  flow?: 'xtls-rprx-vision' | 'xtls-rprx-vision-tls';
  tls: boolean;
  servername?: string;
  network?: 'ws' | 'tcp' | 'grpc';
  'client-fingerprint'?: 'chrome' | 'firefox' | 'safari' | 'random';
}

export interface Hysteria2Proxy extends BaseProxy {
  type: 'hysteria2';
  password?: string;
  sni?: string;
  up?: string; // e.g. "20 Mbps"
  down?: string;
}

export interface TuicProxy extends BaseProxy {
  type: 'tuic';
  uuid: string;
  password?: string;
  version?: number;
  'congestion-controller'?: 'cubic' | 'new_reno' | 'bbr';
}

export interface TrojanProxy extends BaseProxy {
  type: 'trojan';
  password?: string;
  sni?: string;
  network?: 'ws' | 'grpc';
}

/** Mihomo AnyTLS 代理（sing-box 1.12.0+ 支持） */
export interface AnyTLSProxy extends BaseProxy {
  type: 'anytls';
  password: string;
  sni?: string;
  alpn?: string[];
  'client-fingerprint'?: string;
  'idle-session-check-interval'?: number;
  'idle-session-timeout'?: number;
  'min-idle-session'?: number;
}

// --- 策略组 ---
export interface ProxyGroup {
  name: string;
  type: 'select' | 'url-test' | 'fallback' | 'load-balance';
  proxies: string[]; // 可以包含其他组名或节点名
  url?: string;
  interval?: number;
  tolerance?: number;
  lazy?: boolean;
}

// --- Providers (Meta 用户常用远程资源) ---
export interface ProxyProvider {
  type: 'http' | 'file';
  path: string;
  url?: string;
  interval?: number;
  filter?: string; // 正则过滤节点
  health_check?: {
    enable: boolean;
    url: string;
    interval: number;
  };
}

/**
 * Rule Provider 规则集配置
 * @see https://clash.wiki/premium/rule-providers.html
 */
export interface RuleProvider {
  /** 行为类型：domain(域名)、ipcidr(IP段)、classical(经典规则) */
  behavior: 'domain' | 'ipcidr' | 'classical';
  /** 来源类型 */
  type: 'http' | 'file';
  /** 本地缓存路径 */
  path: string;
  /** 远程 URL（type=http 时必填） */
  url?: string;
  /** 更新间隔（秒），如 3600 */
  interval?: number;
  /** 规则文件格式，默认 yaml */
  format?: 'yaml' | 'text';
}

/** domain 行为下的 payload 项：域名模式，如 .blogger.com、*.*.microsoft.com */
export type RuleSetPayloadDomain = string[];

/** ipcidr 行为下的 payload 项：CIDR 格式，如 192.168.1.0/24 */
export type RuleSetPayloadIpcidr = string[];

/** classical 行为下的规则类型 */
export type ClassicalRuleType =
  | 'DOMAIN-SUFFIX'
  | 'DOMAIN-KEYWORD'
  | 'DOMAIN'
  | 'SRC-IP-CIDR'
  | 'IP-CIDR'
  | 'GEOIP'
  | 'DST-PORT'
  | 'SRC-PORT'
  | 'MATCH';

/** classical 行为下的 payload 项：经典规则字符串，如 DOMAIN-SUFFIX,google.com */
export type RuleSetPayloadClassical = string[];

/** 规则集文件 payload 结构（yaml 格式） */
export interface RuleSetFileYaml {
  payload: string[];
}

/** rules 中 RULE-SET 规则格式：RULE-SET,<provider_name>,<policy> */
export type RuleSetRule = `RULE-SET,${string},${string}`;