/**
 * 路由规则集与策略相关逻辑
 * 包含 rule provider、policy、rule_set 的构建与过滤
 */

import path from 'node:path';
import fs from 'node:fs';
import { spawnSync, execSync } from 'node:child_process';
import axios from 'axios';
import * as dbUtils from './db';
// import { formatDateFixed } from './db'; // 不再使用，改用标准ISO格式
import * as singbox from './core-controller';
import { getDataDir, getRulesetsDir, resolveDataPath, getBuiltinResourcesPath, getPresetRulesetsPath, getPresetTemplatesPath } from './paths';
import { cnJsonRuleToPolicy, getPolicyRuleSet } from '../src/services/policy';
import type { RuleProviderForConfig, CnJsonRule } from '../src/types/policy';
import { getRuleProviderFileBaseName, downloadAndConvertRuleSet, compileLocalRuleSet } from './ruleset-utils';
import {
    regenerateConfigIfOverrideRulesEnabled,
    regenerateConfigForRuleProviderIfNeeded
} from './config-file';
import * as scheduler from './scheduler';
import { RuleProvider } from '../src/types/rule-providers';
import { getCachedIsServiceInstalled } from './roverservice-cache';

/** 检测 RoverService 服务是否已安装（使用启动时缓存的值） */
export function checkIsServiceInstalled(): boolean {
    return getCachedIsServiceInstalled();
}

export function getPolicyReferencedRuleProviderRefs(policy: any): string[] {
    const rawRuleSets = getPolicyRuleSet(policy as import('../src/types/policy').Policy);
    const refs: string[] = [];
    for (const item of rawRuleSets) {
        if (typeof item !== 'string') continue;
        if (item.startsWith('acl:')) {
            refs.push(item.slice(4));
        } else if (!item.startsWith('geosite:') && !item.startsWith('geoip:')) {
            refs.push(item);
        }
    }
    return refs;
}

export function isRuleProviderUsedByEnabledPolicies(provider: { id: string; name: string }): boolean {
    if (!provider.id && !provider.name) return false;
    const enabledPolicies = dbUtils.getPolicies().filter((p: any) => p.enabled);
    return enabledPolicies.some((policy: any) => {
        const refs = getPolicyReferencedRuleProviderRefs(policy);
        return refs.includes(provider.id) || refs.includes(provider.name);
    });
}

export const POLICY_FINAL_OUTBOUND_VALUES = new Set(['direct_out', 'block_out', 'selector_out']);

export function getPolicyFinalOutbound(): string {
    const saved = dbUtils.getSetting('policy-final-outbound', 'selector_out');
    return saved && POLICY_FINAL_OUTBOUND_VALUES.has(saved) ? saved : 'selector_out';
}


/** 判断是否为 singbox 二进制规则集（.srs 需原样保存） */
export function isSingboxBinaryRuleSet(provider: { type?: string; url?: string }): boolean {
    const t = provider.type || 'clash';
    const url = (provider.url || '').toLowerCase();
    return t === 'singbox' && (url.endsWith('.srs') || url.includes('.srs?'));
}

/** 构建策略用的规则集提供者列表，直接使用SRS格式路径 */
export function buildProvidersForConfig(ruleProviders: RuleProvider[]): RuleProviderForConfig[] {
    return ruleProviders.map(v=> ({...v} )as RuleProviderForConfig);
}

/** 获取预设规则集列表（从 resources/presets/rulesets/ 目录加载） */
export function loadPresetRulesets(): import('../src/types/rule-providers').RuleProvider[] {
    const rulesetsDir = getPresetRulesetsPath();
    if (!fs.existsSync(rulesetsDir)) {
        return [];
    }

    const allRulesets: import('../src/types/rule-providers').RuleProvider[] = [];
    const seenIds = new Set<string>();

    try {
        const files = fs.readdirSync(rulesetsDir);
        for (const file of files) {
            if (!file.endsWith('.json')) continue;

            const filePath = path.join(rulesetsDir, file);
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const data = JSON.parse(content);
                const list = Array.isArray(data) ? data : [];
                for (const item of list) {
                    if (item?.id && item?.name && !seenIds.has(item.id)) {
                        seenIds.add(item.id);
                        allRulesets.push({
                            id: item.id,
                            name: item.name,
                            url: item.url || '',
                            type: item.type || 'clash',
                            enabled: item.enabled !== false,
                            path: item.path,
                            last_update: item.last_update,
                        });
                    }
                }
            } catch (e) {
                console.error(`Failed to load preset ruleset file ${file}:`, e);
            }
        }
    } catch (e) {
        console.error('Failed to read preset rulesets directory:', e);
    }

    return allRulesets;
}

