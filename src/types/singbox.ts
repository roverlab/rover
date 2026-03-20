import type {
    MihomoConfig,
    ProxyGroup,
    ProxyNode,
    ShadowsocksProxy,
    VMessProxy,
    VLESSProxy,
    Hysteria2Proxy,
    TuicProxy,
    TrojanProxy,
    AnyTLSProxy
} from './clash';

/**
 * PolicyRule 类型定义
 * 用于表示单条策略规则
 */
export interface PolicyRule {
    id: string;
    type: 'geoip' | 'geosite' | 'domain' | 'domain_keyword' | 'domain_suffix' | 'ip_cidr' | 'src_ip_cidr' | 'port' | 'process_name' | 'package' | 'rule_set' | 'protocol';
    values: string[];
    operator: 'AND' | 'OR';
    outbound: string;
}

export interface SingboxConfig {
    $schema?: string;
    log?: LogConfig;
    experimental?: ExperimentalConfig;
    inbounds?: InboundConfig[];
    outbounds?: OutboundConfig[];
    route?: RouteConfig;
    dns?: DnsConfig;
}

export interface LogConfig {
    disabled?: boolean;
    level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'panic';
    output?: string;
    timestamp?: boolean;
}

export interface ExperimentalConfig {
    clash_api?: {
        external_controller?: string;
        secret?: string;
        default_mode?: 'rule' | 'global' | 'direct';
        access_control_allow_origin?: string[];
        access_control_allow_private_network?: boolean;
    };
    cache_file?: {
        enabled?: boolean;
        path?: string;
        cache_id?: string;
        store_fakeip?: boolean;
        store_rdrc?: boolean;
        rdrc_timeout?: string;
    };
}

export interface InboundConfig {
    type: string;
    tag: string;
    listen?: string;
    listen_port?: number;
    tcp_fast_open?: boolean;
    tcp_multi_path?: boolean;
    udp_fragment?: boolean;
    sniff?: boolean;
    interface_name?: string;
    address?: string[];
    route_exclude_address?: string[];
}

/** sing-box 出站 TLS 配置（仅支持的字段） */
export interface OutboundTls {
    enabled: true;
    insecure?: boolean;
    server_name?: string;
    reality?: { enabled: true; public_key: string; short_id: string };
    utls?: { enabled: true; fingerprint: string };
}

/** sing-box 传输层配置（仅支持的字段） */
export type TransportConfig =
    | { type: 'ws'; path?: string; headers?: Record<string, string> }
    | { type: 'grpc'; service_name: string }
    | { type: 'http' };

/** sing-box shadowsocks 出站 */
export interface ShadowsocksOutbound {
    type: 'shadowsocks';
    tag: string;
    server: string;
    server_port: number;
    method: string;
    password?: string;
    tcp_fast_open?: boolean;
}

/** sing-box vmess 出站 */
export interface VMessOutbound {
    type: 'vmess';
    tag: string;
    server: string;
    server_port: number;
    uuid: string;
    alter_id: number;
    security: string;
    transport?: TransportConfig;
    tls?: OutboundTls;
    tcp_fast_open?: boolean;
}

/** sing-box vless 出站 */
export interface VLESSOutbound {
    type: 'vless';
    tag: string;
    server: string;
    server_port: number;
    uuid: string;
    flow?: string;
    transport?: TransportConfig;
    tls?: OutboundTls;
    tcp_fast_open?: boolean;
}

/** sing-box hysteria2 出站 */
export interface Hysteria2Outbound {
    type: 'hysteria2';
    tag: string;
    server: string;
    server_port: number;
    password?: string;
    up_mbps?: number;
    down_mbps?: number;
    tcp_fast_open?: boolean;
    tls: OutboundTls;
}

/** sing-box tuic 出站 */
export interface TuicOutbound {
    type: 'tuic';
    tag: string;
    server: string;
    server_port: number;
    uuid: string;
    password?: string;
    congestion_control?: 'cubic' | 'new_reno' | 'bbr';
    tls: OutboundTls;
    tcp_fast_open?: boolean;
}

/** sing-box trojan 出站 */
export interface TrojanOutbound {
    type: 'trojan';
    tag: string;
    server: string;
    server_port: number;
    password?: string;
    transport?: TransportConfig;
    tls: OutboundTls;
    tcp_fast_open?: boolean;
}

export interface OutboundConfig {
    type: string;
    tag: string;
    server?: string;
    server_port?: number;
    interrupt_exist_connections?: boolean;
    outbounds?: string[];
    url?: string;
    interval?: string;
    tolerance?: number;
    password?: string;
    uuid?: string;
    method?: string;
    security?: string;
    alter_id?: number;
    up_mbps?: number;
    down_mbps?: number;
    tls?: {
        enabled?: boolean;
        insecure?: boolean;
        server_name?: string;
        reality?: {
            enabled?: boolean;
            public_key?: string;
            short_id?: string;
        };
        utls?: {
            enabled?: boolean;
            fingerprint?: string;
        };
    };
    packet_encoding?: string;
    flow?: string;
    transport?: TransportConfig;
    idle_session_check_interval?: string;
    idle_session_timeout?: string;
    min_idle_session?: number;
    tcp_fast_open?: boolean;
    congestion_control?: string;
}

export interface RouteConfig {
    rules?: DnsPlainRule[];
    rule_set?: RuleSetConfig[];
    auto_detect_interface?: boolean;
    final?: string;
    default_domain_resolver?: string;
}

