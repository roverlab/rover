/**
 * config.json 读写与生成逻辑
 * 包含配置文件读取、写入、合并设置、生成完整 config
 */

import fs from 'node:fs';
import crypto from 'node:crypto';
import yaml from 'js-yaml';
import * as dbUtils from './db';
import * as singbox from './core-controller';
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
function buildAndAssignRuleSets(config: SingboxConfig): void {
    const refs = collectAllRuleSetRefs(config);
    if (refs.size === 0) return;

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
    if (!config.route) config.route = {};
    config.route.rule_set = ruleSets;
}

export { getConfigPath };

/** 读取并解析 config.json */
export function readConfig(): any | null {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) return null;
    try {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch {
        throw new Error('配置文件损坏，请重新生成配置文件');
    }
}

/** 写入 config.json */
export function writeConfig(config: any): void {
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

/** 若内核运行中则重启，使新配置生效 */
async function restartKernelIfRunning(): Promise<void> {
    if (!singbox.isSingboxRunning()) return;
    await singbox.stopSingbox();
    await new Promise((r) => setTimeout(r, 500));
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
    if (had) console.log(`[订阅转换缓存] 已清除 profile=${profileId}`);
}

/** 将 Clash YAML 转为 Sing-box JSON */
export function convertYamlToSingbox(content: string, options?: ConvertOptions): string {
    try {
        const parsed = yaml.load(content) as MihomoConfig;
        if (!parsed) throw new Error('Failed to parse YAML content');
        if (parsed.proxies && Array.isArray(parsed.proxies)) {
            console.log(`Converting Clash config with ${parsed.proxies.length} proxies...`);
            if (options?.skipRules) {
                console.log('[Config] Skipping rules conversion (override-rules enabled)');
            }
            const singboxConfig = convertClashToSingbox(parsed, options);
            return JSON.stringify(singboxConfig, null, 2);
        }
        throw new Error('No proxies found in YAML file');
    } catch (err: any) {
        console.error('YAML conversion error:', err.message);
        throw new Error(`Failed to convert YAML: ${err.message}`);
    }
}


/** 获取 profile 配置（读取文件并解析为 JSON）
 * @param profileId 配置文件 ID
 * @param skipRules 跳过规则转换（当使用自定义分流时可跳过，提升性能）
 */
export async function getProfileConfig(profileId: string, skipRules = false): Promise<{ config: any; profile: any }> {
    const profile = dbUtils.getProfileById(profileId);
    if (!profile) throw new Error('Profile not found');

    let content = subscription.readProfileContent(profileId, profile.path ? resolveDataPath(profile.path) : undefined);

    if (!content) {
        if (profile.type === 'local') {
            throw new Error('本地配置文件已损坏或丢失，无法使用。请重新导入配置文件。');
        } else if (profile.type === 'remote') {
            console.log(`Profile file missing, attempting to re-download for profile ${profileId}...`);
            if (!profile.url) {
                throw new Error('配置文件丢失且没有订阅地址，无法自动恢复。请重新添加订阅。');
            }
            try {
                content = await subscription.downloadProfile(profileId);
                console.log('Successfully re-downloaded profile');
            } catch (downloadErr: any) {
                throw new Error(`配置文件丢失，自动重新下载失败: ${downloadErr.message}`);
            }
        }
    }

    if (isYaml(content)) {
        const contentHash = hashContent(content);
        
        // 当跳过规则转换时，不使用缓存，因为缓存的配置包含完整规则
        if (skipRules) {
            console.log(`[订阅转换] profile=${profileId} skipRules=true，跳过规则转换`);
            console.log('YAML content detected in profile, converting to sing-box JSON (without rules)...');
            try {
                content = convertYamlToSingbox(content, { skipRules: true });
            } catch (convertErr: any) {
                throw new Error(`Failed to convert YAML config: ${convertErr.message}`);
            }
        } else {
            // 正常模式：使用缓存机制
            const cached = profileConvertCache.get(profileId);
            if (cached && cached.hash === contentHash) {
                console.log(`[订阅转换缓存] 命中 profile=${profileId} hash=${contentHash.slice(0, 12)}...`);
                content = cached.converted;
            } else {
                const reason = !cached ? '无缓存' : `hash 变化 (旧=${cached.hash.slice(0, 12)}... 新=${contentHash.slice(0, 12)}...)`;
                console.log(`[订阅转换缓存] 未命中 profile=${profileId} 原因=${reason}`);
                console.log('YAML content detected in profile, converting to sing-box JSON...');
                try {
                    content = convertYamlToSingbox(content);
                    profileConvertCache.set(profileId, { hash: contentHash, converted: content });
                    console.log(`[订阅转换缓存] 已写入 profile=${profileId} hash=${contentHash.slice(0, 12)}...`);
                } catch (convertErr: any) {
                    throw new Error(`Failed to convert YAML config: ${convertErr.message}`);
                }
            }
        }
    }

    let config;
    try {
        config = JSON.parse(content);
        if (Object.keys(config).length === 0) throw new Error('Config is empty');
    } catch (e: any) {
        console.error('Invalid config format:', e.message);
        throw new Error(`Invalid config format: ${e.message}. Note: Only Sing-box JSON is supported.`);
    }

    return { config, profile };
}

/** 将用户设置合并到 config */
export function mergeSettingsIntoConfig(config: any): SingboxConfig {
    const settings = dbUtils.getAllSettings();

    const isAllowLan = settings['allow-lan'] === 'true';
    const mixedPort = parseInt(settings['mixed-port'], 10) || 7890;
    const logLevelSetting = settings['log-level'] || 'warn'
    const tunModeEnabled = settings['dashboard-tun-mode'] === 'true';

    let apiUrl = settings['api-url'] || '127.0.0.1:9090';
    apiUrl = apiUrl.replace(/^https?:\/\//, '');
    const apiSecret = settings['api-secret'] || '';

    config.log = { ...config.log, level: logLevelSetting, disabled: false, timestamp: true };

    const inbounds: any[] = [{
        type: 'mixed',
         tag: 'proxy_in',
        listen: isAllowLan ? '0.0.0.0' : '127.0.0.1',
        listen_port: mixedPort,
        sniff: true
    }];

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

        console.log('[Config] TUN route_exclude_address:', routeExcludeAddress);

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
    if (config.experimental.rest_api) delete config.experimental.rest_api;

    if (config.mode !== undefined) delete config.mode;
    config.experimental.clash_api = {
        external_controller: apiUrl,
        secret: apiSecret,
        // default_mode: defaultMode,
    };

    const dnsServers = dbUtils.getDnsServers();
    const enabledDnsServers = dnsServers.filter(s => s.enabled !== false);
    if (enabledDnsServers.length > 0) {
        const servers = enabledDnsServers.map((s) => {
            // raw 类型直接使用 raw_data，不做任何覆盖
            if (s.type === 'raw' && s.raw_data) {
                return s.raw_data as Record<string, any>;
            }
            
            const obj: any = { type: s.type, tag: s.id };
            if (s.server) obj.server = s.server;
            if (s.server_port != null) obj.server_port = s.server_port;
            if (s.path) obj.path = s.path;
            if (s.prefer_go != null) obj.prefer_go = s.prefer_go;
            if (s.inet4_range) obj.inet4_range = s.inet4_range;
            if (s.inet6_range) obj.inet6_range = s.inet6_range;
            if (s.predefined && Object.keys(s.predefined).length > 0) obj.predefined = s.predefined;
            if (s.domain_resolver) obj.domain_resolver = s.domain_resolver;
            return obj;
        });
        const defaultServer = enabledDnsServers.find(s => s.is_default);
        config.dns = { servers };
        if (defaultServer) config.dns.final = defaultServer.id;
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
export function appendExtraOutbounds(config: SingboxConfig): void {
    const outbounds = config.outbounds || [];
    const existingTags = new Set(outbounds.map((o: OutboundConfig) => o?.tag).filter(Boolean));

    const selectorUrltestTags = outbounds
        .filter(
            (o: OutboundConfig) =>
                o?.tag &&
                (String(o.type || '').toLowerCase() === 'selector' || String(o.type || '').toLowerCase() === 'urltest') &&
                Array.isArray(o.outbounds) &&
                o.outbounds.length > 0
        )
        .map((o: OutboundConfig) => o.tag);

    if (existingTags.has('selector_out') && existingTags.has('direct_out') && existingTags.has('block_out') && selectorUrltestTags.length > 0) {
        return;
    }

    const extra: OutboundConfig[] = [];

    if (!existingTags.has('selector_out') && selectorUrltestTags.length > 0) {
        extra.push({
            type: 'selector',
            tag: 'selector_out',
            outbounds: selectorUrltestTags
        });
    }

    // 确保 dns_direct_out 存在（即使用于 domain_resolver）
    if (!config.dns) config.dns = { servers: [] };
    if (!Array.isArray(config.dns.servers)) config.dns.servers = [];
    const hasDnsDirectOut = config.dns.servers.some((s: any) => s?.tag === 'dns_direct_out');
    if (!hasDnsDirectOut) {
        config.dns.servers.push({ tag: 'dns_direct_out', type: 'local' });
    }

    if (!existingTags.has('direct_out')) {
        extra.push({
            type: 'direct',
            tag: 'direct_out'
        });
    }

    if (!existingTags.has('block_out')) {
        extra.push({ type: 'block', tag: 'block_out' });
    }

    if (extra.length > 0) {
        config.outbounds = [...outbounds, ...extra];
    }

    if (selectorUrltestTags.length === 0) {
        config.outbounds = (config.outbounds || []).filter((o: any) => o?.tag !== 'selector_out');
        if (config.route?.final === 'selector_out') {
            config.route.final = 'direct_out';
        }
    }
}

/** 确保 config.dns.servers 中存在 dns_direct_out */
function ensureDnsDirectOutExists(config: SingboxConfig): void {
    if (!config.dns) config.dns = { servers: [] };
    if (!Array.isArray(config.dns.servers)) config.dns.servers = [];
    const hasDnsDirectOut = config.dns.servers.some((s: DnsServer) => s?.tag === 'dns_direct_out');
    if (!hasDnsDirectOut) {
        config.dns.servers.push({ tag: 'dns_direct_out', type: 'local' });
    }
    if (!config.dns.final) {
        config.dns.final = 'dns_direct_out';
    }
    // 始终将 default_domain_resolver 与 dns.final 同步（默认 DNS 服务器）
    config.route.default_domain_resolver = config.dns.final;
    if (config.route.auto_detect_interface === undefined) {
        config.route.auto_detect_interface = true;
    }
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

/** 从 outbounds 中提取所有真实代理节点的 server（域名或 IP）
 *  排除 selector、urltest、direct、block、dns 等非真实节点
 */
function extractProxyServerAddresses(config: SingboxConfig): { domains: string[]; ips: string[] } {
    const domains = new Set<string>();
    const ips = new Set<string>();
    
    // 排除的出站类型
    const excludeTypes = new Set(['selector', 'urltest', 'direct', 'block', 'dns', 'dns_out', 'dns_direct_out']);
    
    const outbounds = config.outbounds || [];
    for (const outbound of outbounds) {
        const type = (outbound.type || '').toLowerCase();
        if (excludeTypes.has(type)) continue;
        
        const server = outbound.server;
        if (!server || typeof server !== 'string') continue;
        
        if (isIpAddress(server)) {
            ips.add(server);
        } else {
            domains.add(server);
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
    
    console.log(`[Config] 为 ${domains.length} 个代理域名和 ${ips.length} 个代理 IP 生成直连规则`);
    
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
        console.log(`[Config] DNS 规则: ${domains.length} 个代理域名使用 dns_direct_out`);
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
        console.log(`[Config] 路由规则: ${ips.length} 个代理 IP 直连`);
    }
    
    // 域名直连规则
    if (domains.length > 0) {
        const domainRule: RouteRule = {
            domain: domains,
            outbound: 'direct_out'
        };
        config.route.rules.unshift(domainRule);
        console.log(`[Config] 路由规则: ${domains.length} 个代理域名直连`);
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
            console.log(`[Config] 跳过策略 ${policyId}: 节点 ${preferredOutbound} 不存在`);
            continue;
        }

        // 找到对应的 rule index
        const ruleIndex = policyIdToRuleIndex.get(policyId);
        if (ruleIndex === undefined || ruleIndex < 0 || ruleIndex >= config.route.rules.length) {
            console.log(`[Config] 跳过策略 ${policyId}: 找不到对应的规则`);
            continue;
        }

        const rule = config.route.rules[ruleIndex];
        // 跳过逻辑规则
        if ('type' in rule && rule.type === 'logical') {
            console.log(`[Config] 跳过策略 ${policyId}: 逻辑规则不支持 preferred_outbound`);
            continue;
        }

        const oldOutbound = rule.outbound;
        rule.outbound = preferredOutbound;
        rulesUpdated++;
        console.log(`[Config] 更新策略规则出站: ${policyId} (${oldOutbound}) -> ${preferredOutbound}`);
    }

    console.log(`[Config] 成功更新 ${rulesUpdated} 条规则的出站`);
}

/** 应用 profile 的 DNS 服务器 detour 设置 */
function applyDnsServerDetours(config: SingboxConfig, profileId: string): void {
    const profileDnsDetours = dbUtils.getAllProfileDnsServerDetours(profileId);
    if (profileDnsDetours.length === 0 || !config.dns?.servers) return;

    const dnsDetourMap = new Map(profileDnsDetours.map(d => [d.dns_server_id, d.detour]));
    let appliedCount = 0;

    for (const server of config.dns.servers) {
        const serverId = server.tag;
        const detour = dnsDetourMap.get(serverId);
        if (detour) {
            server.detour = detour;
            appliedCount++;
            console.log(`[Config] DNS 服务器 ${serverId} 设置 detour: ${detour}`);
        }
    }

    console.log(`[Config] 应用了 ${appliedCount} 个 DNS 服务器的 detour 设置`);
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
    config.route.rules = [
        ...appendRules,
        ...config.route.rules,
    ]


    const mergedConfig = config;

   // 为代理节点生成直连规则
    addProxyServerRules(mergedConfig);

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
}


/** 根据 dashboard-mode 覆盖 route（直连/全局/规则） */
function applyDashboardMode(config: SingboxConfig, settings: Record<string, string>): void {
    const dashboardMode = settings['dashboard-mode'] || 'rule';
    if(dashboardMode === 'rule') {
        return;
    }

    config.route.rules = [];
    config.route.rule_set = [];
    config.dns.rules = [];

    if (dashboardMode === 'direct') {
        config.route.final = 'direct_out';
        config.route.default_domain_resolver = 'dns_direct_out';
        config.dns.final = 'dns_direct_out';
        console.log('[Config] Outbound mode: direct (all traffic direct)');
    } else if (dashboardMode === 'global') {
        config.route.final = 'selector_out';
        console.log('[Config] Outbound mode: global (all traffic via proxy)');
    }
}

/**
 * 应用自定义代理分组
 * 如果 custom-proxy-groups 开启且 profile 有自定义分组，替换订阅中的原始 selector/urltest 分组
 * 并在自定义分组前插入 2 个默认分组：🚀 节点选择、♻️ 自动选择
 */
function applyCustomProxyGroups(config: SingboxConfig, profileId: string, customProxyGroupsEnabled: boolean): void {
    // 只有开启 custom-proxy-groups 时才替换代理组
    if (!customProxyGroupsEnabled) {
        return;
    }
    
    const profile = dbUtils.getProfileById(profileId);
    const customGroups = profile?.customGroups;
    
    if (!customGroups || customGroups.length === 0) {
        return;
    }
    
    console.log(`[Config] Applying ${customGroups.length} custom proxy groups for profile ${profileId}`);
    
    if (!config.outbounds) config.outbounds = [];
    
    // 获取所有现有节点的 tag（非分组类型），按原始顺序排列
    const allProxyNodes = config.outbounds
        .filter((o: OutboundConfig) => {
            const type = (o.type || '').toLowerCase();
            return !['selector', 'urltest', 'dns', 'direct'].includes(type);
        })
        .map((o: OutboundConfig) => o.tag);
    
    const existingNodeTags = new Set(allProxyNodes);
    
    // 移除原有的 selector/urltest 分组（保留 selector_out）
    const originalCount = config.outbounds.length;
    config.outbounds = config.outbounds.filter((o: OutboundConfig) => {
        const type = (o.type || '').toLowerCase();
        const tag = o.tag || '';
        // 保留非分组类型和 selector_out
        if (!['selector', 'urltest'].includes(type)) return true;
        if (tag === 'selector_out') return true;
        return false;
    });
    console.log(`[Config] Removed ${originalCount - config.outbounds.length} original proxy groups`);
    
    // 默认分组名称
    const SELECTOR_GROUP = '🚀 节点选择';
    const AUTO_SELECT_GROUP = '♻️ 自动选择';

    
    // 1. ♻️ 自动选择 - urltest 类型，包含所有代理节点
    const autoSelectOutbound: OutboundConfig = {
        type: 'urltest',
        tag: AUTO_SELECT_GROUP,
        outbounds: allProxyNodes,
        url: 'http://www.gstatic.com/generate_204',
        interval: '300s',
        tolerance: 50
    };
    config.outbounds.push(autoSelectOutbound);
    console.log(`[Config] Added default group: ${AUTO_SELECT_GROUP} (urltest) with ${allProxyNodes.length} nodes`);
    

    // 添加自定义分组，并收集自定义分组的名称
    const customGroupNames: string[] = [];
    let addedCount = 0;
    for (const group of customGroups) {
        // 过滤出有效的节点
        const validOutbounds = group.outbounds.filter(tag => existingNodeTags.has(tag));
        
        if (validOutbounds.length === 0) {
            console.log(`[Config] Custom group "${group.name}" has no valid nodes, skipping`);
            continue;
        }
        
        if (group.type === 'selector') {
            config.outbounds.push({
                type: 'selector',
                tag: group.name,
                outbounds: validOutbounds
            });
        } else {
            // urltest 类型
            config.outbounds.push({
                type: 'urltest',
                tag: group.name,
                outbounds: validOutbounds,
                url: 'http://www.gstatic.com/generate_204',
                interval: '5m',
                tolerance: 50
            });
        }
        customGroupNames.push(group.name);
        addedCount++;
        console.log(`[Config] Added custom group: ${group.name} (${group.type}) with ${validOutbounds.length} nodes`);
    }
    
    // 3. 🚀 节点选择 - selector 类型，包含自动选择、故障转移、自定义分组和所有代理节点
    const selectorOutbound: OutboundConfig = {
        type: 'selector',
        tag: SELECTOR_GROUP,
        outbounds: [AUTO_SELECT_GROUP, ...customGroupNames, ...allProxyNodes]
    };
    // 放到 outbounds 数组的最前面
    config.outbounds.unshift(selectorOutbound);
    console.log(`[Config] Added default group: ${SELECTOR_GROUP} (selector) with ${2 + customGroupNames.length + allProxyNodes.length} outbounds`);
    
    console.log(`[Config] Applied ${addedCount} custom proxy groups (plus 3 default groups)`);
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
        
        // 记录生成配置时的 TUN 模式状态到数据库（用于启动时判断是否需要重新生成）
        const settings = dbUtils.getAllSettings();
        const tunModeEnabled = settings['dashboard-tun-mode'] === 'true';
        dbUtils.setSetting('last-config-tun-mode', tunModeEnabled ? 'true' : 'false');
        
        console.log(`Generated config.json for profile ${profileId} (TUN: ${tunModeEnabled})`);
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
        // 应用自定义代理分组
        const customProxyGroupsEnabled = settings['custom-proxy-groups'] === 'true';
        if (customProxyGroupsEnabled) {
            applyCustomProxyGroups(mergedConfig, profileId, true);
        }
    }

    // 构建和分配规则集
    buildAndAssignRuleSets(mergedConfig);

    // 设置route和dns的默认值
    ensureDnsDirectOutExists(mergedConfig);

    // 添加默认使用的出站节点
    appendExtraOutbounds(mergedConfig);

    // 应用仪表板模式设置（清空多余的规则）
    applyDashboardMode(mergedConfig, settings);

    // 系统默认的规则(route 和 dns)
    addSystemRouteRules(mergedConfig,settings);

    // 获取配置文件路径并写入文件
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2), 'utf8');
    
    console.log(`[Config] 配置文件已写入: ${configPath}`);
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

// 防抖重新生成配置的定时器和回调队列
const REGENERATE_CONFIG_DEBOUNCE_MS = 300;
let regenerateConfigTimer: NodeJS.Timeout | null = null;
let regenerateConfigPendingResolves: ((ok: boolean) => void)[] = [];

/** 内部函数：实际执行配置重新生成 */
async function runRegenerateConfig(
    reason: string,
    sendToRenderer?: (channel: string, ...args: any[]) => void,
    log?: { info: (s: string) => void; error: (s: string) => void }
): Promise<boolean> {
    const selectedProfile = dbUtils.getSelectedProfile();
    if (!selectedProfile) return false;
    await generateConfigFile(selectedProfile.id, sendToRenderer);
    log?.info(`[Config] regenerated config.json (${reason})`);
    return true;
}

/** 防抖式重新生成 config（仅当 override-rules 启用时） */
export function regenerateConfigIfOverrideRulesEnabled(
    reason: string,
    sendToRenderer?: (channel: string, ...args: any[]) => void,
    log?: { info: (s: string) => void; error: (s: string) => void }
): Promise<boolean> {
    const settings = dbUtils.getAllSettings();
    const overrideRules = settings['override-rules'] === 'true';
    if (!overrideRules) {
        log?.info(`[Config] skip regenerate (override-rules disabled, ${reason})`);
        return Promise.resolve(false);
    }

    return new Promise((resolve) => {
        regenerateConfigPendingResolves.push(resolve);
        if (regenerateConfigTimer) clearTimeout(regenerateConfigTimer);
        regenerateConfigTimer = setTimeout(async () => {
            regenerateConfigTimer = null;
            const resolvers = regenerateConfigPendingResolves;
            regenerateConfigPendingResolves = [];
            try {
                const ok = await runRegenerateConfig(reason, sendToRenderer, log);
                resolvers.forEach((r) => r(ok));
            } catch (err: any) {
                log?.error(`[Config] regenerate failed: ${err?.message || err}`);
                resolvers.forEach((r) => r(false));
            }
        }, REGENERATE_CONFIG_DEBOUNCE_MS);
    });
}

/** 规则集更新后重新生成 config（如果规则集存在且 override-rules 启用） */
export async function regenerateConfigForRuleProviderIfNeeded(
    providerId: string,
    reason: string,
    sendToRenderer?: (channel: string, ...args: any[]) => void,
    log?: { info: (s: string) => void; error: (s: string) => void }
): Promise<boolean> {
    const provider = dbUtils.getRuleProviderById(providerId);
    if (!provider) {
        log?.info(`[Config] skip regenerate (provider ${providerId} not found)`);
        return false;
    }
    return regenerateConfigIfOverrideRulesEnabled(reason, sendToRenderer, log);
}

export { POLICY_FINAL_OUTBOUND_VALUES };
