/**
 * config.json 读写与生成逻辑
 * 包含配置文件读取、写入、合并设置、生成完整 config
 */

import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import yaml from 'js-yaml';
import * as dbUtils from './db';
import * as singbox from './singbox';
import { getConfigPath, getProfilesDir, resolveDataPath, getBuiltinRulesetsPath } from './paths';
import { SingboxConfig, tunDefaultConfig } from '../src/types/singbox';
import type { MihomoConfig } from '../src/types/clash';
import { convertClashToSingbox, type ConvertOptions } from '../src/types/singbox';
import * as subscription from './subscription';
import {
    buildProvidersForConfig,
    getPolicyFinalOutbound,
    ensureLocalRuleSetFiles,
    isRuleProviderUsedByEnabledPolicies,
    POLICY_FINAL_OUTBOUND_VALUES,
    checkIsAdmin
} from './route-policy';
import { policiesToSingboxConfig, getPolicyMatchableFields } from '../src/types/policy';
import { dnsPoliciesToSingboxConfig } from '../src/types/dns-policy';

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
    rules: any[];
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


 

    for (const [domainSuffix, { ipv4, ipv6 }] of wildcardMap) {
        const wildcardDomain = '*' + domainSuffix;
        if (ipv6) {
            rules.push({
                query_type: ['AAAA'],
                domain_suffix: [domainSuffix],
                action: 'predefined',
                rcode: 'NOERROR',
                answer: [`${wildcardDomain}. IN AAAA ${ipv6}`],
            });
        }
        if (ipv4) {
            rules.push({
                query_type: ['A'],
                domain_suffix: [domainSuffix],
                action: 'predefined',
                rcode: 'NOERROR',
                answer: [`${wildcardDomain}. IN A ${ipv4}`],
            });
        }
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


    return { server, rules };
}

/** 从单条规则中搜集 rule_set 引用（支持 route 的数组格式与 dns 的字符串格式） */
function collectRuleSetRefsFromRule(rule: any): string[] {
    const tags = rule?.rule_set;
    if (!tags) return [];
    if (Array.isArray(tags)) {
        return tags.filter((t: any) => typeof t === 'string' && (t as string).trim()).map((t: string) => (t as string).trim());
    }
    if (typeof tags === 'string' && tags.trim()) return [tags.trim()];
    return [];
}

/** 递归搜集规则中的 rule_set 引用（含嵌套 logical） */
function collectRuleSetRefsRecursive(rule: any, refs: Set<string>): void {
    if (!rule) return;
    for (const tag of collectRuleSetRefsFromRule(rule)) refs.add(tag);
    if (rule.type === 'logical' && Array.isArray(rule.rules)) {
        for (const sub of rule.rules) collectRuleSetRefsRecursive(sub, refs);
    }
}

