/**
 * Profile 与 RuleProvider 内容校验
 */

import yaml from 'js-yaml';
import { t } from './i18n-main';
import type { MihomoConfig } from '../src/types/clash';

/**
 * 校验 profile 内容是否为有效的配置文件（YAML/JSON，含 proxies 或 outbounds）
 * @returns 校验通过后的内容（用于保存）
 */
export function validateProfileContent(content: string): string {
    const toParse = content.trim();
    if (!toParse) throw new Error(t('main.errors.validation.contentEmpty'));

    if (toParse.startsWith('<') || toParse.startsWith('<!') || toParse.toLowerCase().startsWith('<?xml')) {
        throw new Error(t('main.errors.validation.suspectedHtmlXml'));
    }

    let parsed: any;
    try {
        parsed = JSON.parse(toParse);
    } catch {
        try {
            parsed = yaml.load(toParse) as MihomoConfig;
        } catch (e: any) {
            throw new Error(
                t('main.errors.validation.parseFailed', {
                    reason: (e as Error)?.message || t('main.errors.validation.unknownError')
                })
            );
        }
    }

    if (!parsed || typeof parsed !== 'object') {
        throw new Error(t('main.errors.validation.parseResultInvalid'));
    }

    const hasProxies = parsed.proxies && Array.isArray(parsed.proxies) && parsed.proxies.length > 0;
    const hasOutbounds = parsed.outbounds && Array.isArray(parsed.outbounds) && parsed.outbounds.length > 0;
    if (!hasProxies && !hasOutbounds) {
        throw new Error(t('main.errors.validation.missingProxiesOrOutbounds'));
    }
    return toParse;
}

/** 校验 Clash 规则集文本非 HTML 等无效格式 */
export function validateClashRuleSetContent(content: string): void {
    const trimmed = content.trim();
    if (trimmed.startsWith('<') || trimmed.toLowerCase().startsWith('<!')) {
        throw new Error(t('main.errors.validation.suspectedHtmlRuleset'));
    }
}
