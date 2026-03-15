/**
 * 统一日志模块
 * 将程序运行日志保存到文件，方便排查问题
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as iconv from 'iconv-lite';
import { getLogsDir } from './paths';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
    logDir: string;
    maxFileSize: number;  // 单个日志文件最大大小（字节）
    maxBackupFiles: number;  // 保留的备份日志文件数量
    logLevel: LogLevel;  // 最低日志级别
    enableConsole: boolean;  // 是否同时输出到控制台
}

// 默认配置
const defaultConfig: LoggerConfig = {
    logDir: '',
    maxFileSize: 10 * 1024 * 1024,  // 10MB
    maxBackupFiles: 5,
    logLevel: 'info',
    enableConsole: true
};

let config: LoggerConfig = { ...defaultConfig };
let currentLogFile: string = '';
let currentLogSize: number = 0;

// Windows 控制台编码标志
const isWindows = process.platform === 'win32';

/**
 * 在 Windows 上将 UTF-8 字符串转换为 GBK 编码后输出
 * 解决 Windows 控制台中文乱码问题
 */
function consoleLogWithEncoding(method: 'log' | 'warn' | 'error', message: string): void {
    // 使用保存的原始 console 方法，避免与 redirectConsole 产生递归
    const extendedConsole = console as Console & { _originalLog?: typeof console.log; _originalError?: typeof console.error; _originalWarn?: typeof console.warn };
    const originalMethod = method === 'error'
        ? extendedConsole._originalError
        : method === 'warn'
            ? extendedConsole._originalWarn
            : extendedConsole._originalLog;

    if (isWindows) {
        try {
            // 将 UTF-8 字符串编码为 GBK Buffer
            // 这样可以正确显示在 Windows 控制台（默认 GBK 编码）
            const gbkBuffer = iconv.encode(message + '\n', 'gbk');
            // 直接输出 Buffer，让控制台按其默认编码解释
            process.stdout.write(gbkBuffer);
        } catch {
            // 转换失败时回退到普通输出
            if (originalMethod) {
                originalMethod(message);
            } else {
                console[method](message);
            }
        }
    } else {
        if (originalMethod) {
            originalMethod(message);
        } else {
            console[method](message);
        }
    }
}

/**
 * 初始化日志系统
 */
export function initLogger(customConfig?: Partial<LoggerConfig>): void {
    // 设置日志目录
    if (customConfig?.logDir) {
        config.logDir = customConfig.logDir;
    } else {
        config.logDir = getLogsDir();
    }

    // 应用自定义配置
    if (customConfig) {
        config = { ...config, ...customConfig };
    }

    // 确保日志目录存在
    if (!fs.existsSync(config.logDir)) {
        fs.mkdirSync(config.logDir, { recursive: true });
    }

    // 设置当前日志文件
    currentLogFile = getLogFilePath();
    currentLogSize = getFileSize(currentLogFile);

    info('Logger', '日志系统初始化完成');
    info('Logger', `日志目录: ${config.logDir}`);
}

/**
 * 获取当前日期的日志文件路径
 */
function getLogFilePath(): string {
    const date = new Date();
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return path.join(config.logDir, `app-${dateStr}.log`);
}

/**
 * 获取文件大小
 */
function getFileSize(filePath: string): number {
    try {
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            return stats.size;
        }
    } catch {
        // 忽略错误
    }
    return 0;
}

/**
 * 检查并执行日志轮转
 */
function checkRotation(): void {
    // 检查日期是否变化
    const todayLogFile = getLogFilePath();
    if (todayLogFile !== currentLogFile) {
        currentLogFile = todayLogFile;
        currentLogSize = getFileSize(currentLogFile);
    }

    // 检查文件大小
    if (currentLogSize > config.maxFileSize) {
        rotateLogFile();
    }
}

/**
 * 日志轮转
 */
