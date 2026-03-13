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
import * as singbox from './singbox';
import { getDataDir, getRulesetsDir, resolveDataPath, getBuiltinResourcesPath, getPresetRulesetsPath, getPresetTemplatesPath } from './paths';
import { cnJsonRuleToPolicy } from '../src/types/policy';
import type { RuleProviderForConfig, CnJsonRule } from '../src/types/policy';
import { getRuleProviderFileBaseName, downloadAndConvertRuleSet } from './ruleset-utils';
import {
    regenerateConfigIfOverrideRulesEnabled,
    regenerateConfigForRuleProviderIfNeeded
} from './config-file';
import * as scheduler from './scheduler';
import { RuleProvider } from '../src/types/rule-providers';

/** 检测当前进程是否以管理员权限运行 */
function checkIsAdmin(): boolean {
    if (process.platform !== 'win32') return true;
    try {
        // 方法1: 使用 Windows API 检查当前进程令牌
        const script = `
            $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
            $principal = New-Object Security.Principal.WindowsPrincipal($identity)
            $isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
            if ($isAdmin) { exit 0 } else { exit 1 }
        `;
        execSync('powershell.exe -Command ' + script, {
            encoding: 'utf8',
            windowsHide: true,
            timeout: 5000
        });
        return true;
    } catch {
        // PowerShell 失败，尝试 net session 检测
        try {
            execSync('net session', { stdio: 'ignore', windowsHide: true });
            return true;
        } catch {
            return false;
        }
    }
}

export function getPolicyReferencedRuleProviderRefs(policy: any): string[] {
    const rawRuleSets = policy?.ruleSetBuildIn ?? policy?.rule_set_build_in ?? [];
    if (!Array.isArray(rawRuleSets)) return [];
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

/** 确保规则集本地文件存在（rulesets/geo 仅使用本地，不下载） */
export async function ensureLocalRuleSetFiles(config: any): Promise<void> {
    const ruleSets = config.route?.rule_set;
    if (!Array.isArray(ruleSets)) return;
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

            if (rules.length === 0) {
                return { success: false, message: '该模板没有可导入的策略', addedCount: 0 };
            }

            const policiesToImport: Array<Omit<any, 'id' | 'createdAt' | 'updatedAt'>> = [];

            rules.forEach((rule: Record<string, unknown>, order: number) => {
                const policy = cnJsonRuleToPolicy(rule as unknown as CnJsonRule, order);
                policiesToImport.push(policy);
            });

            if (policiesToImport.length === 0) {
                return { success: false, message: '未找到有效的策略配置', addedCount: 0 };
            }

            const addedCount = dbUtils.addPoliciesBatch(policiesToImport, true);

            let dnsSet = false;
            // 导入模板时，根据 dns 字段更新数据库
            // - dns 有内容：保存到数据库
            // - dns 为空/null/{}/不存在：清空数据库中的 dns 配置
            try {
                if (data.dns && typeof data.dns === 'object' && Object.keys(data.dns).length > 0) {
                    dbUtils.setSetting('dns-config', JSON.stringify(data.dns));
                } else {
                    dbUtils.setSetting('dns-config', '');
                }
                dnsSet = true;
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

            // 处理 tun 字段：如果没有 tun 字段，默认当作 false（关闭 TUN）
            let tunSet = false;
            let tunNeedsAdmin = false;
            const tunValue = typeof data.tun === 'boolean' ? data.tun : false;
            try {
                // 检查是否有管理员权限
                const hasAdmin = checkIsAdmin();

                if (hasAdmin) {
                    // 有管理员权限，直接修改数据库
                    dbUtils.setSetting('dashboard-tun-mode', tunValue ? 'true' : 'false');
                    tunSet = true;
                } else {
                    // 没有管理员权限，标记需要提示用户
                    tunNeedsAdmin = true;
                }
            } catch (e) {
                console.error('Failed to process tun setting from template:', e);
            }

            // 策略导入成功后，触发 config.json 写入
            if (addedCount > 0) {
                await regenerateConfigIfOverrideRulesEnabled('policies imported from template', sendToRenderer, log);
            }

            return {
                success: true,
                addedCount,
                dnsSet,
                finalOutboundSet,
                finalOutbound,
                tunSet,
                tunNeedsAdmin,
                tunValue,
                message: `成功导入 ${addedCount} 条策略${dnsSet ? '，已应用DNS配置' : ''}${finalOutboundSet ? '，已设置兜底出站' : ''}${tunSet ? '，已设置TUN模式' : ''}`
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

}
