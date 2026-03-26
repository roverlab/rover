import type { RuleFieldConfig, RuleFieldKey, BoolFieldKey } from './types';
import { FORM_KEY_TO_SINGBOX } from './ruleFieldMapping';

function withSingboxKey(fields: RuleFieldConfig[]): RuleFieldConfig[] {
    return fields.map(f => ({
        ...f,
        singboxKey: FORM_KEY_TO_SINGBOX[f.formKey] ?? f.formKey,
    }));
}

/** 规则字段配置列表（字符串类型） */
const STRING_FIELDS: RuleFieldConfig[] = withSingboxKey([
    { key: 'processNames', label: 'ruleFields.processNames', placeholder: 'Telegram.exe', formKey: 'processNames', type: 'string' },
    { key: 'processPath', label: 'ruleFields.processPath', placeholder: '/usr/bin/curl', formKey: 'processPath', type: 'string' },
    { key: 'processPathRegex', label: 'ruleFields.processPathRegex', placeholder: '^/usr/bin/.+', formKey: 'processPathRegex', type: 'string' },
    { key: 'packageName', label: 'ruleFields.packageName', placeholder: 'com.termux', formKey: 'packageName', type: 'string' },
    { key: 'domain', label: 'ruleFields.domain', placeholder: 'google.com', formKey: 'domain', type: 'string' },
    { key: 'domainKeyword', label: 'ruleFields.domainKeyword', placeholder: 'keyword', formKey: 'domainKeyword', type: 'string' },
    { key: 'domainSuffix', label: 'ruleFields.domainSuffix', placeholder: '.google.com', formKey: 'domainSuffix', type: 'string' },
    { key: 'domainRegex', label: 'ruleFields.domainRegex', placeholder: '^stun\\..+', formKey: 'domainRegex', type: 'string' },
    { key: 'port', label: 'ruleFields.port', placeholder: '80, 443', formKey: 'port', type: 'string' },
    { key: 'portRange', label: 'ruleFields.portRange', placeholder: '1000:2000, :3000, 4000:', formKey: 'portRange', type: 'string' },
    { key: 'sourcePort', label: 'ruleFields.sourcePort', placeholder: '12345', formKey: 'sourcePort', type: 'string' },
    { key: 'sourcePortRange', label: 'ruleFields.sourcePortRange', placeholder: '1000:2000', formKey: 'sourcePortRange', type: 'string' },
    { key: 'ipCidr', label: 'ruleFields.ipCidr', placeholder: '192.168.1.0/24', formKey: 'ipCidr', type: 'string' },
    { key: 'sourceIpCidr', label: 'ruleFields.sourceIpCidr', placeholder: '10.0.0.0/8', formKey: 'sourceIpCidr', type: 'string' },
    { key: 'queryType', label: 'ruleFields.queryType', placeholder: 'A, HTTPS, 32768', formKey: 'queryType', type: 'string' },
    { key: 'network', label: 'ruleFields.network', placeholder: 'tcp, udp', formKey: 'network', type: 'string' },
    { key: 'networkType', label: 'ruleFields.networkType', placeholder: 'wifi, cellular, ethernet', formKey: 'networkType', type: 'string' },
    { key: 'defaultInterfaceAddress', label: 'ruleFields.defaultInterfaceAddress', placeholder: '2000::/3', formKey: 'defaultInterfaceAddress', type: 'string' },
    { key: 'networkInterfaceAddressWifi', label: 'ruleFields.networkInterfaceAddressWifi', placeholder: '2000::/3', formKey: 'networkInterfaceAddressWifi', type: 'string' },
    { key: 'networkInterfaceAddressCellular', label: 'ruleFields.networkInterfaceAddressCellular', placeholder: '2000::/3', formKey: 'networkInterfaceAddressCellular', type: 'string' },
    { key: 'networkInterfaceAddressEthernet', label: 'ruleFields.networkInterfaceAddressEthernet', placeholder: '2000::/3', formKey: 'networkInterfaceAddressEthernet', type: 'string' },
    { key: 'networkInterfaceAddressOther', label: 'ruleFields.networkInterfaceAddressOther', placeholder: '2000::/3', formKey: 'networkInterfaceAddressOther', type: 'string' },
    { key: 'wifiSsid', label: 'ruleFields.wifiSsid', placeholder: 'My WIFI', formKey: 'wifiSsid', type: 'string' },
    { key: 'wifiBssid', label: 'ruleFields.wifiBssid', placeholder: '00:00:00:00:00:00', formKey: 'wifiBssid', type: 'string' },
]);

/** 布尔类型字段配置 */
const BOOL_FIELDS: RuleFieldConfig[] = withSingboxKey([
   // { key: 'invert', label: '取反', placeholder: '', formKey: 'invert', type: 'boolean' },
    { key: 'networkIsExpensive', label: 'ruleFields.networkIsExpensive', placeholder: '', formKey: 'networkIsExpensive', type: 'boolean' },
    { key: 'networkIsConstrained', label: 'ruleFields.networkIsConstrained', placeholder: '', formKey: 'networkIsConstrained', type: 'boolean' },
]);

/** 所有字段配置 */
export const RULE_FIELD_CONFIG: RuleFieldConfig[] = [...STRING_FIELDS, ...BOOL_FIELDS];

/** 根据 key 获取配置项 */
export function getRuleFieldConfigByKey(key: RuleFieldKey | BoolFieldKey): RuleFieldConfig | undefined {
    return RULE_FIELD_CONFIG.find(c => c.key === key);
}

/** 根据 formKey 获取配置项 */
export function getRuleFieldConfigByFormKey(formKey: string): RuleFieldConfig | undefined {
    return RULE_FIELD_CONFIG.find(c => c.formKey === formKey);
}

/** 判断是否为布尔字段 */
export function isBoolField(formKey: string): boolean {
    return BOOL_FIELDS.some(f => f.formKey === formKey);
}