function rotateLogFile(): void {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedFile = currentLogFile.replace('.log', `-${timestamp}.log`);
        fs.renameSync(currentLogFile, rotatedFile);
        currentLogSize = 0;

        // 清理旧的备份文件
        cleanOldLogFiles();
    } catch (err) {
        console.error('日志轮转失败:', err);
    }
}

/**
 * 清理旧的日志文件
 */
function cleanOldLogFiles(): void {
    try {
        const files = fs.readdirSync(config.logDir)
            .filter(f => f.startsWith('app-') && f.endsWith('.log'))
            .sort()
            .reverse();

        // 保留最新的 N 个文件
        const filesToDelete = files.slice(config.maxBackupFiles);
        for (const file of filesToDelete) {
            const filePath = path.join(config.logDir, file);
            fs.unlinkSync(filePath);
        }
    } catch (err) {
        console.error('清理旧日志文件失败:', err);
    }
}

/**
 * 日志级别权重
 */
const logLevelWeight: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
};

/**
 * 格式化本地时间戳
 * 格式: 2026-03-09 14:30:25.123
 */
function formatLocalTimestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
}

/**
 * 格式化日志消息
 */
function formatMessage(level: LogLevel, module: string, message: string): string {
    const timestamp = formatLocalTimestamp();
    const levelUpper = level.toUpperCase().padEnd(5);
    return `[${timestamp}] [${levelUpper}] [${module}] ${message}\n`;
}

/**
 * 写入日志
 */
function writeLog(level: LogLevel, module: string, message: string): void {
    // 检查日志级别
    if (logLevelWeight[level] < logLevelWeight[config.logLevel]) {
        return;
    }

    const formattedMessage = formatMessage(level, module, message);

    // 控制台输出
    if (config.enableConsole) {
        const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
        consoleLogWithEncoding(consoleMethod, formattedMessage.trim());
    }

    // 文件输出
    try {
        // 确保日志目录存在
        if (!fs.existsSync(config.logDir)) {
            fs.mkdirSync(config.logDir, { recursive: true });
        }

        // 检查日志轮转
        checkRotation();

        // 追加写入日志
        fs.appendFileSync(currentLogFile, formattedMessage);
        currentLogSize += Buffer.byteLength(formattedMessage);
    } catch (err) {
        console.error('写入日志文件失败:', err);
    }
}

/**
 * Debug 级别日志
 */
export function debug(module: string, message: string): void {
    writeLog('debug', module, message);
}

/**
 * Info 级别日志
 */
export function info(module: string, message: string): void {
    writeLog('info', module, message);
}

/**
 * Warn 级别日志
 */
export function warn(module: string, message: string): void {
    writeLog('warn', module, message);
}

/**
 * Error 级别日志
 */
export function error(module: string, message: string): void {
    writeLog('error', module, message);
}

/**
 * 通用日志方法（供 IPC 调用）
 */
export function log(level: LogLevel, module: string, message: string): void {
    writeLog(level, module, message);
}

/**
 * 日志条目接口
 */
export interface LogEntry {
    level: LogLevel;
    module: string;
    message: string;
}

/**
 * 批量写入日志（供 IPC 调用，优化性能）
 */
export function logBatch(entries: LogEntry[]): void {
    if (!entries || entries.length === 0) return;

    // 过滤出符合条件的日志
    const filteredEntries = entries.filter(entry =>
        logLevelWeight[entry.level] >= logLevelWeight[config.logLevel]
    );

    if (filteredEntries.length === 0) return;

    // 批量格式化
    const formattedMessages = filteredEntries.map(entry => formatMessage(entry.level, entry.module, entry.message));

    // 控制台输出
    if (config.enableConsole) {
        for (let i = 0; i < filteredEntries.length; i++) {
            const entry = filteredEntries[i];
            const consoleMethod = entry.level === 'error' ? 'error' : entry.level === 'warn' ? 'warn' : 'log';
            consoleLogWithEncoding(consoleMethod, formattedMessages[i].trim());
        }
    }

    // 文件输出
    try {
        // 确保日志目录存在
        if (!fs.existsSync(config.logDir)) {
            fs.mkdirSync(config.logDir, { recursive: true });
        }

        // 检查日志轮转
        checkRotation();

        // 批量写入（一次 I/O 操作）
        const allMessages = formattedMessages.join('');
        fs.appendFileSync(currentLogFile, allMessages);
        currentLogSize += Buffer.byteLength(allMessages);
    } catch (err) {
        console.error('批量写入日志文件失败:', err);
    }
}

