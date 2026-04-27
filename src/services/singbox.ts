/**
 * sing-box 配置转换功能函数
 */

import type {
    MihomoConfig,
    ProxyGroup,
    ProxyNode,
    ShadowsocksProxy,
    Socks5Proxy,
    HttpProxy,
    VMessProxy,
    VLESSProxy,
    Hysteria2Proxy,
    TuicProxy,
    TrojanProxy,
    AnyTLSProxy
} from '../types/clash';
import type {
    ConvertOptions,
    HeadlessPlainRule,
    HTTPOutbound,
    OutboundConfig,
    RouteRule,
    RoutePlainRule,
    RuleConversionStats,
    ShadowsocksOutbound,
    SocksOutbound,
    SingboxConfig,
    TransportConfig,
    VMessOutbound,
    VLESSOutbound,
    Hysteria2Outbound,
    TuicOutbound,
    TrojanOutbound,
    OutboundTls,
} from '../types/singbox';

export function convertClashToSingbox(config: MihomoConfig , options?: ConvertOptions): SingboxConfig {
    const outbounds = buildOutbounds(config);

    // 如果跳过规则转换，直接返回不含规则的基础配置
    if (options?.skipRules) {
        return {
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


    return {
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

    // Convert proxies and filter out null (unsupported types)
    const proxies = (config.proxies ?? [])
        .map(convertProxyNodeToOutbound)
        .filter((proxy): proxy is OutboundConfig => proxy !== null);

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

/** Clash 代理类型 → sing-box 出站类型的白名单映射 */
const CLASH_TYPE_SINGBOX_MAP: Record<string, string> = {
    ss: 'shadowsocks',
    socks5: 'socks',
    http: 'http',
    vmess: 'vmess',
    vless: 'vless',
    trojan: 'trojan',
    hysteria2: 'hysteria2',
    tuic: 'tuic',
    anytls: 'anytls',
};

/** 将 port 值安全地转为 number（YAML 中可能为字符串） */
function toPortNumber(port: unknown): number {
    if (typeof port === 'number') return port;
    if (typeof port === 'string') {
        const n = parseInt(port, 10);
        return isNaN(n) ? 0 : n;
    }
    return 0;
}


export function convertProxyNodeToOutbound(node: ProxyNode): OutboundConfig | null {
    const singboxType = CLASH_TYPE_SINGBOX_MAP[node.type];
    if (!singboxType) {
        const json = JSON.stringify(node)
        console.warn(`[singbox] Unsupported proxy type: ${node.type}, skipping node: ${json}`);
        return null;
    }

    const server_port = toPortNumber(node.port);

    switch (node.type) {
        case 'ss': {
            const n = node as ShadowsocksProxy;
            const out: ShadowsocksOutbound = {
                type: singboxType as 'shadowsocks',
                tag: n.name,
                server: n.server,
                server_port,
                method: n.cipher
            };
            if (n.password) out.password = n.password;
            if (n.tfo) out.tcp_fast_open = true;

            // 处理 plugin 和 plugin-opts → 转为 SingBox 的 plugin / plugin_opts 字符串
            // 仅支持白名单内的 SIP003 插件，其余忽略
            const SUPPORTED_SS_PLUGINS = new Set(['v2ray-plugin', 'obfs-local']);
            if (n.plugin && SUPPORTED_SS_PLUGINS.has(n.plugin)) {
                out.plugin = n.plugin;
                if (n['plugin-opts']) {
                    out.plugin_opts = buildShadowsocksPluginOpts(n['plugin-opts']);
                }
            }

            return out;
        }
        case 'socks5': {
            const n = node as Socks5Proxy;
            const out: SocksOutbound = {
                type: singboxType as 'socks',
                tag: n.name,
                server: n.server,
                server_port,
                version: '5',
            };
            if (n.username) out.username = n.username;
            if (n.password) out.password = n.password;
            return out;
        }
        case 'http': {
            const n = node as HttpProxy;
            const out: HTTPOutbound = {
                type: singboxType as 'http',
                tag: n.name,
                server: n.server,
                server_port,
            };
            if (n.username) out.username = n.username;
            if (n.password) out.password = n.password;
            return out;
        }
        case 'vmess': {
            const n = node as VMessProxy;
            const out: VMessOutbound = {
                type: singboxType as 'vmess',
                tag: n.name,
                server: n.server,
                server_port,
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
                type: singboxType as 'vless',
                tag: n.name,
                server: n.server,
                server_port,
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
                type: singboxType as 'hysteria2',
                tag: n.name,
                server: n.server,
                server_port,
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
                type: singboxType as 'tuic',
                tag: n.name,
                server: n.server,
                server_port,
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
                type: singboxType as 'trojan',
                tag: n.name,
                server: n.server,
                server_port,
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
                type: singboxType,
                tag: n.name,
                server: n.server,
                server_port,
                password: n.password,
                tls: { ...tls, ...(n.alpn?.length && { alpn: n.alpn }) }
            };
            if (n['idle-session-check-interval'] != null) out.idle_session_check_interval = `${n['idle-session-check-interval']}s`;
            if (n['idle-session-timeout'] != null) out.idle_session_timeout = `${n['idle-session-timeout']}s`;
            if (n['min-idle-session'] != null) out.min_idle_session = n['min-idle-session'];
            if (n.tfo) out.tcp_fast_open = true;
            return out;
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
        // 强制使用统一的测速地址，忽略订阅中的 url 配置
        base.url = 'http://www.gstatic.com/generate_204';
        base.interval = toSingboxInterval(group.interval);
        // tolerance only applies to url-test (fallback doesn't use it)
        if (group.type === 'url-test') {
            base.tolerance = group.tolerance || 50;
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
 * @returns RoutePlainRule 对象（有 outbound 和 rule_set）或 HeadlessPlainRule 对象（无 outbound，无 rule_set），不支持的规则返回 null
 */
export function convertClashRuleToRouteRule(rule: string, requireOutbound = true): RoutePlainRule | HeadlessPlainRule | null {
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
    // 使用 RoutePlainRule 类型，因为 rule_set 只在 RouteRule 中存在
    const routeRule: RoutePlainRule = outbound ? { outbound } : {};

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
                (last as unknown as Record<string, unknown>)[key] = [...new Set(merged)];
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

/**
 * 将 Clash 的 plugin-opts 对象转换为 SingBox 的 plugin_opts 字符串
 *
 * v2ray-plugin 示例: {mode: websocket, path: /, mux: true, skip-cert-verify: true}
 * → "mode=websocket;path=/;mux=1;skip-cert-verify=true"
 *
 * obfs-local 示例: {obfs: tls, obfs-host: www.apple.com}
 * → "obfs=tls;obfs-host=www.apple.com"
 *
 * 规则：
 * - 布尔值为 false 的字段直接忽略（不输出）
 * - 布尔值为 true 的字段：skip-cert-verify/tls 输出 true/false，其余如 mux 输出 0/1
 */
function buildShadowsocksPluginOpts(pluginOpts: Record<string, unknown>): string {
    const parts: string[] = [];

    // 按照常见顺序排列字段（v2ray-plugin + obfs-local）
    const fieldOrder = ['mode', 'host', 'path', 'tls', 'mux', 'skip-cert-verify', 'obfs', 'obfs-host'];

    // 需要使用 true/false 而非 0/1 的字段
    const BOOL_AS_STRING = new Set(['skip-cert-verify', 'tls']);

    for (const key of fieldOrder) {
        if (!(key in pluginOpts)) continue;
        const value = pluginOpts[key];
        if (value === undefined || value === null || value === '') continue;

        if (typeof value === 'boolean') {
            // 布尔值为 false 直接忽略
            if (!value) continue;
            // 值为 true：skip-cert-verify / tls 等用 true，其余如 mux 用 1
            const strVal = BOOL_AS_STRING.has(key) ? 'true' : '1';
            parts.push(`${key}=${strVal}`);
        } else {
            parts.push(`${key}=${value}`);
        }
    }

    // 处理其他未在 fieldOrder 中的额外字段
    for (const [key, value] of Object.entries(pluginOpts)) {
        if (fieldOrder.includes(key)) continue;
        if (value === undefined || value === null || value === '') continue;

        if (typeof value === 'boolean') {
            if (!value) continue;
            const strVal = BOOL_AS_STRING.has(key) ? 'true' : '1';
            parts.push(`${key}=${strVal}`);
        } else {
            parts.push(`${key}=${value}`);
        }
    }

    return parts.join(';');
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
    return typeof interval === 'number' ? `${interval > 600 ? 600: interval}s` : undefined;
}

function splitListValue(value: string): string[] {
    return value.split(/[/:]/).map((item) => item.trim()).filter(Boolean);
}

function hasDefinedValue(value: Record<string, unknown>): boolean {
    return Object.values(value).some((item) => item !== undefined);
}
