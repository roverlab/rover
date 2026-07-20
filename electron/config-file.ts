/**
 * config.json 读写与生成逻辑
 * 包含配置文件读取、写入、合并设置、生成完整 config
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import yaml from 'js-yaml';
import * as dbUtils from './db';
import * as singbox from './core-controller';
import { isSingboxRunningAsync } from './core-controller';
import { getConfigPath, resolveDataPath } from './paths';
import type {
    SingboxConfig,
    ConvertOptions,
    RouteRule,
    DnsRule,
    DnsPlainRule,
    RuleSetConfig,
    OutboundConfig,
    DnsServer,
    InboundConfig,
} from '../src/types/singbox';
import type { MihomoConfig } from '../src/types/clash';
import { convertClashToSingbox } from '../src/services/singbox';
import * as subscription from './subscription';
import {
    buildProvidersForConfig,
    getPolicyFinalOutbound,
    POLICY_FINAL_OUTBOUND_VALUES
} from './route-policy';
import { policiesToSingboxConfig } from '../src/services/policy';
import { dnsPoliciesToSingboxConfig } from '../src/services/dns-policy';
import { t } from './i18n-main';
import {
    CHAIN_BACK_TAG,
    CHAIN_FRONT_TAG,
    CHAIN_PROXY_SETTING_KEY,
    isChainHopActive,
    parseChainProxySettings,
    type ChainProxySettings,
    type ChainSocksHop,
} from '../src/types/chain-proxy';

/** 判断是否为 IPv6 地址 */
function isIPv6(ip: string): boolean {
    return ip.includes(':');
}

/** 解析 hosts-override 行，返回 { hostname, ip }[] */
function parseHostsOverrideLines(lines: string[]): Array<{ hostname: string; ip: string }> {
    const result: Array<{ hostname: string; ip: string }> = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const parts = trimmed.split(/\s+/);
        if (parts.length < 2) continue;
        const ip = parts[0];
        const hostnames = parts.slice(1).filter((h) => h && !h.startsWith('#'));
        for (const hostname of hostnames) {
            result.push({ hostname, ip });
        }
    }
    return result;
}

/** 将高级配置 hosts-override 转为 dns servers + rules */
function hostsOverrideToDnsConfig(hostsOverrideLines: string[]): {
    server?: { type: 'hosts'; tag: string; predefined: Record<string, string> };
    rules: DnsRule[];
} {
    const entries = parseHostsOverrideLines(hostsOverrideLines);
    if (entries.length === 0) return { rules: [] };

    const singleDomains: Record<string, string> = {};
    const wildcardMap = new Map<string, { ipv4: string | null; ipv6: string | null }>();

    for (const { hostname, ip } of entries) {
        const isWildcard = hostname.startsWith('*.');
        if (isWildcard) {
            const suffix = hostname.slice(1);
            const domainSuffix = suffix.startsWith('.') ? suffix : '.' + suffix;
            if (!wildcardMap.has(domainSuffix)) {
                wildcardMap.set(domainSuffix, { ipv4: null, ipv6: null });
            }
            const entry = wildcardMap.get(domainSuffix)!;
            if (isIPv6(ip)) {
                entry.ipv6 = ip;
            } else {
                entry.ipv4 = ip;
            }
        } else {
            singleDomains[hostname] = ip;
        }
    }

        const rules: any[] = [];

    // 合并相同 IP 组合的域名后缀
    // key: `${ipv4}|${ipv6}`，value: domainSuffix[]
    const ipGroupMap = new Map<string, string[]>();

    for (const [domainSuffix, { ipv4, ipv6 }] of wildcardMap) {
        const key = `${ipv4 || ''}|${ipv6 || ''}`;
        if (!ipGroupMap.has(key)) {
            ipGroupMap.set(key, []);
        }
        ipGroupMap.get(key)!.push(domainSuffix);
    }

    let server: { type: 'hosts'; tag: string; predefined: Record<string, string> } | undefined;
    if (Object.keys(singleDomains).length > 0) {
        server = {
            type: 'hosts',
            tag: 'dns_hosts',
            predefined: singleDomains,
        };
        rules.push({ ip_accept_any: true, server: 'dns_hosts' });
    }

    // 生成合并后的规则
    for (const [key, domainSuffixes] of ipGroupMap) {
        const [ipv4, ipv6] = key.split('|');
        const hasIpv4 = ipv4 !== '';
        const hasIpv6 = ipv6 !== '';

        // 构建所有 answer 条目
        const answers: string[] = [];
        for (const suffix of domainSuffixes) {
            const wildcardDomain = '*' + suffix;
            if (hasIpv4) {
                answers.push(`${wildcardDomain}. IN A ${ipv4}`);
            }
            if (hasIpv6) {
                answers.push(`${wildcardDomain}. IN AAAA ${ipv6}`);
            }
        }

        // 构建查询类型
        const queryTypes: string[] = [];
        if (hasIpv4) queryTypes.push('A');
        if (hasIpv6) queryTypes.push('AAAA');

        if (answers.length > 0) {
            rules.push({
                query_type: queryTypes,
                domain_suffix: domainSuffixes,
                action: 'predefined',
                rcode: 'NOERROR',
                answer: answers,
            });
        }
    }

    return { server, rules };
}

/** 从单条规则中搜集 rule_set 引用（支持 route 的数组格式与 dns 的字符串格式） */
function collectRuleSetRefsFromRule(rule: RouteRule | DnsRule): string[] {
    const tags = rule?.rule_set;
    if (!tags) return [];
    
    // 处理数组类型的 rule_set
    if (Array.isArray(tags)) {
        const result: string[] = [];
        for (const t of tags) {
            if (typeof t === 'string') {
                const trimmed = t.trim();
                if (trimmed) result.push(trimmed);
            }
        }
        return result;
    }
    
    // 处理字符串类型的 rule_set（使用类型断言避免 never 类型问题）
    const tagsStr = tags as string | unknown;
    if (typeof tagsStr === 'string') {
        const trimmed = tagsStr.trim();
        if (trimmed) return [trimmed];
    }
    return [];
}

