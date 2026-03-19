/**
 * 订阅处理模块
 * 处理订阅配置文件的下载、更新和导入功能
 */

import axios from 'axios';
import * as iconv from 'iconv-lite';
import * as jschardet from 'jschardet';
import yaml from 'js-yaml';
import * as dbUtils from './db';
import { validateProfileContent } from './validation';
import { getProfilesDir } from './paths';
import { downloadAndConvertRuleSet } from './ruleset-utils';
import path from 'node:path';
import fs from 'node:fs';
import type { RuleProvider as ClashRuleProvider } from '../src/types/clash';
import type { SubscriptionUserinfo, ProxyNode } from './db';
import { convertClashToSingbox } from '../src/services/singbox';

const DEFAULT_SUBSCRIPTION_USER_AGENT = 'clash-verge/v2.4.2';

/**
 * 从 Subscription-Userinfo 响应头解析订阅用户信息
 * 格式: upload=5476036115025; download=5476036115025; total=26388279066624; expire=4102329600
 * expire 可为空，表示无期限
 */
export function parseSubscriptionUserinfo(headerValue: string | undefined): SubscriptionUserinfo | null {
    if (!headerValue?.trim()) return null;
    const result: Record<string, number> = {};
    for (const part of headerValue.split(';')) {
        const eqIdx = part.trim().indexOf('=');
        if (eqIdx < 0) continue;
        const key = part.trim().slice(0, eqIdx).trim().toLowerCase();
        const val = part.trim().slice(eqIdx + 1).trim();
        if (!key) continue;
        // expire 允许为空（表示无期限），其他字段必须有有效数值
        if (val) {
            const num = parseInt(val, 10);
            if (!isNaN(num)) result[key] = num;
        } else if (key === 'expire') {
            result.expire = 0; // 空值表示无期限
        }
    }
    if (result.upload != null && result.download != null && result.total != null) {
        return {
            upload: result.upload,
            download: result.download,
            total: result.total,
            expire: result.expire ?? 0
        };
    }
    return null;
}

/** 规则集解析和下载结果 */
export interface RuleProviderParseResult {
    name: string;
    success: boolean;
    srsPath?: string;
    error?: string;
}

/**
 * 判断内容是否为 YAML 格式（非 JSON）
 */
export function isYamlContent(content: string): boolean {
    try {
        JSON.parse(content);
        return false;
    } catch {
        return true;
    }
}



/**
 * 从订阅配置中解析真实代理节点（不含分组）
 * 支持 Clash YAML 和 Sing-box JSON 格式
 * 使用 convertClashToSingbox 进行过滤，自动排除不支持的协议（如 SSR）
 */
export function parseProxyNodes(content: string): ProxyNode[] {

    /** 内置出站类型（非代理节点） */
    const BUILTIN_OUTBOUND_TYPES = new Set(['direct', 'block']);

    /** 分组出站类型 */
    const GROUP_OUTBOUND_TYPES = new Set(['selector', 'urltest']);

    const nodes: ProxyNode[] = [];
    
    try {
        let parsed: any;
        
        // 判断是否为 YAML 格式
        if (isYamlContent(content)) {
            parsed = yaml.load(content) as any;
        } else {
            parsed = JSON.parse(content);
        }
        
        if (!parsed || typeof parsed !== 'object') return [];
        
        // 处理 Clash 格式（有 proxies 字段）- 使用 convertClashToSingbox 过滤
        if (Array.isArray(parsed.proxies)) {
            const singboxConfig = convertClashToSingbox(parsed, { skipRules: true });
            const outbounds = singboxConfig.outbounds ?? [];
            
            for (const outbound of outbounds) {
                // 排除内置类型和分组类型
                const type = (outbound.type || '').toLowerCase();
                if (!BUILTIN_OUTBOUND_TYPES.has(type) && !GROUP_OUTBOUND_TYPES.has(type)) {
                    nodes.push({
                        name: outbound.tag,
                        type: outbound.type
                    });
                }
            }
        }
        // 处理 Sing-box 格式（有 outbounds 字段）
        else if (Array.isArray(parsed.outbounds)) {
            for (const outbound of parsed.outbounds) {
                if (outbound && outbound.tag && outbound.type) {
                    // 排除分组类型和内置类型
                    const type = (outbound.type || '').toLowerCase();
                    if (!BUILTIN_OUTBOUND_TYPES.has(type) && !GROUP_OUTBOUND_TYPES.has(type)) {
                        nodes.push({
                            name: outbound.tag,
                            type: outbound.type
                        });
                    }
                }
            }
        }
        
        console.log(`[Nodes] Parsed ${nodes.length} proxy nodes from content`);
    } catch (e) {
        console.error('[Nodes] Failed to parse proxy nodes:', e);
    }
    
    return nodes;
}

