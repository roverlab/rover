/**
 * 统一路径管理模块
 * 所有应用产生的数据都存放在 userData/data 目录下
 */

import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';

// ==================== 应用根目录路径 ====================

/**
 * 获取应用根目录路径
 * 每个环境下只有一个确定的路径
 */
export function getAppRootPath(): string {
    // 生产环境使用确定的 app 路径
    if (app.isPackaged) {
        return app.getAppPath();
    }
    
    // 开发环境使用确定的当前工作目录
    return process.cwd();
}

/**
 * 获取 Electron Resources 目录路径
 * 生产环境: process.resourcesPath
 */
export function getResourcesPath(): string {
    return process.resourcesPath;
}

/**
 * 获取打包后的 dist 目录路径
 * 每个环境下只有一个确定的路径
 *
 * 注意：electron-builder 将 files 中的 dist/ 打包进 app.asar，
 * 因此生产环境必须使用 app.getAppPath()（指向 app.asar 根目录），
 * 而非 process.resourcesPath（指向 resources 目录，其下没有 dist）。
 */
export function getDistPath(): string {
    // 生产环境：dist 在 app.asar 内，需用 app.getAppPath()
    if (app.isPackaged) {
        return path.join(app.getAppPath(), 'dist');
    }
    
    // 开发环境使用确定的路径
    return path.join(process.cwd(), 'dist');
}

/**
 * 获取 public 目录路径
 * 每个环境下只有一个确定的路径
 */
export function getPublicPath(): string {
    // 生产环境使用 dist 目录
    if (app.isPackaged) {
        return getDistPath();
    }
    
    // 开发环境使用确定的 public 目录
    return path.join(process.cwd(), 'public');
}

/**
 * 获取 preload 脚本路径
 */
export function getPreloadPath(): string {
    // 生产环境使用确定的路径
    if (app.isPackaged) {
        return path.join(app.getAppPath(), 'dist-electron', 'preload.mjs');
    }
    
    // 开发环境使用确定的路径
    return path.join(process.cwd(), 'dist-electron', 'preload.mjs');
}

// ==================== 内置资源路径 ====================

/**
 * 获取内置资源目录路径 (resources/)
 * 每个环境下只有一个确定的路径
 */
export function getBuiltinResourcesPath(): string {
    // 生产环境使用确定的标准路径
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'resources');
    }
    
    // 开发环境使用确定的项目路径
    return path.join(getAppRootPath(), 'resources');
}

/**
 * 获取内置规则集目录路径
 */
export function getBuiltinRulesetsPath(): string {
    return path.join(getBuiltinResourcesPath());
}

/**
 * 获取预设规则集目录路径
 */
export function getPresetRulesetsPath(): string {
    return path.join(getBuiltinResourcesPath(), 'presets', 'rulesets');
}

/**
 * 获取预设模板目录路径
 */
export function getPresetTemplatesPath(): string {
    return path.join(getBuiltinResourcesPath(), 'presets');
}

/**
 * 获取预设模板索引文件路径
 */
export function getTemplatesIndexPath(): string {
    return path.join(getBuiltinResourcesPath(), 'presets', 'templates.json');
}

/**
 * 获取 sing-box 内核路径
 * 每个环境下只有一个确定的路径
 */
export function getSingboxBinaryPath(): string {
    const isWin = process.platform === 'win32';
    const binaryName = isWin ? 'sing-box.exe' : 'sing-box';
    
    // 生产环境使用确定的标准路径
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'resources', binaryName);
    }
    
    // 开发环境使用确定的项目路径
    return path.join(getAppRootPath(), 'resources', binaryName);
}

/**
 * 获取 build.json 文件路径
 */
export function getBuildInfoPath(): string {
    return path.join(getBuiltinResourcesPath(), 'build.json');
}

/**
 * 获取 Karing 规则集文件路径
 */
export function getKaringRulesetsPath(): string {
    return path.join(app.getAppPath(), 'karing_rulesets2.json');
}

/**
 * 获取 Karing 脚本路径
 */
export function getKaringScriptPath(): string {
    return path.join(app.getAppPath(), 'scripts', 'karing', 'extract.mjs');
}

// ==================== 用户数据路径 ====================

/**
 * 获取应用数据根目录 (userData/data)
 * 所有应用产生的数据都放在这个目录下
 */
export function getDataDir(): string {
    const dataDir = path.join(app.getPath('userData'), 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    return dataDir;
}

/**
 * 获取数据库文件路径
 */
export function getDbPath(): string {
    return path.join(getDataDir(), 'database.json');
}

/**
 * 获取日志目录
 */
export function getLogsDir(): string {
    const logsDir = path.join(getDataDir(), 'logs');
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }
    return logsDir;
}

/**
 * 获取订阅配置文件目录
 */
export function getProfilesDir(): string {
    const profilesDir = path.join(getDataDir(), 'profiles');
    if (!fs.existsSync(profilesDir)) {
        fs.mkdirSync(profilesDir, { recursive: true });
    }
    return profilesDir;
}

/**
 * 获取规则集目录
 */
export function getRulesetsDir(): string {
    const rulesetsDir = path.join(getDataDir(), 'rulesets');
    if (!fs.existsSync(rulesetsDir)) {
        fs.mkdirSync(rulesetsDir, { recursive: true });
    }
    return rulesetsDir;
}

/**
 * 获取 GeoIP 数据目录
 */
export function getGeoDir(): string {
    const geoDir = path.join(getDataDir(), 'geo', 'geoip');
    if (!fs.existsSync(geoDir)) {
        fs.mkdirSync(geoDir, { recursive: true });
    }
    return geoDir;
}

/**
 * 获取 sing-box 运行配置文件路径
 */
export function getConfigPath(): string {
    return path.join(getDataDir(), 'config.json');
}

/**
 * 获取 sing-box 内核日志文件路径
 */
export function getSingboxLogPath(): string {
    return path.join(getDataDir(), 'sing-box.log');
}

/**
 * 将路径转为相对 data 目录的格式（用于数据库存储）
 * @param absolutePath 绝对路径
 * @returns 相对路径，使用正斜杠
 */
export function toDataRelativePath(absolutePath: string): string {
    if (!absolutePath) return absolutePath;
    if (!path.isAbsolute(absolutePath)) return absolutePath; // 已是相对路径
    const dataDir = path.resolve(getDataDir());
    const resolved = path.resolve(absolutePath);
    const rel = path.relative(dataDir, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return absolutePath; // 不在 data 下，保留原样
    return rel.split(path.sep).join('/');
}

/**
 * 将数据库中的相对路径解析为完整路径（使用时拼接）
 * @param storedPath 数据库中存储的路径（相对或旧数据中的绝对路径）
 * @returns 完整绝对路径
 */
export function resolveDataPath(storedPath: string): string {
    if (!storedPath) return storedPath;
    if (path.isAbsolute(storedPath)) return storedPath; // 兼容旧数据
    return path.join(getDataDir(), storedPath);
}
