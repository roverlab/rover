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
import { execSync } from 'node:child_process';

// UAC 以管理员运行后白屏：Chromium 沙箱与提升权限冲突，需禁用沙箱
// 见 https://github.com/electron/electron/issues/49167
if (process.platform === 'win32') {
    // 使用 whoami 检查管理员权限，比 net session 更可靠
    // S-1-5-32-544 是 Windows 内置管理员组的 SID
    let isAdmin = false;
    try {
        const output = execSync('whoami /groups', { encoding: 'utf8', windowsHide: true });
        isAdmin = output.includes('S-1-5-32-544');
    } catch {
        // whoami 失败时，尝试 net session 作为备选
        try {
            execSync('net session', { stdio: 'ignore', windowsHide: true });
            isAdmin = true;
        } catch {
            isAdmin = false;
        }
    }
    
    if (isAdmin) {
        app.commandLine.appendSwitch('no-sandbox');
        app.commandLine.appendSwitch('disable-gpu-sandbox');
    }
}

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { exec, spawn, spawnSync } from 'node:child_process';
import * as dbUtils from './db';
import * as singbox from './singbox';
import * as proxy from './proxy';
import { createTray, updateTrayMenu } from './tray';
import * as scheduler from './scheduler';
import { policiesToSingboxConfig } from '../src/types/policy';
import { initLogger, createLogger, getLogDir, getLogFiles, clearAllLogs, redirectConsole, log as loggerLog, logBatch } from './logger';
import { getDataDir, getProfilesDir, getGeoDir, resolveDataPath, getAppRootPath, getDistPath, getPublicPath, getPreloadPath, getTemplatesIndexPath, getPresetTemplatesPath, getBuildInfoPath } from './paths';
import {
    getConfigPath,
    readConfig,
    generateConfigFile,
    regenerateConfigIfOverrideRulesEnabled,
    regenerateConfigForRuleProviderIfNeeded,
    getCurrentConfigRules,
    getAvailableOutbounds,
    updateConfigFile,
    POLICY_FINAL_OUTBOUND_VALUES
} from './config-file';
import {
    loadPresetRulesets,
    loadBuiltinRulesets,
    addRuleProvidersFromPreset as addRuleProvidersFromPresetFn,
    buildProvidersForConfig,
    registerRuleProviderIpcHandlers
} from './route-policy';
import { decompileSrsToJson } from './ruleset-utils';
import { validateProfileContent } from './validation';
import * as subscription from './subscription';
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
ipcMain.handle('db:setSetting', (_, key, value) => {
    dbUtils.setSetting(key, value);
    if (key === 'rule-provider-update-interval') {
        scheduler.initSchedulers();
    }
});
ipcMain.handle('db:setPolicyFinalOutbound', async (_, value: string) => {
    if (!POLICY_FINAL_OUTBOUND_VALUES.has(value)) {
        throw new Error('Invalid policy final outbound value');
    }
    dbUtils.setSetting('policy-final-outbound', value);
    await regenerateConfigIfOverrideRulesEnabled('policy final outbound updated', sendToRenderer, log);
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
ipcMain.handle('db:getAutoUpdateProfiles', () => dbUtils.getAutoUpdateProfiles());

// IPC Handlers for Scheduler
// 定时任务已改为全量更新，在数据库操作后自动调用 initSchedulers()
ipcMain.handle('db:updateProfileContent', (_, id, content) => {
    const filePath = saveProfileFile(id, content);
    return dbUtils.updateProfileContent(id, filePath);
});
ipcMain.handle('db:getProfileContent', (_, id: string) => {
    const profile = dbUtils.getProfileById(id);
    const profilePath = profile?.path ? resolveDataPath(profile.path) : undefined;
    return readProfileContent(id, profilePath);
});
ipcMain.handle('db:getAllSettings', () => dbUtils.getAllSettings());

// IPC Handlers for Rule Providers
ipcMain.handle('db:getRuleProviders', () => dbUtils.getRuleProviders());
ipcMain.handle('db:addRuleProvider', (_, provider) => {
    const id = dbUtils.addRuleProvider(provider);
    // 全量重新加载定时任务
    scheduler.initSchedulers();
    return id;
});
ipcMain.handle('db:updateRuleProvider', async (_, id, updates) => {
    dbUtils.updateRuleProvider(id, updates);
    scheduler.initSchedulers();
    await regenerateConfigForRuleProviderIfNeeded(id, 'rule provider updated', sendToRenderer, log);
});
ipcMain.handle('db:deleteRuleProvider', async (_, id) => {
    dbUtils.deleteRuleProvider(id);
    scheduler.initSchedulers();
    await regenerateConfigIfOverrideRulesEnabled('rule provider deleted', sendToRenderer, log);
});
ipcMain.handle('db:updateRuleProviderContent', async (_, id, filePath, lastUpdate) => {
    dbUtils.updateRuleProviderContent(id, filePath, lastUpdate);
    await regenerateConfigForRuleProviderIfNeeded(id, 'rule provider content updated', sendToRenderer, log);
});
ipcMain.handle('db:addRuleProvidersBatch', (_, providers) => {
    dbUtils.addRuleProvidersBatch(providers);
    // 全量重新加载定时任务
    scheduler.initSchedulers();
});

// IPC Handlers for Policies
ipcMain.handle('db:getPolicies', () => dbUtils.getPolicies());
ipcMain.handle('db:getPolicyById', (_, id) => dbUtils.getPolicyById(id));
ipcMain.handle('db:addPolicy', async (_, policy) => {
    const id = dbUtils.addPolicy(policy);
    await regenerateConfigIfOverrideRulesEnabled('policy added', sendToRenderer, log);
    return id;
});
ipcMain.handle('db:updatePolicy', async (_, id, updates) => {
    dbUtils.updatePolicy(id, updates);
    await regenerateConfigIfOverrideRulesEnabled('policy updated', sendToRenderer, log);
});
ipcMain.handle('db:deletePolicy', async (_, id) => {
    dbUtils.deletePolicy(id);
    await regenerateConfigIfOverrideRulesEnabled('policy deleted', sendToRenderer, log);
});
ipcMain.handle('db:addPoliciesBatch', async (_, policies, clearFirst?: boolean) => {
    const added = dbUtils.addPoliciesBatch(policies, clearFirst);
    await regenerateConfigIfOverrideRulesEnabled('policy batch imported', sendToRenderer, log);
    return added;
});
ipcMain.handle('db:updatePoliciesOrder', async (_, orders) => {
    dbUtils.updatePoliciesOrder(orders);
    await regenerateConfigIfOverrideRulesEnabled('policy order updated', sendToRenderer, log);
});
ipcMain.handle('db:clearPolicies', async () => {
    dbUtils.clearPolicies();
    await regenerateConfigIfOverrideRulesEnabled('policies cleared', sendToRenderer, log);
});
// Profile Policies
ipcMain.handle('db:getProfilePolicies', () => dbUtils.getProfilePolicies());
ipcMain.handle('db:getProfilePolicy', (_, profileId) => dbUtils.getProfilePolicy(profileId));
ipcMain.handle('db:getProfilePolicyByPolicyId', (_, profileId, policyId) => dbUtils.getProfilePolicyByPolicyId(profileId, policyId));
ipcMain.handle('db:setProfilePolicy', (_, profileId, policyId, preferredOutbounds) => dbUtils.setProfilePolicy(profileId, policyId, preferredOutbounds));
ipcMain.handle('db:deleteProfilePolicy', (_, profileId) => dbUtils.deleteProfilePolicy(profileId));
ipcMain.handle('db:clearRuleProviders', async () => {
    dbUtils.clearRuleProviders();
    scheduler.initSchedulers();
    await regenerateConfigIfOverrideRulesEnabled('rule providers cleared', sendToRenderer, log);
});

ipcMain.handle('core:getPresetRulesets', () => loadPresetRulesets());
ipcMain.handle('core:getBuiltinRulesets', () => loadBuiltinRulesets());

ipcMain.handle('core:addRuleProvidersFromPreset', async (_, aclIds: string[]) => {
    return addRuleProvidersFromPresetFn(aclIds, () =>
        regenerateConfigIfOverrideRulesEnabled('preset rulesets imported or overwritten', sendToRenderer, log)
    );
});

// 预设导入（覆盖模式）：后台清空所有策略和规则集，再导入预设规则集和策略
ipcMain.handle('core:importPresetWithOverwrite', async (_, arg: { policies: any[]; presetRulesetIds: string[] }) => {
    const { policies, presetRulesetIds } = arg;
    dbUtils.clearPolicies();
    dbUtils.clearRuleProviders();
    if (presetRulesetIds.length > 0) {
        const preset = loadPresetRulesets();
        const presetById = new Map(preset.map((p: any) => [p.id, p]));
        for (const id of presetRulesetIds) {
            const entry = presetById.get(id);
            if (!entry) continue;
            const provider = {
                id: entry.id,
                name: entry.name,
                url: entry.url || '',
                type: entry.type || 'clash',
                path: entry.path,
                enabled: entry.enabled !== false,
            };
            dbUtils.upsertRuleProviderFromPreset(provider);
        }
        scheduler.initSchedulers();
    }
    const addedCount = dbUtils.addPoliciesBatch(policies);
    await regenerateConfigIfOverrideRulesEnabled('preset imported with overwrite', sendToRenderer, log);
    return { addedCount };
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
ipcMain.handle('core:stop', () => {
    log.info('IPC core:stop');
    return singbox.stopSingbox();
});

ipcMain.handle('core:restart', async () => {
    try {
        log.info('IPC core:restart 开始重启内核');
        log.info('[重启内核] 正在停止当前内核...');
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
        log.info('[重启内核] 内核已成功重启');
        return true;
    } catch (err: any) {
        log.error(`[重启内核] 失败: ${err?.message || err}`);
        throw err;
    }
});

ipcMain.handle('core:setSystemProxy', (_, enable) => proxy.setSystemProxy(enable));
ipcMain.handle('core:getSystemProxyStatus', () => proxy.getSystemProxyStatus());

// 更新托盘菜单
ipcMain.handle('core:updateTrayMenu', () => {
    log.info('IPC core:updateTrayMenu');
    updateTrayMenu();
});

ipcMain.handle('core:isAdmin', () => {
    if (process.platform !== 'win32') return false;
    return isAdmin();
});

/**
 * 检测当前进程是否以管理员权限运行
 * 使用 Windows API 检测当前进程令牌，这是最准确的方法
 */
function isAdmin(): boolean {
    // 方法1: 使用 Windows API 检查当前进程令牌（最准确）
    // 直接检测当前进程是否拥有管理员令牌，而不是用户是否属于管理员组
    try {
        const script = `
            $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
            $principal = New-Object Security.Principal.WindowsPrincipal($identity)
            $isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
            if ($isAdmin) { exit 0 } else { exit 1 }
        `;
        execSync('powershell.exe -Command ' + script, { 
            encoding: 'utf8', 
            windowsHide: true,
            timeout: 5000 
        });
        return true;
    } catch {
        // PowerShell 失败，继续尝试其他方法
    }
    
    // 方法2: 传统的 net session 检测 (作为备选)
    try {
        execSync('net session', { stdio: 'ignore', windowsHide: true });
        return true;
    } catch {
        // net session 失败
    }
    
    return false;
}

ipcMain.handle('core:restartAsAdmin', () => {
    if (process.platform === 'win32') {
        const exePath = process.execPath;
        let psCommand = '';
        if (app.isPackaged) {
            psCommand = `Start-Process -FilePath '${exePath}' -Verb RunAs`;
        } else {
            // 在开发环境（未打包开发）时，需要把启动参数也传递过去，否则只会弹出一个空白的 Electron
            // UAC 提升后不继承 env，需通过 --vite-dev-url 传递开发服务器地址
            const baseArgs = process.argv.slice(1).filter((a) => !a.startsWith('--vite-dev-url='));
            const devUrl = process.env.VITE_DEV_SERVER_URL;
            if (devUrl) {
                const escaped = devUrl.replace(/'/g, "''");
                baseArgs.push(`--vite-dev-url=${escaped}`);
            }
            const args = baseArgs.map((arg) => `'${arg.replace(/'/g, "''")}'`).join(', ');
            psCommand = `Start-Process -FilePath '${exePath}' -ArgumentList ${args} -Verb RunAs`;
        }

        exec(`powershell.exe -Command "${psCommand}"`, { windowsHide: true }, (err) => {
            if (!err) {
                app.quit();
            }
        });
        return true;
    }
    return false;
});

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
        return null;
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

ipcMain.handle('core:updateConfigFile', async (_, updates: { mode?: string; tun?: boolean }) => {
    try {
        log.info(`IPC core:updateConfigFile ${JSON.stringify(updates)}`);
        await updateConfigFile(updates);
        return true;
    } catch (e: any) {
        console.error('Failed to update config file:', e);
        throw new Error(`Failed to update config file: ${e.message}`);
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

    // 迁移旧的数字型 profile id 为短 id（与规则集一致）
    dbUtils.migrateProfileIdsToShortId();
    dbUtils.migratePathsToRelative();
    dbUtils.migrateRuleProviderFilePrefix();
    
    // 迁移时间格式为ISO标准格式
    dbUtils.migrateDateTimeFormats();

    // 清理无效的 profilePolicies 条目（profile 或 policy 不存在的）
    dbUtils.cleanupProfilePolicies();

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
                if (!fs.existsSync(configPath)) {
                    await generateConfigFile(selectedProfile.id, sendToRenderer);
                }
                if (!fs.existsSync(configPath)) {
                    log.warn('config.json 不存在，跳过自动启动内核');
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
