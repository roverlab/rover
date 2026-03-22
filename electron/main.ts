
// 抑制 axios 等第三方库使用 url.parse() 的弃用警告
// process.removeAllListeners('warning');
// process.on('warning', (warning) => {
//     // 忽略 DEP0169 url.parse() 弃用警告
//     if (warning.name === 'DeprecationWarning' && warning.message.includes('url.parse()')) {
//         return;
//     }
//     console.warn(warning);
// });

import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import { setCachedIsServiceInstalled, getCachedIsServiceInstalled } from './roverservice-cache';

// UAC 以管理员运行后白屏：Chromium 沙箱与提升权限冲突，需禁用沙箱
// 见 https://github.com/electron/electron/issues/49167
// 注意：管理员权限检测移到 app.whenReady() 中进行，以便使用日志系统

import path from 'node:path';
import fs from 'node:fs';
import readline from 'node:readline';
import * as dbUtils from './db';
import * as singbox from './core-controller';
import * as proxy from './proxy';
import { createTray, updateTrayMenu } from './tray';
import * as scheduler from './scheduler';
import { startSingboxLogMaintenance, stopSingboxLogMaintenance } from './singbox-log-maintenance';
import { initLogger, createLogger, getLogDir, getLogFiles, clearAllLogs, redirectConsole, log as loggerLog, logBatch } from './logger';
import { getDataDir, getProfilesDir,  resolveDataPath, getAppRootPath, getDistPath, getPublicPath, getPreloadPath, getTemplatesIndexPath, getPresetTemplatesPath, getBuildInfoPath, getSingboxLogPath, syncBuiltinRulesetsToUserData } from './paths';
import {
    getConfigPath,
    readConfig,
    generateConfigFile,
    writeConfigFileOnly,
    getCurrentConfigRules,
    getAvailableOutbounds,
    POLICY_FINAL_OUTBOUND_VALUES
} from './config-file';
import {
    loadPresetRulesets,
    getAllRuleSetsGrouped,
    addRuleProvidersFromPreset as addRuleProvidersFromPresetFn,
    registerRuleProviderIpcHandlers
} from './route-policy';
import { decompileSrsToJson } from './ruleset-utils';
import * as subscription from './subscription';
import { fetchIpThroughProxy, fetchIpDirect } from './network-check';
import type { LogLevel, LogEntry } from './logger';
import {
    sendToRenderer,
    exportConfig,
    importConfig,
    importLocalProfile,
    restartSingbox,
    startSingbox,
    generateConfig,
    isServiceInstalled,
    getBuildInfo,
    handleAppQuit,
    getWindowIconPath,
    getSelectedProfileWithConfig
} from './app-utils';
import { clearAllDns } from './dns-macos';

const log = createLogger('Main');

// sing-box 日志文件当前行数（启动时初始化，避免前端读取旧日志）
let singboxLogInitialLineCount = 0;

// 从 subscription 模块重新导出辅助函数
const { readProfileContent } = subscription;

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
ipcMain.handle('config:export', async (event) => exportConfig(event));

ipcMain.handle('config:import', async (event) => importConfig(event, sendToRenderer));


