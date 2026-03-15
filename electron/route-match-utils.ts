/**
 * 网址测试：规则集加载与域名/IP 匹配
 * 用于 Debug 页面的网址测试功能，按策略顺序匹配 URL 对应的出站
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import axios from 'axios';
import { spawnSync } from 'node:child_process';
import * as singbox from './singbox';
import { decompileSrsToJson, isBuiltinRuleSet } from './ruleset-utils';
import { getRulesetsDir, getGeoDir, getDataDir, getBuiltinRulesetsPath } from './paths';

/** sing-box 规则集 JSON 中的单条 headless rule */
interface HeadlessRule {
    domain?: string[];
    domain_suffix?: string[];
    domain_keyword?: string[];
    domain_regex?: string[];
    ip_cidr?: string[];
    source_ip_cidr?: string[];
    invert?: boolean;
    type?: string;
    rules?: HeadlessRule[];
    mode?: 'and' | 'or';
}

/** 规则集 JSON 结构 */
interface RuleSetJson {
    version?: number;
    rules?: HeadlessRule[];
}

/** 规则集定义（来自 policiesToSingboxConfig） */
interface RuleSetDef {
    tag: string;
    type: 'local' | 'remote';
    path?: string;
    url?: string;
    format?: string;
}

/** 检查 IP 是否在 CIDR 范围内（支持 IPv4，IPv6 简化处理） */
function ipInCidr(ip: string, cidr: string): boolean {
    const parts = cidr.split('/');
    const range = parts[0]?.trim();
    const bits = parts[1] ? parseInt(parts[1], 10) : (range?.includes(':') ? 128 : 32);
    if (!range || isNaN(bits) || bits < 0) return false;

    const ipToNum = (addr: string): bigint | null => {
        if (addr.includes(':')) {
            const expanded = expandIPv6(addr);
            if (!expanded) return null;
            const hextets = expanded.split(':');
            let result = BigInt(0);
            for (const h of hextets) {
                result = (result << BigInt(16)) | BigInt(parseInt(h, 16));
            }
            return result;
        }
        const octets = addr.split('.').map(Number);
        if (octets.length !== 4 || octets.some(o => isNaN(o) || o < 0 || o > 255)) return null;
        return (BigInt(octets[0]) << BigInt(24)) | (BigInt(octets[1]) << BigInt(16)) |
            (BigInt(octets[2]) << BigInt(8)) | BigInt(octets[3]);
    };

    const expandIPv6 = (addr: string): string | null => {
        const parts = addr.split('::');
        if (parts.length > 2) return null;
        if (parts.length === 1) return addr;
        const left = parts[0].split(':').filter(Boolean);
        const right = parts[1].split(':').filter(Boolean);
        const total = 8;
        const mid = total - left.length - right.length;
        if (mid < 0) return null;
        const zeros = Array(mid).fill('0');
        return [...left, ...zeros, ...right].join(':');
    };

    try {
        const ipNum = ipToNum(ip);
        const rangeNum = ipToNum(range);
        if (ipNum === null || rangeNum === null) return false;
        const maskBits = range.includes(':') ? 128 : 32;
        if (bits > maskBits) return false;
        return (ipNum >> BigInt(maskBits - bits)) === (rangeNum >> BigInt(maskBits - bits));
    } catch {
        return false;
    }
}

/** 检查域名是否匹配单条 headless rule 的 domain 相关字段 */
function domainMatchesHeadlessRule(domain: string, rule: HeadlessRule): boolean {
    if (rule.type === 'logical') {
        const subRules = rule.rules || [];
        if (rule.mode === 'and') {
            return subRules.every(r => domainMatchesHeadlessRule(domain, r));
        }
        return subRules.some(r => domainMatchesHeadlessRule(domain, r));
    }

    let matched = false;
    if (rule.domain?.length) {
        matched = matched || rule.domain.some(d => domain === d);
    }
    if (rule.domain_suffix?.length) {
        matched = matched || rule.domain_suffix.some(s => {
            const suffix = s.startsWith('.') ? s : `.${s}`;
            return domain === suffix.slice(1) || domain.endsWith(suffix);
        });
    }
    if (rule.domain_keyword?.length) {
        matched = matched || rule.domain_keyword.some(k => domain.includes(k));
    }
    if (rule.domain_regex?.length) {
        matched = matched || rule.domain_regex.some(re => {
            try {
                return new RegExp(re).test(domain);
            } catch {
                return false;
            }
        });
    }
    if (rule.invert) matched = !matched;
    return matched;
}

/** 检查 IP 是否匹配单条 headless rule 的 ip_cidr */
function ipMatchesHeadlessRule(ip: string, rule: HeadlessRule): boolean {
    if (rule.type === 'logical') {
        const subRules = rule.rules || [];
        if (rule.mode === 'and') {
            return subRules.every(r => ipMatchesHeadlessRule(ip, r));
        }
        return subRules.some(r => ipMatchesHeadlessRule(ip, r));
    }
    const cidrs = [...(rule.ip_cidr || []), ...(rule.source_ip_cidr || [])];
    if (cidrs.length === 0) return false;
    const matched = cidrs.some(c => ipInCidr(ip, c));
    return rule.invert ? !matched : matched;
}

