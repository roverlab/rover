/**
 * 定时任务调度器
 * 负责定时更新订阅配置和规则集
 */

import * as dbUtils from './db';
// import { formatDateFixed } from './db'; // 不再使用，改用标准ISO格式
import axios from 'axios';
import fs from 'node:fs';
import path from 'node:path';
import * as jschardet from 'jschardet';
import * as iconv from 'iconv-lite';
import { createLogger } from './logger';
import { getProfilesDir, getRulesetsDir } from './paths';
import { downloadAndConvertRuleSet, getRuleProviderFileBaseName } from './ruleset-utils';
import { validateProfileContent } from './validation';
import { getSubscriptionUserAgent, parseSubscriptionUserinfo } from './subscription';

const log = createLogger('Scheduler');

// 定时器映射表：profileId -> timer
const profileTimers: Map<string, NodeJS.Timeout> = new Map();

// 全局规则集更新检查定时器
let ruleProviderGlobalTimer: NodeJS.Timeout | null = null;

// 检查间隔（秒）- 用于检查是否到了更新时间
const CHECK_INTERVAL = 60;

// 上次更新时间记录
const lastProfileUpdate: Map<string, Date> = new Map();
const lastRuleProviderUpdate: Map<string, Date> = new Map();

// 全局规则集更新间隔（秒）
let ruleProviderGlobalInterval: number = 0;
let onRuleProviderUpdatedHook: (() => Promise<void> | void) | null = null;
let onProfileUpdatedHook: ((profileId: string) => Promise<void> | void) | null = null;

// getProfilesDir 和 getRulesetsDir 现在由 paths.ts 模块统一管理

/**
 * 保存订阅配置文件
 */
function saveProfileFile(profileId: string, content: string): string {
    const profilesDir = getProfilesDir();
    const filePath = path.join(profilesDir, `profile_${profileId}`);
    const cleanContent = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
    fs.writeFileSync(filePath, cleanContent, 'utf8');
    return filePath;
}

/**
 * 下载并更新订阅配置
 */
async function updateProfile(profileId: string): Promise<boolean> {
    const profile = dbUtils.getProfileById(profileId);
    if (!profile) {
        log.warn(`Profile ${profileId} not found, skipping update`);
        return false;
    }

    if (!profile.url) {
        log.warn(`Profile ${profileId} has no URL, skipping update`);
        return false;
    }

    log.info(`开始更新订阅配置: ${profile.name} (ID: ${profileId})`);
    log.info(`订阅地址: ${profile.url}`);

    const subscriptionUserAgent = getSubscriptionUserAgent();
    log.info(`User-Agent: ${subscriptionUserAgent}`);

    try {
        const response = await axios.get(profile.url, {
            timeout: 10000,
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': subscriptionUserAgent,
            }
        });

        const buffer = Buffer.from(response.data);
        const detected = jschardet.detect(buffer);
        let content: string;

        if (detected.encoding && detected.encoding.toLowerCase() !== 'utf-8' && detected.encoding.toLowerCase() !== 'ascii') {
            log.debug(`检测到编码: ${detected.encoding}, 转换为 UTF-8`);
            content = iconv.decode(buffer, detected.encoding);
        } else {
            content = buffer.toString('utf-8');
        }

        if (content.charCodeAt(0) === 0xfeff) {
            content = content.slice(1);
        }

        content = validateProfileContent(content);

        const filePath = saveProfileFile(profileId, content);
        dbUtils.updateProfileContent(profileId, filePath, new Date().toISOString());

        // 从响应头提取订阅用户信息（流量、过期时间）并写入数据库
        const userinfoHeader = response.headers['subscription-userinfo'];
        const userinfo = parseSubscriptionUserinfo(userinfoHeader);
        if (userinfo) {
            dbUtils.updateProfileSubscriptionInfo(profileId, userinfo);
            log.debug(`Profile ${profileId} userinfo: upload=${userinfo.upload} download=${userinfo.download} total=${userinfo.total} expire=${userinfo.expire}`);
        }

        lastProfileUpdate.set(profileId, new Date());

        // 调用订阅更新钩子（用于通知前端刷新）
        if (onProfileUpdatedHook) {
            await onProfileUpdatedHook(profileId);
        }

        log.info(`订阅配置更新成功: ${profile.name} (ID: ${profileId})`);
        log.debug(`文件保存至: ${filePath}`);
        return true;
    } catch (err: any) {
        log.error(`订阅配置更新失败: ${profile.name} (ID: ${profileId}) - ${err.message}`);
        return false;
    }
}

