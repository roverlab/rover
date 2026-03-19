/**
 * DNS策略功能函数
 */

import type {
    DnsPolicy,
    DnsPolicyInput,
    RuleSetItem,
} from '../types/dns-policy';
import type { DnsPlainRule, DnsLogicRule } from '../types/singbox';

/** 从 logical_rule 提取 rule_set */
function extractRuleSetFromRule(r: DnsPlainRule | DnsLogicRule): string[] {
    const fromSelf = (r as DnsPlainRule).rule_set ?? [];
    if ('type' in r && r.type === 'logical') {
        const fromChildren = (r as DnsLogicRule).rules.flatMap(extractRuleSetFromRule);
        return [...fromSelf, ...fromChildren];
    }
    return fromSelf;
}

/** 判断规则是否仅含 rule_set */
export function isRuleSetOnlyRule(r: DnsPlainRule | DnsLogicRule): boolean {
    if ('type' in r && r.type === 'logical') return false;
    const sr = r as DnsPlainRule;
    const keys = Object.keys(sr).filter(k => k !== 'rule_set');
    return keys.length === 0 && (sr.rule_set?.length ?? 0) > 0;
}

/** 获取策略的规则集列表 */
export function getDnsPolicyRuleSet(policy: DnsPolicyInput): string[] {
    const p = policy as unknown as Record<string, unknown>;
    if (Array.isArray(p.ruleSet) && p.ruleSet.length > 0) return p.ruleSet as string[];
    const lr = policy.logical_rule;
    if (lr) {
        const fromLogical = extractRuleSetFromRule(lr).filter(Boolean);
        if (fromLogical.length > 0) return fromLogical;
    }
    const buildIn = (p.ruleSetBuildIn ?? p.rule_set_build_in ?? []) as string[];
    const acl = (p.ruleSetAcl ?? []) as string[];
    return [...(Array.isArray(buildIn) ? buildIn : []), ...(Array.isArray(acl) ? acl : [])];
}

/** 从 logical_rule 提取可匹配字段 */
function extractMatchableFromRule(r: DnsPlainRule | DnsLogicRule, out: Record<string, unknown[]>) {
    if ('type' in r && r.type === 'logical') {
        (r as DnsLogicRule).rules.forEach(sub => extractMatchableFromRule(sub, out));
        return;
    }
    const sr = r as DnsPlainRule;
    const keys = ['rule_set', 'domain', 'domain_keyword', 'domain_suffix'] as const;
    for (const k of keys) {
        const v = sr[k];
        if (Array.isArray(v) && v.length) {
            if (!out[k]) out[k] = [];
            out[k].push(...v.map(String));
        }
    }
}

/** 获取策略的可匹配字段 */
export function getDnsPolicyMatchableFields(policy: DnsPolicyInput): Record<string, unknown[]> {
    const out: Record<string, unknown[]> = {};
    const lr = policy.logical_rule;
    if (lr) extractMatchableFromRule(lr, out);
    if (!out.rule_set?.length) {
        const rs = getDnsPolicyRuleSet(policy);
        if (rs.length) out.rule_set = rs;
    }
    return out;
}

/**
 * 解析规则集字符串
 */
export function parseRuleSetValue(value: string): RuleSetItem {
    if (value.startsWith('geosite:')) {
        return { value, type: 'geosite', name: value.substring(8) };
    } else if (value.startsWith('geoip:')) {
        return { value, type: 'geoip', name: value.substring(6) };
    } else if (value.startsWith('acl:')) {
        return { value, type: 'acl', name: value.substring(4) };
    }
    return { value, type: 'acl', name: value };
}

/**
 * 将策略转换为 sing-box DNS 规则
 */
export function dnsPolicyToSingboxRule(policy: DnsPolicy): DnsPlainRule {
    // 原始类型策略（name 仅用于展示，输出到 sing-box 时排除）
    if (policy.type === 'raw' && policy.raw_data) {
        const { name: _n, ...rest } = policy.raw_data as Record<string, unknown>;
        return {
            ...rest,
            server: policy.server || 'local',
        } as DnsPlainRule;
    }

    const ruleSets = getDnsPolicyRuleSet(policy);
    const logicalRule = policy.logical_rule as DnsLogicRule | undefined;
    const hasRuleSet = ruleSets.length > 0;
    const hasLogicalRules = logicalRule && logicalRule.rules?.length > 0;

    // 仅 ruleSet
    if (hasRuleSet && !hasLogicalRules) {
        return { rule_set: ruleSets, server: policy.server };
    }
    // 仅 logical_rule
    if (!hasRuleSet && hasLogicalRules) {
        const rules = logicalRule!.rules;
        if (rules.length === 1 && !('type' in rules[0] && (rules[0] as any).type === 'logical')) {
            return { ...(rules[0] as DnsPlainRule), server: policy.server };
        }
        return {
            type: 'logical',
            mode: logicalRule!.mode ?? 'or',
            invert: logicalRule!.invert,
            rules,
            server: policy.server,
        } as DnsPlainRule & { type: 'logical'; mode: 'or'; rules: (DnsPlainRule | DnsLogicRule)[] };
    }
    // 两者都有
    if (hasRuleSet && hasLogicalRules) {
        const rulesWithoutRuleSet = logicalRule!.rules.filter(r => !isRuleSetOnlyRule(r));
        if (rulesWithoutRuleSet.length === 0) {
            return { rule_set: ruleSets, server: policy.server };
        }
        const logicalPart: DnsLogicRule = {
            type: 'logical',
            mode: logicalRule!.mode ?? 'and',
            ...(logicalRule!.invert && { invert: logicalRule!.invert }),
            rules: rulesWithoutRuleSet,
        };
        return {
            rule_set: ruleSets,
            type: 'logical',
            mode: 'and',
            rules: [logicalPart],
            server: policy.server,
        } as DnsPlainRule & { rule_set: string[]; type: 'logical'; mode: 'and'; rules: (DnsPlainRule | DnsLogicRule)[] };
    }

    // 两者都空
    return { server: policy.server };
}

export type SingboxDnsRuleItem = DnsPlainRule | DnsLogicRule;

/**
 * 将策略列表转换为 sing-box DNS 配置
 */
export function dnsPoliciesToSingboxConfig(policies: DnsPolicy[]): {
    rules: SingboxDnsRuleItem[];
} {
    const rules: SingboxDnsRuleItem[] = [];
    
    const sortedPolicies = [...policies]
        .filter(p => p.enabled)
        .sort((a, b) => a.order - b.order);

    for (const policy of sortedPolicies) {
        const rule = dnsPolicyToSingboxRule(policy);
        rules.push(rule);
    }

    return { rules };
}