/**
 * 解析 Clash 配置中的 rule-providers
 * @param content 配置文件内容（YAML 或 JSON）
 * @returns rule-providers 映射表，解析失败返回 null
 */
export function parseRuleProviders(content: string): Record<string, ClashRuleProvider> | null {
    try {
        let parsed: any;
        
        // 判断是否为 YAML 格式
        if (isYamlContent(content)) {
            parsed = yaml.load(content) as any;
        } else {
            parsed = JSON.parse(content);
        }
        
        if (!parsed || typeof parsed !== 'object') return null;
        
        const ruleProviders = parsed['rule-providers'];
        if (!ruleProviders || typeof ruleProviders !== 'object') return null;
        
        return ruleProviders as Record<string, ClashRuleProvider>;
    } catch (e) {
        console.error('[RuleProviders] Failed to parse rule-providers:', e);
        return null;
    }
}

/** 订阅规则集 ID 写入数据库时：将冒号替换为连字符，避免存储含冒号的 ID */
function sanitizeRuleProviderIdForDb(id: string): string {
    return (id || '').replace(/:/g, '-');
}

/**
 * 从订阅配置中解析并下载 rule-providers
 * @param content 配置文件内容
 * @param profileId 订阅 ID（用于日志和记录来源）
 * @returns 下载结果列表
 */
export async function parseAndDownloadRuleProviders(
    content: string,
    profileId: string
): Promise<RuleProviderParseResult[]> {
    const ruleProviders = parseRuleProviders(content);
    if (!ruleProviders || Object.keys(ruleProviders).length === 0) {
        console.log(`[RuleProviders] No rule-providers found in profile ${profileId}`);
        return [];
    }

    const results: RuleProviderParseResult[] = [];
    
    console.log(`[RuleProviders] Found ${Object.keys(ruleProviders).length} rule-providers in profile ${profileId}`);

    for (const [name, provider] of Object.entries(ruleProviders)) {
        // 只处理 http 类型的规则集
        if (provider.type !== 'http') {
            console.log(`[RuleProviders] Skipping non-http provider: ${name} (type: ${provider.type})`);
            continue;
        }

        if (!provider.url) {
            console.log(`[RuleProviders] Skipping provider without URL: ${name}`);
            continue;
        }

        try {
            // 使用订阅配置中的 key（name）作为 id，写入数据库时冒号替换为连字符
            const providerId = sanitizeRuleProviderIdForDb(name);
            
            // 根据文件扩展名判断类型
            const url = provider.url.toLowerCase();
            const providerType = (url.endsWith('.srs') || url.includes('.srs?')) ? 'singbox' : 'clash';
            
            console.log(`[RuleProviders] Downloading: ${name} from ${provider.url}`);
            
            // 下载并转换
            const result = await downloadAndConvertRuleSet(providerId, provider.url, providerType);
            
            if (result.error) {
                results.push({
                    name,
                    success: false,
                    error: result.error
                });
                console.error(`[RuleProviders] Failed to download ${name}: ${result.error}`);
                continue;
            }

            // 使用 upsertRuleProviderFromSubscription 写入数据库（id 重复则覆盖）
            dbUtils.upsertRuleProviderFromSubscription({
                id: providerId,
                name,
                url: provider.url,
                type: providerType,
                enabled: true,
                path: result.srsPath || undefined,
                last_update: new Date().toISOString(), // 使用标准ISO时间格式
                profile_id: profileId
            });

            results.push({
                name,
                success: true,
                srsPath: result.srsPath || undefined
            });

            console.log(`[RuleProviders] Successfully downloaded and saved: ${name}`);
        } catch (e: any) {
            results.push({
                name,
                success: false,
                error: e.message || 'Unknown error'
            });
            console.error(`[RuleProviders] Failed to process ${name}:`, e);
        }
    }

    return results;
}

/**
 * 检查是否应该跳过下载规则集
 * 当数据库中存在相同ID的记录，且profile_id相同，且last_update小于一天时跳过
 */