/**
 * 下载并更新规则集
 */
async function updateRuleProvider(providerId: string): Promise<boolean> {
    const provider = dbUtils.getRuleProviderById(providerId);
    if (!provider) {
        log.warn(`RuleProvider ${providerId} not found, skipping update`);
        return false;
    }

    if (!provider.url) {
        log.warn(`RuleProvider ${providerId} has no URL, skipping update`);
        return false;
    }

    log.info(`开始更新规则集: ${provider.name} (ID: ${providerId})`);
    log.info(`规则集地址: ${provider.url}`);

    try {
        const providerType = (provider.type || 'clash') as 'clash' | 'singbox';
        const result = await downloadAndConvertRuleSet(providerId, provider.url, providerType);
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        if (result.srsPath) {
            dbUtils.updateRuleProviderContent(providerId, result.srsPath, new Date().toISOString());
        }
        
        lastRuleProviderUpdate.set(providerId, new Date());
        // 注意：不再在这里调用 hook，由批量更新函数统一调用

        log.info(`规则集更新成功: ${provider.name} (ID: ${providerId})`);
        log.debug(`文件保存至: ${result.srsPath}`);
        return true;
    } catch (err: any) {
        log.error(`规则集更新失败: ${provider.name} (ID: ${providerId}) - ${err.message}`);
        return false;
    }
}

export function setRuleProviderUpdatedHook(hook: (() => Promise<void> | void) | null) {
    onRuleProviderUpdatedHook = hook;
}

export function setProfileUpdatedHook(hook: ((profileId: string) => Promise<void> | void) | null) {
    onProfileUpdatedHook = hook;
}

/**
 * 启动订阅配置的定时更新
 */
function startProfileScheduler(profileId: string, intervalSeconds: number) {
    // 如果已存在定时器，先清除
    if (profileTimers.has(profileId)) {
        const existingTimer = profileTimers.get(profileId);
        if (existingTimer) {
            clearInterval(existingTimer);
        }
    }

    log.info(`启动订阅配置定时更新: Profile ${profileId}, 间隔 ${intervalSeconds} 秒`);

    // 记录启动时间
    lastProfileUpdate.set(profileId, new Date());

    // 创建定时器，每分钟检查一次是否需要更新
    const timer = setInterval(async () => {
        const lastUpdate = lastProfileUpdate.get(profileId);
        const now = new Date();

        if (!lastUpdate) {
            // 没有记录，立即更新
            await updateProfile(profileId);
            return;
        }

        const elapsedSeconds = Math.floor((now.getTime() - lastUpdate.getTime()) / 1000);
        if (elapsedSeconds >= intervalSeconds) {
            log.debug(`订阅配置 ${profileId} 已经过 ${elapsedSeconds} 秒，需要更新`);
            await updateProfile(profileId);
        }
    }, CHECK_INTERVAL * 1000);

    profileTimers.set(profileId, timer);
}

/**
 * 批量检查并更新所有需要更新的规则集
 * 等所有更新完成后，只调用一次 hook
 */
async function checkAndUpdateAllRuleProviders(): Promise<void> {
    if (ruleProviderGlobalInterval <= 0) {
        return;
    }

    const providers = dbUtils.getRuleProviders().filter((p) => p.enabled && p.url && !p.profile_id);
    const now = new Date();
    const providersToUpdate: string[] = [];

    for (const provider of providers) {
        const lastUpdate = lastRuleProviderUpdate.get(provider.id);
        if (!lastUpdate) {
            providersToUpdate.push(provider.id);
        } else {
            const elapsedSeconds = Math.floor((now.getTime() - lastUpdate.getTime()) / 1000);
            if (elapsedSeconds >= ruleProviderGlobalInterval) {
                providersToUpdate.push(provider.id);
            }
        }
    }

    if (providersToUpdate.length === 0) {
        return;
    }

    log.info(`批量更新规则集: ${providersToUpdate.length} 个需要更新`);

    // 依次更新所有规则集
    for (const providerId of providersToUpdate) {
        try {
            await updateRuleProvider(providerId);
        } catch (err: any) {
            log.error(`规则集 ${providerId} 更新失败: ${err.message}`);
        }
    }

    // 所有更新完成后，只调用一次 hook
    if (onRuleProviderUpdatedHook) {
        try {
            await onRuleProviderUpdatedHook();
            log.info('规则集批量更新完成，已通知前台');
        } catch (err: any) {
            log.error(`规则集更新 hook 调用失败: ${err.message}`);
        }
    }
}

