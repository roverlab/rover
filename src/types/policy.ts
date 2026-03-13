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
 */
export interface Policy {
    /** 策略 ID */
    id: string;
    /** 策略类型: default - 标准表单编辑, json - JSON 编辑 */
    type: PolicyType;
    /** 策略名称 */
    name: string;
    /** 出站代理/策略组 */
    outbound: string;
    /** 内置规则集列表 (rule_set_build_in) - geosite:, geoip:, acl: 内置规则集 */
    ruleSetBuildIn: string[];
    /** 自定义规则集列表 - 数据库中的规则集 ID */
    ruleSetAcl?: string[];
    /** 包名列表 (Android) */
    package?: string[];
    /** 进程名列表 */
    processName?: string[];
    /** 是否启用 */
    enabled: boolean;
    /** 排序顺序 */
    order: number;
    /** 创建时间 */
    createdAt: string;
    /** 更新时间 */
    updatedAt: string;
     /** 以下字段用于存储完整的 sing-box 路由规则信息，从 config.json 导入时保留 */
    /** 域名 */
    domain?: string[];
    /** 域名关键词 */
    domain_keyword?: string[];
    /** 域名后缀 */
    domain_suffix?: string[];
    /** IP CIDR */
    ip_cidr?: string[];
    /** 源 IP CIDR */
    source_ip_cidr?: string[];
    /** 端口 */
    port?: number[];
    /** 协议 */
    protocol?: string;
    /** 网络 */
    network?: 'tcp' | 'udp';
    /** clash 模式 */
    clash_mode?: string;
    /** 原始类型策略的原始规则内容 */
    raw_data?: any;
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
 * sing-box 路由规则格式（不包含出站字段，出站由策略单独管理）
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
    /** IP CIDR */
    ip_cidr?: string[];
    /** 源 IP CIDR */
    source_ip_cidr?: string[];
    /** 端口 */
    port?: number[];
    /** 进程名 */
    process_name?: string[];
    /** 包名 (Android) */
    package_name?: string[];
}

/**
 * 带 outbound 的完整 sing-box 路由规则（用于生成 config）
 */
export interface SingboxRouteRuleWithOutbound extends SingboxRouteRule {
    /** 出站 */
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

    const rule: SingboxRouteRuleWithOutbound = {
        outbound: policy.outbound
    };

    // 处理 rule_set：合并 ruleSetBuildIn 和 ruleSetAcl
    const ruleSets: string[] = [];
    
    // 处理 ruleSetBuildIn（内置规则集：geosite:xxx, geoip:xxx, acl:xxx）
    if (policy.ruleSetBuildIn && policy.ruleSetBuildIn.length > 0) {
        // 内置规则集直接使用原始值作为 tag
        ruleSets.push(...policy.ruleSetBuildIn);
    }
    
    // 处理 ruleSetAcl（自定义规则集，数据库规则集 ID）
    if (policy.ruleSetAcl && policy.ruleSetAcl.length > 0) {
        ruleSets.push(...policy.ruleSetAcl);
    }
    
    if (ruleSets.length > 0) {
        rule.rule_set = ruleSets;
    }

    // 处理 package (Android)
    if (policy.package && policy.package.length > 0) {
        rule.package_name = policy.package;
    }

    // 处理 processName
    if (policy.processName && policy.processName.length > 0) {
        rule.process_name = policy.processName;
    }

    // 处理从 config.json 导入时保留的完整字段
    if (policy.domain && policy.domain.length > 0) {
        rule.domain = policy.domain;
    }
    if (policy.domain_keyword && policy.domain_keyword.length > 0) {
        rule.domain_keyword = policy.domain_keyword;
    }
    if (policy.domain_suffix && policy.domain_suffix.length > 0) {
        rule.domain_suffix = policy.domain_suffix;
    }
    if (policy.ip_cidr && policy.ip_cidr.length > 0) {
        rule.ip_cidr = policy.ip_cidr;
    }
    if (policy.source_ip_cidr && policy.source_ip_cidr.length > 0) {
        rule.source_ip_cidr = policy.source_ip_cidr;
    }
    if (policy.port && policy.port.length > 0) {
        rule.port = policy.port;
    }

