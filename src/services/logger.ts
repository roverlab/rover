/**
 * Frontend logging module
 * Send logs to main process logger via IPC
 * Use buffering mechanism to optimize performance
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// 错误提示配置
const ERROR_TOAST_CONFIG = {
    duration: 5000,        // 显示时长（毫秒）
    maxToasts: 3,          // 最大同时显示数量
};

// 当前显示的错误提示
let activeErrorToasts: HTMLDivElement[] = [];

/**
 * 创建并显示简洁的错误提示
 * 使用原生 DOM 实现，不依赖 React
 */
function showErrorToast(message: string, type: 'error' | 'warning' = 'error'): void {
    // 限制最大数量
    if (activeErrorToasts.length >= ERROR_TOAST_CONFIG.maxToasts) {
        const oldest = activeErrorToasts.shift();
        oldest?.remove();
    }

    // 创建提示元素
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: ${20 + activeErrorToasts.length * 60}px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 99999;
        background: ${type === 'error' ? 'rgba(239, 68, 68, 0.95)' : 'rgba(245, 158, 11, 0.95)'};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 200px;
        max-width: 400px;
        backdrop-filter: blur(8px);
        animation: errorToastSlideIn 0.3s ease-out;
        pointer-events: auto;
    `;

    // 添加图标
    const icon = type === 'error' ? '✕' : '⚠';
    toast.innerHTML = `
        <span style="font-size: 16px; font-weight: bold;">${icon}</span>
        <span style="flex: 1; line-height: 1.4;">${escapeHtml(message)}</span>
        <button style="
            background: none;
            border: none;
            color: white;
            cursor: pointer;
            font-size: 18px;
            line-height: 1;
            padding: 0 4px;
            opacity: 0.8;
            transition: opacity 0.2s;
        " onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.8'">×</button>
    `;

    // 添加关闭按钮事件
    const closeBtn = toast.querySelector('button');
    closeBtn?.addEventListener('click', () => removeErrorToast(toast));

    // 添加动画样式（如果还没有）
    if (!document.getElementById('error-toast-styles')) {
        const style = document.createElement('style');
        style.id = 'error-toast-styles';
        style.textContent = `
            @keyframes errorToastSlideIn {
                from {
                    opacity: 0;
                    transform: translateX(-50%) translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }
            }
            @keyframes errorToastSlideOut {
                from {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }
                to {
                    opacity: 0;
                    transform: translateX(-50%) translateY(-20px);
                }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(toast);
    activeErrorToasts.push(toast);

    // 自动移除
    setTimeout(() => removeErrorToast(toast), ERROR_TOAST_CONFIG.duration);
}

/**
 * 移除错误提示
 */
function removeErrorToast(toast: HTMLDivElement): void {
    const index = activeErrorToasts.indexOf(toast);
    if (index === -1) return;

    activeErrorToasts.splice(index, 1);
    toast.style.animation = 'errorToastSlideOut 0.3s ease-in forwards';
    
    setTimeout(() => {
        toast.remove();
        // 重新计算位置
        activeErrorToasts.forEach((t, i) => {
            t.style.top = `${20 + i * 60}px`;
        });
    }, 300);
}

/**
 * 转义 HTML 特殊字符
 */
function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 提取简洁的错误消息
 */
function getSimpleErrorMessage(message: string): string {
    // 取第一行，限制长度
    const firstLine = message.split('\n')[0];
    if (firstLine.length > 100) {
        return firstLine.substring(0, 100) + '...';
    }
    return firstLine;
}

// 日志缓冲配置
const BUFFER_CONFIG = {
    maxSize: 50,           // 缓冲区最大条数
    flushInterval: 1000,   // 定时刷新间隔（毫秒）
};

// 日志条目
interface LogEntry {
    level: LogLevel;
    module: string;
    message: string;
}

// 日志缓冲区
let logBuffer: LogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isFlushing = false;

/**
 * 刷新日志缓冲区到主进程
 */
async function flushBuffer(): Promise<void> {
    if (isFlushing || logBuffer.length === 0) return;

    isFlushing = true;
    const logsToSend = logBuffer;
    logBuffer = [];

    try {
        // 批量发送日志
        await window.ipcRenderer.logger.logBatch(logsToSend);
    } catch {
        // 如果批量发送失败，尝试逐条发送（兼容旧版本）
        for (const log of logsToSend) {
            try {
                await window.ipcRenderer.logger.log(log.level, log.module, log.message);
            } catch {
                // 静默忽略
            }
        }
    }

    isFlushing = false;
}

/**
 * 调度刷新
 */
function scheduleFlush(): void {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        flushBuffer();
    }, BUFFER_CONFIG.flushInterval);
}

/**
 * 写入日志到缓冲区
 */