/** 从 resources/presets/rulesets/ 目录加载所有 JSON 文件并合并成内置规则集列表 */
export function loadBuiltinRulesets(): import('../src/types/rule-providers').RuleProvider[] {
    const rulesetsDir = getPresetRulesetsPath();
    if (!fs.existsSync(rulesetsDir)) {
        return [];
    }

    const allRulesets: import('../src/types/rule-providers').RuleProvider[] = [];
    const seenIds = new Set<string>();

    try {
        const files = fs.readdirSync(rulesetsDir);
        for (const file of files) {
            if (!file.endsWith('.json')) continue;

            const filePath = path.join(rulesetsDir, file);
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const data = JSON.parse(content);
                if (Array.isArray(data)) {
                    for (const item of data) {
                        if (item?.id && item?.name && !seenIds.has(item.id)) {
                            seenIds.add(item.id);
                            allRulesets.push({
                                id: item.id,
                                name: item.name,
                                url: item.url || '',
                                type: item.type || 'singbox',
                                enabled: item.enabled !== false,
                                path: item.path,
                                last_update: item.last_update,
                            });
                        }
                    }
                }
            } catch (e) {
                console.error(`Failed to load ruleset file ${file}:`, e);
            }
        }
    } catch (e) {
        console.error('Failed to read rulesets directory:', e);
    }

    return allRulesets;
}

/** 分组键显示名称映射 */
const RULE_SET_GROUP_DISPLAY_NAMES: Record<string, string> = {
    custom: '自定义规则集',
    acl: 'ACL 规则',
    geoip: 'GeoIP 规则',
    geosite: 'GeoSite 规则',
    clash: 'Clash 规则',
    singbox: 'SingBox 规则',
};

/** 从规则集 ID 提取分组键，如 "acl:360" -> "acl" */
function getRuleSetGroupKey(id: string, isFromDb: boolean): string {
    if (isFromDb) return 'custom';
    const colonIndex = id.indexOf(':');
    if (colonIndex > 0) {
        return id.substring(0, colonIndex).toLowerCase();
    }
    return '其他';
}

/** 内置规则集分组顺序 */
const BUILTIN_GROUP_ORDER = ['acl', 'geosite', 'geoip', 'clash', 'singbox', '其他'];

export interface RuleSetGroupItem {
    groupKey: string;
    displayName: string;
    items: RuleProvider[];
}

/**
 * 获取全部规则集（内置 + 自定义），已按分组整理，供策略编辑使用
 */
export function getAllRuleSetsGrouped(): RuleSetGroupItem[] {
    const customProviders = dbUtils.getRuleProviders();
    const builtinRulesets = loadBuiltinRulesets();

    const groups = new Map<string, RuleProvider[]>();

    // 自定义规则集
    if (customProviders.length > 0) {
        groups.set('custom', [...customProviders]);
    }

    // 内置规则集按前缀分组
    for (const item of builtinRulesets) {
        const key = getRuleSetGroupKey(item.id, false);
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key)!.push(item);
    }

    const result: RuleSetGroupItem[] = [];
    const seenKeys = new Set<string>();

    // 先添加自定义
    if (groups.has('custom')) {
        result.push({
            groupKey: 'custom',
            displayName: RULE_SET_GROUP_DISPLAY_NAMES.custom,
            items: groups.get('custom')!,
        });
        seenKeys.add('custom');
    }

    // 按固定顺序添加内置分组
    for (const key of BUILTIN_GROUP_ORDER) {
        if (groups.has(key) && !seenKeys.has(key)) {
            result.push({
                groupKey: key,
                displayName: RULE_SET_GROUP_DISPLAY_NAMES[key] || key,
                items: groups.get(key)!,
            });
            seenKeys.add(key);
        }
    }

    // 其余未在顺序中的分组
    for (const [key, items] of groups) {
        if (!seenKeys.has(key)) {
            result.push({
                groupKey: key,
                displayName: RULE_SET_GROUP_DISPLAY_NAMES[key] || key,
                items,
            });
        }
    }

    return result;
}