    return rule;
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
export function policiesToSingboxConfig(
    policies: Policy[],
    ruleProviders?: RuleProviderForConfig[]
): {
    rules: SingboxRouteRuleWithOutbound[];
    ruleSets: SingboxRuleSet[];
} {
    const rules: SingboxRouteRuleWithOutbound[] = [];
    const ruleSetMap = new Map<string, SingboxRuleSet>();
    const enabledProviders = (ruleProviders || []).filter(p => p.enabled !== false);

    // 按 order 排序
    const sortedPolicies = [...policies]
        .filter(p => p.enabled)
        .sort((a, b) => a.order - b.order);

    for (const policy of sortedPolicies) {
        const rule = policyToSingboxRule(policy);
        rules.push(rule);

        // 收集规则集定义：合并 ruleSetBuildIn 和 ruleSetAcl
        const itemsToCollect: string[] = [];
        
        // 从 ruleSetBuildIn 收集（内置规则集）
        if (policy.ruleSetBuildIn?.length) {
            itemsToCollect.push(...policy.ruleSetBuildIn);
        }
        
        // 从 ruleSetAcl 收集（自定义规则集，直接使用 ID，不加前缀）
        // parseRuleSetValue 会将无前缀的值默认解析为 acl 类型
        if (policy.ruleSetAcl?.length) {
            itemsToCollect.push(...policy.ruleSetAcl);
        }
        
        // 如果都没有，从 rule.rule_set 收集（raw 类型策略）
        if (itemsToCollect.length === 0 && rule.rule_set?.length) {
            itemsToCollect.push(...rule.rule_set);
        }
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
        // 检查是否为 action 类型的规则（如 sniff, hijack-dns, resolve）
        const isActionRule = 'action' in (rule.raw_data as Record<string, unknown>);
        
        // 只有非 action 类型规则才需要 outbound 字段
        if (isActionRule) {
            return {
                type: 'raw',
                name: rule.name,
                raw_data: rule.raw_data,
                enabled: true,
                order,
                outbound: '',
                ruleSetBuildIn: []
            };
        }
        
        // 对于需要 outbound 的规则，合并 outbound 到 raw_data
        const outbound = PRESET_OUTBOUND_MAP[rule.outbound ?? ''] ?? rule.outbound ?? 'selector_out';
        const rawData = { ...rule.raw_data, outbound: outbound };
        return {
            type: 'raw',
            name: rule.name,
            raw_data: rawData,
            enabled: true,
            order,
            outbound: '',
            ruleSetBuildIn: []
        };
    }
    
    const outbound = PRESET_OUTBOUND_MAP[rule.outbound ?? ''] ?? rule.outbound ?? 'selector_out';
    return {
        type: 'default',
        name: rule.name,
        outbound,
        ruleSetBuildIn: rule.rule_set_build_in || [],
        package: rule.package,
        processName: rule.processName,
        enabled: true,
        order
    };
}

/**
 * 从 sing-box route rule (config.json) 转换为策略
 * 保留所有规则字段，以便后续完整转换回 routeRules
 */
export function configRouteRuleToPolicy(
    rule: SingboxRouteRuleWithOutbound, 
    order: number,
    defaultName?: string
): Omit<Policy, 'id' | 'createdAt' | 'updatedAt'> {
    // 生成规则名称：优先使用传入的名称，否则根据规则内容生成（route.rules 不支持 tag）
    let name = defaultName || '';
    if (!name) {
        const parts: string[] = [];
        if (rule.rule_set && rule.rule_set.length > 0) {
            parts.push(rule.rule_set.slice(0, 2).join(', '));
        }
        if (rule.domain && rule.domain.length > 0) {
            parts.push(`域名: ${rule.domain.length}`);
        }
        if (rule.domain_keyword && rule.domain_keyword.length > 0) {
            parts.push(`关键词: ${rule.domain_keyword.length}`);
        }
        if (rule.ip_cidr && rule.ip_cidr.length > 0) {
            parts.push(`IP: ${rule.ip_cidr.length}`);
        }
        name = parts.length > 0 ? parts.slice(0, 2).join(' | ') : `规则 ${order + 1}`;
    }

    return {
        type: 'default',
        name,
        outbound: rule.outbound || 'direct_out',
        // rule_set 需要反向解析为 ruleSetBuildIn 格式
        ruleSetBuildIn: parseRuleSetToBuildIn(rule.rule_set || []),
        // 标准字段
        package: rule.package_name,
        processName: rule.process_name,
        enabled: true,
        order,
        // 保留完整的 sing-box 规则字段
        domain: rule.domain,
        domain_keyword: rule.domain_keyword,
        domain_suffix: rule.domain_suffix,
        ip_cidr: rule.ip_cidr,
        source_ip_cidr: rule.source_ip_cidr,
        port: rule.port,
    };
}

/**
 * 将 sing-box rule_set 数组直接使用（新格式不再需要转换）
 */
function parseRuleSetToBuildIn(ruleSets: string[]): string[] {
    return ruleSets;
}

/**
 * 默认出站选项
 */
export const OUTBOUND_OPTIONS = [
    { value: 'direct_out', label: '直连' as const },
    { value: 'block_out', label: '拦截' as const },
    { value: 'selector_out', label: '代理' as const },
];