/**
 * 创建模块专用的日志器
 */
export function createLogger(moduleName: string) {
    return {
        debug: (message: string) => debug(moduleName, message),
        info: (message: string) => info(moduleName, message),
        warn: (message: string) => warn(moduleName, message),
        error: (message: string) => error(moduleName, message),
        log: (message: string) => info(moduleName, message),  // 兼容 console.log
    };
}

/**
 * 获取日志目录路径
 */
export function getLogDir(): string {
    return config.logDir;
}

/**
 * 获取当前日志文件路径
 */
export function getCurrentLogFile(): string {
    return currentLogFile;
}

/**
 * 获取所有日志文件列表
 */
export function getLogFiles(): string[] {
    try {
        if (!fs.existsSync(config.logDir)) {
            return [];
        }
        return fs.readdirSync(config.logDir)
            .filter(f => f.startsWith('app-') && f.endsWith('.log'))
            .sort()
            .reverse()
            .map(f => path.join(config.logDir, f));
    } catch {
        return [];
    }
}

/**
 * 清空所有日志文件
 */
export function clearAllLogs(): void {
    try {
        const files = getLogFiles();
        for (const file of files) {
            fs.unlinkSync(file);
        }
        currentLogSize = 0;
        info('Logger', '所有日志文件已清空');
    } catch (err) {
        console.error('清空日志文件失败:', err);
    }
}

/**
 * 重定向控制台输出到日志系统
 * 将 console.log 和 console.error 重定向到 logger
 */
export function redirectConsole(): void {
    // 保存原始的 console 方法
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;

    // 重写 console.log
    console.log = (...args: unknown[]) => {
        const message = args.map(arg => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');

        info('Console', message);
    };

    // 重写 console.error
    console.error = (...args: unknown[]) => {
        const message = args.map(arg => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');

        error('Console', message);
    };

    // 重写 console.warn
    console.warn = (...args: unknown[]) => {
        const message = args.map(arg => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');

        warn('Console', message);
    };

    // 保存原始方法以便需要时恢复
    (console as Console & { _originalLog?: typeof console.log; _originalError?: typeof console.error; _originalWarn?: typeof console.warn })._originalLog = originalConsoleLog;
    (console as Console & { _originalLog?: typeof console.log; _originalError?: typeof console.error; _originalWarn?: typeof console.warn })._originalError = originalConsoleError;
    (console as Console & { _originalLog?: typeof console.log; _originalError?: typeof console.error; _originalWarn?: typeof console.warn })._originalWarn = originalConsoleWarn;
}

/**
 * 恢复原始的 console 方法
 */
export function restoreConsole(): void {
    const extendedConsole = console as Console & { _originalLog?: typeof console.log; _originalError?: typeof console.error; _originalWarn?: typeof console.warn };
    if (extendedConsole._originalLog) {
        console.log = extendedConsole._originalLog;
    }
    if (extendedConsole._originalError) {
        console.error = extendedConsole._originalError;
    }
    if (extendedConsole._originalWarn) {
        console.warn = extendedConsole._originalWarn;
    }
}

// 默认导出
export default {
    init: initLogger,
    debug,
    info,
    warn,
    error,
    createLogger,
    getLogDir,
    getCurrentLogFile,
    getLogFiles,
    clearAllLogs,
    redirectConsole,
    restoreConsole
};
