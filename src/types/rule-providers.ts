export type RuleProviderType = 'clash' | 'singbox';

export interface RuleProvider {
    id: string;
    name: string;
    url: string;
    /** 规则集类型：clash 或 singbox */
    type?: RuleProviderType;
    path?: string; // local cache path
    last_update?: string;
    enabled: boolean;
    /** 来源订阅 ID（从订阅配置中解析时记录） */
    profile_id?: string;
}