function writeLog(level: LogLevel, module: string, message: string): void {
    logBuffer.push({ level, module, message });

    // 缓冲区满时立即刷新
    if (logBuffer.length >= BUFFER_CONFIG.maxSize) {
        if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
        }
        flushBuffer();
    } else {
        scheduleFlush();
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
 * Error 级别日志（立即刷新）
 */
export function error(module: string, message: string): void {
    writeLog('error', module, message);
    // error 级别立即刷新，确保错误日志不丢失
    // flushBuffer();
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
 * 格式化堆栈信息，提取关键位置信息
 */
function formatStackTrace(stack: string | undefined): string {
    if (!stack) return '';
    // 提取关键行（文件名、行号、列号）
    const lines = stack.split('\n').slice(0, 10); // 最多取前10行
    return lines.map(line => line.trim()).join('\n    ');
}

/**
 * 详细序列化错误对象
 */
function stringifyError(arg: unknown): string {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (typeof arg === 'string') return arg;
    if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
    
    if (arg instanceof Error) {
        const errorInfo = {
            name: arg.name,
            message: arg.message,
            stack: formatStackTrace(arg.stack),
            // @ts-ignore - 某些错误可能有额外属性
            code: arg.code,
            // @ts-ignore
            cause: arg.cause,
        };
        // 尝试获取更多上下文
        const context = {
            url: window.location?.href,
            timestamp: new Date().toISOString(),
            userAgent: navigator?.userAgent,
        };
        return `${errorInfo.name}: ${errorInfo.message}\n  Stack: ${errorInfo.stack}\n  Context: ${JSON.stringify(context)}`;
    }
    
    if (arg instanceof Date) return arg.toISOString();

    // 对象和数组使用 JSON
    try {
        return JSON.stringify(arg, null, 2);
    } catch {
        return String(arg);
    }
}

/**
 * 简单序列化（比 JSON.stringify 更快）
 */
function fastStringify(arg: unknown): string {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (typeof arg === 'string') return arg;
    if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
    if (arg instanceof Error) return stringifyError(arg);
    if (arg instanceof Date) return arg.toISOString();

    // 对象和数组使用 JSON
    try {
        return JSON.stringify(arg);
    } catch {
        return String(arg);
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
        const message = args.map(fastStringify).join(' ');
        info('Renderer', message);
    };

    // 重写 console.error
    console.error = (...args: unknown[]) => {
        const message = args.map(fastStringify).join(' ');
        error('Renderer', message);
    };

    // 重写 console.warn
    console.warn = (...args: unknown[]) => {
        const message = args.map(fastStringify).join(' ');
        warn('Renderer', message);
    };

    // 保存原始方法以便需要时恢复
    (console as Console & { _originalLog?: typeof console.log; _originalError?: typeof console.error; _originalWarn?: typeof console.warn })._originalLog = originalConsoleLog;
    (console as Console & { _originalLog?: typeof console.log; _originalError?: typeof console.error; _originalWarn?: typeof console.warn })._originalError = originalConsoleError;
    (console as Console & { _originalLog?: typeof console.log; _originalError?: typeof console.error; _originalWarn?: typeof console.warn })._originalWarn = originalConsoleWarn;

    // 页面卸载前刷新缓冲区
    window.addEventListener('beforeunload', () => {
        flushBuffer();
    });
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

    // 刷新剩余日志
    flushBuffer();
}

/**
 * 全局错误处理器
 * 捕获未处理的异常和 Promise 拒绝
 */
export function setupGlobalErrorHandler(): void {
    // 捕获同步错误
    window.addEventListener('error', (event: ErrorEvent) => {
        const { message, filename, lineno, colno, error: eventError } = event;
        
        const errorDetails = {
            type: 'Uncaught Error',
            message,
            filename,
            line: lineno,
            column: colno,
            stack: eventError?.stack || 'No stack trace',
            url: window.location?.href,
            timestamp: new Date().toISOString(),
        };
        
        error('GlobalErrorHandler', 
            `Uncaught Error\n  Message: ${message}\n  File: ${filename}:${lineno}:${colno}\n  Stack: ${errorDetails.stack}\n  URL: ${errorDetails.url}`
        );
        
        // 显示简洁的错误提示
        showErrorToast(getSimpleErrorMessage(message), 'error');
        
        // 阻止默认的错误处理（开发环境下 React 会显示错误覆盖层）
        event.preventDefault();
    });

    // 捕获未处理的 Promise 拒绝
    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
        const { reason } = event;
        
        let errorInfo: string;
        if (reason instanceof Error) {
            errorInfo = stringifyError(reason);
        } else if (typeof reason === 'string') {
            errorInfo = reason;
        } else {
            try {
                errorInfo = JSON.stringify(reason, null, 2);
            } catch {
                errorInfo = String(reason);
            }
        }
        
        const context = {
            url: window.location?.href,
            timestamp: new Date().toISOString(),
        };
        
        error('GlobalErrorHandler', 
            `Unhandled Promise Rejection\n  Reason: ${errorInfo}\n  Context: ${JSON.stringify(context)}`
        );
        
        // 显示简洁的错误提示
        const simpleMessage = reason instanceof Error ? reason.message : String(reason).substring(0, 100);
        showErrorToast(simpleMessage, 'error');
        
        event.preventDefault();
    });

    // 捕获资源加载错误（如图片、脚本加载失败）
    window.addEventListener('error', (event: Event) => {
        const target = event.target as HTMLElement;
        
        // 只处理元素错误事件（不处理 window error）
        if (target && !(target instanceof Window)) {
            const tagName = target.tagName;
            const src = (target as HTMLImageElement).src || (target as HTMLScriptElement).src || '';
            
            if (tagName && src) {
                warn('ResourceLoader', 
                    `Resource Load Failed\n  Tag: ${tagName}\n  Source: ${src}\n  URL: ${window.location?.href}`
                );
            }
        }
    }, true); // 使用捕获阶段
}

/**
 * 记录 React 组件错误
 */
export function logReactError(error: Error, errorInfo: { componentStack: string }): void {
    const context = {
        url: window.location?.href,
        timestamp: new Date().toISOString(),
    };
    
    // Log React error using local error function
    writeLog('error', 'ReactError', 
        `React Component Error\n  Error: ${error.name}: ${error.message}\n  Component Stack: ${errorInfo.componentStack}\n  Error Stack: ${error.stack || 'No stack'}\n  Context: ${JSON.stringify(context)}`
    );
    flushBuffer();
}

// 默认导出
export default {
    debug,
    info,
    warn,
    error,
    createLogger,
    redirectConsole,
    restoreConsole,
    flushBuffer,
    setupGlobalErrorHandler,
    logReactError,
};
