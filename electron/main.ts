// UAC 提升后新进程不继承 env，通过 --vite-dev-url 传递开发服务器地址
const viteDevUrlArg = process.argv.find((a) => a.startsWith('--vite-dev-url='));
if (viteDevUrlArg) {
    process.env.VITE_DEV_SERVER_URL = viteDevUrlArg.slice('--vite-dev-url='.length);
}

// 抑制 axios 等第三方库使用 url.parse() 的弃用警告
process.removeAllListeners('warning');
process.on('warning', (warning) => {
    // 忽略 DEP0169 url.parse() 弃用警告
    if (warning.name === 'DeprecationWarning' && warning.message.includes('url.parse()')) {
        return;
    }
    console.warn(warning);
});

import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import { setCachedIsServiceInstalled, getCachedIsServiceInstalled } from './roverservice-cache';

// UAC 以管理员运行后白屏：Chromium 沙箱与提升权限冲突，需禁用沙箱
// 见 https://github.com/electron/electron/issues/49167
// 注意：管理员权限检测移到 app.whenReady() 中进行，以便使用日志系统

import path from 'node:path';
import fs from 'node:fs';
import * as dbUtils from './db';
import * as singbox from './singbox';
import * as proxy from './proxy';
import { createTray, updateTrayMenu } from './tray';
import * as scheduler from './scheduler';
import { initLogger, createLogger, getLogDir, getLogFiles, clearAllLogs, redirectConsole, log as loggerLog, logBatch } from './logger';
import { getDataDir, getProfilesDir,  resolveDataPath, getAppRootPath, getDistPath, getPublicPath, getPreloadPath, getTemplatesIndexPath, getPresetTemplatesPath, getBuildInfoPath, getSingboxLogPath, syncBuiltinRulesetsToUserData } from './paths';
import {
    getConfigPath,
    readConfig,
    generateConfigFile,
    getCurrentConfigRules,
    getAvailableOutbounds,
    POLICY_FINAL_OUTBOUND_VALUES,
    regenerateConfigForRuleProviderIfNeeded
} from './config-file';
import {
    loadPresetRulesets,
    getAllRuleSetsGrouped,
    addRuleProvidersFromPreset as addRuleProvidersFromPresetFn,
    registerRuleProviderIpcHandlers
} from './route-policy';
import { decompileSrsToJson } from './ruleset-utils';
import { validateProfileContent } from './validation';
import * as subscription from './subscription';
import { setTunDns, restoreDns } from './dns-macos';
import { fetchIpThroughProxy, fetchIpDirect } from './network-check';
import * as configBackup from './config-backup';
import type { LogLevel, LogEntry } from './logger';

const log = createLogger('Main');



// 从 subscription 模块重新导出辅助函数
const { saveProfileFile, readProfileContent } = subscription;

function sendToRenderer(channel: string, ...args: any[]) {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(w => {
        if (!w.isDestroyed()) {
            w.webContents.send(channel, ...args);
        }
    });
}

registerRuleProviderIpcHandlers(ipcMain, sendToRenderer, log);

// @ts-ignore
globalThis.__filename = '';
// @ts-ignore
globalThis.__dirname = '';

// IPC Handlers for Auto-launch
ipcMain.handle('core:setAutoLaunch', (_, enable) => {
    app.setLoginItemSettings({
        openAtLogin: enable,
        path: app.getPath('exe'),
    });
});

