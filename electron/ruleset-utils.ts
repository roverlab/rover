/**
 * 规则集工具函数
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import axios from 'axios';
import * as singbox from './core-controller';
import {  clashRuleSetToSingbox } from './clash-rule-set';
import { getRulesetsDir } from './paths';
import type { RouteLogicRule } from '../src/types/singbox';
import { t } from './i18n-main';

/**
 * 本地规则集数据结构
 * 符合 sing-box rule-set 格式
 */
interface LocalRuleSetData {
    version: number;
    rules: any[];
}

// 从共享模块导入并重新导出（保持向后兼容）
import { isBuiltinRuleSet, getRuleProviderFileBaseName } from '../src/shared/ruleset';
export { isBuiltinRuleSet, getRuleProviderFileBaseName };


/**
 * singbox .srs 解压为 JSON 并保存到同目录 .json 文件
 * @returns JSON 内容，失败返回 null
 */
export function decompileSrsToJson(srsPath: string): string | null {
    const singboxPath = singbox.getSingboxBinaryPath();
    if (!fs.existsSync(singboxPath)) return null;

    const jsonPath = srsPath.replace(/\.srs$/i, '.json');

    try {
        const result = spawnSync(
            singboxPath,
            ['rule-set', 'decompile', srsPath, '-o', jsonPath],
            {
                encoding: 'utf8',
                timeout: 30000,
            }
        );

        if (result.status !== 0) return null;

        const data = fs.readFileSync(jsonPath, 'utf8');
        return data;
    } catch {
        return null;
    } finally {
        try {
            if (fs.existsSync(jsonPath)) {
                fs.unlinkSync(jsonPath);
            }
        } catch {
            // 忽略删除错误
        }
    }
}

/** 判断是否为 singbox 二进制规则集（.srs 需原样保存） */
export function isSingboxBinaryRuleSet(provider: { type?: string; url?: string }): boolean {
    const t = provider.type || 'clash';
    const url = (provider.url || '').toLowerCase();
    return t === 'singbox' && (url.endsWith('.srs') || url.includes('.srs?'));
}

/**
 * 从 URL 下载并转换规则集为 SRS 格式
 * @param providerId 规则集 ID
 * @param url 规则集下载 URL
 * @param providerType 规则集类型 ('clash' | 'singbox')
 * @returns { srsPath: string | null, error: string | null }
 */
export async function downloadAndConvertRuleSet(
    providerId: string,
    url: string,
    providerType: 'clash' | 'singbox' = 'clash'
): Promise<{ srsPath: string | null; error: string | null }> {
    const rulesetsDir = getRulesetsDir();
    const fileBase = getRuleProviderFileBaseName(providerId);
    const srsPath = path.join(rulesetsDir, `${fileBase}.srs`);
    const jsonPath = path.join(rulesetsDir, `${fileBase}.json`);

    console.log(`Downloading rule set from ${url}...`);

    try {
        const response = await axios.get(url, {
            timeout: 30000,
            responseType: 'arraybuffer',
        });

        const buffer = Buffer.from(response.data);

        // 判断是否为 singbox 二进制规则集
        const providerLike = { url, type: providerType };
        if (isSingboxBinaryRuleSet(providerLike)) {
            // 直接保存为 .srs
            fs.writeFileSync(srsPath, buffer);
            // 验证是否为有效的 .srs 格式
            const singboxPath = singbox.getSingboxBinaryPath();
            if (singboxPath && fs.existsSync(singboxPath)) {

                const result = spawnSync(singboxPath, ['rule-set', 'decompile', srsPath], {
                    encoding: 'utf8',
                    timeout: 30000,
                });
                if (result.status !== 0) {
                    try { fs.unlinkSync(srsPath);  } catch { }
                    return { srsPath: null, error: t('main.errors.ruleset.invalidSrs') };
                }

                try {fs.unlinkSync(jsonPath); } catch { }
            }
            return { srsPath, error: null };
        }

        // Clash 规则集处理 - 默认 UTF-8
        let content = buffer.toString('utf-8');
        // 移除 BOM
        if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);

        // 转换为 sing-box 规则集格式
        const singboxRuleSet = clashRuleSetToSingbox(content);
        const rules = singboxRuleSet.rules;
        if (!rules || rules.length === 0) {
            return { srsPath: null, error: t('main.errors.ruleset.invalidClashRuleset') };
        }

        // 保存 JSON 文件（用于编译）
        const jsonContent = JSON.stringify(singboxRuleSet, null, 2);
        fs.writeFileSync(jsonPath, jsonContent, 'utf8');

        try {
            // 使用 sing-box 编译为 .srs
            const singboxPath = singbox.getSingboxBinaryPath();
            if (!fs.existsSync(singboxPath)) {
                console.error('sing-box executable not found, cannot convert to SRS format');
                return { srsPath: null, error: 'sing-box executable not found, cannot convert' };
            }

            const result = spawnSync(singboxPath, ['rule-set', 'compile', '--output', srsPath, jsonPath], {
                encoding: 'utf8',
                timeout: 60000,
            });

            if (result.status !== 0) {
                const errMsg = (result.stderr || result.stdout || result.error?.message || `exit code ${result.status}`).trim();
                console.error(`SRS compilation failed: ${errMsg}`);
                return { srsPath: null, error: `SRS compilation failed: ${errMsg}` };
            }

            console.log(`Ruleset compiled to .srs: ${srsPath}`);
            return { srsPath, error: null };
        } finally {
            // 清理所有临时文件和 JSON 文件
            try {
                if (fs.existsSync(jsonPath)) {
                    fs.unlinkSync(jsonPath);
                }
            } catch (cleanupError: any) {
                console.error(`Failed to cleanup temp file: ${cleanupError.message}`);
            }
        }
    } catch (dlErr: any) {
        console.error('Failed to download rule set:', dlErr.message);
        return { srsPath: null, error: `Download failed: ${dlErr.message}` };
    }
}