/** 从 route.rules 和 dns.rules 中搜集所有引用的 rule_set tag */
function collectAllRuleSetRefs(config: any): Set<string> {
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

/** 根据引用的 rule_set 构建 rule_set 配置并写入 config.route.rule_set；有冒号用内置路径，无冒号用自定义规则集路径 */
function buildAndAssignRuleSets(config: any): void {
    const refs = collectAllRuleSetRefs(config);
    if (refs.size === 0) return;

    const ruleProviders = dbUtils.getRuleProviders();
    const providersForConfig = buildProvidersForConfig(ruleProviders);
    const providerMap = new Map(providersForConfig.map(p => [p.id, p]));

    const ruleSets: any[] = [];
    for (const tag of refs) {
        const hasColon = tag.includes(':');
        if (hasColon) {
            const [type, name] = tag.split(':');
            const nameLower = (type === 'geoip' || type === 'geosite') ? name.toLowerCase() : name;
            const relPath = `rulesets/${type}/${nameLower}.srs`;
            const fullPath = path.join(getBuiltinRulesetsPath(), relPath);
            ruleSets.push({ tag, type: 'local', format: 'binary', path: fullPath });
        } else {
            const provider = providerMap.get(tag);
            if (provider?.path) {
                const fullPath = resolveDataPath(provider.path);
                const format = fullPath.endsWith('.srs') ? 'binary' : 'source';
                ruleSets.push({ tag, type: 'local', format, path: fullPath });
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
export function mergeSettingsIntoConfig(config: any, profileId?: string): SingboxConfig {
    const settings = dbUtils.getAllSettings();

    const isAllowLan = settings['allow-lan'] === 'true';
    const mixedPort = parseInt(settings['mixed-port'], 10) || 7890;
    const logLevelSetting = settings['log-level'] || 'warn'
    const tunModeEnabled = settings['dashboard-tun-mode'] === 'true' && checkIsAdmin();

    if (settings['dashboard-tun-mode'] === 'true' && !checkIsAdmin()) {
        console.log('[Config] TUN mode disabled: no admin privilege');
    }

    let apiUrl = settings['api-url'] || '127.0.0.1:9090';
    apiUrl = apiUrl.replace(/^https?:\/\//, '');
    const apiSecret = settings['api-secret'] || '';

    config.log = { ...config.log, level: logLevelSetting, disabled: false };

    const inbounds: any[] = [{
        type: 'mixed',
        listen: isAllowLan ? '0.0.0.0' : '127.0.0.1',
        listen_port: mixedPort,
        sniff: true
    }];

    if (tunModeEnabled) {
        console.log('[Config] TUN mode enabled, adding TUN inbound');
        inbounds.push(tunDefaultConfig);
    }

    config.inbounds = inbounds;

    if (!config.experimental) config.experimental = {};
    if (config.experimental.rest_api) delete config.experimental.rest_api;

    const dashboardMode = settings['dashboard-mode'] || 'rule';
    const defaultMode = ['rule', 'global', 'direct'].includes(dashboardMode)
        ? dashboardMode.charAt(0).toUpperCase() + dashboardMode.slice(1)
        : 'Rule';
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
            const obj: any = { type: s.type, tag: s.id };
            if (s.server) obj.server = s.server;
            if (s.server_port != null) obj.server_port = s.server_port;
            if (s.path) obj.path = s.path;
            if (s.detour) obj.detour = s.detour;
            if (s.prefer_go != null) obj.prefer_go = s.prefer_go;
            if (s.inet4_range) obj.inet4_range = s.inet4_range;
            if (s.inet6_range) obj.inet6_range = s.inet6_range;
            if (s.predefined && Object.keys(s.predefined).length > 0) obj.predefined = s.predefined;
            return obj;
        });
        const defaultServer = enabledDnsServers.find(s => s.is_default);
        config.dns = { servers };
        if (defaultServer) config.dns.final = defaultServer.id;
        // 使用数据库 dnsPolicies 重新生成 dns.rules
        const dnsPolicies = dbUtils.getDnsPolicies();
        if (dnsPolicies.length > 0) {
            const { rules } = dnsPoliciesToSingboxConfig(dnsPolicies);
            config.dns.rules = rules;
        }
        console.log('[Config] Applied DNS config from dnsServers + dnsPolicies');
    }

    // IPv6 设置：如果禁用 IPv6，设置 dns.strategy = 'ipv4_only'
    const ipv6Enabled = settings['ipv6'] === 'true';
    if (!ipv6Enabled) {
        if (!config.dns) config.dns = {};
        config.dns.strategy = 'ipv4_only';
        console.log('[Config] IPv6 disabled, set dns.strategy = ipv4_only');
    }

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
            if (!config.dns) config.dns = { servers: [], rules: [] };
            if (!Array.isArray(config.dns.servers)) config.dns.servers = [];
            if (hostsServer) {
                config.dns.servers = config.dns.servers.filter((s: any) => s?.tag !== 'dns_hosts');
                config.dns.servers.unshift(hostsServer);
            }
            if (hostsRules.length > 0) {
                const existingRules = Array.isArray(config.dns.rules) ? config.dns.rules : [];
                config.dns.rules = [...hostsRules, ...existingRules];
            }
            console.log('[Config] Applied hosts-override to DNS (single domains -> hosts, wildcards -> predefined rules)');
        }
    }

    return config;
}

/** 附加 selector_out、direct_out、block_out 三个出站到 config */
export function appendExtraOutbounds(config: any): void {
    const outbounds = config.outbounds || [];
    const existingTags = new Set(outbounds.map((o: any) => o?.tag).filter(Boolean));

    const selectorUrltestTags = outbounds
        .filter(
            (o: any) =>
                o?.tag &&
                (String(o.type || '').toLowerCase() === 'selector' || String(o.type || '').toLowerCase() === 'urltest') &&
                Array.isArray(o.outbounds) &&
                o.outbounds.length > 0
        )
        .map((o: any) => o.tag);

    if (existingTags.has('selector_out') && existingTags.has('direct_out') && existingTags.has('block_out') && selectorUrltestTags.length > 0) {
        return;
    }

    const extra: any[] = [];

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

const REGENERATE_CONFIG_DEBOUNCE_MS = 400;
let regenerateConfigTimer: ReturnType<typeof setTimeout> | null = null;
let regenerateConfigPendingResolves: Array<(value: boolean) => void> = [];

/** 确保 config.dns.servers 中存在 dns_direct_out */
function ensureDnsDirectOutExists(config: any): void {
    if (!config.dns) config.dns = { servers: [] };
    if (!Array.isArray(config.dns.servers)) config.dns.servers = [];
    const hasDnsDirectOut = config.dns.servers.some((s: any) => s?.tag === 'dns_direct_out');
    if (!hasDnsDirectOut) {
        config.dns.servers.push({ tag: 'dns_direct_out', type: 'local' });
    }
}

/** 确保 route 默认值已设置（sing-box 要求及常用配置） */
function ensureRouteDefaults(config: any): void {
    if (!config.route) return;
    // 确保 dns.final 有值（与 route.default_domain_resolver.server 保持一致）
    if (!config.dns) config.dns = { servers: [] };
    if (!config.dns.final) {
        config.dns.final = 'dns_direct_out';
    }
    // 始终将 default_domain_resolver.server 与 dns.final 同步（默认 DNS 服务器）
    config.route.default_domain_resolver = { ...config.route.default_domain_resolver, server: config.dns.final };
    if (config.route.auto_detect_interface === undefined) {
        config.route.auto_detect_interface = true;
    }
}

/** 应用自定义分流模式：策略规则（不处理 rule_set，后续统一处理） */
function applyOverrideRulesRoute(config: any): any[] {
    const policies = dbUtils.getPolicies().filter((p: any) => p.enabled);
    const ruleProviders = dbUtils.getRuleProviders();
    const providersForConfig = buildProvidersForConfig(ruleProviders);
    providersForConfig.forEach(p => { p.path = resolveDataPath(p.path); });

    const { rules } = policiesToSingboxConfig(policies, providersForConfig);
    const finalOutbound = getPolicyFinalOutbound();
    if (!config.route) config.route = {};
    config.route.rules = rules;
    config.route.final = finalOutbound;
    return policies;
}

/** 应用默认路由模式（不处理 rule_set，后续统一处理） */
function applyDefaultRoute(_config: any): void {
    // rule_set 路径解析等由后续统一处理
}

/** 根据 dashboard-mode 覆盖 route（直连/全局/规则） */
function applyDashboardMode(config: any, settings: Record<string, string>): void {
    const dashboardMode = settings['dashboard-mode'] || 'rule';
    if (dashboardMode === 'direct') {
        if (!config.route) config.route = {};
        config.route.rules = [];
        config.route.final = 'direct_out';
        config.route.rule_set = [];
        console.log('[Config] Outbound mode: direct (all traffic direct)');
    } else if (dashboardMode === 'global') {
        if (!config.route) config.route = {};
        config.route.rules = [];
        config.route.final = 'selector_out';
        config.route.rule_set = [];
        console.log('[Config] Outbound mode: global (all traffic via proxy)');
    }
}

/** 生成 config.json 并写入磁盘 */
export async function generateConfigFile(
    profileId: string,
    sendToRenderer?: (channel: string, ...args: any[]) => void
): Promise<string> {
    if (sendToRenderer) sendToRenderer('config-generate-start');
    try {
        const settings = dbUtils.getAllSettings();
        const overrideRules = settings['override-rules'] === 'true';

        const { config } = await getProfileConfig(profileId, overrideRules);
        const mergedConfig = mergeSettingsIntoConfig(config, profileId);

        let policies: any[] = [];
        if (overrideRules) {
            policies = applyOverrideRulesRoute(mergedConfig);
        } else {
            applyDefaultRoute(mergedConfig);
        }

        buildAndAssignRuleSets(mergedConfig);
        ensureDnsDirectOutExists(mergedConfig);
        ensureRouteDefaults(mergedConfig);
        appendExtraOutbounds(mergedConfig);

        if (overrideRules) {
            const profile = dbUtils.getProfileById(profileId);
            const profilePolicies = (profile?.policies ?? []).map((pp) => ({
                profile_id: profileId,
                policy_id: pp.policy_id,
                preferred_outbounds: pp.preferred_outbounds,
            }));
            createCustomUrltestOutbounds(mergedConfig, policies, profilePolicies);
        }

        applyDashboardMode(mergedConfig, settings);

        await ensureLocalRuleSetFiles(mergedConfig);
        const configPath = getConfigPath();
        
        // 记录生成配置时的 TUN 模式状态到数据库（用于启动时判断是否需要重新生成）
        const tunModeEnabled = settings['dashboard-tun-mode'] === 'true' && checkIsAdmin();
        dbUtils.setSetting('last-config-tun-mode', tunModeEnabled ? 'true' : 'false');
        
        fs.writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2), 'utf8');
        console.log(`Generated config.json for profile ${profileId} (TUN: ${tunModeEnabled})`);
        await restartKernelIfRunning();
        return configPath;
    } finally {
        if (sendToRenderer) sendToRenderer('config-generate-end');
    }
}

