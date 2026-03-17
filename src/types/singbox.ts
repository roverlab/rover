import { getDataDir } from '@/electron/paths';
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
    AnyTLSProxy,
    RuleProvider
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
    [key: string]: any;
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
    [key: string]: any;
}

export interface RouteConfig {
    rules?: RouteRule[];
    rule_set?: RuleSetConfig[];
    auto_detect_interface?: boolean;
    final?: string;
    default_domain_resolver?: {
        server: string;
        [key: string]: any;
    };
    [key: string]: any;
}

/**
 * sing-box DNS 配置
 */
export interface DnsConfig {
    servers?: DnsServer[];
    rules?: DnsRule[];
    final?: string;
    strategy?: 'prefer_ipv4' | 'prefer_ipv6' | 'ipv4_only' | 'ipv6_only';
    [key: string]: any;
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
    [key: string]: any;
}

/**
 * sing-box DNS 规则
 */
export interface DnsRule {
    server?: string;
    [key: string]: any;
}

/** sing-box 路由规则（包含 outbound） */
export interface RouteRule {
    outbound: string;
    [key: string]: any;
}

/** sing-box 无头规则（不含 outbound，用于规则集） */
export type HeadlessRule = Omit<RouteRule, 'outbound'>;

export interface RuleSetConfig {
    tag: string;
    type: 'remote' | 'local';
    format?: 'binary' | 'source';
    url?: string;
    path?: string;
    download_detour?: string;
}

const CLASH_LOG_LEVEL_MAP: Record<
    NonNullable<MihomoConfig['log-level']>,
    LogConfig['level'] | undefined
> = {
    info: 'info',
    warning: 'warn',
    error: 'error',
    debug: 'debug',
    silent: undefined
};

/** 转换选项 */
export interface ConvertOptions {
    /** 跳过规则转换（当使用自定义分流时可跳过，提升性能） */
    skipRules?: boolean;
}

export function convertClashToSingbox(config: MihomoConfig , options?: ConvertOptions): SingboxConfig {
    const outbounds = buildOutbounds(config);
    const inbounds = buildInbounds(config);

    // 如果跳过规则转换，直接返回不含规则的基础配置
    if (options?.skipRules) {
        return {
            log: buildLogConfig(config),
            experimental: buildExperimentalConfig(config),
            inbounds: inbounds.length > 0 ? inbounds : undefined,
            outbounds: outbounds.length > 0 ? outbounds : undefined,
            route: undefined // 规则将由自定义分流生成
        };
    }

    // 收集所有 GEOIP 和 GEOSITE 规则值
    const geoipValues = new Set<string>();
    const geositeValues = new Set<string>();
    // 收集所有自定义 rule-providers 的引用
    const customRuleSetValues = new Set<string>();

    (config.rules ?? []).forEach(rule => {
        const segments = rule.split(',').map(s => s.trim()).filter(Boolean);
        if (segments.length >= 2) {
            const ruleType = segments[0].toUpperCase();
            if (ruleType === 'GEOIP') {
                const val = segments[1].toLowerCase();
                // lan/private 无对应 .srs 文件，改用 ip_is_private，不加入 geoipValues
                if (val !== 'lan' && val !== 'private') {
                    geoipValues.add(segments[1]);
                }
            } else if (ruleType === 'GEOSITE') {
                geositeValues.add(segments[1]);
            } else if (ruleType === 'RULE-SET') {
                // 收集自定义 rule-set 引用
                const ruleSetName = segments[1];
                // 排除内置的 geosite: 和 geoip: 前缀
                if (!ruleSetName.startsWith('geosite:') && !ruleSetName.startsWith('geoip:')) {
                    customRuleSetValues.add(ruleSetName);
                }
            }
        }
    });

    const rules = mergeRouteRules(
        (config.rules ?? [])
            .map((rule) => convertClashRuleToRouteRule(rule, true))
            .filter((rule): rule is RouteRule => Boolean(rule))
    );
    const final = resolveFinalOutbound(config);

    // 构建 rule_set 配置
    const ruleSets = buildRuleSetConfigs(geoipValues, geositeValues);

    return {
        log: buildLogConfig(config),
        experimental: buildExperimentalConfig(config),
        inbounds: inbounds.length > 0 ? inbounds : undefined,
        outbounds: outbounds.length > 0 ? outbounds : undefined,
        route: rules.length > 0 || final
            ? {
                rule_set: [],
                rules: rules.length > 0 ? rules : undefined,
                final
            }
            : undefined
    };
}