/**
 * 编译本地规则集数据为 SRS 文件
 * @param providerId 规则集 ID
 * @param rawData 本地规则集数据
 * @returns { srsPath: string | null, error: string | null }
 */
export function compileLocalRuleSet(
    providerId: string,
    rawData: LocalRuleSetData
): { srsPath: string | null; error: string | null } {
    const rulesetsDir = getRulesetsDir();
    const fileBase = getRuleProviderFileBaseName(providerId);
    const srsPath = path.join(rulesetsDir, `${fileBase}.srs`);
    const jsonPath = path.join(rulesetsDir, `${fileBase}.json`);

    // 验证规则数据
    if (!rawData.rules || rawData.rules.length === 0) {
        return { srsPath: null, error: 'Rules data is empty' };
    }

    try {
        // 确保 rulesets 目录存在
        if (!fs.existsSync(rulesetsDir)) {
            fs.mkdirSync(rulesetsDir, { recursive: true });
        }

        // 保存 JSON 文件（用于编译）
        const jsonContent = JSON.stringify(rawData, null, 2);
        fs.writeFileSync(jsonPath, jsonContent, 'utf8');

        try {
            // 使用 sing-box 编译为 .srs
            const singboxPath = singbox.getSingboxBinaryPath();
            if (!singboxPath || !fs.existsSync(singboxPath)) {
                console.error('sing-box executable not found, cannot convert to SRS format');
                return { srsPath: null, error: 'sing-box executable not found, cannot convert' };
            }

            const result = spawnSync(singboxPath, ['rule-set', 'compile', '--output', srsPath, jsonPath], {
                encoding: 'utf8',
                timeout: 60000,
            });

            if (result.status !== 0) {
                const errMsg = (result.stderr || result.stdout || result.error?.message || `exit code ${result.status}`).trim();
                console.error(`SRS compilation failed: ${errMsg}`);
                return { srsPath: null, error: `SRS compilation failed: ${errMsg}` };
            }

            console.log(`Local ruleset compiled to .srs: ${srsPath}`);
            return { srsPath, error: null };
        } finally {
            // 清理临时 JSON 文件
            try {
                if (fs.existsSync(jsonPath)) {
                    fs.unlinkSync(jsonPath);
                }
            } catch (cleanupError: any) {
                console.error(`Failed to cleanup temp file: ${cleanupError.message}`);
            }
        }
    } catch (err: any) {
        console.error('Failed to compile local rule set:', err.message);
        return { srsPath: null, error: `编译失败: ${err.message}` };
    }
}

/**
 * 编译本地规则集 logical_rule 为 SRS 文件
 * @param providerId 规则集 ID
 * @param logicRule 逻辑规则
 * @returns { srsPath: string | null, error: string | null }
 */
export function compileLocalRuleSetFromLogicRule(
    providerId: string,
    logicRule: RouteLogicRule
): { srsPath: string | null; error: string | null } {
    // 直接使用 logical_rule 作为规则数据（符合 sing-box rule-set 格式）
    const ruleSetData = {
        version: 3,
        rules: [logicRule]
    };
    // 复用现有的编译逻辑
    return compileLocalRuleSet(providerId, ruleSetData);
}
