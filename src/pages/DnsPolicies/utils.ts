/**
 * DNS策略页面工具函数
 */
import type { DnsPolicy } from '../../types/dns-policy';
import { getDnsPolicyRuleSet } from '../../types/dns-policy';
import type { RuleProvider } from '../../types/rule-providers';

import { DNS_SERVER_LABELS } from '../../types/dns-policy';

export const DNS_SERVER_OPTIONS = [
    { value: 'local', label: DNS_SERVER_LABELS.local },
    { value: 'remote', label: DNS_SERVER_LABELS.remote },
    { value: 'block', label: DNS_SERVER_LABELS.block },
] as const;

export const DNS_SERVER_LABEL_MAP: Record<string, string> = DNS_SERVER_LABELS;

export function formatRuleSetDisplay(value: string, ruleProviders?: RuleProvider[]): string {
    const colonIdx = value.indexOf(':');
    const prefix = colonIdx >= 0 ? value.substring(0, colonIdx) : '';
    const rawName = colonIdx >= 0 ? value.substring(colonIdx + 1) : value;

    if (prefix === 'acl' && ruleProviders) {
        const provider = ruleProviders.find(p => p.id === rawName || p.name === rawName);
        return `规则:${provider?.name || rawName}`;
    }

    return `规则:${rawName}`;
}

export function getRuleSetBadgeClass(value: string): string {
    if (value.startsWith('geosite:')) return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    if (value.startsWith('geoip:')) return 'bg-blue-50 text-blue-600 border-blue-100';
    return 'bg-purple-50 text-purple-600 border-purple-100';
}

const DISPLAYABLE_SERVERS = new Set(['local', 'remote', 'block']);

/** 服务器为空或不能识别时返回 false */
export function isServerDisplayable(serverValue: string | undefined | null): boolean {
    if (serverValue == null || typeof serverValue !== 'string') return false;
    const trimmed = serverValue.trim();
    if (trimmed === '') return false;
    return DISPLAYABLE_SERVERS.has(trimmed) || DISPLAYABLE_SERVERS.has(trimmed.toLowerCase());
}

export function getServerLabel(serverValue: string | undefined | null): string {
    if (serverValue == null) return '未设置';
    const option = DNS_SERVER_OPTIONS.find(o => o.value === serverValue);
    if (option) return option.label;
    return DNS_SERVER_LABEL_MAP[serverValue] ?? DNS_SERVER_LABEL_MAP[serverValue.toLowerCase()] ?? serverValue;
}

export function getServerTone(serverValue: string): 'neutral' | 'accent' | 'success' | 'warning' | 'danger' {
    if (serverValue === 'local') return 'success';
    if (serverValue === 'block') return 'danger';
    return 'accent';
}

/** 判断 raw_data 是否包含 action 字段 */
function hasActionField(rawData: unknown): boolean {
    if (!rawData || typeof rawData !== 'object') return false;
    const data = rawData as Record<string, unknown>;
    return 'action' in data;
}

/**
 * 获取策略的DNS服务器值
 */
export function getPolicyServer(policy: DnsPolicy): string | undefined {
    if (policy.type === 'raw' && policy.raw_data) {
        if (hasActionField(policy.raw_data)) {
            return undefined;
        }
        return (policy.raw_data as { server?: string }).server;
    }
    return policy.server;
}

export function getPolicyRuleSets(policy: DnsPolicy): string[] {
    if (policy.type === 'raw') return [];
    return getDnsPolicyRuleSet(policy);
}

function countRulesInLogical(lr: { rules: unknown[] }): number {
    return lr.rules.reduce<number>((sum, r) => {
        if (r && typeof r === 'object' && 'type' in r && (r as { type: string }).type === 'logical' && 'rules' in r) {
            return sum + countRulesInLogical(r as { rules: unknown[] });
        }
        return sum + 1;
    }, 0);
}

export function getPolicyMatchCount(policy: DnsPolicy): number {
    const lr = (policy as any).logical_rule;
    if (lr && typeof lr === 'object' && 'rules' in lr && Array.isArray((lr as { rules: unknown[] }).rules)) {
        return countRulesInLogical(lr as { rules: unknown[] });
    }
    return getPolicyRuleSets(policy).length;
}

export function getPolicyPreviewBadges(
    policy: DnsPolicy,
    ruleProviders?: RuleProvider[]
): Array<{ label: string; className: string }> {
    const badges: Array<{ label: string; className: string }> = [];

    getPolicyRuleSets(policy).slice(0, 2).forEach((value) => {
        badges.push({
            label: formatRuleSetDisplay(value, ruleProviders),
            className: getRuleSetBadgeClass(value)
        });
    });

    const lr = (policy as any).logical_rule;
    if (lr && typeof lr === 'object' && 'rules' in lr && Array.isArray((lr as { rules: unknown[] }).rules)) {
        const n = countRulesInLogical(lr as { rules: unknown[] });
        if (n > 0) badges.push({ label: `规则 ×${n}`, className: 'bg-sky-50 text-sky-700 border-sky-100' });
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

        if (value.startsWith('geosite:') || value.startsWith('geoip:') || value.startsWith('acl:')) {
            normalized.push(value);
            continue;
        }

        if (presetTags?.has(value)) {
            normalized.push(`acl:${value}`);
        } else {
            const provider = providerById.get(value) ?? providerByName.get(value);
            if (provider) {
                normalized.push(`acl:${provider.id}`);
            } else {
                normalized.push(value);
            }
        }
    }

    return { normalized, droppedAclRefs };
}
