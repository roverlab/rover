/**
 * 策略页面工具函数
 */
import type { TFunction } from 'i18next';
import type { Policy } from '../../types/policy';
import { OUTBOUND_OPTION_DEFS } from '../../types/policy';
import { getPolicyRuleSet } from '../../services/policy';
import type { RuleProvider } from '../../types/rule-providers';

export function formatRuleSetDisplay(value: string, ruleProviders: RuleProvider[] | undefined, t: TFunction): string {
    const colonIdx = value.indexOf(':');
    const prefix = colonIdx >= 0 ? value.substring(0, colonIdx) : '';
    const rawName = colonIdx >= 0 ? value.substring(colonIdx + 1) : value;

    if (prefix === 'acl' && ruleProviders) {
        const provider = ruleProviders.find(p => p.id === rawName || p.name === rawName);
        return t('policies.rulePrefix') + (provider?.name || rawName);
    }

    return t('policies.rulePrefix') + rawName;
}

export function getRuleSetBadgeClass(value: string): string {
    if (value.startsWith('geosite:')) return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    if (value.startsWith('geoip:')) return 'bg-blue-50 text-blue-600 border-blue-100';
    return 'bg-purple-50 text-purple-600 border-purple-100';
}

const DISPLAYABLE_OUTBOUNDS = new Set(['direct_out', 'block_out', 'selector_out']);

/** 出站为空或不能识别时返回 false，用于策略列表不显示 */
export function isOutboundDisplayable(outboundValue: string | undefined | null): boolean {
    if (outboundValue == null || typeof outboundValue !== 'string') return false;
    const trimmed = outboundValue.trim();
    if (trimmed === '') return false;
    return DISPLAYABLE_OUTBOUNDS.has(trimmed) || DISPLAYABLE_OUTBOUNDS.has(trimmed.toLowerCase());
}

const OUTBOUND_KEY_BY_VALUE: Record<string, string> = {
    direct_out: 'outbound.directOut',
    block_out: 'outbound.blockOut',
    selector_out: 'outbound.proxy',
};

export function getOutboundLabel(outboundValue: string | undefined | null, t: TFunction): string {
    if (outboundValue == null || outboundValue === '') return t('outbound.notSet');
    const key = OUTBOUND_KEY_BY_VALUE[outboundValue] ?? OUTBOUND_KEY_BY_VALUE[outboundValue.toLowerCase()];
    if (key) return t(key);
    const known = OUTBOUND_OPTION_DEFS.find(o => o.value === outboundValue || o.value === outboundValue.toLowerCase());
    if (known) return t(known.labelKey);
    return outboundValue;
}

export function getOutboundTone(outboundValue: string): 'neutral' | 'accent' | 'success' | 'warning' | 'danger' {
    if (outboundValue === 'direct_out') return 'success';
    if (outboundValue === 'block_out') return 'danger';
    return 'accent';
}

/** 判断 raw_data 是否包含 action 字段（如 sniff, hijack-dns, resolve） */
function hasActionField(rawData: unknown): boolean {
    if (!rawData || typeof rawData !== 'object') return false;
    const data = rawData as Record<string, unknown>;
    return 'action' in data;
}

/**
 * 获取策略的出站值
 * 对于 raw 类型策略：
 * - 如果 raw_data 包含 action 字段（如 sniff, hijack-dns, resolve），则不返回 outbound
 * - 否则从 raw_data.outbound 获取
 * 对于 default 类型策略：直接返回 policy.outbound
 */
export function getPolicyOutbound(policy: Policy): string | undefined {
    if (policy.type === 'raw' && policy.raw_data) {
        // action 类型的规则不需要 outbound 字段
        if (hasActionField(policy.raw_data)) {
            return undefined;
        }
        return (policy.raw_data as { outbound?: string }).outbound;
    }
    return policy.outbound;
}

export function getPolicyRuleSets(policy: Policy): string[] {
    if (policy.type === 'raw') return [];
    return getPolicyRuleSet(policy);
}

function countRulesInLogical(lr: { rules: unknown[] }): number {
    return lr.rules.reduce<number>((sum, r) => {
        if (r && typeof r === 'object' && 'type' in r && (r as { type: string }).type === 'logical' && 'rules' in r) {
            return sum + countRulesInLogical(r as { rules: unknown[] });
        }
        return sum + 1;
    }, 0);
}

export function getPolicyMatchCount(policy: Policy): number {
    const lr = (policy as any).logical_rule;
    if (lr && typeof lr === 'object' && 'rules' in lr && Array.isArray((lr as { rules: unknown[] }).rules)) {
        return countRulesInLogical(lr as { rules: unknown[] });
    }
    return getPolicyRuleSets(policy).length;
}

export function getPolicyPreviewBadges(
    policy: Policy,
    ruleProviders: RuleProvider[] | undefined,
    t: TFunction
): Array<{ label: string; className: string }> {
    const badges: Array<{ label: string; className: string }> = [];

    getPolicyRuleSets(policy).slice(0, 2).forEach((value) => {
        badges.push({
            label: formatRuleSetDisplay(value, ruleProviders, t),
            className: getRuleSetBadgeClass(value)
        });
    });

    const lr = (policy as any).logical_rule;
    if (lr && typeof lr === 'object' && 'rules' in lr && Array.isArray((lr as { rules: unknown[] }).rules)) {
        const n = countRulesInLogical(lr as { rules: unknown[] });
        if (n > 0) badges.push({ label: t('policies.ruleLogicBadge', { count: n }), className: 'bg-sky-50 text-sky-700 border-sky-100' });
    }

    return badges.slice(0, 5);
}

export function normalizeRuleSetBuildInToAclIds(
    values: string[],
    providers: RuleProvider[],
    presetTags?: Set<string>
): { normalized: string[]; droppedAclRefs: number } {
    const normalized: string[] = [];
    let droppedAclRefs = 0;
    const providerById = new Map(providers.map(p => [p.id, p]));
    const providerByName = new Map(providers.map(p => [p.name, p]));

    for (const value of values) {
        if (typeof value !== 'string') continue;

        // 内置规则集格式（geosite:xxx, geoip:xxx, acl:xxx）直接保留
        if (value.startsWith('geosite:') || value.startsWith('geoip:') || value.startsWith('acl:')) {
            normalized.push(value);
            continue;
        }

        // 无前缀的值：检查是否在 presetTags 或 providers 中
        if (presetTags?.has(value)) {
            normalized.push(`acl:${value}`);
        } else {
            const provider = providerById.get(value) ?? providerByName.get(value);
            if (provider) {
                normalized.push(`acl:${provider.id}`);
            } else {
                // 找不到对应的 provider，直接保留原始值
                normalized.push(value);
            }
        }
    }

    return { normalized, droppedAclRefs };
}
