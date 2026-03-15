/**
 * Profile 与 RuleProvider 内容校验
 */

import yaml from 'js-yaml';
import type { MihomoConfig } from '../src/types/clash';

/**
 * 校验 profile 内容是否为有效的配置文件（YAML/JSON，含 proxies 或 outbounds）
 * @returns 校验通过后的内容（用于保存）
 */
export function validateProfileContent(content: string): string {
    const toParse = content.trim();
    if (!toParse) throw new Error('配置文件内容为空');

    if (toParse.startsWith('<') || toParse.startsWith('<!') || toParse.toLowerCase().startsWith('<?xml')) {
        throw new Error('文件类型错误：疑似 HTML/XML，非配置文件');
    }

    let parsed: any;
    try {
        parsed = JSON.parse(toParse);
    } catch {
        try {
            parsed = yaml.load(toParse) as MihomoConfig;
        } catch (e: any) {
            throw new Error(`配置文件解析失败，非有效的 YAML/JSON 格式: ${(e as Error)?.message || '未知错误'}`);
        }
    }

    if (!parsed || typeof parsed !== 'object') {
        throw new Error('配置文件解析结果无效');
    }

    const hasProxies = parsed.proxies && Array.isArray(parsed.proxies) && parsed.proxies.length > 0;
    const hasOutbounds = parsed.outbounds && Array.isArray(parsed.outbounds) && parsed.outbounds.length > 0;
    if (!hasProxies && !hasOutbounds) {
        throw new Error('配置文件必须包含 proxies（Clash）或 outbounds（Sing-box）');
    }
    return toParse;
}

/** 校验 Clash 规则集文本非 HTML 等无效格式 */
export function validateClashRuleSetContent(content: string): void {
    const t = content.trim();
    if (t.startsWith('<') || t.toLowerCase().startsWith('<!')) {
        throw new Error('文件类型错误：疑似 HTML，非 Clash 规则集文本');
    }
}
