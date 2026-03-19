/**
 * 策略功能函数
 */

import { isBuiltinRuleSet } from '@/src/shared/ruleset';
import type {
    CnJsonRule,
    Policy,
    PolicyInput,
    PolicyRule,
    RuleSetItem,
    RuleProviderForConfig,
    SingboxRuleSet,
} from '../types/policy';
import type { HeadlessPlainRule, HeadlessLogicRule, RoutePlainRule, RouteLogicRule } from '../types/singbox';

/** 从规则中提取 rule_set（含 logical 规则顶层的 rule_set）
 *  注意：HeadlessPlainRule 本身不含 rule_set，这里兼容旧数据格式
 */
function extractRuleSetFromRule(r: HeadlessPlainRule | HeadlessLogicRule): string[] {
    // 兼容旧数据：rule_set 可能存在于旧格式的 logical_rule 中
    const fromSelf = ((r as Record<string, unknown>).rule_set as string[] | undefined) ?? [];
    if ('type' in r && r.type === 'logical') {
        const fromChildren = (r as HeadlessLogicRule).rules.flatMap(extractRuleSetFromRule);
        return [...fromSelf, ...fromChildren];
    }
    return fromSelf;
}

/** 判断规则是否仅含 rule_set（导出供迁移使用）
 *  注意：HeadlessPlainRule 本身不含 rule_set，这里兼容旧数据格式
 */
export function isRuleSetOnlyRule(r: HeadlessPlainRule | HeadlessLogicRule): boolean {
    if ('type' in r && r.type === 'logical') return false;
    const sr = r as Record<string, unknown>;
    const ruleSet = sr.rule_set as string[] | undefined;
    const keys = Object.keys(sr).filter(k => k !== 'rule_set');
    return keys.length === 0 && (ruleSet?.length ?? 0) > 0;
}

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
function extractMatchableFromRule(r: HeadlessPlainRule | HeadlessLogicRule, out: Record<string, unknown[]>) {
    if ('type' in r && r.type === 'logical') {
        (r as HeadlessLogicRule).rules.forEach(sub => extractMatchableFromRule(sub, out));
        return;
    }
    const sr = r as HeadlessPlainRule;
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
export function policyToSingboxRule(policy: Policy): RoutePlainRule {
    // 原始类型策略：直接使用存储的 raw_data
    if (policy.type === 'raw' && policy.raw_data) {
        const rd = policy.raw_data as { outbound?: string; action?: string };
        // action 类型的规则不需要 outbound 字段
        if (rd.action) {
            return {
                ...policy.raw_data,
            } as RoutePlainRule;
        }
        return {
            ...policy.raw_data,
            outbound: rd.outbound ?? 'selector_out'
        };
    }

    const ruleSets = getPolicyRuleSet(policy);
    const logicalRule = policy.logical_rule as HeadlessLogicRule | undefined;
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
            return { ...(rules[0] as HeadlessPlainRule), outbound: policy.outbound };
        }
        return {
            type: 'logical',
            mode: logicalRule!.mode ?? 'or',
            invert: logicalRule!.invert,
            rules,
            outbound: policy.outbound,
        } as RoutePlainRule & { type: 'logical'; mode: 'or'; rules: (HeadlessPlainRule | HeadlessLogicRule)[] };
    }
    // 两者都有：rule_set 放外层，与 logical 同级（rule_set AND logical_rule）
    if (hasRuleSet && hasLogicalRules) {
        const rulesWithoutRuleSet = logicalRule!.rules.filter(r => !isRuleSetOnlyRule(r));
        if (rulesWithoutRuleSet.length === 0) {
            return { rule_set: ruleSets, outbound: policy.outbound };
        }
        const logicalPart: HeadlessLogicRule = {
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
        } as RoutePlainRule & { rule_set: string[]; type: 'logical'; mode: 'and'; rules: (HeadlessPlainRule | HeadlessLogicRule)[] };
    }

    // 两者都空：仅含 outbound
    return { outbound: policy.outbound };
}

export type SingboxRouteRuleItem = RoutePlainRule | RouteLogicRule;

/**
 * 将策略列表转换为 sing-box 路由配置
 * sing-box 使用 route.rules 和 route.rule_set，规则中通过 rule_set 引用 tag
 * @param policies 策略列表
 * @param ruleProviders 规则集提供者（用于 acl:xxx 类型，需在 database 中配置）
 * @returns 规则数组和规则集定义（对应 route.rules 和 route.rule_set）
 */
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
        const itemsToCollect = extractRuleSetFromRule(rule as HeadlessPlainRule | RouteLogicRule);
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
    const subRules: HeadlessPlainRule[] = [];
    const hasPackage = rule.package?.length;
    const hasProcess = rule.processName?.length;
    if (hasPackage || hasProcess) {
        const r: HeadlessPlainRule = {};
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
            ? { type: 'logical', mode: 'and', rules: subRules } as HeadlessLogicRule
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
    const outbound = (rule as RoutePlainRule).outbound || 'direct_out';

    // 逻辑规则：提取 rule_set 到 ruleSet，logical_rule 不含 rule_set
    if ((rule as any).type === 'logical') {
        const lr = rule as RouteLogicRule;
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
                ? { type: 'logical', mode: lr.mode, invert: lr.invert, rules: rulesWithoutRuleSet } as HeadlessLogicRule
                : undefined,
        };
    }

    // 扁平规则：ruleSet 单独存，logical_rule 不含 rule_set
    const fr = rule as RoutePlainRule;
    const ruleSets = fr.rule_set ?? [];
    const cleanRule: HeadlessPlainRule = { ...fr };
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
        logical_rule: hasOtherFields ? { type: 'logical', mode: 'or' as const, rules: [cleanRule] } as HeadlessLogicRule : undefined,
    };
}