async function runRegenerateConfigIfOverrideRulesEnabled(
    reason: string,
    sendToRenderer?: (channel: string, ...args: any[]) => void,
    log?: { info: (s: string) => void; error: (s: string) => void }
): Promise<boolean> {
    const settings = dbUtils.getAllSettings();
    if (settings['override-rules'] !== 'true') return false;
    const selectedProfile = dbUtils.getSelectedProfile();
    if (!selectedProfile) return false;
    await generateConfigFile(selectedProfile.id, sendToRenderer);
    log?.info(`[Config] override-rules enabled, regenerated config.json (${reason})`);
    return true;
}

/** 防抖式重新生成 config（当 override-rules 启用时） */
export function regenerateConfigIfOverrideRulesEnabled(
    reason: string,
    sendToRenderer?: (channel: string, ...args: any[]) => void,
    log?: { info: (s: string) => void; error: (s: string) => void }
): Promise<boolean> {
    return new Promise((resolve) => {
        regenerateConfigPendingResolves.push(resolve);
        if (regenerateConfigTimer) clearTimeout(regenerateConfigTimer);
        regenerateConfigTimer = setTimeout(async () => {
            regenerateConfigTimer = null;
            const resolvers = regenerateConfigPendingResolves;
            regenerateConfigPendingResolves = [];
            try {
                const ok = await runRegenerateConfigIfOverrideRulesEnabled(reason, sendToRenderer, log);
                resolvers.forEach((r) => r(ok));
            } catch (err: any) {
                log?.error(`[Config] regenerate failed: ${err?.message || err}`);
                resolvers.forEach((r) => r(false));
            }
        }, REGENERATE_CONFIG_DEBOUNCE_MS);
    });
}

