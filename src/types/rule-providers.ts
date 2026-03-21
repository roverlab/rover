import type { RouteLogicRule } from './singbox';

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
    /** 本地类型规则集的逻辑规则 */
    logical_rule?: RouteLogicRule;
}