function shouldSkipDownload(providerId: string, currentProfileId: string): boolean {
    const existingProvider = dbUtils.getRuleProviderById(providerId);
    if (!existingProvider) {
        return false; // 数据库中不存在，需要下载
    }
    
    // 检查profile_id是否匹配
    if (existingProvider.profile_id !== currentProfileId) {
        return false; // 不属于当前订阅，需要下载
    }
    
    // 检查last_update是否存在
    if (!existingProvider.last_update) {
        return false; // 没有更新时间，需要下载
    }
    
    // 检查更新时间是否小于一天
    const lastUpdate = new Date(existingProvider.last_update);
    const now = new Date();
    const timeDiff = now.getTime() - lastUpdate.getTime();
    const oneDayMs = 24 * 60 * 60 * 1000;
    
    if (timeDiff < oneDayMs) {
        const ageHours = Math.round(timeDiff / (60 * 60 * 1000));
        console.log(`[RuleProviders] Skipping download for ${providerId}: updated ${ageHours} hours ago`);
        return true; // 更新时间很新，跳过下载
    }
    
    return false; // 更新时间较旧，需要下载
}

/**
 * 从订阅配置中解析并下载 rule-providers（支持并发控制）
 * @param content 配置文件内容
 * @param profileId 订阅 ID（用于日志和记录来源）
 * @param concurrency 并发数量，默认10个
 * @returns 下载结果列表
 */
export async function parseAndDownloadRuleProvidersWithConcurrency(
    content: string,
    profileId: string,
    concurrency: number = 10
): Promise<RuleProviderParseResult[]> {
    const ruleProviders = parseRuleProviders(content);
    if (!ruleProviders || Object.keys(ruleProviders).length === 0) {
        console.log(`[RuleProviders] No rule-providers found in profile ${profileId}`);
        return [];
    }

    const providersToDownload: Array<{name: string, provider: ClashRuleProvider}> = [];
    const skippedProviders: string[] = [];
    
    // 过滤出需要下载的rule providers
    for (const [name, provider] of Object.entries(ruleProviders)) {
        // 只处理 http 类型的规则集
        if (provider.type !== 'http') {
            console.log(`[RuleProviders] Skipping non-http provider: ${name} (type: ${provider.type})`);
            continue;
        }

        if (!provider.url) {
            console.log(`[RuleProviders] Skipping provider without URL: ${name}`);
            continue;
        }

        // 检查是否应该跳过下载（使用写入 DB 的 id 格式）
        const providerId = sanitizeRuleProviderIdForDb(name);
        if (shouldSkipDownload(providerId, profileId)) {
            skippedProviders.push(name);
            continue;
        }

        providersToDownload.push({ name, provider });
    }
    
    if (skippedProviders.length > 0) {
        console.log(`[RuleProviders] Skipped ${skippedProviders.length} fresh rule-providers: ${skippedProviders.join(', ')}`);
    }
    
    console.log(`[RuleProviders] Found ${providersToDownload.length} rule-providers to download in profile ${profileId}`);

    const results: RuleProviderParseResult[] = [];
    
    // 分批次处理，每批最多concurrency个
    for (let i = 0; i < providersToDownload.length; i += concurrency) {
        const batch = providersToDownload.slice(i, i + concurrency);
        console.log(`[RuleProviders] Processing batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(providersToDownload.length / concurrency)}`);
        
        const batchPromises = batch.map(async ({name, provider}) => {
            try {
                // 使用订阅配置中的 key（name）作为 id，写入数据库时冒号替换为连字符
                const providerId = sanitizeRuleProviderIdForDb(name);
                
                // 根据文件扩展名判断类型
                const url = provider.url.toLowerCase();
                const providerType = (url.endsWith('.srs') || url.includes('.srs?')) ? 'singbox' : 'clash';
                
                console.log(`[RuleProviders] Downloading: ${name} from ${provider.url}`);
                
                // 下载并转换
                const result = await downloadAndConvertRuleSet(providerId, provider.url, providerType);
                
                if (result.error) {
                    console.error(`[RuleProviders] Failed to download ${name}: ${result.error}`);
                    return {
                        name,
                        success: false,
                        error: result.error
                    };
                }

                // 使用 upsertRuleProviderFromSubscription 写入数据库（id 重复则覆盖）
                dbUtils.upsertRuleProviderFromSubscription({
                    id: providerId,
                    name,
                    url: provider.url,
                    type: providerType,
                    enabled: true,
                    path: result.srsPath || undefined,
                    last_update: new Date().toISOString(), // 使用标准ISO时间格式
                    profile_id: profileId
                });

                console.log(`[RuleProviders] Successfully downloaded and saved: ${name}`);
                return {
                    name,
                    success: true,
                    srsPath: result.srsPath || undefined
                };
            } catch (e: any) {
                console.error(`[RuleProviders] Failed to process ${name}:`, e);
                return {
                    name,
                    success: false,
                    error: e.message || 'Unknown error'
                };
            }
        });
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
    }

    return results;
}