/** 递归搜集规则中的 rule_set 引用（含嵌套 logical） */
function collectRuleSetRefsRecursive(rule: RouteRule | DnsRule, refs: Set<string>): void {
    if (!rule) return;
    for (const tag of collectRuleSetRefsFromRule(rule)) refs.add(tag);
    if ('type' in rule && rule.type === 'logical' && Array.isArray(rule.rules)) {
        for (const sub of rule.rules) collectRuleSetRefsRecursive(sub as RouteRule | DnsRule, refs);
    }
}

/** 从 route.rules 和 dns.rules 中搜集所有引用的 rule_set tag */
function collectAllRuleSetRefs(config: SingboxConfig): Set<string> {
    const refs = new Set<string>();
    const routeRules = config?.route?.rules;
    if (Array.isArray(routeRules)) {
        for (const rule of routeRules) {
            collectRuleSetRefsRecursive(rule, refs);
        }
    }
    const dnsRules = config?.dns?.rules;
    if (Array.isArray(dnsRules)) {
        for (const rule of dnsRules) {
            collectRuleSetRefsRecursive(rule, refs);
        }
    }
    return refs;
}

/** 根据引用的 rule_set 构建 rule_set 配置并写入 config.route.rule_set；有冒号用内置路径，无冒号用自定义规则集路径
 * 使用相对路径（相对于 data 目录），便于配置文件的可移植性
 */
function getRuleSets(config: SingboxConfig) {
    const refs = collectAllRuleSetRefs(config);
    if (refs.size === 0) return [];

    const ruleProviders = dbUtils.getRuleProviders();
    const providersForConfig = buildProvidersForConfig(ruleProviders);
    const providerMap = new Map(providersForConfig.map(p => [p.id, p]));

    const ruleSets: RuleSetConfig[] = [];
    for (const tag of refs) {
        const hasColon = tag.includes(':');
        if (hasColon) {
            const [type, name] = tag.split(':');
            const nameLower = (type === 'geoip' || type === 'geosite') ? name.toLowerCase() : name;
            // 使用相对路径：rulesets/geoip/cn.srs（相对于 data 目录）
            const relPath = `rulesets/${type}/${nameLower}.srs`;
            ruleSets.push({ tag, type: 'local', format: 'binary', path: relPath });
        } else {
            const provider = providerMap.get(tag);
            if (provider?.path) {
                // provider.path 已经是相对于 data 目录的相对路径
                const relPath = provider.path;
                const format = relPath.endsWith('.srs') ? 'binary' : 'source';
                ruleSets.push({ tag, type: 'local', format, path: relPath });
            }
        }
    }
    return  ruleSets;
}

export { getConfigPath };

/** 读取并解析 config.json */
export function readConfig(): any | null {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) return null;
    try {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
        throw new Error(t('main.errors.configFile.corrupt'));
    }
}

