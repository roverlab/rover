/**
 * 策略规则类型定义
 * 用于管理路由策略配置
 */

import type { HeadlessRule, HeadlessPlainRule, HeadlessLogicRule, RouteRule, RoutePlainRule, RouteLogicRule } from './singbox';

/** 重新导出 sing-box 规则类型，方便使用 */
export type { RoutePlainRule, RouteLogicRule, RouteRule, HeadlessRule, HeadlessPlainRule, HeadlessLogicRule };

/** 带 outbound 的路由规则（用于导入等场景） */
export type SingboxRouteRuleWithOutbound = RoutePlainRule;

/** sing-box 路由规则项（用于规则树转换） */
export type SingboxRouteRule = RoutePlainRule;

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
    logical_rule?: HeadlessRule;
    /** 原始类型策略的原始规则内容 */
    raw_data?: any;
}

/** 策略或待保存的策略（无 id/createdAt/updatedAt） */
export type PolicyInput = Policy | Omit<Policy, 'id' | 'createdAt' | 'updatedAt'>;

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
 * 默认出站选项
 */
export const OUTBOUND_OPTIONS = [
    { value: 'direct_out', label: '直连' as const },
    { value: 'block_out', label: '拦截' as const },
    { value: 'selector_out', label: '代理' as const },
];