/**
 * 获取订阅请求使用的 User-Agent
 */
export function getSubscriptionUserAgent(): string {
    const ua = dbUtils.getSetting('subscription-user-agent');
    return (ua?.trim() || DEFAULT_SUBSCRIPTION_USER_AGENT);
}

/**
 * 保存配置文件到 profiles 目录
 */
export function saveProfileFile(profileId: string | number, content: string): string {
    const profilesDir = getProfilesDir();
    const filePath = path.join(profilesDir, `profile_${profileId}`);
    // Remove BOM if present to avoid encoding issues
    const cleanContent = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
    fs.writeFileSync(filePath, cleanContent, 'utf8');
    return filePath;
}

/**
 * 读取配置文件内容（自动检测编码并转换为 UTF-8）
 */
export function readProfileContent(profileId: string | number, profilePath?: string): string | null {
    const filePath = profilePath || path.join(getProfilesDir(), `profile_${profileId}`);
    if (!fs.existsSync(filePath)) {
        return null;
    }

    // Read file as buffer first for encoding detection
    const buffer = fs.readFileSync(filePath);

    // Detect encoding
    const detected = jschardet.detect(buffer);
    let content: string;

    // Check if encoding is detected and not UTF-8
    if (detected.encoding && detected.encoding.toLowerCase() !== 'utf-8' && detected.encoding.toLowerCase() !== 'ascii') {
        console.log(`Detected encoding: ${detected.encoding}, converting to UTF-8`);
        content = iconv.decode(buffer, detected.encoding);
    } else {
        // Use UTF-8 decoding
        content = buffer.toString('utf-8');
    }

    // Remove BOM if present (common in Windows-saved files)
    if (content.charCodeAt(0) === 0xfeff) {
        content = content.slice(1);
    }
    return content;
}

/**
 * 下载订阅配置文件
 * @param profileId 配置文件 ID
 * @returns 下载的配置内容
 */
export async function downloadProfile(profileId: string): Promise<string> {
    const profile = dbUtils.getProfileById(profileId);
    if (!profile) throw new Error('Profile not found');
    if (!profile.url) throw new Error('Profile has no URL');

    const ua = getSubscriptionUserAgent();
    console.log(`Downloading profile from ${profile.url}...`);
    console.log(`User-Agent: ${ua}`);
    try {
        const response = await axios.get(profile.url, {
            timeout: 10000,
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': ua,
            }
        });

        // Get raw buffer
        const buffer = Buffer.from(response.data);

        // Detect encoding and convert to UTF-8
        const detected = jschardet.detect(buffer);
        let content: string;

        if (detected.encoding && detected.encoding.toLowerCase() !== 'utf-8' && detected.encoding.toLowerCase() !== 'ascii') {
            console.log(`Remote file encoding detected: ${detected.encoding}, converting to UTF-8`);
            content = iconv.decode(buffer, detected.encoding);
        } else {
            content = buffer.toString('utf-8');
        }

        // Remove BOM if present
        if (content.charCodeAt(0) === 0xfeff) {
            content = content.slice(1);
        }

        content = validateProfileContent(content);

        // Save to file in profiles directory (source file without extension)
        const filePath = saveProfileFile(profileId, content);

        dbUtils.updateProfileContent(profileId, filePath, new Date().toISOString());

        // 从响应头提取订阅用户信息（流量、过期时间）并写入数据库
        const userinfoHeader = response.headers['subscription-userinfo'];
        const userinfo = parseSubscriptionUserinfo(userinfoHeader);
        if (userinfo) {
            dbUtils.updateProfileSubscriptionInfo(profileId, userinfo);
            console.log(`[Subscription] Profile ${profileId} userinfo: upload=${userinfo.upload} download=${userinfo.download} total=${userinfo.total} expire=${userinfo.expire}`);
        }

        // 解析并下载 rule-providers（同步执行，等待所有下载完成）
        console.log(`[RuleProviders] Starting rule providers download for profile ${profileId}...`);
        const downloadResults = await parseAndDownloadRuleProvidersWithConcurrency(content, profileId, 10);
        const successCount = downloadResults.filter(r => r.success).length;
        const failCount = downloadResults.filter(r => !r.success).length;
        console.log(`[RuleProviders] Download completed for profile ${profileId}: ${successCount} success, ${failCount} failed`);
        
        if (failCount > 0) {
            const failedItems = downloadResults.filter(r => !r.success).map(r => `${r.name} (${r.error})`).join(', ');
            console.warn(`[RuleProviders] Some rule providers failed to download for profile ${profileId}: ${failedItems}`);
        }

        // 解析并保存代理节点列表
        const nodes = parseProxyNodes(content);
        dbUtils.updateProfileNodes(profileId, nodes);

        return content;
    } catch (dlErr: any) {
        console.error('Failed to update profile:', dlErr.message);
        throw new Error(`Update failed: ${dlErr.message}`);
    }
}

