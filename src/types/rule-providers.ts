import type { HeadlessRule } from './singbox';

export type RuleProviderType = 'clash' | 'singbox' | 'local';

export interface RuleProvider {
    id: string;
    name: string;
    url: string;
    /** 规则集类型：clash, singbox 或 local */
    type?: RuleProviderType;
    path?: string; // local cache path (srs file path for local type)
    last_update?: string;
    enabled: boolean;
    /** 来源订阅 ID（从订阅配置中解析时记录） */
    profile_id?: string;
    /** 本地类型规则集的原始规则数据 */
    raw_data?: LocalRuleSetData;
}

/**
 * 本地规则集数据结构
 * 符合 sing-box rule-set 格式
 */
export interface LocalRuleSetData {
    version: number;
    rules: HeadlessRule[];
}

/**
 * 本地规则集中的单条规则
 * 直接使用 HeadlessRule 类型
 * @deprecated 请直接使用 HeadlessRule 类型
 */
export type LocalRule = HeadlessRule;
