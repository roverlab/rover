/**
 * DNS策略类型定义
 * 用于管理DNS路由策略配置
 */

import type { DnsRule, DnsPlainRule, DnsLogicRule, HeadlessPlainRule, HeadlessLogicRule } from './singbox';

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
    logical_rule?: DnsRule;
    /** 原始类型策略的原始规则内容 */
    raw_data?: any;
    /** 内置规则集列表（兼容旧模板格式） */
    rule_set_build_in?: string[];
    /** ACL 规则集列表（兼容旧模板格式） */
    ruleSetAcl?: string[];
}

/**
 * 单条规则集项
 */
export interface RuleSetItem {
    /** 原始值 */
    value: string;
    /** 解析后的类型 */
    type: 'geosite' | 'geoip' | 'acl' | 'clash';
    /** 解析后的名称 */
    name: string;
}

/** 策略或待保存的策略（无 id/createdAt/updatedAt） */
export type DnsPolicyInput = DnsPolicy | Omit<DnsPolicy, 'id' | 'createdAt' | 'updatedAt'>;

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