/**
 * sing-box DNS 配置
 */
export interface DnsConfig {
    servers?: DnsServer[];
    rules?: DnsRule[];
    final?: string;
    strategy?: 'prefer_ipv4' | 'prefer_ipv6' | 'ipv4_only' | 'ipv6_only';
}

/**
 * sing-box DNS 服务器配置
 */
export interface DnsServer {
    tag: string;
    type: 'local' | 'remote' | 'hosts';
    address?: string;
    bootstrap?: string;
    detour?: string;
    path?: string;
}

/**
 * sing-box 纯规则（不含逻辑嵌套）
 * 包含所有匹配字段，不含 type/mode/rules
 */
export interface HeadlessPlainRule {
    domain?: string[] | string;
    domain_suffix?: string[] | string;
    domain_keyword?: string[] | string;
    domain_regex?: string[] | string;
    ip_cidr?: string[] | string;
    source_ip_cidr?: string[] | string;
    source_port?: number[];
    /** 源端口范围 */
    source_port_range?: string[] | string;
    port?: number[];
    port_range?: string[] | string;
    process_name?: string[] | string;
    process_path?: string[] | string;
    /** 进程路径正则 */
    process_path_regex?: string[] | string;
    /** 包名 (Android) */
    package_name?: string[] | string;
    /** DNS 查询类型 */
    query_type?: (string | number)[];
    /** 网络协议 tcp/udp */
    network?: string[] | string;
    /** 网络类型 wifi/cellular/ethernet/other */
    network_type?: string[] | string;
    /** 默认接口地址 */
    default_interface_address?: string[] | string;
    /** WiFi SSID */
    wifi_ssid?: string[] | string;
    /** WiFi BSSID */
    wifi_bssid?: string[] | string;
    /** 网络计费 */
    network_is_expensive?: boolean;
    /** 低数据模式 */
    network_is_constrained?: boolean;
    /** 网络接口地址 */
    network_interface_address?: Record<string, string[]>;
    ip_is_private?: boolean;
}
/**
 * sing-box 逻辑规则（支持嵌套）
 * 用于逻辑组合规则
 */
export interface HeadlessLogicRule {
    type: 'logical';
    mode: 'and' | 'or';
    invert?: boolean;
    rules: HeadlessRule[];
}

/**
 * sing-box 无头规则（基础规则字段，不含 outbound）
 * 用于规则集，也可作为 RouteRule 和 DnsRule 的基础
 * 可以是纯规则或逻辑规则
 */
export type HeadlessRule = HeadlessPlainRule | HeadlessLogicRule;

/**
 * sing-box 纯路由规则（基于 HeadlessPlainRule 扩展 outbound 和 rule_set）
 */
export interface RoutePlainRule extends HeadlessPlainRule {
    outbound?: string;
    /** 规则集引用 */
    rule_set?: string[];
}

/**
 * sing-box 逻辑路由规则（基于 HeadlessLogicRule 扩展 outbound 和 rule_set）
 */
export interface RouteLogicRule extends HeadlessLogicRule {
    outbound?: string;
    /** 规则集引用 */
    rule_set?: string[];
    rules: HeadlessRule[];
}


export interface OriginRouteRule extends RoutePlainRule , RouteLogicRule {
    outbound?: string;
    /** 规则集引用 */
    rule_set?: string[];
    /** 路由动作 */
    action?: string;
    /** 协议 */
    protocol?: string | string[];
}

/**
 * sing-box 路由规则（可以是纯规则或逻辑规则）
 */
export type RouteRule = RoutePlainRule | RouteLogicRule;

/**
 * sing-box 纯 DNS 规则（基于 HeadlessPlainRule 扩展 DNS 特有字段和 rule_set）
 */
export interface DnsPlainRule extends HeadlessPlainRule {
    server?: string;
    protocol?: string[] | string;
    action?: string;
    rcode?: string;
    answer?: string[];
    ip_accept_any?: boolean;
    /** 规则集引用 */
    rule_set?: string[];
    outbound?: string;
    inbound?: string;
}

/**
 * sing-box 逻辑 DNS 规则（基于 HeadlessLogicRule 扩展 DNS 特有字段和 rule_set）
 */
export interface DnsLogicRule extends HeadlessLogicRule {
    server?: string;
    protocol?: string[];
    action?: string;
    rcode?: string;
    answer?: string[];
    ip_accept_any?: boolean;
    /** 规则集引用 */
    rule_set?: string[];
    rules: HeadlessRule[];
}

/**
 * sing-box DNS 规则（可以是纯规则或逻辑规则）
 */
export type DnsRule = DnsPlainRule | DnsLogicRule;

export interface RuleSetConfig {
    tag: string;
    type: 'remote' | 'local';
    format?: 'binary' | 'source';
    url?: string;
    path?: string;
    download_detour?: string;
    update_interval?: string;
}

/** 转换选项 */
export interface ConvertOptions {
    /** 跳过规则转换（当使用自定义分流时可跳过，提升性能） */
    skipRules?: boolean;
}

export interface RuleConversionStats {
    /** Clash 输入规则条数（不含 MATCH） */
    inputRuleCount: number;
    /** 转换后 sing-box 规则条数 */
    outputRuleCount: number;
    /** 输入匹配条件总数（每条规则 1 个条件） */
    inputMatchCount: number;
    /** 输出匹配条件总数（合并后各数组长度之和） */
    outputMatchCount: number;
    /** 匹配条件数量是否一致 */
    matchCountOk: boolean;
}
