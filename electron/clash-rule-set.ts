/**
 * 将 Clash 规则集格式转换为 sing-box 规则集 JSON 格式
 * 仅支持 YAML payload 格式：
 * payload:
 *   - DOMAIN-SUFFIX,google.com
 *   - DOMAIN-KEYWORD,github
 *   - IP-CIDR,192.168.1.0/24
 */

import yaml from 'js-yaml';
import { convertClashRuleToRouteRule, type HeadlessRule } from '../src/types/singbox';

/** sing-box 规则集源格式 */
export interface SingboxRuleSetSource {
    version: number;
    rules: HeadlessRule[];
}

// 重新导出 HeadlessRule 类型，保持向后兼容
export type { HeadlessRule as SingboxHeadlessRule };

/** 检测是否为 classical 规则行 */
function isClassicalRule(line: string): boolean {
    const upper = line.toUpperCase();
    return (
        upper.startsWith('DOMAIN-SUFFIX,') ||
        upper.startsWith('DOMAIN-KEYWORD,') ||
        upper.startsWith('DOMAIN,') ||
        upper.startsWith('DOMAIN-REGEX,') ||
        upper.startsWith('IP-CIDR,') ||
        upper.startsWith('IP-CIDR6,') ||
        upper.startsWith('SRC-IP-CIDR,') ||
        upper.startsWith('SRC-PORT,') ||
        upper.startsWith('DST-PORT,') ||
        upper.startsWith('PORT-RANGE,') ||
        upper.startsWith('GEOIP,') ||
        upper.startsWith('MATCH,') ||
        upper.startsWith('PROCESS-NAME,')
    );
}



/** 将多个单字段规则合并为多字段规则 */
function compactRules(rules: HeadlessRule[]): HeadlessRule[] {
    const domainSuffix: string[] = [];
    const domainKeyword: string[] = [];
    const domain: string[] = [];
    const domainRegex: string[] = [];
    const ipCidr: string[] = [];
    const sourceIpCidr: string[] = [];
    const port: number[] = [];
    const portRange: string[] = [];
    const sourcePort: number[] = [];
    const sourcePortRange: string[] = [];
    const processName: string[] = [];

    for (const r of rules) {
        if (r.domain_suffix) domainSuffix.push(...r.domain_suffix);
        if (r.domain_keyword) domainKeyword.push(...r.domain_keyword);
        if (r.domain) domain.push(...r.domain);
        if (r.domain_regex) domainRegex.push(...r.domain_regex);
        if (r.ip_cidr) ipCidr.push(...r.ip_cidr);
        if (r.source_ip_cidr) sourceIpCidr.push(...r.source_ip_cidr);
        if (r.port) port.push(...r.port);
        if (r.port_range) portRange.push(...r.port_range);
        if (r.source_port) sourcePort.push(...r.source_port);
        if (r.source_port_range) sourcePortRange.push(...r.source_port_range);
        if (r.process_name) processName.push(...r.process_name);
    }

    const result: HeadlessRule[] = [];
    if (domainSuffix.length) result.push({ domain_suffix: [...new Set(domainSuffix)] });
    if (domainKeyword.length) result.push({ domain_keyword: [...new Set(domainKeyword)] });
    if (domain.length) result.push({ domain: [...new Set(domain)] });
    if (domainRegex.length) result.push({ domain_regex: [...new Set(domainRegex)] });
    if (ipCidr.length) result.push({ ip_cidr: [...new Set(ipCidr)] });
    if (sourceIpCidr.length) result.push({ source_ip_cidr: [...new Set(sourceIpCidr)] });
    if (port.length) result.push({ port: [...new Set(port)] });
    if (portRange.length) result.push({ port_range: [...new Set(portRange)] });
    if (sourcePort.length) result.push({ source_port: [...new Set(sourcePort)] });
    if (sourcePortRange.length) result.push({ source_port_range: [...new Set(sourcePortRange)] });
    if (processName.length) result.push({ process_name: [...new Set(processName)] });

    return result;
}

// 智能识别文件格式的behavior：classical，ipcidr，domain
/**
 * 1.classical:
 * payload:
  - DOMAIN,vsmarketplacebadge.apphb.com
  - DOMAIN-SUFFIX,1drv.ms
  - DOMAIN-SUFFIX,21vbc.com
 * 2.domain格式
 * payload:
  - '+.0.avmarket.rs'
  - '+.0.myikas.com'

 * 3.ipcidr格式
 * payload:
  - '+.0.avmarket.rs'
  - '+.0.myikas.com'
  - 'baidu.com'
 */

/**
 * 检测规则内容格式类型
 */