/** 从预设添加或重写规则集到数据库 */
export async function addRuleProvidersFromPreset(
    aclIds: string[],
    onRegenerate: () => Promise<boolean>
): Promise<{ added: number; updated: number }> {
    const preset = loadPresetRulesets();
    const presetById = new Map(preset.map(p => [p.id, p]));
    let added = 0;
    let updated = 0;
    for (const id of aclIds) {
        const entry = presetById.get(id);
        if (!entry) continue;
        const provider = {
            id: entry.id,
            name: entry.name,
            url: entry.url || '',
            type: entry.type || 'clash',
            path: entry.path,
            enabled: entry.enabled !== false,
        };
        const result = dbUtils.upsertRuleProviderFromPreset(provider);
        if (result === 'added') added++;
        else if (result === 'updated') updated++;
    }
    if (added > 0 || updated > 0) {
        const scheduler = await import('./scheduler');
        scheduler.initSchedulers();
        await onRegenerate();
    }
    return { added, updated };
}

/** sing-box DNS 规则中 default 类型支持的字段（rule_set + server + name），其余字段需放入 raw_data */
const DNS_DEFAULT_ONLY_KEYS = new Set(['rule_set', 'server', 'name']);

/** 从规则中提取 name，用于 DnsPolicy 显示名称（写入数据库） */
function getRuleName(rule: Record<string, unknown>, fallback: string): string {
    const n = rule.name;
    return typeof n === 'string' && n.trim() ? n.trim() : fallback;
}

/** 判断规则是否为 default 类型：有 rule_set + server，且仅有 default 允许的字段 */
function isDefaultDnsRuleFormat(rule: Record<string, unknown>): boolean {
    const ruleSet = rule.rule_set;
    const hasRuleSet = ruleSet !== undefined && ruleSet !== null &&
        (Array.isArray(ruleSet) ? ruleSet.length > 0 : typeof ruleSet === 'string');
    const hasServer = rule.server !== undefined && rule.server !== null;
    if (!hasRuleSet || !hasServer) return false;
    const ruleKeys = Object.keys(rule).filter(k => rule[k] !== undefined && rule[k] !== null);
    return ruleKeys.every(k => DNS_DEFAULT_ONLY_KEYS.has(k));
}

/** 将模板 dns.rules 中的单条规则转换为 DnsPolicy 输入：仅支持 default 格式（rule_set+server）或显式 raw_data 格式，不自动识别/生成 raw */
function templateDnsRuleToDnsPolicy(rule: Record<string, unknown>, order: number): Omit<import('../src/types/dns-policy').DnsPolicy, 'id' | 'createdAt' | 'updatedAt'> | null {
    // 1. 显式 raw_data 格式：仅当模板包含 name + raw_data 时使用 raw 类型
    if (rule.raw_data && typeof rule.raw_data === 'object') {
        const rawData = rule.raw_data as Record<string, unknown>;
        const server = String(rawData.server ?? rule.server ?? 'local');
        return {
            type: 'raw',
            name: getRuleName(rule, `DNS 规则 ${order + 1}`),
            server,
            enabled: true,
            order,
            raw_data: rawData,
        };
    }
    // 2. default 格式：rule_set + server
    if (isDefaultDnsRuleFormat(rule)) {
        const server = String(rule.server ?? 'local');
        const ruleSet = rule.rule_set;
        const ruleSetArr = Array.isArray(ruleSet) ? ruleSet : typeof ruleSet === 'string' ? [ruleSet] : [];
        const builtIn = ruleSetArr.filter((v: unknown) => typeof v === 'string' && (v.startsWith('geosite:') || v.startsWith('geoip:')));
        const acl = ruleSetArr.filter((v: unknown) => typeof v === 'string' && v.startsWith('acl:'));
        const defaultName = ruleSetArr.length > 0 ? `规则集 ${ruleSetArr.join(', ')}` : `DNS 规则 ${order + 1}`;
        return {
            type: 'default',
            name: getRuleName(rule, defaultName),
            server,
            enabled: true,
            order,
            rule_set_build_in: builtIn.length > 0 ? builtIn : undefined,
            ruleSetAcl: acl.length > 0 ? acl : undefined,
        };
    }
    // 3. 其他格式：不导入，不自动生成 raw
    return null;
}

