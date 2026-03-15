/**
 * 策略规则类型定义
 * 用于管理路由策略配置
 */

import { isBuiltinRuleSet } from "@/src/shared/ruleset";

/**
 * 单条规则集项
 * 支持 geosite:xxx, geoip:xxx, acl:xxx 三种格式
 */
export interface RuleSetItem {
    /** 原始值，如 geosite:youtube, geoip:netflix, acl:ChinaIp */
    value: string;
    /** 解析后的类型 */
    type: 'geosite' | 'geoip' | 'acl';
    /** 解析后的名称 */
    name: string;
}

/**
 * 策略规则
 */
export interface PolicyRule {
    /** 规则 ID */
    id: string;
    /** 规则类型 */
    type: 'rule_set' | 'domain' | 'domain_keyword' | 'domain_suffix' | 'ip_cidr' | 'src_ip_cidr' | 'port' | 'process_name' | 'package';
    /** 规则值数组 */
    values: string[];
    /** 逻辑操作符 */
    operator: 'AND' | 'OR';
}

/**
 * 策略类型
 */
export type PolicyType = 'default' | 'raw';

/**
 * 策略配置
 * ruleSet 与 logical_rule 分开存储，转 route 时合并
 */
export interface Policy {
    /** 策略 ID */
    id: string;
    /** 策略类型: default - 标准表单编辑, raw - JSON 编辑 */
    type: PolicyType;
    /** 策略名称 */
    name: string;
    /** 出站代理/策略组 */
    outbound: string;
    /** 是否启用 */
    enabled: boolean;
    /** 排序顺序 */
    order: number;
    /** 创建时间 */
    createdAt: string;
    /** 更新时间 */
    updatedAt: string;
    /** 规则集列表（单独存储，不与 logical_rule 重复） */
    ruleSet?: string[];
    /** 逻辑规则 (type: logical)，不含 rule_set，转 route 时与 ruleSet 合并 */
    logical_rule?: SingboxLogicalRule;
    /** 原始类型策略的原始规则内容 */
    raw_data?: any;
}

/** 从规则中提取 rule_set（含 logical 规则顶层的 rule_set） */
function extractRuleSetFromRule(r: SingboxRouteRule | SingboxLogicalRule): string[] {
    const fromSelf = (r as SingboxRouteRule).rule_set ?? [];
    if ('type' in r && r.type === 'logical') {
        const fromChildren = (r as SingboxLogicalRule).rules.flatMap(extractRuleSetFromRule);
        return [...fromSelf, ...fromChildren];
    }
    return fromSelf;
}

/** 判断规则是否仅含 rule_set（导出供迁移使用） */
export function isRuleSetOnlyRule(r: SingboxRouteRule | SingboxLogicalRule): boolean {
    if ('type' in r && r.type === 'logical') return false;
    const sr = r as SingboxRouteRule;
    const keys = Object.keys(sr).filter(k => k !== 'rule_set');
    return keys.length === 0 && (sr.rule_set?.length ?? 0) > 0;
}

/** 策略或待保存的策略（无 id/createdAt/updatedAt） */
export type PolicyInput = Policy | Omit<Policy, 'id' | 'createdAt' | 'updatedAt'>;

