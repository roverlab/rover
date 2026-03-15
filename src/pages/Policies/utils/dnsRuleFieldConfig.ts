import type { RuleFieldConfig, RuleFieldKey, BoolFieldKey } from '../types/ruleFields';
import { FORM_KEY_TO_SINGBOX } from '../ruleFieldMapping';

function withSingboxKey(fields: RuleFieldConfig[]): RuleFieldConfig[] {
    return fields.map(f => ({
        ...f,
        singboxKey: FORM_KEY_TO_SINGBOX[f.formKey] ?? f.formKey,
    }));
}

/**
 * DNS 策略规则字段配置
 * DNS 规则只支持有限的字段（域名相关 + query_type）
 * 参考：https://sing-box.sagernet.org/configuration/dns/rule/
 */
const DNS_STRING_FIELDS: RuleFieldConfig[] = withSingboxKey([
    { key: 'domain', label: '域名', placeholder: 'google.com', formKey: 'domain', type: 'string' },
    { key: 'domainKeyword', label: '域名关键词', placeholder: 'keyword', formKey: 'domainKeyword', type: 'string' },
    { key: 'domainSuffix', label: '域名后缀', placeholder: '.google.com', formKey: 'domainSuffix', type: 'string' },
    { key: 'domainRegex', label: '域名正则', placeholder: '^stun\\..+', formKey: 'domainRegex', type: 'string' },
    { key: 'queryType', label: 'DNS 查询类型', placeholder: 'A, HTTPS, 32768', formKey: 'queryType', type: 'string' },
]);

/** DNS 规则没有布尔类型字段 */
const DNS_BOOL_FIELDS: RuleFieldConfig[] = [];

/** DNS 规则字段配置 */
export const DNS_RULE_FIELD_CONFIG: RuleFieldConfig[] = [...DNS_STRING_FIELDS, ...DNS_BOOL_FIELDS];

/** 根据 key 获取配置项 */
export function getDnsRuleFieldConfigByKey(key: RuleFieldKey | BoolFieldKey): RuleFieldConfig | undefined {
    return DNS_RULE_FIELD_CONFIG.find(c => c.key === key);
}

/** 根据 formKey 获取配置项 */
export function getDnsRuleFieldConfigByFormKey(formKey: string): RuleFieldConfig | undefined {
    return DNS_RULE_FIELD_CONFIG.find(c => c.formKey === formKey);
}