/** 注册规则集相关 IPC 处理器 */
export function registerRuleProviderIpcHandlers(
    ipcMain: import('electron').IpcMain,
    sendToRenderer: (channel: string, ...args: any[]) => void,
    log: { info: (msg: string) => void; error: (msg: string) => void }
): void {
    // 统一导入模板：一次性导入策略、DNS和兜底出站
    ipcMain.handle('core:importTemplateComplete', async (_, templatePath: string) => {
        try {
            const fullPath = path.join(getPresetTemplatesPath(), templatePath);

            console.log('fullPath', fullPath);
            if (!fs.existsSync(fullPath)) {
                throw new Error('模板文件不存在');
            }

            const content = fs.readFileSync(fullPath, 'utf8');
            const data = JSON.parse(content);
            const rules = data.rules || [];

            const policiesToImport: Array<Omit<any, 'id' | 'createdAt' | 'updatedAt'>> = [];
            rules.forEach((rule: Record<string, unknown>, order: number) => {
                const policy = cnJsonRuleToPolicy(rule as unknown as CnJsonRule, order);
                policiesToImport.push(policy);
            });

            const hasDns = data.dns && typeof data.dns === 'object' && (
                (Array.isArray(data.dns.servers) && data.dns.servers.length > 0) ||
                (Array.isArray(data.dns.rules) && data.dns.rules.length > 0)
            );
            if (policiesToImport.length === 0 && !hasDns) {
                return { success: false, message: '该模板没有可导入的策略或 DNS 配置', addedCount: 0 };
            }

            const addedCount = policiesToImport.length > 0 ? dbUtils.addPoliciesBatch(policiesToImport, true) : 0;

            let dnsSet = false;
            // 导入模板时：dns.servers -> dnsServers 表（tag 作为 id，重复覆盖）；dns.rules -> dnsPolicies 表（先清空再写入）
            try {
                const dns = data.dns;
                if (dns && typeof dns === 'object') {
                    const servers = Array.isArray(dns.servers) ? dns.servers : [];
                    for (let i = 0; i < servers.length; i++) {
                        const s = servers[i];
                        if (s && typeof s === 'object' && s.tag) {
                            dbUtils.upsertDnsServerByTag(s as Record<string, unknown>, i);
                        }
                    }
                    const rules = Array.isArray(dns.rules) ? dns.rules : [];
                    dbUtils.clearDnsPolicies();
                    for (let i = 0; i < rules.length; i++) {
                        const r = rules[i];
                        if (r && typeof r === 'object' && (r.server || r.raw_data)) {
                            const policy = templateDnsRuleToDnsPolicy(r as Record<string, unknown>, i);
                            if (policy) dbUtils.addDnsPolicy(policy);
                        }
                    }
                    dbUtils.cleanupProfileDnsPolicies();
                    dnsSet = servers.length > 0 || rules.length > 0;
                } else {
                    // 模板没有 DNS 配置时，清空 DNS 策略数据
                    dbUtils.clearDnsPolicies();
                    dbUtils.cleanupProfileDnsPolicies();
                }
            } catch (e) {
                console.error('Failed to save DNS config from template:', e);
            }

            let finalOutboundSet = false;
            let finalOutbound: string | undefined;
            if (data.rule_unmatched_outbound) {
                try {
                    // 转换 outbound 值：direct -> direct_out, block -> block_out, currentSelected -> selector_out
                    const PRESET_OUTBOUND_MAP: Record<string, string> = {
                        direct: 'direct_out',
                        block: 'block_out',
                        currentSelected: 'selector_out',
                    };
                    const normalizedOutbound = PRESET_OUTBOUND_MAP[data.rule_unmatched_outbound] ?? data.rule_unmatched_outbound;
                    dbUtils.setSetting('policy-final-outbound', normalizedOutbound);
                    finalOutbound = normalizedOutbound;
                    finalOutboundSet = true;
                } catch (e) {
                    console.error('Failed to save policy final outbound from template:', e);
                }
            }

            // 处理 tun 字段：只有当模板中明确有 tun 字段时才修改数据库设置
            // 如果模板没有 tun 字段，保持用户当前设置不变
            let tunSet = false;
            let tunNeedsAdmin = false;
            let tunValue: boolean | undefined;
            
            // 只有当模板中明确有 tun 字段且为 true 时才处理
            if (data.tun === true) {
                tunValue = true;
                try {
                    // 写入数据库不需要管理员权限，直接设置
                    // TUN 模式生效时才需要管理员权限（在 Dashboard 中处理）
                    dbUtils.setSetting('dashboard-tun-mode', 'true');
                    // 重置控制器，下次启动时将使用 ServiceSingboxController
                    await require('./core-controller').resetController();
                    tunSet = true;
// 检查 RoverService 服务是否已安装，用于前端提示
tunNeedsAdmin = !checkIsServiceInstalled();
                } catch (e) {
                    console.error('Failed to process tun setting from template:', e);
                }
            }
            // 如果模板中 tun 为 false，也更新数据库关闭 TUN 模式
            else if (data.tun === false) {
                tunValue = false;
                try {
                    dbUtils.setSetting('dashboard-tun-mode', 'false');
                    // 重置控制器，下次启动时将使用 LocalSingboxController
                    await require('./core-controller').resetController();
                    tunSet = true;
                } catch (e) {
                    console.error('Failed to process tun setting from template:', e);
                }
            }
            // 如果模板中没有 tun 字段，不做任何处理，保持用户当前设置

            // 处理 default_dns_server 字段：如果有，将对应的 DNS 服务器设为默认
            let defaultDnsServerSet = false;
            if (typeof data.default_dns_server === 'string' && data.default_dns_server.trim()) {
                try {
                    const serverId = data.default_dns_server.trim();
                    const success = dbUtils.setDefaultDnsServer(serverId);
                    if (success) {
                        defaultDnsServerSet = true;
                    } else {
                        // 找不到对应的服务器，清除现有的默认值
                        console.warn(`Default DNS server "${serverId}" not found, clearing default`);
                        dbUtils.clearDefaultDnsServer();
                    }
                } catch (e) {
                    console.error('Failed to set default DNS server from template:', e);
                }
            }

            // 配置生成由前端在导入成功后触发

            return {
                success: true,
                addedCount,
                dnsSet,
                finalOutboundSet,
                finalOutbound,
                tunSet,
                tunNeedsAdmin,
                tunValue,
                defaultDnsServerSet,
                message: `成功导入 ${addedCount} 条策略${dnsSet ? '，已应用DNS配置' : ''}${finalOutboundSet ? '，已设置兜底出站' : ''}${tunSet ? '，已设置TUN模式' : ''}${defaultDnsServerSet ? '，已设置默认DNS服务器' : ''}`
            };
        } catch (e) {
            console.error('Failed to import template completely:', templatePath, e);
            return { success: false, message: `导入失败: ${(e as Error).message}`, addedCount: 0 };
        }
    });

    // Download a single rule provider
    ipcMain.handle('core:downloadRuleProvider', async (_, providerId: string) => {
        const provider = dbUtils.getRuleProviderById(providerId);
        if (!provider) throw new Error('Rule provider not found');
        if (!provider.url) throw new Error('Rule provider has no URL');

        const providerType = (provider.type || 'clash') as 'clash' | 'singbox';
        
        try {
            const result = await downloadAndConvertRuleSet(providerId, provider.url, providerType);
            
            if (result.error) {
                throw new Error(result.error);
            }
            
            if (result.srsPath) {
                dbUtils.updateRuleProviderContent(providerId, result.srsPath, new Date().toISOString());
            }
            
            await regenerateConfigForRuleProviderIfNeeded(providerId, 'rule provider downloaded', sendToRenderer, log);
            return { success: true, path: result.srsPath };
        } catch (dlErr: any) {
            console.error('Failed to download rule provider:', dlErr.message);
            throw new Error(`Download failed: ${dlErr.message}`);
        }
    });

    // 新增规则集：先下载，成功后再写入数据库
    ipcMain.handle('core:addRuleProviderWithDownload', async (_, provider: { name: string; url: string; type?: 'clash' | 'singbox'; enabled?: boolean }) => {
        const { name, url, type: providerType = 'clash', enabled = true } = provider;
        if (!name?.trim() || !url?.trim()) throw new Error('规则集名称和 URL 不能为空');

        const providerId = dbUtils.allocateId();
        
        const result = await downloadAndConvertRuleSet(providerId, url.trim(), providerType);
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        if (result.srsPath) {
            console.log(`规则集 ${name} 已转换为SRS: ${result.srsPath}`);
        }
        
        dbUtils.addRuleProvider({
            name: name.trim(),
            url: url.trim(),
            type: providerType,
            enabled,
            path: result.srsPath,
                last_update: new Date().toISOString(),
        }, providerId);

        scheduler.initSchedulers();
        await regenerateConfigForRuleProviderIfNeeded(providerId, 'rule provider added', sendToRenderer, log);
        return providerId;
    });

    // Download all enabled rule providers
    ipcMain.handle('core:downloadAllRuleProviders', async () => {
        const providers = dbUtils.getRuleProviders().filter(p => p.enabled);
        const results: { id: string; name: string; success: boolean; error?: string }[] = [];
        let shouldRegenerateConfig = false;

        for (const provider of providers) {
            try {
                if (!provider.url) {
                    results.push({ id: provider.id, name: provider.name, success: false, error: 'No URL' });
                    continue;
                }

                console.log(`Downloading rule provider: ${provider.name}`);
                const providerType = (provider.type || 'clash') as 'clash' | 'singbox';
                const result = await downloadAndConvertRuleSet(provider.id, provider.url, providerType);
                
                if (result.error) {
                    throw new Error(result.error);
                }
                
                if (result.srsPath) {
                    dbUtils.updateRuleProviderContent(provider.id, result.srsPath, new Date().toISOString());
                }
                
                if (isRuleProviderUsedByEnabledPolicies(provider)) {
                    shouldRegenerateConfig = true;
                }
                results.push({ id: provider.id, name: provider.name, success: true });
            } catch (err: any) {
                console.error(`Failed to download ${provider.name}:`, err.message);
                results.push({ id: provider.id, name: provider.name, success: false, error: err.message });
            }
        }

        if (shouldRegenerateConfig) {
            await regenerateConfigIfOverrideRulesEnabled('rule providers batch updated', sendToRenderer, log);
        }

        return results;
    });

    // 添加本地类型规则集
    ipcMain.handle('core:addLocalRuleProvider', async (_, provider: { name: string; enabled?: boolean }) => {
        const { name, enabled = true } = provider;
        if (!name?.trim()) throw new Error('规则集名称不能为空');

        const providerId = dbUtils.allocateId();
        
        // 创建空的规则集数据
        const emptyRawData: import('../src/types/rule-providers').LocalRuleSetData = {
            version: 1,
            rules: []
        };
        
        dbUtils.addRuleProvider({
            name: name.trim(),
            url: '', // 本地规则集没有 URL
            type: 'local',
            enabled,
            raw_data: emptyRawData,
            last_update: new Date().toISOString(),
        }, providerId);

        return providerId;
    });

    // 保存本地规则集数据并编译为 srs
    ipcMain.handle('core:saveLocalRuleProvider', async (_, providerId: string, rawData: import('../src/types/rule-providers').LocalRuleSetData) => {
        const provider = dbUtils.getRuleProviderById(providerId);
        if (!provider) throw new Error('规则集不存在');
        if (provider.type !== 'local') throw new Error('只能编辑本地类型的规则集');

        // 编译为 srs 文件
        const result = compileLocalRuleSet(providerId, rawData);
        
        if (result.error) {
            throw new Error(result.error);
        }

        // 更新数据库
        dbUtils.updateLocalRuleProviderData(providerId, rawData, result.srsPath || undefined);

        // 如果规则集被启用的策略引用，重新生成配置
        await regenerateConfigForRuleProviderIfNeeded(providerId, 'local rule provider saved', sendToRenderer, log);
        
        return { success: true, srsPath: result.srsPath };
    });

}
