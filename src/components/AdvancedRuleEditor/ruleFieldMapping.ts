/**
 * 表单 formKey 与 sing-box snake_case 字段的映射
 * 用于 LogicalRuleGroup 与 SingboxLogicalRule 的转换
 */
export const FORM_KEY_TO_SINGBOX: Record<string, string> = {
    processNames: 'process_name',
    processPath: 'process_path',
    processPathRegex: 'process_path_regex',
    packageName: 'package_name',
    domain: 'domain',
    domainKeyword: 'domain_keyword',
    domainSuffix: 'domain_suffix',
    domainRegex: 'domain_regex',
    port: 'port',
    portRange: 'port_range',
    sourcePort: 'source_port',
    sourcePortRange: 'source_port_range',
    ipCidr: 'ip_cidr',
    sourceIpCidr: 'source_ip_cidr',
    queryType: 'query_type',
    network: 'network',
    networkType: 'network_type',
    defaultInterfaceAddress: 'default_interface_address',
    wifiSsid: 'wifi_ssid',
    wifiBssid: 'wifi_bssid',
    // 布尔字段
    invert: 'invert',
    networkIsExpensive: 'network_is_expensive',
    networkIsConstrained: 'network_is_constrained',
};

export const SINGBOX_KEY_TO_FORM: Record<string, string> = Object.fromEntries(
    Object.entries(FORM_KEY_TO_SINGBOX).map(([k, v]) => [v, k])
);
