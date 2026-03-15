/**
 * DNS策略类型定义
 * 用于管理DNS路由策略配置
 */

/**
 * DNS策略类型
 */
export type DnsPolicyType = 'default' | 'raw';

/**
 * DNS策略配置
 * 与常规策略类似，但专门用于DNS路由规则
 */
export interface DnsPolicy {
    /** 策略 ID */
    id: string;
    /** 策略类型: default - 标准表单编辑, raw - JSON 编辑 */
    type: DnsPolicyType;
    /** 策略名称 */
    name: string;
    /** DNS服务器 id（与 DnsServer.id 一致） */
    server: string;
    /** 是否启用 */
    enabled: boolean;
    /** 排序顺序 */
    order: number;
    /** 创建时间 */
    createdAt: string;
    /** 更新时间 */
    updatedAt: string;
    /** 规则集列表 */
    ruleSet?: string[];
    /** 逻辑规则 */
    logical_rule?: SingboxLogicalRule;
    /** 原始类型策略的原始规则内容 */
    raw_data?: any;
}

/** sing-box DNS 逻辑规则 (type: logical) */
export interface SingboxLogicalRule {
    type: 'logical';
    mode: 'and' | 'or';
    invert?: boolean;
    rules: SingboxDnsRule[];
}

/**
 * sing-box DNS 规则格式
 * 对应 sing-box DNS Rule 规范
 */
export interface SingboxDnsRule {
    /** 规则集引用 */
    rule_set?: string[];
    /** 域名 */
    domain?: string[];
    /** 域名关键词 */
    domain_keyword?: string[];
    /** 域名后缀 */
    domain_suffix?: string[];
    /** 域名正则 */
    domain_regex?: string[];
    /** 取反匹配 */
    invert?: boolean;
}

/** 带 server 的完整 sing-box DNS 规则 */
export interface SingboxDnsRuleWithServer extends SingboxDnsRule {
    /** DNS服务器 */
    server: string;
}

/** 带 server 的逻辑规则 */
export interface SingboxLogicalRuleWithServer extends SingboxLogicalRule {
    server: string;
}

/**
 * 单条规则集项
 */
export interface RuleSetItem {
    /** 原始值 */
    value: string;
    /** 解析后的类型 */
    type: 'geosite' | 'geoip' | 'acl';
    /** 解析后的名称 */
    name: string;
}

/** 策略或待保存的策略（无 id/createdAt/updatedAt） */
export type DnsPolicyInput = DnsPolicy | Omit<DnsPolicy, 'id' | 'createdAt' | 'updatedAt'>;

/** 从 logical_rule 提取 rule_set */
function extractRuleSetFromRule(r: SingboxDnsRule | SingboxLogicalRule): string[] {
    const fromSelf = (r as SingboxDnsRule).rule_set ?? [];
    if ('type' in r && r.type === 'logical') {
        const fromChildren = (r as SingboxLogicalRule).rules.flatMap(extractRuleSetFromRule);
        return [...fromSelf, ...fromChildren];
    }
    return fromSelf;
}

/** 判断规则是否仅含 rule_set */
export function isRuleSetOnlyRule(r: SingboxDnsRule | SingboxLogicalRule): boolean {
    if ('type' in r && r.type === 'logical') return false;
    const sr = r as SingboxDnsRule;
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
function extractMatchableFromRule(r: SingboxDnsRule | SingboxLogicalRule, out: Record<string, unknown[]>) {
    if ('type' in r && r.type === 'logical') {
        (r as SingboxLogicalRule).rules.forEach(sub => extractMatchableFromRule(sub, out));
        return;
    }
    const sr = r as SingboxDnsRule;
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
export function dnsPolicyToSingboxRule(policy: DnsPolicy): SingboxDnsRuleWithServer {
    // 原始类型策略（name 仅用于展示，输出到 sing-box 时排除）
    if (policy.type === 'raw' && policy.raw_data) {
        const { name: _n, ...rest } = policy.raw_data as Record<string, unknown>;
        return {
            ...rest,
            server: policy.server || 'local',
        } as SingboxDnsRuleWithServer;
    }

    const ruleSets = getDnsPolicyRuleSet(policy);
    const logicalRule = policy.logical_rule;
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
            return { ...(rules[0] as SingboxDnsRule), server: policy.server };
        }
        return {
            type: 'logical',
            mode: logicalRule!.mode ?? 'or',
            invert: logicalRule!.invert,
            rules,
            server: policy.server,
        } as SingboxDnsRuleWithServer & { type: 'logical'; mode: 'or'; rules: (SingboxDnsRule | SingboxLogicalRule)[] };
    }
    // 两者都有
    if (hasRuleSet && hasLogicalRules) {
        const rulesWithoutRuleSet = logicalRule!.rules.filter(r => !isRuleSetOnlyRule(r));
        if (rulesWithoutRuleSet.length === 0) {
            return { rule_set: ruleSets, server: policy.server };
        }
        const logicalPart: SingboxLogicalRule = {
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
        } as SingboxDnsRuleWithServer & { rule_set: string[]; type: 'logical'; mode: 'and'; rules: (SingboxDnsRule | SingboxLogicalRule)[] };
    }

    // 两者都空
    return { server: policy.server };
}

export type SingboxDnsRuleItem = SingboxDnsRuleWithServer | SingboxLogicalRuleWithServer;

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

/**
 * 默认DNS服务器选项
 */
export const DNS_SERVER_OPTIONS = [
    { value: 'local', label: '本地DNS' as const },
    { value: 'remote', label: '远程DNS' as const },
    { value: 'block', label: '拦截' as const },
];

/**
 * DNS服务器标签映射
 */
export const DNS_SERVER_LABELS: Record<string, string> = {
    local: '本地DNS',
    remote: '远程DNS',
    block: '拦截',
};
