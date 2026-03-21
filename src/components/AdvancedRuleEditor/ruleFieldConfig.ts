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
    { key: 'processNames', label: '进程名', placeholder: 'Telegram.exe', formKey: 'processNames', type: 'string' },
    { key: 'processPath', label: '进程路径', placeholder: '/usr/bin/curl', formKey: 'processPath', type: 'string' },
    { key: 'processPathRegex', label: '进程路径正则', placeholder: '^/usr/bin/.+', formKey: 'processPathRegex', type: 'string' },
    { key: 'packageName', label: '包名 (Android)', placeholder: 'com.termux', formKey: 'packageName', type: 'string' },
    { key: 'domain', label: '域名', placeholder: 'google.com', formKey: 'domain', type: 'string' },
    { key: 'domainKeyword', label: '域名关键词', placeholder: 'keyword', formKey: 'domainKeyword', type: 'string' },
    { key: 'domainSuffix', label: '域名后缀', placeholder: '.google.com', formKey: 'domainSuffix', type: 'string' },
    { key: 'domainRegex', label: '域名正则', placeholder: '^stun\\..+', formKey: 'domainRegex', type: 'string' },
    { key: 'port', label: '端口', placeholder: '80, 443', formKey: 'port', type: 'string' },
    { key: 'portRange', label: '端口范围', placeholder: '1000:2000, :3000, 4000:', formKey: 'portRange', type: 'string' },
    { key: 'sourcePort', label: '源端口', placeholder: '12345', formKey: 'sourcePort', type: 'string' },
    { key: 'sourcePortRange', label: '源端口范围', placeholder: '1000:2000', formKey: 'sourcePortRange', type: 'string' },
    { key: 'ipCidr', label: 'IP CIDR', placeholder: '192.168.1.0/24', formKey: 'ipCidr', type: 'string' },
    { key: 'sourceIpCidr', label: '源 IP CIDR', placeholder: '10.0.0.0/8', formKey: 'sourceIpCidr', type: 'string' },
    { key: 'queryType', label: 'DNS 查询类型', placeholder: 'A, HTTPS, 32768', formKey: 'queryType', type: 'string' },
    { key: 'network', label: '网络协议', placeholder: 'tcp, udp', formKey: 'network', type: 'string' },
    { key: 'networkType', label: '网络类型', placeholder: 'wifi, cellular, ethernet', formKey: 'networkType', type: 'string' },
    { key: 'defaultInterfaceAddress', label: '默认接口地址', placeholder: '2000::/3', formKey: 'defaultInterfaceAddress', type: 'string' },
    { key: 'networkInterfaceAddressWifi', label: '接口地址 (wifi)', placeholder: '2000::/3', formKey: 'networkInterfaceAddressWifi', type: 'string' },
    { key: 'networkInterfaceAddressCellular', label: '接口地址 (cellular)', placeholder: '2000::/3', formKey: 'networkInterfaceAddressCellular', type: 'string' },
    { key: 'networkInterfaceAddressEthernet', label: '接口地址 (ethernet)', placeholder: '2000::/3', formKey: 'networkInterfaceAddressEthernet', type: 'string' },
    { key: 'networkInterfaceAddressOther', label: '接口地址 (other)', placeholder: '2000::/3', formKey: 'networkInterfaceAddressOther', type: 'string' },
    { key: 'wifiSsid', label: 'WiFi SSID', placeholder: 'My WIFI', formKey: 'wifiSsid', type: 'string' },
    { key: 'wifiBssid', label: 'WiFi BSSID', placeholder: '00:00:00:00:00:00', formKey: 'wifiBssid', type: 'string' },
]);

/** 布尔类型字段配置 */
const BOOL_FIELDS: RuleFieldConfig[] = withSingboxKey([
   // { key: 'invert', label: '取反', placeholder: '', formKey: 'invert', type: 'boolean' },
    { key: 'networkIsExpensive', label: '网络计费', placeholder: '', formKey: 'networkIsExpensive', type: 'boolean' },
    { key: 'networkIsConstrained', label: '低数据模式', placeholder: '', formKey: 'networkIsConstrained', type: 'boolean' },
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