/**
 * 添加新的订阅配置
 * 先下载，成功后再写入数据库，失败则直接报错
 * @param url 订阅地址
 * @returns 新配置文件的 ID
 */
export async function addSubscriptionProfile(url: string): Promise<string> {
    if (!url?.trim()) throw new Error('订阅地址不能为空');

    const ua = getSubscriptionUserAgent();
    console.log(`Downloading subscription from ${url}...`);
    console.log(`User-Agent: ${ua}`);
    const response = await axios.get(url, {
        timeout: 10000,
        responseType: 'arraybuffer',
        headers: { 'User-Agent': ua }
    });

    const buffer = Buffer.from(response.data);
    const detected = jschardet.detect(buffer);
    let content: string;
    if (detected.encoding && detected.encoding.toLowerCase() !== 'utf-8' && detected.encoding.toLowerCase() !== 'ascii') {
        content = iconv.decode(buffer, detected.encoding);
    } else {
        content = buffer.toString('utf-8');
    }
    if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);

    content = validateProfileContent(content);

    const profileId = dbUtils.allocateId();
    const filePath = saveProfileFile(profileId, content);
    const name = (() => {
        try {
            return new URL(url).hostname || 'New Profile';
        } catch {
            return 'New Profile';
        }
    })();

    dbUtils.addProfile({
        name,
        type: 'remote',
        url: url.trim(),
        path: filePath
    }, profileId);

    // 从响应头提取订阅用户信息（流量、过期时间）并写入数据库
    const userinfoHeader = response.headers['subscription-userinfo'];
    const userinfo = parseSubscriptionUserinfo(userinfoHeader);
    if (userinfo) {
        dbUtils.updateProfileSubscriptionInfo(profileId, userinfo);
        console.log(`[Subscription] New profile ${profileId} userinfo: upload=${userinfo.upload} download=${userinfo.download} total=${userinfo.total} expire=${userinfo.expire}`);
    }

    // 解析并下载 rule-providers（同步执行，等待所有下载完成）
    console.log(`[RuleProviders] Starting rule providers download for new profile ${profileId}...`);
    parseAndDownloadRuleProvidersWithConcurrency(content, profileId, 10)
        .then(downloadResults => {
            const successCount = downloadResults.filter(r => r.success).length;
            const failCount = downloadResults.filter(r => !r.success).length;
            console.log(`[RuleProviders] Download completed for new profile ${profileId}: ${successCount} success, ${failCount} failed`);
            
            if (failCount > 0) {
                console.warn(`[RuleProviders] Some rule providers failed to download for new profile ${profileId}: ${downloadResults.filter(r => !r.success).map(r => `${r.name} (${r.error})`).join(', ')}`);
            }
        })
        .catch(err => {
            console.error(`[RuleProviders] Failed to parse/download rule-providers for new profile ${profileId}:`, err);
        });

    // 解析并保存代理节点列表
    const nodes = parseProxyNodes(content);
    dbUtils.updateProfileNodes(profileId, nodes);

    return profileId;
}

/**
 * 从 URL 下载订阅内容（不保存到数据库）
 * @param url 订阅地址
 * @returns 下载的配置内容
 */
export async function fetchSubscriptionContent(url: string): Promise<string> {
    if (!url?.trim()) throw new Error('订阅地址不能为空');

    const ua = getSubscriptionUserAgent();
    console.log(`Fetching subscription content from ${url}...`);
    console.log(`User-Agent: ${ua}`);
    const response = await axios.get(url, {
        timeout: 10000,
        responseType: 'arraybuffer',
        headers: { 'User-Agent': ua }
    });

    const buffer = Buffer.from(response.data);
    const detected = jschardet.detect(buffer);
    let content: string;
    if (detected.encoding && detected.encoding.toLowerCase() !== 'utf-8' && detected.encoding.toLowerCase() !== 'ascii') {
        content = iconv.decode(buffer, detected.encoding);
    } else {
        content = buffer.toString('utf-8');
    }
    if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);

    return validateProfileContent(content);
}