/** 写入 config.json */
export function writeConfig(config: any): void {
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

/** 若内核运行中则重启，使新配置生效；否则仅重置 Controller 缓存
 *  使用 resetController 代替 stopSingbox，确保：
 *  1. 清空 controllerInstance，下次 startSingbox 时根据最新 TUN 设置创建正确的 Controller
 *  2. 等待端口释放（600ms），避免 "address already in use" 错误
 *
 *  重要：即使内核未运行也要重置 controllerInstance，因为配置生成可能改变了 TUN 模式设置，
 *  如果不复用旧 Controller，下次启动时会用错误的 Controller（如 TUN 开启但用的是 LocalSingboxController）
 *  导致 "Access is denied" 错误。
 */
export async function restartKernelIfRunning(): Promise<void> {
    const isRunning = await isSingboxRunningAsync();
    if (!isRunning) {
        // 内核未运行，但仍需重置 Controller 缓存，确保下次启动使用正确的 Controller 类型
        await singbox.resetController();
        return;
    }
    await singbox.resetController();
    const configPath = getConfigPath();
    const binaryPath = singbox.getSingboxBinaryPath();
    if (fs.existsSync(configPath) && fs.existsSync(binaryPath)) {
        await singbox.startSingbox(configPath, binaryPath);
    }
}

/** 判断内容是否为 YAML */
export function isYaml(content: string): boolean {
    try {
        JSON.parse(content);
        return false;
    } catch {
        return true;
    }
}

/** 订阅 YAML 转 sing-box JSON 的缓存：key=profileId, value={ hash, converted }，仅当 profile 内容变化时重新转换 */
const profileConvertCache = new Map<string, { hash: string; converted: string }>();

function hashContent(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/** 清除指定 profile 的转换缓存（profile 更新时调用） */
export function invalidateProfileConvertCache(profileId: string): void {
    const had = profileConvertCache.has(profileId);
    profileConvertCache.delete(profileId);
    if (had) console.log(`[ConvertCache] Cleared profile=${profileId}`);
}

/** 将 Clash YAML 转为 Sing-box JSON */
export function convertYamlToSingbox(content: string, options?: ConvertOptions): string {
    try {
        const parsed = yaml.load(content) as MihomoConfig;
        if (!parsed) throw new Error(t('main.errors.configFile.parseYamlEmpty'));
        if (parsed.proxies && Array.isArray(parsed.proxies)) {
            console.log(`Converting Clash config with ${parsed.proxies.length} proxies...`);
            if (options?.skipRules) {
                console.log('[Config] Skipping rules conversion (override-rules enabled)');
            }
            const singboxConfig = convertClashToSingbox(parsed, options);
            return JSON.stringify(singboxConfig, null, 2);
        }
        throw new Error(t('main.errors.configFile.noProxiesInYaml'));
    } catch (err: any) {
        console.error('YAML conversion error:', err.message);
        throw new Error(t('main.errors.configFile.convertYamlGeneric', { message: err.message }));
    }
}


/** 获取 profile 配置（读取文件并解析为 JSON）
 * @param profileId 配置文件 ID
 * @param skipRules 跳过规则转换（当使用自定义分流时可跳过，提升性能）
 */
export async function getProfileConfig(profileId: string, skipRules = false): Promise<{ config: any; profile: any }> {
    const profile = dbUtils.getProfileById(profileId);
    if (!profile) throw new Error(t('main.errors.profileNotFound'));

    let content = subscription.readProfileContent(profileId, profile.path ? resolveDataPath(profile.path) : undefined);

    if (!content) {
        if (profile.type === 'local') {
            throw new Error(t('main.errors.configFile.localProfileMissing'));
        } else if (profile.type === 'remote') {
            console.log(`Profile file missing, attempting to re-download for profile ${profileId}...`);
            if (!profile.url) {
                throw new Error(t('main.errors.configFile.remoteProfileNoUrl'));
            }
            try {
                content = await subscription.downloadProfile(profileId);
                console.log('Successfully re-downloaded profile');
            } catch (downloadErr: any) {
                throw new Error(t('main.errors.configFile.redownloadFailed', { message: downloadErr.message }));
            }
        }
    }

    if (isYaml(content)) {
        const contentHash = hashContent(content);
        
        // 当跳过规则转换时，不使用缓存，因为缓存的配置包含完整规则
        if (skipRules) {
            console.log(`[Convert] profile=${profileId} skipRules=true, skipping rules conversion`);
            console.log('YAML content detected in profile, converting to sing-box JSON (without rules)...');
            try {
                content = convertYamlToSingbox(content, { skipRules: true });
            } catch (convertErr: any) {
                throw new Error(t('main.errors.configFile.convertYamlFailed', { message: convertErr.message }));
            }
        } else {
            // 正常模式：使用缓存机制
            const cached = profileConvertCache.get(profileId);
            if (cached && cached.hash === contentHash) {
                console.log(`[ConvertCache] Hit profile=${profileId} hash=${contentHash.slice(0, 12)}...`);
                content = cached.converted;
            } else {
                const reason = !cached ? 'no cache' : `hash changed (old=${cached.hash.slice(0, 12)}... new=${contentHash.slice(0, 12)}...)`;
                console.log(`[ConvertCache] Miss profile=${profileId} reason=${reason}`);
                console.log('YAML content detected in profile, converting to sing-box JSON...');
                try {
                    content = convertYamlToSingbox(content);
                    profileConvertCache.set(profileId, { hash: contentHash, converted: content });
                    console.log(`[ConvertCache] Written profile=${profileId} hash=${contentHash.slice(0, 12)}...`);
                } catch (convertErr: any) {
                    throw new Error(t('main.errors.configFile.convertYamlFailed', { message: convertErr.message }));
                }
            }
        }
    }

    let config;
    try {
        config = JSON.parse(content);
        if (Object.keys(config).length === 0) throw new Error(t('main.errors.configFile.configEmpty'));
    } catch (e: any) {
        console.error('Invalid config format:', e.message);
        throw new Error(t('main.errors.configFile.invalidSingboxJson', { message: e.message }));
    }

    return { config, profile };
}

/** 将用户设置合并到 config */
export function mergeSettingsIntoConfig(config: SingboxConfig): SingboxConfig {
    const settings = dbUtils.getAllSettings();

    const isAllowLan = settings['allow-lan'] === 'true';
    const mixedPort = parseInt(settings['mixed-port'], 10) || 7890;
    const logLevelSetting = settings['log-level'] || 'warn'
    const tunModeEnabled = settings['dashboard-tun-mode'] === 'true';
    const dnsServerEnabled = settings['dns-server-enabled'] !== 'false';
    const dnsProxyPort = parseInt(settings['dns-proxy-port'], 10) || 17890;

    let apiUrl = settings['api-url'] || '127.0.0.1:9090';
    apiUrl = apiUrl.replace(/^https?:\/\//, '');
    const apiSecret = settings['api-secret'] || '';

    config.log = { ...config.log, level: logLevelSetting as any, disabled: false, timestamp: true };

    const inbounds: InboundConfig[] = [{
        type: 'mixed',
        tag: 'proxy_in',
        listen: isAllowLan ? '0.0.0.0' : '127.0.0.1',
        listen_port: mixedPort
    }];

    // DNS 专用代理端口：dns-server-enabled 开启时自动启用，默认 17890
    if (dnsServerEnabled) {
        inbounds.push({
            type: 'mixed',
            tag: 'dns_proxy_in',
            listen: isAllowLan ? '0.0.0.0' : '127.0.0.1',
            listen_port: dnsProxyPort
        });
        console.log(`[Config] DNS proxy inbound added on port ${dnsProxyPort}`);
    }

    if (tunModeEnabled) {
        console.log('[Config] TUN mode enabled, adding TUN inbound');

        // 读取用户配置的排除地址
        const tunExcludeAddressVal = settings['tun-exclude-address'] || '[]';
        let userExcludeAddresses: string[] = [];
        try {
            const arr = JSON.parse(tunExcludeAddressVal);
            if (Array.isArray(arr)) {
                // 解析时忽略注释行和空行（以#开头的行视为注释）
                userExcludeAddresses = arr.filter((s: unknown) => {
                    if (typeof s !== 'string') return false;
                    const trimmed = s.trim();
                    return trimmed !== '' && !trimmed.startsWith('#');
                });
            }
        } catch {
            /* ignore */
        }

        // 默认排除地址
        const defaultExcludeAddresses = [
            '192.168.0.0/16',
            'fc00::/7'
        ];

        // 合并默认排除地址和用户配置的排除地址（去重）
        const excludeAddressSet = new Set([...defaultExcludeAddresses, ...userExcludeAddresses]);
        const routeExcludeAddress = Array.from(excludeAddressSet);

        inbounds.push({
            type: 'tun',
            tag: 'tun_in',
            mtu: 1600,
            stack: 'mixed',
            address: [
                '172.19.0.1/30',
                'fdfe:dcba:9876::1/126'
            ],
            route_exclude_address: routeExcludeAddress,
            auto_route: true,
            strict_route: true
        });
    }

    config.inbounds = inbounds;

    if (!config.experimental) config.experimental = {};

    config.experimental.clash_api = {
        external_controller: apiUrl,
        secret: apiSecret,
        // default_mode: defaultMode,
    };

    const dnsServers = dbUtils.getDnsServers();
    const enabledDnsServers = dnsServers.filter(s => s.enabled !== false);
    if (enabledDnsServers.length > 0) {
        const servers = enabledDnsServers.map((s) => {
            // raw 类型使用 raw_data，但需要覆盖 tag 字段为数据库中的 id
            if (s.type === 'raw' && s.raw_data) {
                return { ...s.raw_data, tag: s.id } as DnsServer;
            }
            
            // rover 类型：生成一个指向 roverservice 本地 HTTPS DoH 服务的 https server
            if (s.type === 'rover') {
                const dnsPort = settings['dns-server-port'] || '5353';
                const port = parseInt(dnsPort, 10);
                // Pass upstream config via headers (sing-box supports custom headers)
                const headers: Record<string, string> = {};
                if (s.upstreams) headers['X-Upstreams'] = s.upstreams;
                // use_proxy: 当开启时，使用 dns-proxy-port
                if (s.use_proxy) {
                    const dnsProxyPort = parseInt(settings['dns-proxy-port'], 10) || 17890;
                    headers['X-Proxy'] = 'socks5';
                    headers['X-Proxy-Addr'] = `127.0.0.1:${dnsProxyPort}`;
                }
                if (s.bootstrap_addrs) headers['X-Bootstrap-Addrs'] = s.bootstrap_addrs;
                if (s.fallback_addrs) headers['X-Fallback-Addrs'] = s.fallback_addrs;
                const obj: DnsServer = {
                    type: 'https',
                    tag: s.id,
                    server: '127.0.0.1',
                    server_port: port,
                    path: '/dns-query',
                    headers,
                    // Self-signed cert: skip TLS verification
                    tls: {
                        enabled: true,
                        insecure: true,
                    },
                };
                if (s.detour) obj.detour = s.detour;
                return obj;
            }
            
            const obj: DnsServer = { type: s.type, tag: s.id };
            if (s.server) obj.server = s.server;
            if (s.server_port != null) obj.server_port = s.server_port;
            if (s.path) obj.path = s.path;
            if (s.detour) obj.detour = s.detour;
            if (s.prefer_go != null) obj.prefer_go = s.prefer_go;
            if (s.domain_resolver) obj.domain_resolver = s.domain_resolver;
            return obj;
        });
      
        config.dns = { servers };
      
        // 使用数据库 dnsPolicies 重新生成 dns.rules（过滤禁用的策略）
        const dnsPolicies = dbUtils.getDnsPolicies().filter((p) => p.enabled);
        if (dnsPolicies.length > 0) {
            const { rules } = dnsPoliciesToSingboxConfig(dnsPolicies);
            config.dns.rules = rules;
        }
        console.log('[Config] Applied DNS config from dnsServers + dnsPolicies');
    }

    // IPv6 设置：如果禁用 IPv6，设置 dns.strategy = 'ipv4_only'，并移除 fakeip 的 inet6_range 和 tun 的 IPv6 地址
    const ipv6Enabled = settings['ipv6'] === 'true';
    if (!ipv6Enabled) {
        if (!config.dns) config.dns = {};
        config.dns.strategy = 'ipv4_only';
        console.log('[Config] IPv6 disabled, set dns.strategy = ipv4_only');

        // 移除 fakeip DNS 服务器的 inet6_range
        if (config.dns.servers) {
            config.dns.servers = config.dns.servers.map((s: any) => {
                if (s.type === 'fakeip' && s.inet6_range) {
                    const { inet6_range, ...rest } = s;
                    console.log(`[Config] IPv6 disabled, removed inet6_range from fakeip server: ${s.tag}`);
                    return rest;
                }
                return s;
            });
        }

        // 移除 tun 配置中的 IPv6 地址
        if (config.inbounds) {
            config.inbounds = config.inbounds.map((inbound: any) => {
                if (inbound.type === 'tun' && inbound.address) {
                    const ipv4Addresses = inbound.address.filter((addr: string) => !addr.includes(':'));
                    if (ipv4Addresses.length !== inbound.address.length) {
                        console.log('[Config] IPv6 disabled, removed IPv6 addresses from TUN inbound');
                    }
                    return { ...inbound, address: ipv4Addresses };
                }
                return inbound;
            });
        }
    }

    return config;
}

/** 附加 selector_out、direct_out、block_out 三个出站到 config */
export function appendExtraOutbounds(config: SingboxConfig, settings?: Record<string, string>): void {
    // 代理节点的 domain_resolver：优先使用用户设置的 dns-proxy-server，否则默认 dns_direct_out
    const proxyDomainResolver = settings?.['dns-proxy-server'] || 'dns_direct_out';
    
    let outbounds = (config.outbounds || [])
    .filter(a=>!['selector_out','direct_out','block_out', CHAIN_FRONT_TAG, CHAIN_BACK_TAG].includes(a.tag));
    outbounds.forEach(o=>{
        if(!['selector','urltest','block','direct'].includes(o.type)){
            // 清掉上次链式注入的 detour，由 applyChainProxy 重新挂
            if (o.detour === CHAIN_FRONT_TAG || o.detour === CHAIN_BACK_TAG) {
                delete o.detour;
            }
            o.domain_resolver = proxyDomainResolver;
        }
    })

    const selectorUrltestTags = outbounds
        .filter(
            (o: OutboundConfig) =>
                o?.tag &&
                (String(o.type || '').toLowerCase() === 'selector' || String(o.type || '').toLowerCase() === 'urltest') &&
                Array.isArray(o.outbounds) &&
                o.outbounds.length > 0
        )
        .map((o: OutboundConfig) => o.tag);

    // 如果没有分组，构造一个包含全部节点的 selector 分组
    let finalOutbounds: OutboundConfig[];
    if (selectorUrltestTags.length > 0) {
        finalOutbounds = outbounds;
    } else {
        const allNodeTags = outbounds
            .map((o: OutboundConfig) => o.tag)
            .filter(Boolean);
        const fallbackGroup: OutboundConfig = {
            type: 'selector',
            tag: t('main.config.proxyGroupSelector'),
            outbounds: allNodeTags,
        };
        outbounds.push(fallbackGroup);
        selectorUrltestTags.push(fallbackGroup.tag);
        finalOutbounds = outbounds;
    }

    config.outbounds = [
        ...finalOutbounds,
            {
            "type": "selector",
            "tag": "selector_out",
            "outbounds": selectorUrltestTags
        },
        {
            "type": "direct",
            "tag": "direct_out",
        },
        {
            "type": "block",
            "tag": "block_out"
        }
    ];

    // 链式代理（SOCKS5：前置挂节点 detour，后置包在节点之后）
    applyChainProxy(config, settings);
}

/** 构造单跳 SOCKS5 出站 */
function buildChainSocksOutbound(
    tag: string,
    hop: ChainSocksHop,
    domainResolver: string,
    detour?: string
): OutboundConfig {
    const outbound: OutboundConfig = {
        type: 'socks',
        tag,
        server: hop.server.trim(),
        server_port: hop.server_port,
        version: '5',
        domain_resolver: domainResolver,
    };
    const username = hop.username?.trim();
    const password = hop.password ?? '';
    if (username) outbound.username = username;
    if (password) outbound.password = password;
    const bindInterface = hop.bind_interface?.trim();
    if (bindInterface) outbound.bind_interface = bindInterface;
    if (detour) outbound.detour = detour;
    return outbound;
}

/**
 * 将「走代理」出口 selector_out 替换为后置 tag。
 * 不改 chain_back 自身的 detour，避免环路。
 */
function rewriteSelectorOutToChainBack(config: SingboxConfig): void {
    const from = 'selector_out';
    const to = CHAIN_BACK_TAG;

    if (config.route?.final === from) {
        config.route.final = to;
    }

    for (const rule of config.route?.rules || []) {
        const r = rule as RouteRule & { outbound?: string };
        if (r.outbound === from) r.outbound = to;
    }

    for (const server of config.dns?.servers || []) {
        if (server.detour === from) server.detour = to;
    }
}

/**
 * 应用链式代理：
 * 本地 → [前置 SOCKS5] → 订阅节点 → [后置 SOCKS5] → 目标
 *
 * - 前置：真实节点 detour = chain_front_out
 * - 后置：chain_back_out.detour = selector_out，并将 selector_out 业务出口改为 chain_back_out
 */
function applyChainProxy(config: SingboxConfig, settings?: Record<string, string>): void {
    if (!settings) return;
    const chain: ChainProxySettings = parseChainProxySettings(settings[CHAIN_PROXY_SETTING_KEY]);
    const frontActive = isChainHopActive(chain.front);
    const backActive = isChainHopActive(chain.back);
    if (!frontActive && !backActive) return;

    // 链本身用本地 DNS，避免依赖代理 DNS 造成鸡生蛋
    const hopResolver = 'dns_direct_out';
    const chainOutbounds: OutboundConfig[] = [];

    if (frontActive) {
        chainOutbounds.push(buildChainSocksOutbound(CHAIN_FRONT_TAG, chain.front, hopResolver));
    }
    if (backActive) {
        // 后置经节点拨号：节点 → 后置 → 目标
        chainOutbounds.push(
            buildChainSocksOutbound(CHAIN_BACK_TAG, chain.back, hopResolver, 'selector_out')
        );
    }

    const excludeTypes = new Set(['selector', 'urltest', 'direct', 'block', 'dns']);
    const excludeTags = new Set([
        CHAIN_FRONT_TAG,
        CHAIN_BACK_TAG,
        'selector_out',
        'direct_out',
        'block_out',
    ]);

    // 前置：挂在真实节点上
    let frontApplied = 0;
    if (frontActive) {
        for (const outbound of config.outbounds || []) {
            const type = (outbound.type || '').toLowerCase();
            if (excludeTypes.has(type)) continue;
            if (!outbound.tag || excludeTags.has(outbound.tag)) continue;
            outbound.detour = CHAIN_FRONT_TAG;
            frontApplied++;
        }
    }

    config.outbounds = [...chainOutbounds, ...(config.outbounds || [])];

    // 后置：业务上凡走 selector_out 的改为走后置（后置内部 detour 回 selector_out）
    // 前置拨号不注入全局直连规则：outbound 拨号不经 route rules，且会污染同 IP/域名业务流量
    // TUN 环路依赖 route.auto_detect_interface + 前置 domain_resolver / bind_interface
    if (backActive) {
        rewriteSelectorOutToChainBack(config);
    }

    console.log(
        `[Config] Chain proxy applied: front=${frontActive}(nodes=${frontApplied}) back=${backActive} path=local` +
            `${frontActive ? '->front' : ''}->node${backActive ? '->back' : ''}->dest`
    );
}


/** 判断字符串是否为 IP 地址（IPv4 或 IPv6） */
function isIpAddress(str: string): boolean {
    if (!str) return false;
    // IPv6 检测
    if (str.includes(':')) return true;
    // IPv4 检测：简单正则
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    return ipv4Regex.test(str);
}

/** 从 outbounds 中提取所有真实代理节点的 server（域名或 IP）以及 tls.server_name
 *  排除 selector、urltest、direct、block 等非真实节点
 */
function extractProxyServerAddresses(config: SingboxConfig): { domains: string[]; ips: string[] } {
    const domains = new Set<string>();
    const ips = new Set<string>();
    
    // 排除的出站类型
    const excludeTypes = new Set(['selector', 'urltest', 'direct', 'block']);
    
    const outbounds = config.outbounds || [];
    for (const outbound of outbounds) {
        const type = (outbound.type || '').toLowerCase();
        if (excludeTypes.has(type)) continue;
        
        const server = outbound.server;
        if (server && typeof server === 'string') {
            if (isIpAddress(server)) {
                ips.add(server);
            } else {
                domains.add(server);
            }
        }
    }
    
    return { 
        domains: Array.from(domains), 
        ips: Array.from(ips) 
    };
}

/** 为代理节点地址生成 DNS 规则和路由规则
 *  DNS 规则：对节点域名使用 dns_direct_out（本地 DNS 解析）
 *  路由规则：对节点域名和 IP 直连（direct_out）
 */
function addProxyServerRules(config: SingboxConfig): void {
    const { domains, ips } = extractProxyServerAddresses(config);
    
    if (domains.length === 0 && ips.length === 0) {
        return;
    }
    
    console.log(`[Config] Generating direct rules for ${domains.length} proxy domains and ${ips.length} proxy IPs`);
    
    // 1. DNS 规则：代理域名使用 dns_direct_out（本地解析）
    if (domains.length > 0) {
        if (!config.dns) config.dns = { servers: [] };
        if (!Array.isArray(config.dns.rules)) config.dns.rules = [];
        
        const dnsRule: DnsPlainRule = {
            domain: domains,
            server: 'dns_direct_out'
        };
        // 插入到 DNS 规则最前面（优先匹配）
        config.dns.rules.unshift(dnsRule as DnsRule);
        console.log(`[Config] DNS rules: ${domains.length} proxy domains using dns_direct_out`);
    }
    
    // 2. 路由规则：代理域名和 IP 直连
    if (!config.route) config.route = {};
    if (!Array.isArray(config.route.rules)) config.route.rules = [];
    
    // IP 直连规则
    if (ips.length > 0) {
        const ipRule: RouteRule = {
            ip_cidr: ips,
            outbound: 'direct_out'
        };
        config.route.rules.unshift(ipRule);
        console.log(`[Config] Route rules: ${ips.length} proxy IPs direct`);
    }
    
    // 域名直连规则
    if (domains.length > 0) {
        const domainRule: RouteRule = {
            domain: domains,
            outbound: 'direct_out'
        };
        config.route.rules.unshift(domainRule);
        console.log(`[Config] Route rules: ${domains.length} proxy domains direct`);
    }
}


/** 应用路由策略规则到 config */
function applyRoutePolicies(config: SingboxConfig, policies: any[]): void {
    const ruleProviders = dbUtils.getRuleProviders();
    const providersForConfig = buildProvidersForConfig(ruleProviders);
    providersForConfig.forEach(p => { p.path = resolveDataPath(p.path); });

    const { rules } = policiesToSingboxConfig(policies, providersForConfig);
    const finalOutbound = getPolicyFinalOutbound();
    
    if (!config.route) config.route = {};
    config.route.rules = rules;
    config.route.final = finalOutbound;
}

/** 应用 profile 的 DNS 策略偏好服务器覆盖 */
function applyDnsPolicyPreferredServers(
    config: SingboxConfig,
    profileId: string
): void {
    const profileDnsPolicies = dbUtils.getProfileById(profileId)?.dnsPolicies ?? [];
    if (profileDnsPolicies.length === 0 || !config.dns?.rules) return;

    // 构建 preferred_server 映射
    const preferredServerMap = new Map<string, string>();
    for (const p of profileDnsPolicies) {
        if (p.preferred_server) {
            preferredServerMap.set(p.dns_policy_id, p.preferred_server);
        }
    }
    if (preferredServerMap.size === 0) return;

    // 获取排序后的 DNS 策略列表（与生成 rules 时的顺序一致）
    const allDnsPolicies = dbUtils.getDnsPolicies();
    const sortedPolicies = allDnsPolicies
        .filter(p => p.enabled)
        .sort((a, b) => a.order - b.order);

    // 通过 index 匹配 rule 和 policy，覆盖 server
    for (let i = 0; i < sortedPolicies.length && i < config.dns.rules.length; i++) {
        const policy = sortedPolicies[i];
        const preferredServer = preferredServerMap.get(policy.id);
        if (preferredServer) {
            (config.dns.rules[i] as any).server = preferredServer;
        }
    }
    console.log(`[Config] Applied ${preferredServerMap.size} preferred_server from profile.dnsPolicies`);
}

/** 应用 profile 的路由策略偏好出站覆盖 */
function applyRoutePolicyPreferredOutbounds(
    config: SingboxConfig,
    profileId: string,
    enabledPolicies: any[]
): void {
    const profile = dbUtils.getProfileById(profileId);
    const profilePolicies = profile?.policies ?? [];
    if (profilePolicies.length === 0 || !config.route?.rules) return;

    // 构建 policy_id -> preferred_outbound 映射（单选模式，取第一个）
    const preferredOutboundMap = new Map<string, string>();
    for (const pp of profilePolicies) {
        if (pp.policy_id && pp.preferred_outbound) {
            preferredOutboundMap.set(pp.policy_id, pp.preferred_outbound);
        }
    }
    if (preferredOutboundMap.size === 0) return;

    // 构建 policy_id 到 rule index 的映射（按 order 排序后的策略顺序与 rules 顺序一致）
    const sortedPolicies = [...enabledPolicies].sort((a, b) => a.order - b.order);
    const policyIdToRuleIndex = new Map<string, number>();
    sortedPolicies.forEach((policy, index) => {
        policyIdToRuleIndex.set(policy.id, index);
    });

    // 获取现有出站节点
    const existingOutboundTags = new Set(
        (config.outbounds || []).map((o: OutboundConfig) => o.tag).filter(Boolean)
    );

    // 更新策略规则的出站
    let rulesUpdated = 0;
    for (const [policyId, preferredOutbound] of preferredOutboundMap.entries()) {
        // 检查节点是否存在
        if (!existingOutboundTags.has(preferredOutbound)) {
            console.log(`[Config] Skip policy ${policyId}: node ${preferredOutbound} not found`);
            continue;
        }

        // 找到对应的 rule index
        const ruleIndex = policyIdToRuleIndex.get(policyId);
        if (ruleIndex === undefined || ruleIndex < 0 || ruleIndex >= config.route.rules.length) {
            console.log(`[Config] Skip policy ${policyId}: rule not found`);
            continue;
        }

        const rule = config.route.rules[ruleIndex];
        // 跳过逻辑规则
        if ('type' in rule && rule.type === 'logical') {
            console.log(`[Config] Skip policy ${policyId}: logical rule does not support preferred_outbound`);
            continue;
        }

        const oldOutbound = rule.outbound;
        rule.outbound = preferredOutbound;
        rulesUpdated++;
        console.log(`[Config] Update policy rule outbound: ${policyId} (${oldOutbound}) -> ${preferredOutbound}`);
    }

    console.log(`[Config] Successfully updated ${rulesUpdated} rule outbounds`);
}

/** 应用 profile 的 DNS 服务器 detour 设置 */
function applyDnsServerDetours(config: SingboxConfig, profileId: string): void {
    const profileDnsDetours = dbUtils.getAllProfileDnsServerDetours(profileId);
    if (profileDnsDetours.length === 0 || !config.dns?.servers) return;

    const dnsDetourMap = new Map(profileDnsDetours.map(d => [d.dns_server_id, d.preferred_detour]));
    let appliedCount = 0;

    for (const server of config.dns.servers) {
        const serverId = server.tag;
        const preferredDetour = dnsDetourMap.get(serverId);
        if (preferredDetour) {
            server.detour = preferredDetour;
            appliedCount++;
            console.log(`[Config] DNS server ${serverId} set detour: ${preferredDetour}`);
        }
    }

    console.log(`[Config] Applied ${appliedCount} DNS server detour settings`);
}

/** 应用自定义分流模式：策略规则（不处理 rule_set，后续统一处理） */
function applyOverrideRulesRoute(config: SingboxConfig, profileId: string): any[] {
    // 1. 获取启用的路由策略并应用
    const policies = dbUtils.getPolicies().filter((p: any) => p.enabled);
    applyRoutePolicies(config, policies);

    // 2. 应用 DNS 服务器 detour 设置
    applyDnsServerDetours(config, profileId);

    // 3. 应用 DNS 策略偏好服务器
    applyDnsPolicyPreferredServers(config, profileId);

    // 4. 应用路由策略偏好出站
    applyRoutePolicyPreferredOutbounds(config, profileId, policies);

    return policies;
}


function addSystemRouteRules(config: SingboxConfig, settings: Record<string, string>): void {
    const isTunMode = settings['dashboard-tun-mode'] === 'true';


    const mergedConfig = config;

   // 为代理节点生成直连规则
    // addProxyServerRules(mergedConfig);

     // 高级配置 hosts-override 转为 dns 配置：单域名用 hosts 服务器，泛域名用 rule 的 predefined
    const hostsOverrideVal = settings['hosts-override'] || '[]';
    let hostsOverrideLines: string[] = [];
    try {
        const arr = JSON.parse(hostsOverrideVal);
        hostsOverrideLines = Array.isArray(arr) ? arr.filter((s: unknown) => typeof s === 'string') : [];
    } catch {
        /* ignore */
    }
    if (hostsOverrideLines.length > 0) {
        const { server: hostsServer, rules: hostsRules } = hostsOverrideToDnsConfig(hostsOverrideLines);
        if (hostsServer || hostsRules.length > 0) {
            if (!mergedConfig.dns) mergedConfig.dns = { servers: [], rules: [] };
            if (!Array.isArray(mergedConfig.dns.servers)) mergedConfig.dns.servers = [];
            if (hostsServer) {
                mergedConfig.dns.servers = mergedConfig.dns.servers.filter((s: any) => s?.tag !== 'dns_hosts');
                mergedConfig.dns.servers.unshift(hostsServer);
            }
            if (hostsRules.length > 0) {
                const existingRules = Array.isArray(mergedConfig.dns.rules) ? mergedConfig.dns.rules : [];
                mergedConfig.dns.rules = [...hostsRules, ...existingRules];
            }
            console.log('[Config] Applied hosts-override to DNS (single domains -> hosts, wildcards -> predefined rules)');
        }
    }

    let appendRules: DnsPlainRule[] = [
      {
        "protocol": "dns",
        "action": "hijack-dns"
      },
      {
        "inbound": "proxy_in",
        "action": "sniff"
      },
    ]

    if(isTunMode) {
        appendRules = [
            {
                "inbound": "tun_in",
                "action": "sniff"
            },
            ...appendRules
        ]
            
    }

    // DNS 专用代理端口：所有流量直接走代理（selector_out）
    const dnsServerEnabled = settings['dns-server-enabled'] !== 'false';
    const dnsProxyPort = parseInt(settings['dns-proxy-port'], 10) || 17890;
    if (dnsServerEnabled) {
        appendRules.push({
            "inbound": "dns_proxy_in",
            "outbound": "selector_out"
        });
        console.log('[Config] Route rule: dns_proxy_in -> selector_out (proxy all DNS inbound traffic)');
    }

    config.route.rules = [
        ...appendRules,
        ...(config.route.rules || []),
    ]
}


/** 根据 dashboard-mode 覆盖 route（直连/全局/规则） */
function applyDashboardMode(config: SingboxConfig, settings: Record<string, string>): void {
    const dashboardMode = settings['dashboard-mode'] || 'rule';
    let final_route_outbound = settings['policy-final-outbound'] || 'selector_out';
    let final_dns_server = 'dns_direct_out';
  
    if(dashboardMode === 'rule'){
        // 规则模式下，使用用户设置的 DNS 策略默认服务器
        const unmatchedServer = settings['dns-unmatched-server'];
        const resolveServer = settings['dns-resolve-server'];
        if (unmatchedServer) {
            final_dns_server = unmatchedServer;
            console.log(`[Config] Using dns-unmatched-server: ${unmatchedServer}`);
        }
        // route.default_domain_resolver 优先使用 dns-resolve-server，否则使用 final_dns_server
        const domainResolver = resolveServer || final_dns_server;
        config.route.final = final_route_outbound;
        config.route.default_domain_resolver = domainResolver;
        config.dns.final = final_dns_server;
        console.log(`[Config] route.default_domain_resolver: ${domainResolver}, dns.final: ${final_dns_server}`);
    }else{
        config.route.rules = [];
        config.route.rule_set = [];
        config.dns.rules = [];
        if (dashboardMode === 'direct') {
            final_route_outbound = 'direct_out';
            final_dns_server = 'dns_direct_out';
            console.log('[Config] Outbound mode: direct (all traffic direct)');
        } else if (dashboardMode === 'global') {
            final_route_outbound = 'selector_out';
            final_dns_server = 'dns_selector_out';
            console.log('[Config] Outbound mode: global (all traffic via proxy)');
        }
        config.route.final = final_route_outbound;
        config.route.default_domain_resolver = final_dns_server;
        config.dns.final = final_dns_server;
    }
    config.route.auto_detect_interface = true;
    
    // 确保 dns.servers 存在
    if (!config.dns.servers) {
        config.dns.servers = [];
    }
    
    config.dns.servers.push({ 
        tag: 'dns_direct_out',
        type: 'local'
     });
    config.dns.servers.push({
        "tag": "dns_selector_out",
        "type": "tls",
        "server": "8.8.8.8",
        "detour": "selector_out"
    });

    // 系统默认的规则(route 和 dns)
    addSystemRouteRules(config, settings);

    // 添加默认使用的出站节点
    appendExtraOutbounds(config, settings);

    // 构建和分配规则集
    config.route.rule_set = getRuleSets(config);
}

/**
 * 应用自定义代理分组
 * 如果 custom-proxy-groups 开启且 profile 有自定义分组，替换订阅中的原始 selector/urltest 分组
 * 并在自定义分组前插入 2 个默认分组：🚀 节点选择、♻️ 自动选择
 */
function applyCustomProxyGroups(config: SingboxConfig, profileId: string): void {
    
    const profile = dbUtils.getProfileById(profileId);
    const customGroups = profile?.customGroups ?? [];
    

    console.log(`[Config] Applying ${customGroups.length} custom proxy groups for profile ${profileId}`);
    console.log(`[Config] Custom groups:`, JSON.stringify(customGroups.map(g => ({ name: g.name, type: g.type, nodeCount: g.outbounds.length }))));
    
    if (!config.outbounds) config.outbounds = [];
    
    // 获取所有现有节点的 tag（非分组类型），按原始顺序排列
    const allProxyNodes = config.outbounds
        .filter((o: OutboundConfig) => {
            const type = (o.type || '').toLowerCase();
            return !['selector', 'urltest',  'direct', 'block'].includes(type);
        });
    
    const existingNodeTags = new Set(allProxyNodes.map(a=>a.tag));
    console.log(`[Config] Found ${allProxyNodes.length} proxy nodes in current config`);

    
    // 默认分组名称（与当前语言一致，写入 config）
    const SELECTOR_GROUP = t('main.config.proxyGroupSelector');
    const AUTO_SELECT_GROUP = t('main.config.proxyGroupAutoSelect');

    
    // 1. ♻️ 自动选择 - urltest 类型，包含所有代理节点
    const autoSelectOutbound: OutboundConfig = {
        type: 'urltest',
        tag: AUTO_SELECT_GROUP,
        outbounds: [...existingNodeTags],
        url: 'http://www.gstatic.com/generate_204',
        interval: '300s',
        tolerance: 50
    };
    console.log(`[Config] Added default group: ${AUTO_SELECT_GROUP} (urltest) with ${allProxyNodes.length} nodes`);
    

    // 添加自定义分组，并收集自定义分组的名称
    const customGroupNodes: OutboundConfig[] = [];
    let addedCount = 0;
    for (const group of customGroups) {
        // 过滤出有效的节点
        const validOutbounds = group.outbounds.filter(tag => existingNodeTags.has(tag));
        const invalidOutbounds = group.outbounds.filter(tag => !existingNodeTags.has(tag));
        
        // 输出无效节点信息以便调试
        if (invalidOutbounds.length > 0) {
            console.log(`[Config] Custom group "${group.name}" has ${invalidOutbounds.length} invalid nodes:`, invalidOutbounds.slice(0, 5));
        }
        
        if (validOutbounds.length === 0) {
            console.log(`[Config] Custom group "${group.name}" has no valid nodes, skipping`);
            continue;
        }
        
        if (group.type === 'selector') {
            customGroupNodes.push({
                type: 'selector',
                tag: group.name,
                outbounds: validOutbounds
            });
        } else {
            // urltest 类型
            customGroupNodes.push({
                type: 'urltest',
                tag: group.name,
                outbounds: validOutbounds,
                url: 'http://www.gstatic.com/generate_204',
                interval: '5m',
                tolerance: 50
            });
        }
        addedCount++;
        console.log(`[Config] Added custom group: ${group.name} (${group.type}) with ${validOutbounds.length} nodes`);
    }
    
    // 3. 🚀 节点选择 - selector 类型，包含自动选择、故障转移、自定义分组和所有代理节点
    const selectorOutbound: OutboundConfig = {
        type: 'selector',
        tag: SELECTOR_GROUP,
        outbounds: [AUTO_SELECT_GROUP, ...customGroups.map(a=>a.name), ...existingNodeTags]
    };
    // 放到 outbounds 数组的最前面
    config.outbounds = [
        ...allProxyNodes,
        selectorOutbound,
        autoSelectOutbound,
        ...customGroupNodes,
    ];
    console.log(`[Config] Added default group: ${SELECTOR_GROUP} (selector) with ${2 + customGroupNodes.length + allProxyNodes.length} outbounds`);
}

/** 生成 config.json 并写入磁盘 */
export async function generateConfigFile(
    profileId: string,
    sendToRenderer?: (channel: string, ...args: any[]) => void
): Promise<string> {
    if (sendToRenderer) sendToRenderer('config-generate-start');
    try {
        // 使用新的纯净函数处理配置的转换和写入
        const configPath = await writeConfigFileOnly(profileId);
        
        console.log(`Generated config.json for profile ${profileId}`);
        await restartKernelIfRunning();
        return configPath;
    } finally {
        if (sendToRenderer) sendToRenderer('config-generate-end');
    }
}

/** 
 * 纯净的配置转换和写入函数
 * 只做配置的转换、合并设置和写入文件，不处理其他逻辑
 */
export async function writeConfigFileOnly(
    profileId: string,
    customSettings?: Record<string, string>
): Promise<string> {
    // 获取设置（可以传入自定义设置覆盖默认设置）
    const settings = customSettings ? { ...dbUtils.getAllSettings(), ...customSettings } : dbUtils.getAllSettings();
    const overrideRules = settings['override-rules'] === 'true';

    // 获取基础配置
    const { config } = await getProfileConfig(profileId, overrideRules);
    const mergedConfig = mergeSettingsIntoConfig(config);

    // 应用路由规则
    if (overrideRules) {
        applyOverrideRulesRoute(mergedConfig, profileId);

        // 应用自定义代理分组（依赖自定义分流：只在 override-rules 开启时生效）
        const customProxyGroupsEnabled = settings['custom-proxy-groups'] === 'true';
        if (customProxyGroupsEnabled) {
            applyCustomProxyGroups(mergedConfig, profileId);
        }
    }
    
    // 应用仪表板模式设置（清空多余的规则）
    applyDashboardMode(mergedConfig, settings);

    // 获取配置文件路径并写入文件
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2), 'utf8');
    
    console.log(`[Config] Config file written: ${configPath}`);
    return configPath;
}

/** 获取当前 config 中的 route.rules */
export function getCurrentConfigRules(): any[] {
    const config = readConfig();
    return config?.route?.rules ?? [];
}

/** 获取可用出站列表 */
export function getAvailableOutbounds(): { tag: string; type: string; all?: string[] }[] {
    const config = readConfig();
    if (!config) return [];
    const outbounds = config.outbounds || [];
    return outbounds
        .filter((o: OutboundConfig) => o.tag && !['dns', 'block'].includes(o.type?.toLowerCase()))
        .map((o: OutboundConfig) => ({
            tag: o.tag,
            type: o.type,
            all: o.type === 'selector' ? o.outbounds || [] : undefined
        }));
}


export { POLICY_FINAL_OUTBOUND_VALUES };