/**
 * 将 PolicyRule 数组转换为 sing-box 路由规则和规则集配置
 */
export function convertPolicyRules(policyRules: PolicyRule[]): { rules: RoutePlainRule[], ruleSets: SingboxRuleSet[] } {
    const rules: RoutePlainRule[] = [];
    const ruleSetsMap = new Map<string, SingboxRuleSet>();

    for (const policyRule of policyRules) {
        const { type, values, operator, outbound, rule_set_build_in } = policyRule as any;
        const convertedValues: string[] = [];

        // Handle rule_set_build_in map 
        if (rule_set_build_in && rule_set_build_in.length > 0) {
            for (const rs of rule_set_build_in) {
                // expecting format: "type:name", e.g., "geosite:apple", "geoip:cn", "acl:BanAD"
                const colonIdx = rs.indexOf(':');
                if (colonIdx > 0) {
                    const rsType = rs.substring(0, colonIdx).toLowerCase(); // geosite, geoip, acl
                    const rsName = rs.substring(colonIdx + 1);
                    // geoip 和 geosite 目录下文件名是小写，acl 目录保留原始大小写
                    const fileName = (rsType === 'geoip' || rsType === 'geosite') ? rsName.toLowerCase() : rsName;

                    // tag 直接使用原始值，如 geosite:apple, geoip:cn, acl:BanAD
                    const tag = rs;

                    convertedValues.push(tag);

                    if (!ruleSetsMap.has(tag)) {
                        ruleSetsMap.set(tag, {
                            tag: tag,
                            type: 'local',
                            format: 'binary',
                            path: `rulesets/${rsType}/${fileName}.srs`
                        });
                    }
                } else {
                    convertedValues.push(rs);
                }
            }
        }

        // Add standard values
        if (values && values.length > 0) {
            for (const val of values) {
                if (!val) continue;
                if (type === 'geoip') {
                    // tag 格式：geoip:xxx
                    const tag = `geoip:${val.toLowerCase()}`;
                    convertedValues.push(tag);
                    if (!ruleSetsMap.has(tag)) {
                        ruleSetsMap.set(tag, {
                            tag: tag,
                            type: 'local',
                            format: 'binary',
                            path: `geoip/${val.toLowerCase()}.srs`
                        });
                    }
                } else if (type === 'geosite') {
                    // tag 格式：geosite:xxx
                    const tag = `geosite:${val.toLowerCase()}`;
                    convertedValues.push(tag);
                    if (!ruleSetsMap.has(tag)) {
                        ruleSetsMap.set(tag, {
                            tag: tag,
                            type: 'local',
                            format: 'binary',
                            path: `geosite/${val.toLowerCase()}.srs`
                        });
                    }
                } else {
                    convertedValues.push(val);
                }
            }
        }

        if (convertedValues.length === 0) continue;

        const fieldMap: Record<string, string> = {
            'domain': 'domain',
            'domain_suffix': 'domain_suffix',
            'domain_keyword': 'domain_keyword',
            'ip_cidr': 'ip_cidr',
            'src_ip_cidr': 'source_ip_cidr',
            'geoip': 'rule_set',
            'geosite': 'rule_set',
            'rule_set': 'rule_set',
            'port': 'port',
            'protocol': 'protocol',
            'process_name': 'process_name',
            'package': 'package_name'
        };

        // Determine fieldName. If we have rule_set_build_in, we might have mixed fields.
        // But sing-box doesn't allow mixed keys in a simple OR without array of objects.
        // Let's split into respective RouteRules based on whether it is a rule_set or the base type.
        const baseField = fieldMap[type];
        const ruleSetValues = convertedValues.filter(v => v.includes(':'));
        const normalValues = convertedValues.filter(v => !v.includes(':'));

        // For rule sets
        if (ruleSetValues.length > 0) {
            rules.push({
                outbound,
                rule_set: ruleSetValues
            });
        }

        // For normal values
        if (normalValues.length > 0 && baseField && baseField !== 'rule_set') {
            rules.push({
                outbound,
                [baseField]: normalValues
            });
        }
    }

    return {
        rules,
        ruleSets: Array.from(ruleSetsMap.values())
    };
}