/** 可合并规则中的数组字段 */
const ARRAY_MATCH_KEYS = ['domain', 'domain_suffix', 'domain_keyword', 'ip_cidr', 'source_ip_cidr', 'rule_set', 'port', 'source_port', 'process_name', 'process_path', 'network'];

/**
 * 统计单条 route 规则中的匹配条件数量
 */
function countRuleMatchConditions(rule: RouteRule): number {
    let count = 0;
    for (const key of ARRAY_MATCH_KEYS) {
        const val = rule[key];
        if (Array.isArray(val)) count += val.length;
    }
    // 无数组条件时（如 MATCH）计为 1
    return count > 0 ? count : 1;
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

/**
 * 验证 Clash -> sing-box 分流规则转换是否正确
 */
export function getRuleConversionStats(clashConfig: MihomoConfig, singboxConfig: SingboxConfig): RuleConversionStats {
    const inputRules = (clashConfig.rules ?? []).filter(
        r => r.split(',')[0].trim().toUpperCase() !== 'MATCH'
    );
    const outputRules = singboxConfig.route?.rules ?? [];

    const inputMatchCount = inputRules.length;
    const outputMatchCount = outputRules.reduce((sum, r) => sum + countRuleMatchConditions(r), 0);

    return {
        inputRuleCount: inputRules.length,
        outputRuleCount: outputRules.length,
        inputMatchCount,
        outputMatchCount,
        matchCountOk: inputMatchCount === outputMatchCount
    };
}

function buildLogConfig(config: MihomoConfig): LogConfig | undefined {
    const level = config['log-level'];
    if (!level) {
        return undefined;
    }

    if (level === 'silent') {
        return { disabled: true };
    }

    return { level: CLASH_LOG_LEVEL_MAP[level], timestamp: true };
}

function buildExperimentalConfig(config: MihomoConfig): ExperimentalConfig | undefined {
    const clashApi = {
        external_controller: config['external-controller'],
        secret: config.secret,
        default_mode: config.mode
    };

    if (!hasDefinedValue(clashApi)) {
        return undefined;
    }

    return {
        clash_api: clashApi
    };
}

function buildInbounds(config: MihomoConfig): InboundConfig[] {
    const listen = normalizeListenAddress(config);
    const sniff = config.sniffer?.enable;
    const inbounds: InboundConfig[] = [];

    if (config['mixed-port']) {
        inbounds.push({
            type: 'mixed',
            tag: 'mixed-in',
            listen,
            listen_port: config['mixed-port'],
            sniff,
            tcp_multi_path: config['tcp-concurrent']
        });
    }

    if (config.port) {
        inbounds.push({
            type: 'http',
            tag: 'http-in',
            listen,
            listen_port: config.port,
            sniff,
            tcp_multi_path: config['tcp-concurrent']
        });
    }

    if (config['socks-port']) {
        inbounds.push({
            type: 'socks',
            tag: 'socks-in',
            listen,
            listen_port: config['socks-port'],
            sniff,
            tcp_multi_path: config['tcp-concurrent']
        });
    }

    if (config.tun?.enable) {
        inbounds.push(tunDefaultConfig);
    }

    return inbounds;
}

export const tunDefaultConfig = {
    type: 'tun',
    tag: 'tun-in',
    interface_name: 'utun199',
    mtu: 9000,
    address: [
        '172.19.0.1/30',
        'fdfe:dcba:9876::1/126'
    ],
    auto_route: true,
    strict_route: true,
    stack: 'system',
    route_exclude_address: [
        '192.168.0.0/16',
        'fc00::/7'
    ],
    sniff: true,
    sniff_override_destination: true,
    endpoint_independent_nat: false
}

function buildOutbounds(config: MihomoConfig): OutboundConfig[] {
    const builtins = buildBuiltinOutbounds(config);

    // Collect SSR proxy names to filter them out from groups as well
    const ssrProxyNames = new Set(
        (config.proxies ?? [])
            .filter(proxy => (proxy as any).type === 'ssr')
            .map(proxy => proxy.name)
    );

    // Collect load-balance group names to filter them out from references
    const loadBalanceGroupNames = new Set(
        (config['proxy-groups'] ?? [])
            .filter(group => group.type === 'load-balance')
            .map(group => group.name)
    );

    // Filter out SSR proxies as sing-box doesn't support SSR protocol
    const proxies = (config.proxies ?? [])
        .filter(proxy => (proxy as any).type !== 'ssr')
        .map(convertProxyNodeToOutbound);

    const validProxyTags = new Set(proxies.map((proxy) => proxy.tag));

    // Filter out SSR proxy references and load-balance groups first
    const groupCandidates = (config['proxy-groups'] ?? [])
        .filter(group => group.type !== 'load-balance') // 忽略 load-balance 类型
        .map(group => ({
            ...group,
            proxies: group.proxies.filter(name =>
                !ssrProxyNames.has(name) && !loadBalanceGroupNames.has(name)
            )
        }));

    const validGroupTags = new Set(groupCandidates.map((group) => group.name));

    // Remove invalid references and ensure every group has at least one outbound.
    // sing-box selector/urltest requires non-empty `outbounds`.
    const groups = groupCandidates
        .map(group => ({
            ...group,
            proxies: group.proxies.filter((name) => validProxyTags.has(name) || validGroupTags.has(name))
        }))
        .map(group => {
            if (!group.proxies || group.proxies.length === 0) {
                return { ...group, proxies: ['DIRECT'] };
            }
            return group;
        })
        .map(convertProxyGroupToOutbound);

    return [...builtins, ...proxies, ...groups];
}

function buildBuiltinOutbounds(config: MihomoConfig): OutboundConfig[] {
    const tags = new Set([
        ...(config.proxies ?? []).map((proxy) => proxy.name),
        ...(config['proxy-groups'] ?? []).map((group) => group.name)
    ]);
    const builtins: OutboundConfig[] = [];

    if (!tags.has('DIRECT')) {
        builtins.push({ type: 'direct', tag: 'DIRECT' });
    }

    if (!tags.has('REJECT')) {
        builtins.push({ type: 'block', tag: 'REJECT' });
    }

    return builtins;
}

/** 解析 Clash up/down 带宽字符串（如 "50 Mbps"）为 sing-box 所需的数值 Mbps */
function parseMbps(value: string | number | undefined): number | undefined {
    if (value == null) return undefined;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    const m = String(value).match(/^(\d+(?:\.\d+)?)\s*(?:mbps|mb\/s)?$/i);
    return m ? parseFloat(m[1]) : undefined;
}

function buildVmessTls(n: VMessProxy): OutboundTls | undefined {
    if (n['skip-cert-verify'] === undefined) return undefined;
    const tls: OutboundTls = { enabled: true, insecure: n['skip-cert-verify'] };
    if (n['client-fingerprint']) tls.utls = { enabled: true, fingerprint: n['client-fingerprint'] };
    return tls;
}

function buildVlessTls(n: VLESSProxy): OutboundTls | undefined {
    if (!n.tls) return undefined;
    const tls: OutboundTls = {
        enabled: true,
        insecure: n['skip-cert-verify'],
        server_name: n.servername
    };
    const ro = (n as { 'reality-opts'?: { 'public-key'?: string; 'short-id'?: string } })['reality-opts'];
    if (ro?.['public-key'] && ro?.['short-id']) {
        tls.reality = { enabled: true, public_key: ro['public-key'], short_id: ro['short-id'] };
    }
    if (n['client-fingerprint']) tls.utls = { enabled: true, fingerprint: n['client-fingerprint'] };
    return tls;
}

function convertProxyNodeToOutbound(node: ProxyNode): OutboundConfig {
    switch (node.type) {
        case 'ss': {
            const n = node as ShadowsocksProxy;
            const out: ShadowsocksOutbound = {
                type: 'shadowsocks',
                tag: n.name,
                server: n.server,
                server_port: n.port,
                method: n.cipher
            };
            if (n.password) out.password = n.password;
            if (n.tfo) out.tcp_fast_open = true;
            return out;
        }
        case 'vmess': {
            const n = node as VMessProxy;
            const out: VMessOutbound = {
                type: 'vmess',
                tag: n.name,
                server: n.server,
                server_port: n.port,
                uuid: n.uuid,
                alter_id: n.alterId,
                security: n.cipher
            };
            const transport = buildTransport(n.network, n['ws-opts'], n['grpc-opts']);
            if (transport) out.transport = transport;
            const tls = buildVmessTls(n);
            if (tls) out.tls = tls;
            if (n.tfo) out.tcp_fast_open = true;
            return out;
        }
        case 'vless': {
            const n = node as VLESSProxy;
            const out: VLESSOutbound = {
                type: 'vless',
                tag: n.name,
                server: n.server,
                server_port: n.port,
                uuid: n.uuid
            };
            if (n.flow) out.flow = n.flow;
            const transport = buildTransport(n.network, (n as { 'ws-opts'?: { path?: string; headers?: Record<string, string> }; 'grpc-opts'?: { 'grpc-service-name'?: string } })['ws-opts'], (n as { 'grpc-opts'?: { 'grpc-service-name'?: string } })['grpc-opts']);
            if (transport) out.transport = transport;
            const tls = buildVlessTls(n);
            if (tls) out.tls = tls;
            if (n.tfo) out.tcp_fast_open = true;
            return out;
        }
        case 'hysteria2': {
            const n = node as Hysteria2Proxy;
            const upMbps = parseMbps(n.up);
            const downMbps = parseMbps(n.down);
            const out: Hysteria2Outbound = {
                type: 'hysteria2',
                tag: n.name,
                server: n.server,
                server_port: n.port,
                tls: {
                    enabled: true,
                    insecure: n['skip-cert-verify'],
                    server_name: n.sni
                }
            };
            if (n.password) out.password = n.password;
            if (upMbps != null) out.up_mbps = upMbps;
            if (downMbps != null) out.down_mbps = downMbps;
            if (n.tfo) out.tcp_fast_open = true;
            return out;
        }
        case 'tuic': {
            const n = node as TuicProxy;
            const out: TuicOutbound = {
                type: 'tuic',
                tag: n.name,
                server: n.server,
                server_port: n.port,
                uuid: n.uuid,
                tls: { enabled: true, insecure: n['skip-cert-verify'] }
            };
            if (n.password) out.password = n.password;
            if (n['congestion-controller']) out.congestion_control = n['congestion-controller'];
            if (n.tfo) out.tcp_fast_open = true;
            return out;
        }
        case 'trojan': {
            const n = node as TrojanProxy;
            const trojanNode = n as { network?: string; 'ws-opts'?: { path?: string; headers?: Record<string, string> }; 'grpc-opts'?: { 'grpc-service-name'?: string } };
            const out: TrojanOutbound = {
                type: 'trojan',
                tag: n.name,
                server: n.server,
                server_port: n.port,
                tls: {
                    enabled: true,
                    insecure: n['skip-cert-verify'],
                    server_name: n.sni
                }
            };
            if (n.password) out.password = n.password;
            const transport = buildTransport(trojanNode.network, trojanNode['ws-opts'], trojanNode['grpc-opts']);
            if (transport) out.transport = transport;
            if (n.tfo) out.tcp_fast_open = true;
            return out;
        }
        case 'anytls': {
            const n = node as AnyTLSProxy;
            const tls: OutboundTls = {
                enabled: true,
                insecure: n['skip-cert-verify'],
                server_name: n.sni
            };
            if (n['client-fingerprint']) tls.utls = { enabled: true, fingerprint: n['client-fingerprint'] };
            const out: OutboundConfig = {
                type: 'anytls',
                tag: n.name,
                server: n.server,
                server_port: n.port,
                password: n.password,
                tls: { ...tls, ...(n.alpn?.length && { alpn: n.alpn }) }
            };
            if (n['idle-session-check-interval'] != null) out.idle_session_check_interval = `${n['idle-session-check-interval']}s`;
            if (n['idle-session-timeout'] != null) out.idle_session_timeout = `${n['idle-session-timeout']}s`;
            if (n['min-idle-session'] != null) out.min_idle_session = n['min-idle-session'];
            if (n.tfo) out.tcp_fast_open = true;
            return out;
        }
        default: {
            const n = node as { type: string; name: string; server: string; port: number; tfo?: boolean };
            return {
                type: n.type,
                tag: n.name,
                server: n.server,
                server_port: n.port,
                ...(n.tfo && { tcp_fast_open: true })
            };
        }
    }
}

function convertProxyGroupToOutbound(group: ProxyGroup): OutboundConfig {
    const singboxType = mapGroupType(group.type);
    const base: OutboundConfig = {
        type: singboxType,
        tag: group.name,
        outbounds: group.proxies
    };

    // url-test and fallback use urltest type in sing-box
    if (singboxType === 'urltest') {
        // 统一设置测速节点为 http://www.gstatic.com/generate_204
        base.url = group.url || 'http://www.gstatic.com/generate_204';
        base.interval = toSingboxInterval(group.interval);
        // tolerance only applies to url-test (fallback doesn't use it)
        if (group.type === 'url-test') {
            base.tolerance = group.tolerance;
        }
    }

    return base;
}

/**
 * 规范化域名后缀：确保以 . 开头
 * 例子：
 * +.google.com -> .google.com
 * google.com   -> .google.com
 * .google.com  -> .google.com
 */
export function normalizeDomainSuffix(value: string): string | null {
    let t = value.trim().toLowerCase();
    if (!t) return null;

    // 1. 先移除所有领先的 + 和 .
    while (t.startsWith('+') || t.startsWith('.')) {
        if (t.startsWith('+.')) {
            t = t.slice(2);
        } else {
            t = t.slice(1);
        }
    }

    // 2. 如果清理后还有内容，前面补一个点
    return t ? `.${t}` : null;
}

/**
 * 将 Clash 规则字符串转换为 sing-box 路由规则
 * @param rule Clash 规则字符串，如 "DOMAIN-SUFFIX,google.com,PROXY" 或 "DOMAIN-SUFFIX,google.com"
 * @param requireOutbound 是否要求 outbound 字段（默认 true）。规则集转换时可传 false
 * @returns RouteRule 或 HeadlessRule 对象，不支持的规则返回 null
 */
export function convertClashRuleToRouteRule(rule: string, requireOutbound = true): RouteRule | HeadlessRule | null {
    const segments = rule.split(',').map((segment) => segment.trim()).filter(Boolean);
    if (segments.length === 0) {
        return null;
    }

    const ruleType = segments[0].toUpperCase();

    // MATCH 不写入 rules，由 resolveFinalOutbound 解析后写入 final
    if (ruleType === 'MATCH') {
        return null;
    }

    // 规则集模式下只需要 2 个字段（type, value），路由模式下需要 3 个字段（type, value, outbound）
    const minSegments = requireOutbound ? 3 : 2;
    if (segments.length < minSegments) {
        return null;
    }

    const value = segments[1];
    const outbound = requireOutbound ? segments[2] : undefined;
    const routeRule: RouteRule | HeadlessRule = outbound ? { outbound } : {};

    switch (ruleType) {
        case 'DOMAIN':
            routeRule.domain = [value];
            break;
        case 'DOMAIN-SUFFIX': {
            // 使用规范化函数处理域名后缀
            const suffix = normalizeDomainSuffix(value);
            if (!suffix) return null;
            routeRule.domain_suffix = [suffix];
            break;
        }
        case 'DOMAIN-KEYWORD':
            routeRule.domain_keyword = [value];
            break;
        case 'DOMAIN-REGEX':
            routeRule.domain_regex = [value];
            break;
        case 'GEOSITE':
            // sing-box 1.8.0+ deprecated geosite field, removed in 1.12.0 → use rule_set
            routeRule.rule_set = [`geosite:${value.toLowerCase()}`];
            break;
        case 'GEOIP': {
            const val = value.toLowerCase();
            // lan/private 无对应 geoip .srs，sing-box 用 ip_is_private 匹配私有 IP
            if (val === 'lan' || val === 'private') {
                routeRule.ip_is_private = true;
            } else {
                routeRule.rule_set = [`geoip:${val}`];
            }
            break;
        }
        case 'IP-CIDR':
        case 'IP-CIDR6':
            routeRule.ip_cidr = [value];
            break;
        case 'SRC-IP-CIDR':
            routeRule.source_ip_cidr = [value];
            break;
        case 'SRC-PORT': {
            const port = parseInt(value, 10);
            if (!isNaN(port) && port >= 0 && port <= 65535) {
                routeRule.source_port = [port];
            } else {
                return null;
            }
            break;
        }
        case 'DST-PORT': {
            const port = parseInt(value, 10);
            if (!isNaN(port) && port >= 0 && port <= 65535) {
                routeRule.port = [port];
            } else {
                return null;
            }
            break;
        }
        case 'PORT-RANGE':
            if (value.includes(':')) {
                routeRule.port_range = [value];
            } else {
                return null;
            }
            break;
        case 'PROCESS-NAME':
            routeRule.process_name = [value];
            break;
        case 'PROCESS-PATH':
            routeRule.process_path = [value];
            break;
        case 'NETWORK':
            routeRule.network = splitListValue(value);
            break;
        case 'RULE-SET':
            routeRule.rule_set = [value];
            break;
        default:
            // 未知规则类型：路由模式下保留原始信息，规则集模式下跳过
            break;
    }

    return routeRule;
}

// Keys whose values are arrays and can be merged across rules with the same outbound
const MERGEABLE_RULE_KEYS = new Set([
    'domain', 'domain_suffix', 'domain_keyword', 'geosite', 'geoip',
    'ip_cidr', 'source_ip_cidr', 'source_port', 'port',
    'process_name', 'process_path', 'network', 'rule_set'
]);

/**
 * 合并 Clash 规则：保持顺序，仅合并相邻且相同 outbound 与匹配类型的规则。
 * 例如相邻的 DOMAIN 规则若都走 PROXY，则合并为一条 domain 数组含多个值。
 */
function mergeRouteRules(rules: RouteRule[]): RouteRule[] {
    if (rules.length <= 1) return rules;

    function getSimpleKey(rule: RouteRule): string | null {
        const keys = Object.keys(rule).filter(k => k !== 'outbound');
        return keys.length === 1 && MERGEABLE_RULE_KEYS.has(keys[0]) ? keys[0] : null;
    }

    const result: RouteRule[] = [];
    for (const rule of rules) {
        const key = getSimpleKey(rule);
        if (key) {
            const last = result[result.length - 1];
            // 仅合并相邻且相同 outbound、相同匹配类型的规则
            if (last && getSimpleKey(last) === key && last.outbound === rule.outbound) {
                const merged = [...(last[key] as unknown[]), ...(rule[key] as unknown[])];
                (last as Record<string, unknown>)[key] = [...new Set(merged)];
            } else {
                result.push({ ...rule, [key]: [...(rule[key] as unknown[])] });
            }
        } else {
            result.push(rule);
        }
    }
    return result;
}

function resolveFinalOutbound(config: MihomoConfig): string | undefined {
    if (config.mode === 'direct') {
        return 'DIRECT';
    }

    if (config.mode === 'global') {
        return config['proxy-groups']?.[0]?.name ?? config.proxies?.[0]?.name ?? 'DIRECT';
    }

    // In rule mode, find the MATCH rule to determine the final outbound
    const matchRule = (config.rules ?? []).find(rule =>
        rule.split(',')[0].trim().toUpperCase() === 'MATCH'
    );
    if (matchRule) {
        const parts = matchRule.split(',').map(s => s.trim());
        return parts[1] ?? 'DIRECT';
    }

    // Fallback: use the first proxy group or DIRECT
    return config['proxy-groups']?.[0]?.name ?? 'DIRECT';
}

function buildTransport(
    network?: string,
    wsOpts?: { path?: string; headers?: Record<string, string> },
    grpcOpts?: { 'grpc-service-name'?: string }
): TransportConfig | undefined {
    if (!network || network === 'tcp') return undefined;
    if (network === 'ws') {
        const t: TransportConfig = { type: 'ws' };
        if (wsOpts?.path) t.path = wsOpts.path;
        if (wsOpts?.headers && Object.keys(wsOpts.headers).length > 0) t.headers = wsOpts.headers;
        return t;
    }
    if (network === 'grpc') {
        return { type: 'grpc', service_name: grpcOpts?.['grpc-service-name'] ?? '' };
    }
    if (network === 'h2') return { type: 'http' };
    return undefined;
}

function normalizeListenAddress(config: MihomoConfig): string | undefined {
    const bindAddress = config['bind-address'];
    if (bindAddress) {
        return bindAddress === '*' ? '0.0.0.0' : bindAddress;
    }

    if (config['allow-lan'] === false) {
        return '127.0.0.1';
    }

    return undefined;
}

function mapGroupType(type: ProxyGroup['type']): string {
    switch (type) {
        case 'select':
            return 'selector';
        case 'url-test':
        case 'fallback':
            // fallback and url-test both use urltest type in sing-box
            return 'urltest';
        default:
            return type;
    }
}

function toSingboxInterval(interval?: number): string | undefined {
    return typeof interval === 'number' ? `${interval}s` : undefined;
}

function splitListValue(value: string): string[] {
    return value.split(/[/:]/).map((item) => item.trim()).filter(Boolean);
}

function hasDefinedValue(value: Record<string, unknown>): boolean {
    return Object.values(value).some((item) => item !== undefined);
}

export function convertPolicyRules(policyRules: PolicyRule[]): { rules: RouteRule[], ruleSets: RuleSetConfig[] } {
    const rules: RouteRule[] = [];
    const ruleSetsMap = new Map<string, RuleSetConfig>();

    for (const policyRule of policyRules) {
        const { type, values, operator, outbound, rule_set_build_in } = policyRule as any;
        const convertedValues: string[] = [];

        // Handle rule_set_build_in map 
        if (rule_set_build_in && rule_set_build_in.length > 0) {
            for (const rs of rule_set_build_in) {
                // expecting format: "type:name", e.g., "geosite:apple", "geoip:cn", "acl:BanAD"
                const colonIdx = rs.indexOf(':');
                if (colonIdx > 0) {
                    const rsType = rs.substring(0, colonIdx).toLowerCase(); // geosite, geoip, acl
                    const rsName = rs.substring(colonIdx + 1);
                    // geoip 和 geosite 目录下文件名是小写，acl 目录保留原始大小写
                    const fileName = (rsType === 'geoip' || rsType === 'geosite') ? rsName.toLowerCase() : rsName;

                    // tag 直接使用原始值，如 geosite:apple, geoip:cn, acl:BanAD
                    const tag = rs;

                    convertedValues.push(tag);

                    if (!ruleSetsMap.has(tag)) {
                        ruleSetsMap.set(tag, {
                            tag: tag,
                            type: 'local',
                            format: 'binary',
                            path: `rulesets/${rsType}/${fileName}.srs`
                        });
                    }
                } else {
                    convertedValues.push(rs);
                }
            }
        }

        // Add standard values
        if (values && values.length > 0) {
            for (const val of values) {
                if (!val) continue;
                if (type === 'geoip') {
                    // tag 格式：geoip:xxx
                    const tag = `geoip:${val.toLowerCase()}`;
                    convertedValues.push(tag);
                    if (!ruleSetsMap.has(tag)) {
                        ruleSetsMap.set(tag, {
                            tag: tag,
                            type: 'local',
                            format: 'binary',
                            path: `geoip/${val.toLowerCase()}.srs`
                        });
                    }
                } else if (type === 'geosite') {
                    // tag 格式：geosite:xxx
                    const tag = `geosite:${val.toLowerCase()}`;
                    convertedValues.push(tag);
                    if (!ruleSetsMap.has(tag)) {
                        ruleSetsMap.set(tag, {
                            tag: tag,
                            type: 'local',
                            format: 'binary',
                            path: `geosite/${val.toLowerCase()}.srs`
                        });
                    }
                } else {
                    convertedValues.push(val);
                }
            }
        }

        if (convertedValues.length === 0) continue;

        const fieldMap: Record<PolicyRule['type'], string> = {
            'domain': 'domain',
            'domain_suffix': 'domain_suffix',
            'domain_keyword': 'domain_keyword',
            'ip_cidr': 'ip_cidr',
            'src_ip_cidr': 'source_ip_cidr',
            'geoip': 'rule_set',
            'geosite': 'rule_set',
            'rule_set': 'rule_set',
            'port': 'port',
            'protocol': 'protocol',
            'process_name': 'process_name',
            'package': 'package_name'
        };

        // Determine fieldName. If we have rule_set_build_in, we might have mixed fields.
        // But sing-box doesn't allow mixed keys in a simple OR without array of objects.
        // Let's split into respective RouteRules based on whether it is a rule_set or the base type.
        const baseField = fieldMap[type];
        const ruleSetValues = convertedValues.filter(v => v.includes(':'));
        const normalValues = convertedValues.filter(v => !v.includes(':'));

        // For rule sets
        if (ruleSetValues.length > 0) {
            rules.push({
                outbound,
                rule_set: ruleSetValues
            });
        }

        // For normal values
        if (normalValues.length > 0 && baseField && baseField !== 'rule_set') {
            rules.push({
                outbound,
                [baseField]: normalValues
            });
        }
    }

    return {
        rules,
        ruleSets: Array.from(ruleSetsMap.values())
    };
}

/**
 * 构建 rule_set 配置，使用本地 rulesets 路径（本地不存在时由 main 进程过滤）
 */
function buildRuleSetConfigs(
    geoipValues: Set<string>, 
    geositeValues: Set<string>, 
): RuleSetConfig[] {
    const ruleSets: RuleSetConfig[] = [];

    // 添加 GEOIP 规则集（本地 rulesets/geoip/xxx.srs）
    for (const value of geoipValues) {
        const lowerValue = value.toLowerCase();
        ruleSets.push({
            tag: `geoip:${lowerValue}`,
            type: 'local',
            format: 'binary',
            path: `geoip/${lowerValue}.srs`
        });
    }

    // 添加 GEOSITE 规则集（本地 rulesets/geosite/xxx.srs）
    for (const value of geositeValues) {
        const lowerValue = value.toLowerCase();
        ruleSets.push({
            tag: `geosite:${lowerValue}`,
            type: 'local',
            format: 'binary',
            path: `geosite/${lowerValue}.srs`
        });
    }

    return ruleSets;
}