/** 规则集更新后按需重新生成 config */
export async function regenerateConfigForRuleProviderIfNeeded(
    providerId: string,
    reason: string,
    sendToRenderer?: (channel: string, ...args: any[]) => void,
    log?: { info: (s: string) => void; error: (s: string) => void }
): Promise<boolean> {
    const provider = dbUtils.getRuleProviderById(providerId);
    if (!provider) return false;
    if (!isRuleProviderUsedByEnabledPolicies(provider)) return false;
    return regenerateConfigIfOverrideRulesEnabled(reason, sendToRenderer, log);
}

/** 获取当前 config 中的 route.rules */
export function getCurrentConfigRules(): any[] {
    const config = readConfig();
    return config?.route?.rules ?? [];
}

/** 获取可用出站列表 */
export function getAvailableOutbounds(): any[] {
    const config = readConfig();
    if (!config) return [];
    const outbounds = config.outbounds || [];
    return outbounds
        .filter((o: any) => o.tag && !['dns', 'block'].includes(o.type?.toLowerCase()))
        .map((o: any) => ({
            tag: o.tag,
            type: o.type,
            all: o.type === 'selector' ? o.outbounds || [] : undefined
        }));
}

/** 更新 config 文件（mode、tun 等） */
export async function updateConfigFile(updates: { mode?: string; tun?: boolean }): Promise<void> {
    const configPath = getConfigPath();
    if (!fs.existsSync(configPath)) throw new Error('config.json not found');

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    if (updates.mode !== undefined) {
        if (config.mode !== undefined) delete config.mode;
        if (!config.experimental) config.experimental = {};
        if (!config.experimental.clash_api) config.experimental.clash_api = {};
        config.experimental.clash_api.default_mode = updates.mode;
        console.log(`[Config File] Mode updated to: ${updates.mode}`);
    }

    if (updates.tun !== undefined) {
        if (!config.inbounds) config.inbounds = [];
        const tunIndex = config.inbounds.findIndex((inbound: any) => inbound.type === 'tun');

        if (updates.tun) {
            const tunConfig = {
                type: 'tun',
                tag: 'tun-in',
                mtu: 9000,
                auto_route: true,
                strict_route: true,
                stack: 'system',
                sniff: true,
                endpoint_independent_nat: false
            };
            if (tunIndex >= 0) {
                config.inbounds[tunIndex] = tunConfig;
            } else {
                config.inbounds.push(tunConfig);
            }
            console.log('[Config File] TUN enabled');
        } else {
            if (tunIndex >= 0) {
                config.inbounds.splice(tunIndex, 1);
                console.log('[Config File] TUN disabled');
            }
        }
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    await restartKernelIfRunning();
}

/**
 * 基于profilePolicies创建自定义urltest出站分组
 * 为每个策略生成一个名为"自定义+策略名"的urltest类型出站分组
 * 并更新routerule使用该分组
 */
function createCustomUrltestOutbounds(
    config: any, 
    policies: any[], 
    profilePolicies: any[]
): void {
    if (!config.outbounds) config.outbounds = [];
    
    // 获取profilePolicies映射：policy_id -> preferred_outbounds
    const policyOutboundsMap = new Map<string, string[]>();
    for (const pp of profilePolicies) {
        if (pp.policy_id && pp.preferred_outbounds && pp.preferred_outbounds.length > 0) {
            policyOutboundsMap.set(pp.policy_id, pp.preferred_outbounds);
        }
    }
    
    console.log(`[Config] 正在基于profilePolicies创建自定义urltest出站分组，找到 ${policyOutboundsMap.size} 个策略的优先级配置`);
    
    let customOutboundsCreated = 0;
    let rulesUpdated = 0;
    
    // 为每个有preferred_outbounds的策略创建自定义urltest分组
    for (const policy of policies) {
        const preferredOutbounds = policyOutboundsMap.get(policy.id);
        if (!preferredOutbounds || preferredOutbounds.length === 0) {
            continue;
        }
        
        // 生成自定义分组名称："自定义+策略名"
        const customGroupName = `自定义${policy.name}`;
        
        // 检查是否已存在同名分组
        const existingOutbound = config.outbounds.find((o: any) => o.tag === customGroupName);
        if (existingOutbound) {
            console.log(`[Config] 自定义urltest分组已存在: ${customGroupName}`);
        } else {
            // 检测节点有效性，过滤掉不存在的节点
            const existingOutboundTags = new Set(config.outbounds.map((o: any) => o.tag));
            const validOutbounds = preferredOutbounds.filter(outbound => {
                const exists = existingOutboundTags.has(outbound);
                if (!exists) {
                    console.log(`[Config] 节点 "${outbound}" 不存在，从自定义分组中排除`);
                }
                return exists;
            });
            
            // 如果没有有效节点，使用策略的默认出站
            if (validOutbounds.length === 0) {
                console.log(`[Config] 策略 "${policy.name}" 的所有preferred_outbounds节点都失效，使用默认出站: ${policy.outbound}`);
                continue; // 跳过创建分组，后面会使用原策略的outbound
            }
            
            // 创建urltest类型的出站分组
            const customOutbound = {
                type: 'urltest',
                tag: customGroupName,
                outbounds: validOutbounds,
                url: 'http://www.gstatic.com/generate_204',
                interval: '10m',
                tolerance: 150
            };
            
            config.outbounds.push(customOutbound);
            customOutboundsCreated++;
            console.log(`[Config] 创建自定义urltest分组: ${customGroupName} -> [${validOutbounds.join(', ')}]`);
        }
        
        // 更新策略的routerule，使其使用这个新创建的分组
        if (config.route && config.route.rules) {
            for (const rule of config.route.rules) {
                // 匹配当前策略的规则并更新其outbound
                if (isRuleFromPolicy(rule, policy)) {
                    const oldOutbound = rule.outbound;
                    rule.outbound = customGroupName;
                    rulesUpdated++;
                    console.log(`[Config] 更新策略规则出站: ${policy.name} (${oldOutbound} -> ${customGroupName})`);
                }
            }
        }
    }
    
    console.log(`[Config] 成功创建 ${customOutboundsCreated} 个自定义urltest出站分组，更新 ${rulesUpdated} 条规则`);
}

/** 检查规则是否属于指定策略 */
function isRuleFromPolicy(rule: any, policy: any): boolean {
    const fields = getPolicyMatchableFields(policy);
    if (rule.rule_set && Array.isArray(fields.rule_set) && fields.rule_set.length > 0) {
        const ruleRuleSets = new Set(rule.rule_set);
        const policyRuleSets = new Set(fields.rule_set);
        if (Array.from(ruleRuleSets).some((rs: string) => policyRuleSets.has(rs))) {
            return true;
        }
    }
    return (
        (rule.domain && fields.domain && arraysOverlap(rule.domain, fields.domain)) ||
        (rule.domain_keyword && fields.domain_keyword && arraysOverlap(rule.domain_keyword, fields.domain_keyword)) ||
        (rule.domain_suffix && fields.domain_suffix && arraysOverlap(rule.domain_suffix, fields.domain_suffix)) ||
        (rule.ip_cidr && fields.ip_cidr && arraysOverlap(rule.ip_cidr, fields.ip_cidr)) ||
        (rule.package_name && fields.package_name && arraysOverlap(rule.package_name, fields.package_name)) ||
        (rule.process_name && fields.process_name && arraysOverlap(rule.process_name, fields.process_name))
    );
}

/** 检查两个数组是否有重叠元素 */
function arraysOverlap(arr1: any[], arr2: any[]): boolean {
    if (!arr1 || !arr2 || arr1.length === 0 || arr2.length === 0) return false;
    const set1 = new Set(arr1);
    return arr2.some(item => set1.has(item));
}

export { POLICY_FINAL_OUTBOUND_VALUES };