function detectRuleFormat(lines: string[]): 'classical' | 'domain' | 'ipcidr' {


    let classicalCount = 0;
    let domainCount = 0;
     let ipcidrCount = 0;


    for (const line of lines) {
        const trimmed = line.trim();
        // 检测 classical 格式
        if (isClassicalRule(trimmed)) {
            classicalCount++;
        }
        // 检测 ipcidr 格式（简单的 CIDR 模式，如纯 IP 或 CIDR，包括IPv4和IPv6）
        else if (/^(\d+\.){3}\d+(\/\d+)?$/.test(trimmed.trim()) || // IPv4 pattern
                 /^[0-9a-fA-F:]+(\/\d+)?$/.test(trimmed.trim())) { // IPv6 pattern (hex digits and colons with optional prefix length)
            ipcidrCount++;
        }else{
             domainCount++;
        }
    }

    
    // 返回匹配数量最多的格式，至少需要有一个匹配
    if (classicalCount > 0 || domainCount > 0 || ipcidrCount > 0) {
        if (classicalCount >= domainCount && classicalCount >= ipcidrCount) {
            return 'classical';
        } else if (domainCount >= ipcidrCount) {
            return 'domain';
        } else {
            return 'ipcidr';
        }
    }

    // 默认返回 classical 格式
    return 'classical';
}

/**
 * 将 domain 格式转换为 sing-box 规则集 JSON
 * domain 格式：+或.开头的域名表示domain_suffix，其他域名表示domain
 */
function domainFormatToSingbox(lines: string[]): SingboxRuleSetSource {
    const rules: HeadlessRule[] = [];
    const domainSuffixes: string[] = [];
    const domains: string[] = [];


    for (const line of lines) {
        const trimmed = line.trim();

        // 处理 domain_suffix 格式：+.example.com 或 .example.com
        if (trimmed.startsWith('+.')) {
            const domain = trimmed.substring(2); // 移除 '+.' 前缀
            if (domain) {
                domainSuffixes.push(domain);
            }
        } else if (trimmed.startsWith('.')) {
            const domain = trimmed.substring(1); // 移除 '.' 前缀
            if (domain) {
                domainSuffixes.push(domain);
            }
        } 
        // 处理普通 domain 格式：example.com
        else if (trimmed.includes('.') && 
                 !/^(\d+\.){3}\d+(\/\d+)?$/.test(trimmed) && // exclude IPv4
                 !/^[0-9a-fA-F:]+(\/\d+)?$/.test(trimmed)) { // exclude IPv6
            // 确保不是IP地址，而是域名
            domains.push(trimmed);
        }
    }

    // 添加 domain_suffix 规则
    if (domainSuffixes.length > 0) {
        rules.push({ domain_suffix: [...new Set(domainSuffixes)] });
    }
    
    // 添加 domain 规则
    if (domains.length > 0) {
        rules.push({ domain: [...new Set(domains)] });
    }

    return { version: 3, rules: compactRules(rules) };
}

/**
 * 将 ipcidr 格式转换为 sing-box 规则集 JSON
 * ipcidr 格式：包含 IP 地址和 CIDR，如 '8.8.8.8' 或 '8.8.8.0/24'
 */
function ipcidrFormatToSingbox(lines: string[]): SingboxRuleSetSource {
    const rules: HeadlessRule[] = [];
    const ipCidrs: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();
        // 简单的 IP/CIDR 格式验证
            ipCidrs.push(trimmed);
    }

    if (ipCidrs.length > 0) {
        rules.push({ ip_cidr: [...new Set(ipCidrs)] });
    }

    return { version: 3, rules: compactRules(rules) };
}

/**
 * 智能识别 Clash 规则集格式并转换为 sing-box 规则集 JSON
 * 自动检测格式类型（classical、domain、ipcidr）并调用相应的转换函数
 */
export function clashRuleSetToSingbox(clashContent: string): SingboxRuleSetSource {

    const data = yaml.load(clashContent) as {payload: string[]};
    const lines = data.payload;
    // 检测内容格式
    const format = detectRuleFormat(lines);

    console.log(format);

    switch (format) {
        case 'domain':
            return domainFormatToSingbox(lines);
        case 'ipcidr':
            return ipcidrFormatToSingbox(lines);
        case 'classical':
        default:
            return classicalFormatToSingbox(lines);
    }
}

/**
 * 将 Clash（classical） 规则集文本转换为 sing-box 规则集 JSON
 * 仅支持 YAML payload 格式，规则必须有匹配前缀
 */
 function classicalFormatToSingbox(lines: string[]): SingboxRuleSetSource {
    const rules: HeadlessRule[] = [];

        for (const item of lines) {
            const rule = convertClashRuleToRouteRule(item, false);
            if (rule) rules.push(rule);
        }

    return { version: 3, rules: compactRules(rules) };
}
