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
    rules: LocalRule[];
}

/**
 * 本地规则集中的单条规则
 * 参考 sing-box headless rule 格式
 */
export interface LocalRule {
    domain?: string[];
    domain_suffix?: string[];
    domain_keyword?: string[];
    domain_regex?: string[];
    ip_cidr?: string[];
    ip_cidr_is_private?: boolean;
    source_ip_cidr?: string[];
    source_ip_cidr_is_private?: boolean;
    source_port?: number[];
    source_port_range?: string[];
    port?: number[];
    port_range?: string[];
    process_name?: string[];
    process_path?: string[];
    package_name?: string[];
    user_id?: number[];
    user?: string[];
    network?: 'tcp' | 'udp';
    protocol?: string[];
    invert?: boolean;
    type?: 'logical';
    mode?: 'and' | 'or';
    rules?: LocalRule[];
}