/** 从规则集中检查域名是否匹配 */
function domainMatchesRuleSet(domain: string, rules: HeadlessRule[]): boolean {
    if (!rules?.length) return false;
    return rules.some(r => domainMatchesHeadlessRule(domain, r));
}

/** 从规则集中检查 IP 是否匹配 */
function ipMatchesRuleSet(ip: string, rules: HeadlessRule[]): boolean {
    if (!rules?.length) return false;
    return rules.some(r => ipMatchesHeadlessRule(ip, r));
}

/** 获取规则集文件路径（本地或缓存） */
function getRuleSetFilePath(tag: string, ruleSets: RuleSetDef[], ruleProviders: { id: string; name: string; path?: string }[]): string | null {
    if(isBuiltinRuleSet(tag)){
            const rs = ruleSets.find(r => r.tag === tag);
            return path.join(getBuiltinRulesetsPath(), rs.path);
    }
    const provider = ruleProviders.find(p => p.id === tag );
     return path.join(getRulesetsDir(), provider.path);
}

/** 加载规则集 JSON 内容，支持 .json 和 .srs */
function loadRuleSetContent(filePath: string): HeadlessRule[] | null {
    try {
        if (filePath.toLowerCase().endsWith('.json')) {
            const raw = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(raw) as RuleSetJson;
            return data.rules || [];
        }
        if (filePath.toLowerCase().endsWith('.srs')) {
            const singboxPath = singbox.getSingboxBinaryPath();
            if (!fs.existsSync(singboxPath)) return null;
            const jsonPath = filePath.replace(/\.srs$/i, '.json');
            const decompiled = decompileSrsToJson(filePath);
            if (decompiled) {
                try {
                    const data = JSON.parse(decompiled) as RuleSetJson;
                    return data.rules || [];
                } catch {
                    return null;
                }
            }
            const outPath = path.join(path.dirname(filePath), `decomp_${Date.now()}.json`);
            const result = spawnSync(singboxPath, ['rule-set', 'decompile', filePath, '-o', outPath], {
                encoding: 'utf8',
                timeout: 30000,
            });
            if (result.status === 0 && fs.existsSync(outPath)) {
                const data = JSON.parse(fs.readFileSync(outPath, 'utf8')) as RuleSetJson;
                try {
                    fs.unlinkSync(outPath);
                } catch { /* ignore */ }
                return data.rules || [];
            }
        }
    } catch { /* ignore */ }
    return null;
}



/**
 * 加载规则集内容
 * @param tag 规则集 tag，如 geosite:google, geoip:cn, 或自定义规则集 ID
 */
export async function loadRuleSetRules(
    tag: string,
    ruleSets: RuleSetDef[],
    ruleProviders: { id: string; name: string; path?: string }[]
): Promise<HeadlessRule[] | null> {
    const filePath = getRuleSetFilePath(tag, ruleSets, ruleProviders);
    if (filePath) {
        return loadRuleSetContent(filePath);
    }

    // 内置规则集仅使用本地文件，本地不存在则忽略（不远程拉取）
    if (isBuiltinRuleSet(tag)) {
        return null;
    }

    return null;
}

/**
 * 检查域名是否匹配规则（含 rule_set）
 */
export async function domainMatchesRule(
    domain: string,
    rule: { domain?: string[]; domain_suffix?: string[]; domain_keyword?: string[]; rule_set?: string[] },
    ruleSets: RuleSetDef[],
    ruleProviders: { id: string; name: string; path?: string }[]
): Promise<boolean> {
    if (rule.domain?.length && rule.domain.includes(domain)) return true;
    if (rule.domain_suffix?.length) {
        if (rule.domain_suffix.some(s => {
            const suffix = s.startsWith('.') ? s : `.${s}`;
            return domain === suffix.slice(1) || domain.endsWith(suffix);
        })) return true;
    }
    if (rule.domain_keyword?.length && rule.domain_keyword.some(k => domain.includes(k))) return true;

    if (rule.rule_set?.length) {
        for (const tag of rule.rule_set) {
            const rules = await loadRuleSetRules(tag, ruleSets, ruleProviders);
            if (rules && domainMatchesRuleSet(domain, rules)) return true;
        }
    }
    return false;
}

/**
 * 检查 IP 是否匹配规则（含 rule_set 中的 geoip）
 */
export async function ipMatchesRule(
    ip: string,
    rule: { ip_cidr?: string[]; source_ip_cidr?: string[]; rule_set?: string[] },
    ruleSets: RuleSetDef[],
    ruleProviders: { id: string; name: string; path?: string }[]
): Promise<boolean> {
    const cidrs = [...(rule.ip_cidr || []), ...(rule.source_ip_cidr || [])];
    if (cidrs.length && cidrs.some(c => ipInCidr(ip, c))) return true;

    if (rule.rule_set?.length) {
        for (const tag of rule.rule_set) {
            if (!tag.startsWith('geoip:')) continue;
            const rules = await loadRuleSetRules(tag, ruleSets, ruleProviders);
            if (rules && ipMatchesRuleSet(ip, rules)) return true;
        }
    }
    return false;
}