/** 获取策略的规则集列表（优先 ruleSet，兼容 logical_rule 内 rule_set 的旧数据） */
export function getPolicyRuleSet(policy: PolicyInput): string[] {
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

/** 从 logical_rule 提取可匹配字段（用于 isRuleFromPolicy） */
function extractMatchableFromRule(r: SingboxRouteRule | SingboxLogicalRule, out: Record<string, unknown[]>) {
    if ('type' in r && r.type === 'logical') {
        (r as SingboxLogicalRule).rules.forEach(sub => extractMatchableFromRule(sub, out));
        return;
    }
    const sr = r as SingboxRouteRule;
    const keys = ['rule_set', 'domain', 'domain_keyword', 'domain_suffix', 'ip_cidr', 'source_ip_cidr', 'port', 'package_name', 'process_name'] as const;
    for (const k of keys) {
        const v = sr[k];
        if (Array.isArray(v) && v.length) {
            if (!out[k]) out[k] = [];
            out[k].push(...v.map(String));
        }
    }
}

/** 获取策略的可匹配字段（从 logical_rule 提取） */
export function getPolicyMatchableFields(policy: PolicyInput): Record<string, unknown[]> {
    const out: Record<string, unknown[]> = {};
    const lr = policy.logical_rule;
    if (lr) extractMatchableFromRule(lr, out);
    if (!out.rule_set?.length) {
        const rs = getPolicyRuleSet(policy);
        if (rs.length) out.rule_set = rs;
    }
    return out;
}

/**
 * cn.json 中的规则格式
 */
export interface CnJsonRule {
    /** 规则集列表 */
    rule_set_build_in?: string[];
    /** 出站 */
    outbound?: string;
    /** 名称 */
    name: string;
    /** 包名 (可选) */
    package?: string[];
    /** 进程名 (可选) */
    processName?: string[];
    /** 原始类型策略的原始规则内容 (可选) */
    raw_data?: any;
}

/**
 * cn.json 文件格式
 */
export interface CnJson {
    rules: CnJsonRule[];
    /** DNS 配置（可选） */
    dns?: any;
    /** 未匹配规则的出站（可选） */
    rule_unmatched_outbound?: string;
}

/**
 * sing-box 路由规则格式（不包含 outbound，出站由策略单独管理）
 * 对应 Headless Rule 规范：https://sing-box.sagernet.org/configuration/rule-set/headless-rule/
 */
export interface SingboxRouteRule {
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
    /** IP CIDR */
    ip_cidr?: string[];
    /** 源 IP CIDR */
    source_ip_cidr?: string[];
    /** 端口 */
    port?: number[];
    /** 端口范围 */
    port_range?: string[];
    /** 源端口 */
    source_port?: number[];
    /** 源端口范围 */
    source_port_range?: string[];
    /** 进程名 */
    process_name?: string[];
    /** 进程路径 */
    process_path?: string[];
    /** 进程路径正则 */
    process_path_regex?: string[];
    /** 包名 (Android) */
    package_name?: string[];
    /** DNS 查询类型 */
    query_type?: (string | number)[];
    /** 网络协议 tcp/udp */
    network?: string[];
    /** 网络类型 wifi/cellular/ethernet/other */
    network_type?: string[];
    /** 默认接口地址 */
    default_interface_address?: string[];
    /** WiFi SSID */
    wifi_ssid?: string[];
    /** WiFi BSSID */
    wifi_bssid?: string[];
    /** 网络计费 */
    network_is_expensive?: boolean;
    /** 低数据模式 */
    network_is_constrained?: boolean;
    /** 取反匹配 */
    invert?: boolean;
    /** 网络接口地址 */
    network_interface_address?: Record<string, string[]>;
}

/** sing-box 逻辑规则 (type: logical) */
export interface SingboxLogicalRule {
    type: 'logical';
    mode: 'and' | 'or';
    invert?: boolean;
    rules: SingboxRouteRule[];
}

/**
 * 带 outbound 的完整 sing-box 路由规则（用于生成 config）
 */
export interface SingboxRouteRuleWithOutbound extends SingboxRouteRule {
    /** 出站 */
    outbound: string;
}

/** 带 outbound 的逻辑规则（用于 route.rules） */
export interface SingboxLogicalRuleWithOutbound extends SingboxLogicalRule {
    outbound: string;
}

/**
 * sing-box 规则集定义
 */
export interface SingboxRuleSet {
    /** 标签 */
    tag: string;
    /** 类型: remote 或 local */
    type: 'remote' | 'local';
    /** 格式: source 或 binary */
    format?: 'source' | 'binary';
    /** 远程 URL (type=remote 时) */
    url?: string;
    /** 本地路径 (type=local 时) */
    path?: string;
    /** 下载出站 */
    download_detour?: string;
    /** 更新间隔 */
    update_interval?: string;
}

/**
 * 解析规则集字符串
 * @param value 如 geosite:youtube, geoip:netflix, acl:ChinaIp
 */
export function parseRuleSetValue(value: string): RuleSetItem {
    if (value.startsWith('geosite:')) {
        return {
            value,
            type: 'geosite',
            name: value.substring(8)
        };
    } else if (value.startsWith('geoip:')) {
        return {
            value,
            type: 'geoip',
            name: value.substring(6)
        };
    } else if (value.startsWith('acl:')) {
        return {
            value,
            type: 'acl',
            name: value.substring(4)
        };
    }
    // 默认当作 acl 处理
    return {
        value,
        type: 'acl',
        name: value
    };
}

/**
 * 将策略转换为 sing-box 路由规则（带 outbound）
 * 直接使用 logical_rule，ruleSet 合并到 { type: "logical", mode: "and", rules: [] } 中
 * 对于 action 类型的规则（如 sniff, hijack-dns, resolve），不强制添加 outbound
 */
export function policyToSingboxRule(policy: Policy): SingboxRouteRuleWithOutbound {
    // 原始类型策略：直接使用存储的 raw_data
    if (policy.type === 'raw' && policy.raw_data) {
        const rd = policy.raw_data as { outbound?: string; action?: string };
        // action 类型的规则不需要 outbound 字段
        if (rd.action) {
            return {
                ...policy.raw_data,
            } as SingboxRouteRuleWithOutbound;
        }
        return {
            ...policy.raw_data,
            outbound: rd.outbound ?? 'selector_out'
        };
    }

    const ruleSets = getPolicyRuleSet(policy);
    const logicalRule = policy.logical_rule;
    const hasRuleSet = ruleSets.length > 0;
    const hasLogicalRules = logicalRule && logicalRule.rules?.length > 0;

    // 仅 ruleSet：扁平规则，不嵌套
    if (hasRuleSet && !hasLogicalRules) {
        return { rule_set: ruleSets, outbound: policy.outbound };
    }
    // 仅 logical_rule：若只有一条简单规则则扁平输出，否则保留 logical
    if (!hasRuleSet && hasLogicalRules) {
        const rules = logicalRule!.rules;
        if (rules.length === 1 && !('type' in rules[0] && (rules[0] as any).type === 'logical')) {
            return { ...(rules[0] as SingboxRouteRule), outbound: policy.outbound };
        }
        return {
            type: 'logical',
            mode: logicalRule!.mode ?? 'or',
            invert: logicalRule!.invert,
            rules,
            outbound: policy.outbound,
        } as SingboxRouteRuleWithOutbound & { type: 'logical'; mode: 'or'; rules: (SingboxRouteRule | SingboxLogicalRule)[] };
    }
    // 两者都有：rule_set 放外层，与 logical 同级（rule_set AND logical_rule）
    if (hasRuleSet && hasLogicalRules) {
        const rulesWithoutRuleSet = logicalRule!.rules.filter(r => !isRuleSetOnlyRule(r));
        if (rulesWithoutRuleSet.length === 0) {
            return { rule_set: ruleSets, outbound: policy.outbound };
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
            outbound: policy.outbound,
        } as SingboxRouteRuleWithOutbound & { rule_set: string[]; type: 'logical'; mode: 'and'; rules: (SingboxRouteRule | SingboxLogicalRule)[] };
    }

    // 两者都空：仅含 outbound
    return { outbound: policy.outbound };
}

/** 规则集提供者（用于解析 acl 类型） */
export interface RuleProviderForConfig {
    id: string;
    name: string;
    url: string;
    /** 本地缓存路径，存在时优先使用 path 而非 url */
    path?: string;
    /** 规则集类型：singbox 类型写入 config 时使用 local，不使用 url */
    type?: 'singbox' | 'clash';
    enabled?: boolean;
}


/**
 * 将策略列表转换为 sing-box 路由配置
 * sing-box 使用 route.rules 和 route.rule_set，规则中通过 rule_set 引用 tag
 * @param policies 策略列表
 * @param ruleProviders 规则集提供者（用于 acl:xxx 类型，需在 database 中配置）
 * @returns 规则数组和规则集定义（对应 route.rules 和 route.rule_set）
 */
export type SingboxRouteRuleItem = SingboxRouteRuleWithOutbound | SingboxLogicalRuleWithOutbound;

export function policiesToSingboxConfig(
    policies: Policy[],
    ruleProviders?: RuleProviderForConfig[]
): {
    rules: SingboxRouteRuleItem[];
    ruleSets: SingboxRuleSet[];
} {
    const rules: SingboxRouteRuleItem[] = [];
    const ruleSetMap = new Map<string, SingboxRuleSet>();
    const enabledProviders = (ruleProviders || []).filter(p => p.enabled !== false);

    // 按 order 排序
    const sortedPolicies = [...policies]
        .filter(p => p.enabled)
        .sort((a, b) => a.order - b.order);

    for (const policy of sortedPolicies) {
        const rule = policyToSingboxRule(policy);
        rules.push(rule);

        // 从 rule 中收集规则集定义（logical_rule 或扁平 rule 的 rule_set）
        const itemsToCollect = extractRuleSetFromRule(rule as SingboxRouteRule | SingboxLogicalRuleWithOutbound);
        for (const item of itemsToCollect) {
                // 有 : 分隔符的是内置规则集（geosite:xxx, geoip:xxx, acl:xxx）
                // 没有 : 分隔符的是自定义规则集（纯 ID）
                if (isBuiltinRuleSet(item)) {
                    const [type,name] = item.split(':');
                    if (!ruleSetMap.has(item)) {
                        ruleSetMap.set(item, {
                            tag: item,
                            type: 'local',
                            format: 'binary',
                            path: `rulesets/${type}/${name}.srs`
                        });
                    }
                } else {
                    // 自定义规则集：从 ruleProviders 获取路径
                    if (!ruleSetMap.has(item)) {
                        const provider = enabledProviders.find(p => p.id === item);
                        if (provider) {
                            // 本地路径一律为 .srs 文件，使用 binary 格式
                            const providerPath = provider.path;
                            const format = providerPath.endsWith('.srs') ? 'binary' : 'source';
                            ruleSetMap.set(item, {
                                tag: item,
                                type: 'local',
                                format,
                                path: providerPath
                            });
                        }
                    }
                }
            }
        }

    return {
        rules,
        ruleSets: Array.from(ruleSetMap.values())
    };
}

const PRESET_OUTBOUND_MAP: Record<string, string> = {
    direct: 'direct_out',
    block: 'block_out',
    currentSelected: 'selector_out',
};

/**
 * 从 cn.json 规则转换为策略
 * 预设中的出站值映射为 direct_out / block_out / selector_out
 * 如果存在 raw_data 字段，则策略类型为 raw，raw_data 写入策略的 raw_data 字段
 * 对于 action 类型的规则（如 sniff, hijack-dns, resolve），不添加 outbound 字段
 */
export function cnJsonRuleToPolicy(rule: CnJsonRule, order: number): Omit<Policy, 'id' | 'createdAt' | 'updatedAt'> {
    // 如果存在 raw_data，则使用 raw 类型策略
    if (rule.raw_data) {
        const isActionRule = 'action' in (rule.raw_data as Record<string, unknown>);
        if (isActionRule) {
            return {
                type: 'raw',
                name: rule.name,
                raw_data: rule.raw_data,
                enabled: true,
                order,
                outbound: ''
            };
        }
        const outbound = PRESET_OUTBOUND_MAP[rule.outbound ?? ''] ?? rule.outbound ?? 'selector_out';
        const rawData = { ...rule.raw_data, outbound };
        return {
            type: 'raw',
            name: rule.name,
            raw_data: rawData,
            enabled: true,
            order,
            outbound: ''
        };
    }

    const outbound = PRESET_OUTBOUND_MAP[rule.outbound ?? ''] ?? rule.outbound ?? 'selector_out';
    const subRules: SingboxRouteRule[] = [];
    const hasPackage = rule.package?.length;
    const hasProcess = rule.processName?.length;
    if (hasPackage || hasProcess) {
        const r: SingboxRouteRule = {};
        if (hasPackage) r.package_name = rule.package;
        if (hasProcess) r.process_name = rule.processName;
        subRules.push(r);
    }
    return {
        type: 'default',
        name: rule.name,
        outbound,
        enabled: true,
        order,
        ruleSet: rule.rule_set_build_in?.length ? rule.rule_set_build_in : undefined,
        logical_rule: subRules.length > 0
            ? { type: 'logical', mode: 'and', rules: subRules }
            : undefined
    };
}

/**
 * 从 sing-box route rule (config.json) 转换为策略
 * ruleSet 单独存，logical_rule 不含 rule_set
 */
export function configRouteRuleToPolicy(
    rule: SingboxRouteRuleItem, 
    order: number,
    defaultName?: string
): Omit<Policy, 'id' | 'createdAt' | 'updatedAt'> {
    const outbound = (rule as SingboxRouteRuleWithOutbound).outbound || 'direct_out';

    // 逻辑规则：提取 rule_set 到 ruleSet，logical_rule 不含 rule_set
    if ((rule as any).type === 'logical') {
        const lr = rule as SingboxLogicalRuleWithOutbound;
        const ruleSets = extractRuleSetFromRule(lr);
        const rulesWithoutRuleSet = lr.rules.filter(r => !isRuleSetOnlyRule(r));
        return {
            type: 'default',
            name: defaultName || `逻辑规则 ${order + 1}`,
            outbound,
            enabled: true,
            order,
            ruleSet: ruleSets.length > 0 ? ruleSets : undefined,
            logical_rule: rulesWithoutRuleSet.length > 0
                ? { type: 'logical', mode: lr.mode, invert: lr.invert, rules: rulesWithoutRuleSet }
                : undefined,
        };
    }

    // 扁平规则：ruleSet 单独存，logical_rule 不含 rule_set
    const fr = rule as SingboxRouteRuleWithOutbound;
    const ruleSets = fr.rule_set ?? [];
    const cleanRule: SingboxRouteRule = { ...fr };
    delete (cleanRule as any).outbound;
    delete (cleanRule as any).rule_set;
    if ((cleanRule as any).package_name) delete (cleanRule as any).package_name;
    if ((cleanRule as any).process_name) delete (cleanRule as any).process_name;
    const hasOtherFields = Object.keys(cleanRule).some(k => {
        const v = (cleanRule as any)[k];
        return v !== undefined && v !== null && (Array.isArray(v) ? v.length > 0 : true);
    });

    let name = defaultName || '';
    if (!name) {
        const parts: string[] = [];
        if (ruleSets.length > 0) parts.push(ruleSets.slice(0, 2).join(', '));
        if (cleanRule.domain?.length) parts.push(`域名: ${cleanRule.domain.length}`);
        if (cleanRule.domain_keyword?.length) parts.push(`关键词: ${cleanRule.domain_keyword.length}`);
        if (cleanRule.ip_cidr?.length) parts.push(`IP: ${cleanRule.ip_cidr.length}`);
        name = parts.length > 0 ? parts.slice(0, 2).join(' | ') : `规则 ${order + 1}`;
    }

    return {
        type: 'default',
        name,
        outbound,
        enabled: true,
        order,
        ruleSet: ruleSets.length > 0 ? ruleSets : undefined,
        logical_rule: hasOtherFields ? { type: 'logical', mode: 'or' as const, rules: [cleanRule] } : undefined,
    };
}

/**
 * 默认出站选项
 */
export const OUTBOUND_OPTIONS = [
    { value: 'direct_out', label: '直连' as const },
    { value: 'block_out', label: '拦截' as const },
    { value: 'selector_out', label: '代理' as const },
];
