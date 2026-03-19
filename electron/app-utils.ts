/**
 * 应用工具函数
 * 存放与应用生命周期相关的公共方法
 */

import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import * as singbox from './core-controller';
import * as dbUtils from './db';
import * as scheduler from './scheduler';
import * as configBackup from './config-backup';
import * as subscription from './subscription';
import { createLogger } from './logger';
import { getConfigPath, readConfig, generateConfigFile } from './config-file';
import { getProfilesDir, resolveDataPath, getBuildInfoPath } from './paths';
import { validateProfileContent } from './validation';
import { setCachedIsServiceInstalled, getCachedIsServiceInstalled } from './roverservice-cache';
import { clearAllDns } from './dns-macos';
import type { LogLevel, LogEntry } from './logger';

const log = createLogger('AppUtils');

// 从 subscription 模块重新导出辅助函数
const { saveProfileFile, readProfileContent } = subscription;

/**
 * 处理应用退出时的内核关闭逻辑
 * 如果开启了 TUN 模式，不自动关闭内核
 * 如果未开启 TUN 模式，先停止 sing-box 内核
 * macOS: 清除 DNS 设置让系统使用 DHCP
 */
export async function handleAppQuit(): Promise<void> {
    if (singbox.isTunModeEnabled()) {
        log.info('[AppQuit] TUN mode is enabled, skipping stopSingbox');
    } else {
        log.info('[AppQuit] TUN mode is disabled, stopping sing-box...');
        await singbox.stopSingbox();
        log.info('[AppQuit] sing-box stopped');
    }
}

/**
 * 发送消息到渲染进程
 */
export function sendToRenderer(channel: string, ...args: any[]) {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(w => {
        if (!w.isDestroyed()) {
            w.webContents.send(channel, ...args);
        }
    });
}

/**
 * 导出应用配置
 */
export async function exportConfig(event: any): Promise<{ ok: boolean; path: string | null }> {
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
}

/**
 * 导入应用配置
 */
export async function importConfig(
    event: any,
    sendToRendererFn: (channel: string, ...args: any[]) => void
): Promise<{ ok: boolean }> {
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
        sendToRendererFn('config-generate-start');
        sendToRendererFn('config-import-step', 'restoring');
        try {
            const profiles = dbUtils.getProfiles();
            const remoteProfiles = profiles.filter((p) => p.type === 'remote' && p.url);
            if (remoteProfiles.length > 0) {
                sendToRendererFn('config-import-step', 'downloading');
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
                sendToRendererFn('config-import-step', 'generating');
                log.info(`[Config] import: regenerating config for profile=${selectedProfile.id}`);
                await generateConfigFile(selectedProfile.id, sendToRendererFn);
                // generateConfigFile 内部已发送 config-generate-end
            } else {
                log.info('[Config] import: no selected profile, skip config regeneration');
            }
            sendToRendererFn('config-import-step', 'done');
        } finally {
            // 无选中 profile 时 generateConfigFile 未调用，需手动发送 end 以关闭 loading
            const selectedProfile = dbUtils.getSelectedProfile();
            if (!selectedProfile) {
                sendToRendererFn('config-generate-end');
            }
        }

        return { ok: true };
    } catch (err: any) {
        sendToRendererFn('config-generate-end');
        log.error(`[Config] import failed: ${err?.message || err}`);
        throw err;
    }
}

/**
 * 导入本地配置文件
 */
export async function importLocalProfile(event: any): Promise<string | null> {
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
}

/**
 * 重启 sing-box 内核
 */
export async function restartSingbox(): Promise<boolean> {
    try {
        log.info('IPC core:restart 开始重启内核');
        log.info('[重启内核] 正在停止当前内核...');
        await singbox.stopSingbox();
        log.info('[重启内核] 内核已停止，等待 2000ms 后重新启动');
        await new Promise((r) => setTimeout(r, 2000));
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
}

/**
 * 启动 sing-box 内核
 */
export async function startSingbox(): Promise<boolean> {
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
}

/**
 * 生成配置文件
 */
export async function generateConfig(
    sendToRendererFn: (channel: string, ...args: any[]) => void
): Promise<string> {
    try {
        const selectedProfile = dbUtils.getSelectedProfile();
        log.info(`IPC core:generateConfig profile=${selectedProfile?.id ?? 'none'}`);
        if (!selectedProfile) {
            throw new Error('No profile selected');
        }
        const result = await generateConfigFile(selectedProfile.id, sendToRendererFn);
        log.info(`Config generated successfully at ${result}`);
        return result;
    } catch (err: any) {
        log.error(`Failed to generate config: ${err.message}`);
        throw err;
    }
}

/**
 * 检测 RoverService 服务是否已安装
 */
export function isServiceInstalled(): boolean {
    // 非支持平台返回 false
    const roverservice = require('./roverservice-client');
    if (!roverservice.isSupported()) return false;

    // 使用缓存的值（启动时计算）
    return getCachedIsServiceInstalled();
}

/**
 * 获取构建信息
 */
export async function getBuildInfo(): Promise<{
    appVersion: string;
    singboxVersion: string;
    buildTime: string;
    buildNumber: string;
}> {
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
}

/**
 * 获取窗口图标路径
 */
export function getWindowIconPath(publicPath: string): string {
    const icoPath = path.join(publicPath, 'icon.ico');
    const pngPath = path.join(publicPath, 'icon.png');
    return fs.existsSync(icoPath) ? icoPath : pngPath;
}

/**
 * 获取选中订阅的详细信息
 */
export async function getSelectedProfileWithConfig(): Promise<{ profile: any; config: any } | null> {
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
}