scheduler.setRuleProviderUpdatedHook(async () => {

    try {
        // 1. 获取当前选中的订阅
        const selectedProfile = dbUtils.getSelectedProfile();

        // 2. 检查更新的是否为当前选中的订阅且存在
        if (selectedProfile) {
            try {
                // 3. 重新生成配置文件
                await generateConfigFile(selectedProfile.id, sendToRenderer);

                // 4. 通知前端刷新
                sendToRenderer('ruleProvider-updated');
            } catch (err: any) {
                console.error('Failed to generate config:', err.message);
                throw err; // 抛出给外层 catch 统一记录日志
            }
        }
    } catch (err: any) {
        log.error(`[Config] regenerate after ruleProviders update failed: ${err?.message || err}`);
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
// Profile DNS Server Detours
ipcMain.handle('db:getProfileDnsServerDetour', (_, profileId, dnsServerId) => dbUtils.getProfileDnsServerDetour(profileId, dnsServerId));
ipcMain.handle('db:setProfileDnsServerDetour', (_, profileId, dnsServerId, detour) => dbUtils.setProfileDnsServerDetour(profileId, dnsServerId, detour));
ipcMain.handle('db:getAllProfileDnsServerDetours', (_, profileId) => dbUtils.getAllProfileDnsServerDetours(profileId));
ipcMain.handle('db:getDnsServers', () => dbUtils.getDnsServers());
ipcMain.handle('db:getDnsServerRefs', (_, tag: string) => dbUtils.getDnsServerRefs(tag));
ipcMain.handle('db:addDnsServer', (_, server: any) => dbUtils.addDnsServer(server));
ipcMain.handle('db:updateDnsServer', (_, id: string, updates: any) => dbUtils.updateDnsServer(id, updates));
ipcMain.handle('db:deleteDnsServer', (_, id: string) => dbUtils.deleteDnsServer(id));

// Custom Proxy Groups
ipcMain.handle('db:getProfileCustomGroups', (_, profileId: string) => dbUtils.getProfileCustomGroups(profileId));
ipcMain.handle('db:setProfileCustomGroups', (_, profileId: string, groups: any[]) => dbUtils.setProfileCustomGroups(profileId, groups));
ipcMain.handle('db:addProfileCustomGroup', (_, profileId: string, group: any) => dbUtils.addProfileCustomGroup(profileId, group));
ipcMain.handle('db:updateProfileCustomGroup', (_, profileId: string, groupName: string, updates: any) => dbUtils.updateProfileCustomGroup(profileId, groupName, updates));
ipcMain.handle('db:deleteProfileCustomGroup', (_, profileId: string, groupName: string) => dbUtils.deleteProfileCustomGroup(profileId, groupName));
ipcMain.handle('db:updateProfileCustomGroupsOrder', (_, profileId: string, orders: any[]) => dbUtils.updateProfileCustomGroupsOrder(profileId, orders));
ipcMain.handle('db:clearProfileCustomGroups', (_, profileId: string) => dbUtils.clearProfileCustomGroups(profileId));
ipcMain.handle('db:getProfileNodes', (_, profileId: string) => dbUtils.getProfileNodes(profileId));

// 新的接口：同时设置数据库和重新生成配置
ipcMain.handle('db:setTunModeWithConfigGeneration', async (_, key, value) => {
    // 1. 保存到数据库
    dbUtils.setSetting(key, value);
    
    // 2. TUN 模式切换时重置控制器
    if (key === 'dashboard-tun-mode') {
        await singbox.resetController();
        log.info(`[DB] TUN 模式已${value === 'true' ? '启用' : '禁用'}，控制器已重置`);
    }
    
    // 3. 重新生成配置文件（使用纯净函数）
    try {
        // 获取当前选中的 profile
        const selectedProfile = dbUtils.getSelectedProfile();
        if (!selectedProfile) {
            throw new Error('No profile selected');
        }
        
        // 使用纯净函数重新生成配置
        const configPath = await writeConfigFileOnly(selectedProfile.id);
        log.info(`[DB] config.json 已更新 (dashboard-tun-mode=${value}) -> ${configPath}`);
    } catch (err: any) {
        log.error(`[DB] 重新生成配置文件失败: ${err.message}`);
        throw err;
    }
});

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

// 查看规则集内容：本地类型直接返回 logical_rule，远程类型反编译 SRS
ipcMain.handle('core:getRuleProviderViewContent', async (_, providerId: string) => {
    const provider = dbUtils.getRuleProviderById(providerId);
    if (!provider) throw new Error('规则集不存在');

    // 本地类型：直接返回数据库中的 logical_rule
    if (provider.type === 'local') {
        const logicalRule = (provider as any).logical_rule;
        if (logicalRule) {
            return { content: JSON.stringify(logicalRule, null, 2), error: '' };
        }
        // 如果没有 logical_rule，尝试从 SRS 反编译
    }

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
    
    // macOS: 在停止内核前先清除 DNS 设置
    if (process.platform === 'darwin') {
        log.info('[core:stop] macOS: clearing DNS settings...');
        await clearAllDns();
    }
    
    return singbox.stopSingbox();
});

ipcMain.handle('core:restart', async () => restartSingbox());

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

// 使用 subscription 模块处理订阅相关 IPC 调用
ipcMain.handle('core:updateProfile', async (_, profileId) => {
    return await subscription.downloadProfile(profileId);
});

ipcMain.handle('core:addSubscriptionProfile', async (_, url: string) => {
    return await subscription.addSubscriptionProfile(url);
});

ipcMain.handle('core:importLocalProfile', async (event) => importLocalProfile(event));

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


ipcMain.handle('core:getSelectedProfile', async () => getSelectedProfileWithConfig());

ipcMain.handle('core:generateConfig', async () => generateConfig(sendToRenderer));

ipcMain.handle('core:start', async () => startSingbox());

// Get build information (app version, singbox version, etc.)
ipcMain.handle('core:getBuildInfo', async () => getBuildInfo());

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
let win: BrowserWindow | null;

let isQuitting = false;

function createWindow() {
    // UAC 提升后新进程不继承 env，通过 --dev-url 传递开发服务器地址
    const devUrlArg = process.argv.find((a) => a.startsWith('--dev-url='));
    const devServerUrl = devUrlArg ? devUrlArg.slice('--dev-url='.length) : process.env['DEV_SERVER_URL'];

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
        icon: getWindowIconPath(publicPath),
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

    if (devServerUrl) {
        console.log(`Loading URL: ${devServerUrl}`);
        win.loadURL(devServerUrl);
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
    stopSingboxLogMaintenance();

    handleAppQuit();

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

// 获取 sing-box 日志文件的初始行数（应用启动时已记录的行数）
ipcMain.handle('singbox:getInitialLogLineCount', () => {
    return { lineCount: singboxLogInitialLineCount };
});

// 读取 sing-box 内核日志文件（本地文件，不调接口）
// 容错：编码回退、移除不可打印字符、读取异常时返回空
// 统一使用流式从后往前读取，限制只读取启动后的日志
// 搜索文本支持多关键词(空格分割，AND逻辑)，例如: "ERROR connection" 匹配包含 ERROR 和 connection 的日志
ipcMain.handle('singbox:readLog', async (_event, options?: { fromLine?: number; search?: string; maxResults?: number }) => {
    const logPath = getSingboxLogPath();
    if (!fs.existsSync(logPath)) {
        return { lines: [], totalLines: 0 };
    }
    
    // 移除不可打印字符
    const cleanLine = (line: string): string => line.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
    const chunkSize = 64 * 1024; // 64KB 每次读取块
    
    // 解析搜索文本：所有词都作为关键词(AND逻辑)
    const searchInput = options?.search?.trim() || '';
    const searchWords = searchInput ? searchInput.split(/\s+/).map(w => w.toLowerCase()) : [];
    const isSearch = searchWords.length > 0;
    const maxResults = options?.maxResults ?? 200;  // 默认 200 条
    
    try {
        const stat = fs.statSync(logPath);
        const fileSize = stat.size;
        
        if (fileSize === 0) {
            return { lines: [], totalLines: 0, isSearch };
        }
        
        // 先快速计算总行数
        const totalLines = await new Promise<number>((resolve) => {
            let count = 0;
            const rs = fs.createReadStream(logPath, { encoding: 'utf8' });
            const rl = readline.createInterface({ input: rs, crlfDelay: Infinity });
            rl.on('line', () => count++);
            rl.on('close', () => resolve(count));
            rl.on('error', () => resolve(count));
        });
        
        // 计算起始行号
        const startLine = isSearch 
            ? singboxLogInitialLineCount  // 搜索模式：只读启动后的日志
            : Math.max(singboxLogInitialLineCount, options?.fromLine ?? singboxLogInitialLineCount);
        
        if (startLine >= totalLines) {
            return { lines: [], totalLines, isSearch };
        }
        
        // 从底部向上读取
        const fd = fs.openSync(logPath, 'r');
        
        const readBackwards = (): Promise<{ lines: string[]; stopped: boolean }> => {
            return new Promise((resolve) => {
                const results: string[] = [];
                const buffer = Buffer.alloc(chunkSize);
                let pos = fileSize;
                let carry = '';
                let currentLineNum = totalLines;
                
                // 匹配函数：多关键词搜索(AND逻辑)
                const matchLine = (cleanedLine: string): boolean => {
                    if (searchWords.length === 0) return true;
                    const lineLower = cleanedLine.toLowerCase();
                    // 所有关键词都必须匹配
                    for (const word of searchWords) {
                        if (!lineLower.includes(word)) return false;
                    }
                    return true;
                };
                
                const readChunk = () => {
                    // 停止条件：已读够、已到起始行、文件读完
                    if (results.length >= maxResults || currentLineNum <= startLine || pos <= 0) {
                        // 处理最后剩余的 carry
                        if (carry && currentLineNum > startLine && pos <= 0) {
                            const cleanedCarry = cleanLine(carry);
                            if (cleanedCarry.trim() && matchLine(cleanedCarry)) {
                                results.push(cleanedCarry);
                            }
                        }
                        fs.closeSync(fd);
                        resolve({ lines: results, stopped: results.length >= maxResults });
                        return;
                    }
                    
                    const readSize = Math.min(chunkSize, pos);
                    pos -= readSize;
                    
                    try {
                        const bytesRead = fs.readSync(fd, buffer, 0, readSize, pos);
                        if (bytesRead === 0) {
                            fs.closeSync(fd);
                            resolve({ lines: results, stopped: results.length >= maxResults });
                            return;
                        }
                        
                        // carry 是上一个 chunk 末尾不完整的行（较新），拼到新 chunk 后面
                        const chunk = buffer.toString('utf8', 0, bytesRead) + carry;
                        const lines = chunk.split(/\r?\n/);
                        // lines[0] 是这个 chunk 开头不完整的行（较旧），保存为 carry 供下一个 chunk 使用
                        carry = lines[0];
                        
                        // 从后往前处理 lines[1] 到 lines[end]
                        // lines[end] 是最新的，lines[1] 是这个 chunk 中较旧的
                        for (let i = lines.length - 1; i >= 1; i--) {
                            const line = lines[i];
                            currentLineNum--;
                            
                            if (currentLineNum < startLine) {
                                fs.closeSync(fd);
                                resolve({ lines: results, stopped: results.length >= maxResults });
                                return;
                            }
                            
                            if (!line || !line.trim()) continue;
                            
                            const cleanedLine = cleanLine(line);
                            if (matchLine(cleanedLine)) {
                                results.push(cleanedLine);
                                if (results.length >= maxResults) {
                                    fs.closeSync(fd);
                                    resolve({ lines: results, stopped: true });
                                    return;
                                }
                            }
                        }
                        
                        setImmediate(readChunk);
                    } catch (err) {
                        log.error(`反向读取日志失败: ${(err as Error).message}`);
                        fs.closeSync(fd);
                        resolve({ lines: results, stopped: false });
                    }
                };
                
                readChunk();
            });
        };
        
        const { lines: matched } = await readBackwards();
        // 结果是从新到旧读取的，直接返回
        return { lines: matched, totalLines, isSearch };
        
    } catch (err) {
        log.error(`读取 sing-box 日志失败: ${(err as Error).message}`);
        return { lines: [], totalLines: 0, isSearch };
    }
});

// 清理 sing-box 内核日志文件（写入空字符）
ipcMain.handle('singbox:clearLog', async () => {
    const logPath = getSingboxLogPath();
    try {
        fs.writeFileSync(logPath, '', 'utf-8');
        // 清空日志后重置初始行数
        singboxLogInitialLineCount = 0;
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

ipcMain.handle('roverservice:install', async () => {
    const result = await roverservice.installHelper();
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
dbUtils.cleanupProfileDnsServerDetours();

    // 简化逻辑：TUN 模式需要 RootService 服务
    // 如果开启 TUN 但 RootService 未安装，提示用户安装
    const tunModeEnabled = dbUtils.getSetting('dashboard-tun-mode') === 'true';
    const isServiceInstalledCached = getCachedIsServiceInstalled();
    
    log.info('[启动检测] TUN模式: ${tunModeEnabled}, RootService已安装: ${isServiceInstalledCached}');
    
    if (tunModeEnabled && !isServiceInstalledCached) {
        log.warn('[启动检测] TUN模式已启用但RootService未安装，请安装RootService以使用TUN模式');
    }

    // 初始化 sing-box 日志文件的当前行数，避免前端读取旧日志
    const singboxLogPath = getSingboxLogPath();
    try {
        if (fs.existsSync(singboxLogPath)) {
            const content = fs.readFileSync(singboxLogPath, 'utf8');
            singboxLogInitialLineCount = content.split(/\r?\n/).length;
            log.info(`[启动] sing-box 日志文件当前行数: ${singboxLogInitialLineCount}`);
        }
    } catch (err) {
        log.warn(`[启动] 读取 sing-box 日志文件行数失败: ${(err as Error).message}`);
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

    startSingboxLogMaintenance();

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