ipcMain.handle('core:getAutoLaunch', () => {
    return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle('core:openUserDataPath', () => {
    shell.openPath(getDataDir());
});

ipcMain.handle('core:openExternalUrl', (_, url: string) => {
    if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
        shell.openExternal(url);
    }
});

// 配置导出/导入
ipcMain.handle('config:export', async (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender) || undefined;
    const defaultName = `rover-config-${new Date().toISOString().slice(0, 10)}.zip`;
    const result = await dialog.showSaveDialog(parentWindow, {
        title: '导出应用配置',
        defaultPath: defaultName,
        filters: [{ name: 'ZIP 备份', extensions: ['zip'] }, { name: 'All Files', extensions: ['*'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, path: null };
    try {
        const buffer = configBackup.createBackupZipBuffer();
        fs.writeFileSync(result.filePath, buffer);
        log.info(`[Config] export success: ${result.filePath}`);
        await dialog.showMessageBox(parentWindow ?? undefined, {
            type: 'info',
            title: '导出成功',
            message: '配置已导出',
            detail: result.filePath,
        });
        return { ok: true, path: result.filePath };
    } catch (err: any) {
        log.error(`[Config] export failed: ${err?.message || err}`);
        throw err;
    }
});

ipcMain.handle('config:import', async (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender) || undefined;
    const result = await dialog.showOpenDialog(parentWindow, {
        title: '导入应用配置',
        filters: [{ name: 'ZIP 备份', extensions: ['zip'] }, { name: 'All Files', extensions: ['*'] }],
        properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { ok: false };
    try {
        configBackup.restoreFromZip(result.filePaths[0]);
        scheduler.initSchedulers();
        log.info(`[Config] import success: ${result.filePaths[0]}`);

        // 导入成功后：下载订阅配置、重新生成主配置、尝试重启内核
        sendToRenderer('config-generate-start');
        sendToRenderer('config-import-step', 'restoring');
        try {
            const profiles = dbUtils.getProfiles();
            const remoteProfiles = profiles.filter((p) => p.type === 'remote' && p.url);
            if (remoteProfiles.length > 0) {
                sendToRenderer('config-import-step', 'downloading');
                log.info(`[Config] importing: downloading ${remoteProfiles.length} remote profile(s)`);
                const downloadResults = await Promise.allSettled(
                    remoteProfiles.map((p) => subscription.downloadProfile(p.id))
                );
                const failed = downloadResults.filter((r) => r.status === 'rejected');
                if (failed.length > 0) {
                    log.warn(`[Config] import: ${failed.length} profile(s) download failed`);
                }
            }

            const selectedProfile = dbUtils.getSelectedProfile();
            if (selectedProfile) {
                sendToRenderer('config-import-step', 'generating');
                log.info(`[Config] import: regenerating config for profile=${selectedProfile.id}`);
                await generateConfigFile(selectedProfile.id, sendToRenderer);
                // generateConfigFile 内部已发送 config-generate-end
            } else {
                log.info('[Config] import: no selected profile, skip config regeneration');
            }
            sendToRenderer('config-import-step', 'done');
        } finally {
            // 无选中 profile 时 generateConfigFile 未调用，需手动发送 end 以关闭 loading
            const selectedProfile = dbUtils.getSelectedProfile();
            if (!selectedProfile) {
                sendToRenderer('config-generate-end');
            }
        }

        return { ok: true };
    } catch (err: any) {
        sendToRenderer('config-generate-end');
        log.error(`[Config] import failed: ${err?.message || err}`);
        throw err;
    }
});


scheduler.setRuleProviderUpdatedHook(async (providerId) => {
    try {
        await regenerateConfigForRuleProviderIfNeeded(providerId, 'rule provider auto-updated by scheduler', sendToRenderer, log);
    } catch (err: any) {
        log.error(`[Config] regenerate after scheduler update failed: ${err?.message || err}`);
    }
});

scheduler.setProfileUpdatedHook(async (profileId) => {
    try {
        // 1. 获取当前选中的订阅
        const selectedProfile = dbUtils.getSelectedProfile();

        // 2. 检查更新的是否为当前选中的订阅且存在
        if (selectedProfile && selectedProfile.id === profileId) {
            try {
                // 3. 重新生成配置文件
                await generateConfigFile(selectedProfile.id, sendToRenderer);

                // 4. 通知前端刷新
                sendToRenderer('profile-updated', profileId);
            } catch (err: any) {
                console.error('Failed to generate config:', err.message);
                throw err; // 抛出给外层 catch 统一记录日志
            }
        }
    } catch (err: any) {
        log.error(`[Config] regenerate after profile update failed: ${err?.message || err}`);
    }
});

// IPC Handlers for Database
ipcMain.handle('db:getProfiles', () => dbUtils.getProfiles());
ipcMain.handle('db:addProfile', (_, p) => {
    const id = dbUtils.addProfile(p);
    // 全量重新加载定时任务
    scheduler.initSchedulers();
    return id;
});
ipcMain.handle('db:deleteProfile', (_, id) => {
    dbUtils.deleteProfile(id);
    // 全量重新加载定时任务
    scheduler.initSchedulers();
});
ipcMain.handle('db:selectProfile', (_, id) => dbUtils.selectProfile(id));
ipcMain.handle('db:getSetting', (_, key, defaultValue) => dbUtils.getSetting(key, defaultValue));
ipcMain.handle('db:setSetting', async (_, key, value) => {
    dbUtils.setSetting(key, value);
    if (key === 'rule-provider-update-interval') {
        scheduler.initSchedulers();
    }
    // TUN 模式切换时重置控制器，下次启动时将根据新设置自动选择正确的控制器
    if (key === 'dashboard-tun-mode') {
        await singbox.resetController();
        log.info(`[DB] TUN 模式已${value === 'true' ? '启用' : '禁用'}，控制器已重置`);
    }
});
ipcMain.handle('db:setPolicyFinalOutbound', async (_, value: string) => {
    if (!POLICY_FINAL_OUTBOUND_VALUES.has(value)) {
        throw new Error('Invalid policy final outbound value');
    }
    dbUtils.setSetting('policy-final-outbound', value);
});
ipcMain.handle('db:updateProfileDetails', (_, id, name, url, updateInterval) => {
    dbUtils.updateProfileDetails(id, name, url, updateInterval);
    // 全量重新加载定时任务
    scheduler.initSchedulers();
});
ipcMain.handle('db:updateProfileInterval', (_, id, updateInterval) => {
    dbUtils.updateProfileInterval(id, updateInterval);
    // 全量重新加载定时任务
    scheduler.initSchedulers();
});

// IPC Handlers for Scheduler
// 定时任务已改为全量更新，在数据库操作后自动调用 initSchedulers()
ipcMain.handle('db:getProfileContent', (_, id: string) => {
    const profile = dbUtils.getProfileById(id);
    const profilePath = profile?.path ? resolveDataPath(profile.path) : undefined;
    return readProfileContent(id, profilePath);
});
ipcMain.handle('db:getAllSettings', () => dbUtils.getAllSettings());

// IPC Handlers for Rule Providers
ipcMain.handle('db:getRuleProviders', () => dbUtils.getRuleProviders());
ipcMain.handle('db:updateRuleProvider', async (_, id, updates) => {
    dbUtils.updateRuleProvider(id, updates);
    scheduler.initSchedulers();
});
ipcMain.handle('db:deleteRuleProvider', async (_, id) => {
    dbUtils.deleteRuleProvider(id);
    scheduler.initSchedulers();
});

// IPC Handlers for Policies
ipcMain.handle('db:getPolicies', () => dbUtils.getPolicies());
ipcMain.handle('db:addPolicy', (_, policy) => {
    return dbUtils.addPolicy(policy);
});
ipcMain.handle('db:updatePolicy', (_, id, updates) => {
    dbUtils.updatePolicy(id, updates);
});
ipcMain.handle('db:deletePolicy', (_, id) => {
    dbUtils.deletePolicy(id);
});
ipcMain.handle('db:addPoliciesBatch', (_, policies, clearFirst?: boolean) => {
    return dbUtils.addPoliciesBatch(policies, clearFirst);
});
ipcMain.handle('db:updatePoliciesOrder', (_, orders) => {
    dbUtils.updatePoliciesOrder(orders);
});
// Profile Policies
ipcMain.handle('db:getProfilePolicyByPolicyId', (_, profileId, policyId) => dbUtils.getProfilePolicyByPolicyId(profileId, policyId));
ipcMain.handle('db:setProfilePolicy', (_, profileId, policyId, preferredOutbounds) => dbUtils.setProfilePolicy(profileId, policyId, preferredOutbounds));
// DNS Policies (配置生成在前端触发)
ipcMain.handle('db:getDnsPolicies', () => dbUtils.getDnsPolicies());
ipcMain.handle('db:addDnsPolicy', (_, policy) => dbUtils.addDnsPolicy(policy));
ipcMain.handle('db:updateDnsPolicy', (_, id, updates) => dbUtils.updateDnsPolicy(id, updates));
ipcMain.handle('db:deleteDnsPolicy', (_, id) => dbUtils.deleteDnsPolicy(id));
ipcMain.handle('db:updateDnsPoliciesOrder', (_, orders) => dbUtils.updateDnsPoliciesOrder(orders));
// Profile DNS Policies
ipcMain.handle('db:getProfileDnsPolicyByPolicyId', (_, profileId, dnsPolicyId) => dbUtils.getProfileDnsPolicyByPolicyId(profileId, dnsPolicyId));
ipcMain.handle('db:setProfileDnsPolicy', (_, profileId, dnsPolicyId, dnsServerId) => dbUtils.setProfileDnsPolicy(profileId, dnsPolicyId, dnsServerId));
ipcMain.handle('db:getDnsServers', () => dbUtils.getDnsServers());
ipcMain.handle('db:getDnsServerRefs', (_, tag: string) => dbUtils.getDnsServerRefs(tag));
ipcMain.handle('db:addDnsServer', (_, server: any) => dbUtils.addDnsServer(server));
ipcMain.handle('db:updateDnsServer', (_, id: string, updates: any) => dbUtils.updateDnsServer(id, updates));
ipcMain.handle('db:deleteDnsServer', (_, id: string) => dbUtils.deleteDnsServer(id));

ipcMain.handle('core:getPresetRulesets', () => loadPresetRulesets());
ipcMain.handle('core:getAllRuleSetsGrouped', () => getAllRuleSetsGrouped());

ipcMain.handle('core:addRuleProvidersFromPreset', async (_, aclIds: string[]) => {
    return addRuleProvidersFromPresetFn(aclIds, () => Promise.resolve(true));
});


// 获取模板列表（从 resources/presets/templates.json）
ipcMain.handle('core:getTemplates', async () => {
    try {
        const templatesPath = getTemplatesIndexPath();
        if (!fs.existsSync(templatesPath)) {
            return [];
        }
        const content = fs.readFileSync(templatesPath, 'utf8');
        const templates = JSON.parse(content);
        return templates || [];
    } catch (e) {
        console.error('Failed to load templates.json:', e);
        return [];
    }
});

// 获取指定模板的策略列表（包含 dns 和 rule_unmatched_outbound）
ipcMain.handle('core:getTemplatePolicies', async (_, templatePath: string) => {
    try {
        const fullPath = path.join(getPresetTemplatesPath(), templatePath);
        if (!fs.existsSync(fullPath)) {
            return { rules: [] };
        }
        const content = fs.readFileSync(fullPath, 'utf8');
        const data = JSON.parse(content);
        return {
            rules: data.rules || [],
            dns: data.dns,
            rule_unmatched_outbound: data.rule_unmatched_outbound
        };
    } catch (e) {
        console.error('Failed to load template:', templatePath, e);
        return { rules: [] };
    }
});

// 查看规则集内容：统一返回反编译后的 JSON
ipcMain.handle('core:getRuleProviderViewContent', async (_, providerId: string) => {
    const provider = dbUtils.getRuleProviderById(providerId);
    if (!provider) throw new Error('规则集不存在');
    const filePath = provider.path ? resolveDataPath(provider.path) : null;
    if (!filePath || !fs.existsSync(filePath)) {
        throw new Error('规则集文件不存在，请先刷新下载');
    }


      
        const content = decompileSrsToJson(filePath);

    return { content: content, error: '' };
});

ipcMain.handle('core:getCurrentConfigRules', async () => {
    try {
        return getCurrentConfigRules();
    } catch (e) {
        console.error('Failed to get current config rules:', e);
        return [];
    }
});

// IPC Handlers for Sing-box Core
ipcMain.handle('core:isRunning', () => singbox.isSingboxRunning());
ipcMain.handle('core:getStartTime', () => singbox.getSingboxStartTime());
ipcMain.handle('core:stop', async () => {
    log.info('IPC core:stop');

    // macOS TUN 模式：恢复系统 DNS
    if (process.platform === 'darwin') {
        log.info('[core:stop] macOS, restoring system DNS...');
        await restoreDns();
    }

    return singbox.stopSingbox();
});

ipcMain.handle('core:restart', async () => {
    try {
        log.info('IPC core:restart 开始重启内核');
        log.info('[重启内核] 正在停止当前内核...');

        // macOS TUN 模式：恢复系统 DNS
        if (process.platform === 'darwin') {
            log.info('[重启内核] macOS, restoring system DNS...');
            await restoreDns();
        }

        await singbox.stopSingbox();
        log.info('[重启内核] 内核已停止，等待 500ms 后重新启动');
        await new Promise((r) => setTimeout(r, 500));
        const configPath = getConfigPath();
        if (!fs.existsSync(configPath)) {
            log.error('[重启内核] config.json 不存在');
            throw new Error('config.json not found. Please generate the config first.');
        }
        log.info(`[重启内核] 配置文件: ${configPath}`);
        const binaryPath = singbox.getSingboxBinaryPath();
        if (!fs.existsSync(binaryPath)) {
            log.error(`[重启内核] Sing-box 二进制不存在: ${binaryPath}`);
            throw new Error(`Sing-box binary not found at ${binaryPath}`);
        }
        log.info(`[重启内核] 二进制路径: ${binaryPath}`);
        await singbox.startSingbox(configPath, binaryPath);

        // macOS TUN 模式：设置系统 DNS
        if (process.platform === 'darwin' && singbox.isTunModeEnabled()) {
            log.info('[重启内核] macOS TUN mode enabled, setting system DNS...');
            await setTunDns();
        }

        log.info('[重启内核] 内核已成功重启');
        return true;
    } catch (err: any) {
        log.error(`[重启内核] 失败: ${err?.message || err}`);
        throw err;
    }
});

ipcMain.handle('core:setSystemProxy', (_, enable) => proxy.setSystemProxy(enable));
ipcMain.handle('core:getSystemProxyStatus', () => proxy.getSystemProxyStatus());

// 网络检测：内核运行中走代理，未启动走直连
ipcMain.handle('core:fetchIpThroughProxy', async () => {
    log.info('[网络检测] 收到代理检测请求');
    try {
        return await fetchIpThroughProxy();
    } catch (e: any) {
        log.warn(`[网络检测] 通过代理获取 IP 失败: ${e?.message || e}`);
        return null;
    }
});
ipcMain.handle('core:fetchIpDirect', async () => {
    log.info('[网络检测] 收到直连检测请求');
    try {
        return await fetchIpDirect();
    } catch (e: any) {
        log.warn(`[网络检测] 直连获取 IP 失败: ${e?.message || e}`);
        return null;
    }
});

// 更新托盘菜单
ipcMain.handle('core:updateTrayMenu', () => {
    log.info('IPC core:updateTrayMenu');
    updateTrayMenu();
});

ipcMain.handle('core:isServiceInstalled', () => {
    return isServiceInstalled();
});

/**
 * 检测 RoverService 服务是否已安装
 */
function isServiceInstalled(): boolean {
    // 非支持平台返回 false
    if (!roverservice.isSupported()) return false;

    // 使用缓存的值（启动时计算）
    return getCachedIsServiceInstalled();
}


// 使用 subscription 模块处理订阅相关 IPC 调用
ipcMain.handle('core:updateProfile', async (_, profileId) => {
    return await subscription.downloadProfile(profileId);
});

ipcMain.handle('core:addSubscriptionProfile', async (_, url: string) => {
    return await subscription.addSubscriptionProfile(url);
});

ipcMain.handle('core:importLocalProfile', async (event) => {
    const parentWindow = BrowserWindow.fromWebContents(event.sender) || undefined;
    const result = await dialog.showOpenDialog(parentWindow, {
        title: 'Import Local Profile',
        filters: [
            { name: 'Config Files', extensions: ['yaml', 'yml', 'json'] },
            { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
    });

    if (result.canceled || result.filePaths.length === 0) {
        return null; // User cancelled
    }

    const filePath = result.filePaths[0];
    const fileName = path.basename(filePath);

    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const validatedContent = validateProfileContent(content);

        // Save to profiles directory (source file without extension)
        const tempProfileId = Date.now(); // Temporary ID for filename
        const savedFilePath = saveProfileFile(tempProfileId, validatedContent);

        // Add to database (without content)
        const profileId = dbUtils.addProfile({ name: fileName, type: 'local', path: savedFilePath });

        // Rename file with actual profile ID (no extension)
        const finalFilePath = path.join(getProfilesDir(), `profile_${profileId}`);
        if (savedFilePath !== finalFilePath) {
            fs.renameSync(savedFilePath, finalFilePath);
            dbUtils.updateProfileContent(profileId, finalFilePath);
        }

        return profileId;
    } catch (err: any) {
        console.error('Failed to import local profile:', err);
        throw new Error(`Failed to import local profile: ${err.message}`);
    }
});

ipcMain.handle('core:getActiveConfig', async () => {
    try {
        console.log(`Getting active config from ${getConfigPath()}...`);
        return readConfig();
    } catch (e) {
        console.error('Failed to get active config:', e);
        // 解析错误等需要抛给前端显示，只有文件不存在时 readConfig 才返回 null（不会进 catch）
        throw e;
    }
});

ipcMain.handle('core:getAvailableOutbounds', async () => {
    try {
        return getAvailableOutbounds();
    } catch (e) {
        console.error('Failed to get available outbounds:', e);
        return [];
    }
});


ipcMain.handle('core:getSelectedProfile', async () => {
    try {
        const profile = dbUtils.getSelectedProfile();
        if (!profile) return null;
        const config = readConfig();
        if (!config) {
            console.log('config.json not found, profile may not be started yet');
            return { profile, config: null };
        }
        return { profile, config };
    } catch (e) {
        console.error('Failed to get selected profile:', e);
        return null;
    }
});

ipcMain.handle('core:generateConfig', async () => {
    try {
        const selectedProfile = dbUtils.getSelectedProfile();
        log.info(`IPC core:generateConfig profile=${selectedProfile?.id ?? 'none'}`);
        if (!selectedProfile) {
            throw new Error('No profile selected');
        }
        const result = await generateConfigFile(selectedProfile.id, sendToRenderer);
        log.info(`Config generated successfully at ${result}`);
        return result;
    } catch (err: any) {
        log.error(`Failed to generate config: ${err.message}`);
        throw err;
    }
});

ipcMain.handle('core:start', async () => {
    try {
        const selectedProfile = dbUtils.getSelectedProfile();
        log.info(`IPC core:start profile=${selectedProfile?.id ?? 'none'}`);
        console.log(`Starting profile ${selectedProfile?.id ?? 'none'}...`);
        // 不再在 run 方法内部直接写入 config.json，前端会先调用 generateConfig 生成好配置
        const configPath = getConfigPath();

        if (!fs.existsSync(configPath)) {
            throw new Error('config.json not found. Please generate the config first.');
        }

        // 迁移：修复旧版写入的根级 config.mode（sing-box 不支持，需在 experimental.clash_api.default_mode）
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.mode !== undefined) {
            const mode = config.mode;
            delete config.mode;
            if (!config.experimental) config.experimental = {};
            if (!config.experimental.clash_api) config.experimental.clash_api = {};
            config.experimental.clash_api.default_mode = mode;
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
            console.log(`[Config] Migrated config.mode to experimental.clash_api.default_mode: ${mode}`);
        }

        const binaryPath = singbox.getSingboxBinaryPath();
        console.log(`Starting sing-box using binary: ${binaryPath}`);

        if (!fs.existsSync(binaryPath)) {
            throw new Error(`Sing-box binary not found at ${binaryPath}`);
        }

        await singbox.startSingbox(configPath, binaryPath);

        // macOS TUN 模式：设置系统 DNS
        if (process.platform === 'darwin' && singbox.isTunModeEnabled()) {
            log.info('[core:start] macOS TUN mode enabled, setting system DNS...');
            const dnsResult = await setTunDns();
            if (!dnsResult) {
                log.warn('[core:start] Failed to set TUN DNS, but sing-box is running');
            }
        }

        return true;
    } catch (err: any) {
        console.error('Failed to start core:', err.message);
        throw err;
    }
});

// Get build information (app version, singbox version, etc.)
ipcMain.handle('core:getBuildInfo', async () => {
    try {
        const buildInfoPath = getBuildInfoPath();
        if (!fs.existsSync(buildInfoPath)) {
            console.warn('build.json not found at:', buildInfoPath);
            return {
                appVersion: 'unknown',
                singboxVersion: 'unknown',
                buildTime: new Date().toISOString(),
                buildNumber: 'dev'
            };
        }
        
        const content = fs.readFileSync(buildInfoPath, 'utf8');
        const buildInfo = JSON.parse(content);
        return buildInfo;
    } catch (error) {
        console.error('Failed to read build.json:', error);
        return {
            appVersion: 'unknown',
            singboxVersion: 'unknown',
            buildTime: new Date().toISOString(),
            buildNumber: 'dev'
        };
    }
});

// The built directory structure
//
// ├─┬ dist
// │ ├─┬ electron
// │ │ ├── main.js
// │ │ └── preload.js
// │ ├── index.html
// │ └── ... renderer assets

// 使用 paths.ts 中的统一路径管理函数
const appRootPath = getAppRootPath();
const distPath = getDistPath();
const publicPath = getPublicPath();

process.env.DIST = distPath;
process.env.VITE_PUBLIC = publicPath;

// 调试日志：帮助诊断路径问题
console.log('[Path Debug] app.isPackaged:', app.isPackaged);
console.log('[Path Debug] app.getAppPath():', app.getAppPath());
console.log('[Path Debug] appRootPath:', appRootPath);
console.log('[Path Debug] process.env.DIST:', process.env.DIST);
console.log('[Path Debug] process.env.VITE_PUBLIC:', process.env.VITE_PUBLIC);
console.log('[Path Debug] DIST exists:', fs.existsSync(process.env.DIST as string));
if (fs.existsSync(process.env.DIST as string)) {
    console.log('[Path Debug] DIST contents:', fs.readdirSync(process.env.DIST as string));
}

function getWindowIconPath(): string {
    const icoPath = path.join(publicPath, 'icon.ico');
    const pngPath = path.join(publicPath, 'icon.png');
    return fs.existsSync(icoPath) ? icoPath : pngPath;
}

let win: BrowserWindow | null;
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

let isQuitting = false;

function createWindow() {
    console.log('Creating main window...');
    win = new BrowserWindow({
        width: 1000,
        height: 700,
        show: false, // Set to false to avoid flicker before ready-to-show
        backgroundColor: '#00000000', // Transparent for Mica
        backgroundMaterial: 'mica', // Windows 11 native material
        titleBarStyle: 'hidden',
        trafficLightPosition: { x: 16, y: 16 }, // Mac native traffic light placement
        vibrancy: 'sidebar', // Mac native blur
        visualEffectState: 'active', // Mac
        icon: getWindowIconPath(),
        titleBarOverlay: { // Windows native controls
            color: '#00000000', // transparent
            symbolColor: '#555',
            height: 40
        },
        webPreferences: {
            // 使用 paths.ts 中的统一路径管理函数
            preload: getPreloadPath(),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    console.log('Initializing tray...');
    try {
        createTray(win);
    } catch (e) {
        console.error('Failed to create tray:', e);
    }

    // Hide window instead of closing
    win.on('close', (event) => {
        if (!isQuitting) {
            console.log('Window close prevented, hiding instead');
            event.preventDefault();
            win?.hide();
        }
        return false;
    });

    win.on('ready-to-show', () => {
        console.log('Window ready to show, showing now');
        win?.show();
    });

    // Test active push message to Renderer-process.
    win.webContents.on('did-finish-load', () => {
        win?.webContents.send('main-process-message', (new Date()).toLocaleString());
    });

    if (VITE_DEV_SERVER_URL) {
        console.log(`Loading URL: ${VITE_DEV_SERVER_URL}`);
        win.loadURL(VITE_DEV_SERVER_URL);
    } else {
        const indexPath = path.join(process.env.DIST as string, 'index.html');
        console.log(`Loading File: ${indexPath}`);
        win.loadFile(indexPath);
    }

    // win.webContents.openDevTools(); // Open DevTools to debug renderer
}

app.on('window-all-closed', async () => {
    if (process.platform !== 'darwin') {
        isQuitting = true;
        log.info('app event: window-all-closed');
        console.log('Stopping sing-box before quit...');
        await singbox.stopSingbox();
        console.log('sing-box stopped, quitting app');
        app.quit();
        win = null;
    } else {
        // On macOS, keep the app running with dock icon visible
        console.log('Window closed on macOS, keeping app running with dock icon');
        // Show dock icon to indicate app is still running
        if (app.dock) {
            app.dock.show();
        }
    }
});

// 程序退出前检测内核退出
app.on('before-quit', async (event) => {
    if (isQuitting) return; // 已经在处理退出流程中

    event.preventDefault();
    isQuitting = true;
    log.info('app event: before-quit');
    console.log('Before quit: stopping scheduler and sing-box...');

    // 停止定时任务
    scheduler.stopAllSchedulers();

    // macOS TUN 模式：恢复系统 DNS
    if (process.platform === 'darwin') {
        log.info('[before-quit] macOS, restoring system DNS...');
        await restoreDns();
    }

    if (singbox.isSingboxRunning()) {
        await singbox.stopSingbox();
        console.log('sing-box stopped successfully');
    }

    app.quit();
});

app.on('activate', () => {
    console.log('App activated');
    // Show dock icon when app is activated
    if (app.dock) {
        app.dock.show();
    }
    
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    } else {
        // If windows exist but are hidden, show them
        if (win && win.isMinimized()) {
            win.restore();
        }
        if (win) {
            win.focus();
            win.show();
        }
    }
});

// IPC Handlers for Logger
ipcMain.handle('logger:getLogDir', () => getLogDir());
ipcMain.handle('logger:getLogFiles', () => getLogFiles());
ipcMain.handle('logger:clearAllLogs', () => clearAllLogs());
ipcMain.handle('logger:log', (_event, level: LogLevel, module: string, message: string) => loggerLog(level, module, message));
ipcMain.handle('logger:logBatch', (_event, entries: LogEntry[]) => logBatch(entries));

// 读取 sing-box 内核日志文件（本地文件，不调接口）
// 容错：编码回退、移除不可打印字符、读取异常时返回空
ipcMain.handle('singbox:readLog', async (_event, options?: { fromLine?: number }) => {
    const logPath = getSingboxLogPath();
    if (!fs.existsSync(logPath)) {
        return { lines: [], totalLines: 0 };
    }
    try {
        let buf: Buffer;
        try {
            buf = fs.readFileSync(logPath);
        } catch (readErr) {
            log.error(`读取 sing-box 日志文件失败: ${(readErr as Error).message}`);
            return { lines: [], totalLines: 0 };
        }
        let content: string;
        try {
            content = buf.toString('utf8');
        } catch {
            content = buf.toString('latin1');
        }
        // 移除不可打印字符，避免前端解析异常
        content = content.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
        const allLines = content.split(/\r?\n/);
        const totalLines = allLines.length;
        const fromLine = Math.max(0, options?.fromLine ?? 0);
        const lines = fromLine >= totalLines ? [] : allLines.slice(fromLine);
        return { lines, totalLines };
    } catch (err) {
        log.error(`读取 sing-box 日志失败: ${(err as Error).message}`);
        return { lines: [], totalLines: 0 };
    }
});

// 清理 sing-box 内核日志文件（写入空字符）
ipcMain.handle('singbox:clearLog', async () => {
    const logPath = getSingboxLogPath();
    try {
        fs.writeFileSync(logPath, '', 'utf-8');
        return { success: true };
    } catch (err) {
        log.error(`清理 sing-box 日志失败: ${(err as Error).message}`);
        return { success: false, error: (err as Error).message };
    }
});

// ==================== RoverService IPC Handlers ====================

// 导入 roverservice-client 模块
import * as roverservice from './roverservice-client';

ipcMain.handle('roverservice:getInstallationStatus', async () => {
    return roverservice.getInstallationStatus();
});

ipcMain.handle('roverservice:install', async (_, helperPath?: string) => {
    const result = await roverservice.installHelper(helperPath);
    // 安装成功后更新缓存
    if (result.success) {
        const isLoaded = roverservice.isServiceLoaded();
        setCachedIsServiceInstalled(isLoaded);
        log.info(`[RoverService] 安装完成，服务状态已缓存: ${isLoaded ? '服务已运行' : '服务未运行'}`);
    }
    return result;
});

ipcMain.handle('roverservice:uninstall', async () => {
    const result = await roverservice.uninstallHelper();
    // 卸载成功后更新缓存并重置控制器
    if (result.success) {
        setCachedIsServiceInstalled(false);
        // 重置控制器，下次启动时将根据 TUN 模式自动选择
        await singbox.resetController();
        log.info('[RoverService] 卸载完成，服务状态已缓存: 服务未安装');
    }
    return result;
});

// 防止重复启动：获取单实例锁
let gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    // 如果获取锁失败，说明已经有实例在运行，直接退出
    console.log('Another instance is already running, quitting...');
    app.quit();
} else {
    // 当第二个实例启动时，聚焦到已有的窗口
    app.on('second-instance', () => {
        console.log('Second instance detected, focusing main window...');
        if (win) {
            if (win.isMinimized()) {
                win.restore();
            }
            win.focus();
            win.show();
        }
    });
}

// 初始化日志系统并启动应用
console.log('App starting...');
app.whenReady().then(async () => {
    // 初始化日志系统
    initLogger({
        logLevel: 'info',
        enableConsole: true
    });

    // 重定向 console.log/error 到 logger
    redirectConsole();

    log.info('应用程序启动');
    log.info(`应用版本: ${app.getVersion()}`);
    log.info(`操作系统: ${process.platform} ${process.arch}`);
    log.info(`用户数据目录: ${getDataDir()}`);

    // 同步内置规则集到用户数据目录，确保 root 进程可以访问
    log.info('同步内置规则集到用户数据目录...');
    const syncResult = syncBuiltinRulesetsToUserData();
    if (syncResult.success) {
        log.info(`规则集同步完成: 复制了 ${syncResult.copied} 个文件`);
    } else {
        log.error(`规则集同步失败: ${syncResult.errors.join(', ')}`);
    }

    // 检测 RoverService 服务是否已安装并运行
    log.info('[RoverService] 检测 RoverService 服务安装状态...');
    const binaryInstalled = roverservice.isInstalled();
    const serviceRunning = roverservice.isServiceLoaded();
    // 服务需要二进制存在且服务正在运行
    const isInstalled = binaryInstalled && serviceRunning;
    setCachedIsServiceInstalled(isInstalled);
    log.info(`[RoverService] 检测结果: 二进制=${binaryInstalled}, 服务运行=${serviceRunning}, 缓存=${isInstalled ? '服务已安装' : '服务未安装'}`);

    // 清理无效的 profile.policies / profile.dnsPolicies 条目
    dbUtils.cleanupProfilePolicies();
    dbUtils.cleanupProfileDnsPolicies();

    // 简化逻辑：TUN 模式需要 RootService 服务
    // 如果开启 TUN 但 RootService 未安装，提示用户安装
    const tunModeEnabled = dbUtils.getSetting('dashboard-tun-mode') === 'true';
    const isServiceInstalledCached = getCachedIsServiceInstalled();
    
    log.info(`[启动检测] TUN模式: ${tunModeEnabled}, RootService已安装: ${isServiceInstalledCached}`);
    
    if (tunModeEnabled && !isServiceInstalledCached) {
        log.warn('[启动检测] TUN模式已启用但RootService未安装，请安装RootService以使用TUN模式');
    }

    createWindow();

    // Ensure dock icon is visible on macOS after app is ready
    if (process.platform === 'darwin' && app.dock) {
        console.log('Ensuring dock icon is visible on macOS...');
        try {
            app.dock.show();
        } catch (error) {
            console.error('Failed to show dock icon:', error);
        }
    }

    // 初始化定时任务调度器
    log.info('初始化定时任务调度器...');
    scheduler.initSchedulers();

    // 启动时自动打开内核（默认 true，未显式设为 false 时启用）
    const autoStartKernel = dbUtils.getSetting('auto-start-proxy');
    const shouldAutoStart = autoStartKernel !== 'false';
    if (shouldAutoStart) {
        log.info('启动自动打开内核已启用，正在启动内核...');
        (async () => {
            try {
                const selectedProfile = dbUtils.getSelectedProfile();
                if (!selectedProfile) {
                    log.warn('未选择配置，跳过自动启动内核');
                    return;
                }
                const configPath = getConfigPath();
                // 主程序启动时不再重新生成配置，仅使用已有配置
                if (!fs.existsSync(configPath)) {
                    log.warn('config.json 不存在，跳过自动启动内核（请手动启动）');
                    return;
                }
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (config.mode !== undefined) {
                    const mode = config.mode;
                    delete config.mode;
                    if (!config.experimental) config.experimental = {};
                    if (!config.experimental.clash_api) config.experimental.clash_api = {};
                    config.experimental.clash_api.default_mode = mode;
                    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
                }
                const binaryPath = singbox.getSingboxBinaryPath();
                if (!fs.existsSync(binaryPath)) {
                    log.error('Sing-box 二进制文件不存在');
                    return;
                }
                await singbox.startSingbox(configPath, binaryPath);

                // macOS TUN 模式：设置系统 DNS
                if (process.platform === 'darwin' && singbox.isTunModeEnabled()) {
                    log.info('[自动启动] macOS TUN mode enabled, setting system DNS...');
                    await setTunDns();
                }

                log.info('内核已自动启动');
            } catch (err: any) {
                log.error(`自动启动内核失败: ${err?.message || err}`);
            }
        })();
    }

    log.info('应用程序启动完成');
}).catch(err => {
    console.error('App failed to start:', err);
});