/**
 * 启动规则集的定时更新（使用全局定时器）
 */
function startRuleProviderScheduler(providerId: string, intervalSeconds: number) {
    // 记录启动时间
    lastRuleProviderUpdate.set(providerId, new Date());
    log.debug(`记录规则集启动时间: Provider ${providerId}`);
}

/**
 * 启动全局规则集更新检查定时器
 */
function startGlobalRuleProviderTimer(intervalSeconds: number) {
    // 如果已存在全局定时器，先清除
    if (ruleProviderGlobalTimer) {
        clearInterval(ruleProviderGlobalTimer);
        ruleProviderGlobalTimer = null;
    }

    ruleProviderGlobalInterval = intervalSeconds;

    if (intervalSeconds <= 0) {
        log.info('规则集全局更新已禁用');
        return;
    }

    log.info(`启动规则集全局定时更新检查，间隔 ${CHECK_INTERVAL} 秒`);

    // 创建全局定时器，每分钟检查一次是否有规则集需要更新
    ruleProviderGlobalTimer = setInterval(async () => {
        await checkAndUpdateAllRuleProviders();
    }, CHECK_INTERVAL * 1000);
}

/**
 * 初始化所有定时任务
 * 从数据库加载所有配置，启动相应的定时器
 */
export function initSchedulers() {
    log.info('初始化定时任务调度器...');

    // 清除所有现有定时器
    profileTimers.forEach((timer) => clearInterval(timer));
    profileTimers.clear();
    lastProfileUpdate.clear();
    lastRuleProviderUpdate.clear();

    // 加载需要自动更新的订阅配置
    const autoUpdateProfiles = dbUtils.getAutoUpdateProfiles();
    log.info(`发现 ${autoUpdateProfiles.length} 个需要自动更新的订阅配置`);

    for (const profile of autoUpdateProfiles) {
        if (profile.updateInterval && profile.updateInterval > 0) {
            startProfileScheduler(profile.id, profile.updateInterval);
        }
    }

    // 加载需要自动更新的规则集（使用全局更新间隔）
    const ruleProviders = dbUtils.getRuleProviders();
    const globalInterval = parseInt(dbUtils.getSetting('rule-provider-update-interval', '86400') || '86400', 10) || 0;
    const autoUpdateProviders = ruleProviders.filter((p) => p.enabled && p.url && !p.profile_id);
    log.info(
        globalInterval > 0
            ? `发现 ${autoUpdateProviders.length} 个规则集，全局更新间隔 ${globalInterval} 秒`
            : `发现 ${autoUpdateProviders.length} 个规则集，更新已禁用`
    );

    // 记录所有规则集的启动时间
    if (globalInterval > 0) {
        for (const provider of autoUpdateProviders) {
            startRuleProviderScheduler(provider.id, globalInterval);
        }
        // 启动全局定时器
        startGlobalRuleProviderTimer(globalInterval);
    }

    log.info('定时任务调度器初始化完成');
}

/**
 * 停止所有定时任务
 */
export function stopAllSchedulers() {
    log.info('停止所有定时任务...');

    profileTimers.forEach((timer, profileId) => {
        clearInterval(timer);
        log.info(`停止订阅配置定时更新: Profile ${profileId}`);
    });
    profileTimers.clear();

    // 停止全局规则集定时器
    if (ruleProviderGlobalTimer) {
        clearInterval(ruleProviderGlobalTimer);
        ruleProviderGlobalTimer = null;
        log.info('停止规则集全局定时更新');
    }

    lastProfileUpdate.clear();
    lastRuleProviderUpdate.clear();
    ruleProviderGlobalInterval = 0;

    log.info('所有定时任务已停止');
}

/**
 * 手动触发订阅配置更新
 */
export async function triggerProfileUpdate(profileId: string): Promise<boolean> {
    return await updateProfile(profileId);
}

/**
 * 手动触发规则集更新
 */
export async function triggerRuleProviderUpdate(providerId: string): Promise<boolean> {
    return await updateRuleProvider(providerId);
}
