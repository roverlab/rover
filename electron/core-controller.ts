/**
 * Sing-box Controller Interface
 *
 * 抽象 sing-box 内核控制接口，支持两种实现模式：
 * 1. LocalSingboxController: 本地直接启动 sing-box 进程
 * 2. ServiceSingboxController: 通过 RoverService 服务启动（需要管理员权限）
 */

import { ChildProcess } from 'node:child_process';
import * as net from 'node:net';
import { getSingboxBinaryPath as getSingboxBinaryPathFromPaths } from './paths';
import { t } from './i18n-main';

/**
 * 检查端口是否可绑定（通过实际 bind 检测，避免 TIME_WAIT 误判）
 * connect 检测会误判：TIME_WAIT 时无进程监听会返回 ECONNREFUSED，但端口仍不可 bind
 */
function isPortBindable(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => {
            server.close();
            resolve(false); // 绑定失败 = 端口不可用（被占用或 TIME_WAIT）
        });
        server.once('listening', () => {
            server.close();
            resolve(true); // bind 成功 = 端口可用
        });
        server.listen(port, host);
    });
}

/**
 * 等待端口可绑定（轮询直到可 bind 或超时）
 * 轮询间隔 200ms，总超时 12s（SIGTERM 优雅退出可显著缩短 TIME_WAIT）
 */
async function waitForPortBindable(host: string, port: number, timeoutMs: number): Promise<void> {
    const pollInterval = 200;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const bindable = await isPortBindable(host, port);
        if (bindable) return;
        await new Promise((r) => setTimeout(r, pollInterval));
    }
    throw new Error(t('main.errors.core.portNotReleased', { host, port, timeoutMs }));
}

/**
 * 获取 sing-box 二进制文件路径
 */
export function getSingboxBinaryPath(): string {
    return getSingboxBinaryPathFromPaths();
}

/**
 * sing-box 运行状态
 */
export interface SingboxStatus {
    /** 是否正在运行 */
    running: boolean;
    /** 进程 ID */
    pid?: number;
    /** 启动时间（毫秒时间戳） */
    startTime?: number;
    /** 配置文件路径 */
    configPath?: string;
    /** 二进制文件路径 */
    binaryPath?: string;
}

/**
 * Sing-box Controller 接口
 *
 * 定义了控制 sing-box 内核的标准方法
 */
export interface CoreController {
    /**
     * 控制器类型标识
     */
    readonly type: 'local' | 'service';

    /**
     * 启动 sing-box
     * @param configPath 配置文件路径
     * @param binaryPath 二进制文件路径
     * @throws 启动失败时抛出错误
     */
    start(configPath: string, binaryPath: string): Promise<void>;

    /**
     * 停止 sing-box
     * @throws 停止失败时抛出错误
     */
    stop(): Promise<void>;

    /**
     * 重启 sing-box
     * @param configPath 配置文件路径
     * @param binaryPath 二进制文件路径
     * @throws 重启失败时抛出错误
     */
    restart(configPath: string, binaryPath: string): Promise<void>;

    /**
     * 获取 sing-box 运行状态
     */
    getStatus(): Promise<SingboxStatus>;

    /**
     * 检查 sing-box 是否正在运行
     */
    isRunning(): Promise<boolean>;

    /**
     * 获取启动时间
     */
    getStartTime(): number | null;

    /**
     * 获取进程 ID
     */
    getPid(): number | null;

    /**
     * 检查控制器是否可用
     * - LocalSingboxController: 始终返回 true
     * - ServiceSingboxController: 检查服务是否已安装并运行
     */
    isAvailable(): Promise<boolean>;
}

/**
 * 本地控制器状态（用于跨实例共享状态）
 */
export interface LocalControllerState {
    process: ChildProcess | null;
    pid: number | null;
    startTime: number | null;
}

/**
 * 控制器配置选项
 */
export interface ControllerOptions {
    /** 端口释放等待时间（毫秒） */
    portReleaseDelayMs?: number;
    /** 启动后等待时间（毫秒） */
    startupGraceMs?: number;
}

// ============================================================================
// LocalSingboxController - 本地直接启动 sing-box 进程
// ============================================================================

import { spawn, spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { createLogger } from './logger';
import { getSingboxLogPath } from './paths';

const log = createLogger('SingboxController');

/**
 * 检查进程是否存活
 */
function isProcessAlive(pid: number | null | undefined): boolean {
    if (!pid || pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

/**
 * 列出系统中所有 sing-box 进程 PID
 */
export function listSystemSingboxPids(): number[] {
    if (process.platform === 'win32') {
        const result = spawnSync('tasklist', ['/fo', 'csv', '/nh', '/fi', 'IMAGENAME eq sing-box.exe'], {
            encoding: 'utf8',
            windowsHide: true
        });
        const output = (result.stdout || '').trim();
        if (!output || output.includes('INFO: No tasks are running')) {
            return [];
        }
        return output
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
                const parts = line.replace(/^"|"$/g, '').split('","');
                const pidText = parts[1] || '';
                const pid = Number.parseInt(pidText, 10);
                return Number.isFinite(pid) ? pid : null;
            })
            .filter((pid): pid is number => pid !== null && pid > 0);
    }

    const result = spawnSync('pgrep', ['-x', 'sing-box'], { encoding: 'utf8' });
    const output = (result.stdout || '').trim();
    if (!output) return [];
    return output
        .split(/\r?\n/)
        .map((line) => Number.parseInt(line.trim(), 10))
        .filter((pid) => Number.isFinite(pid) && pid > 0);
}

/**
 * 通过 PID 终止进程
 * 如果本地终止失败，会尝试通过 RoverService 终止
 */
async function killByPid(pid: number): Promise<boolean> {
    // First try local termination
    const localResult = await killByPidLocal(pid);
    if (localResult) {
        return true;
    }

    // Local termination failed, try RoverService if available
    log.info(`Failed to kill process ${pid} locally, trying via RoverService`);
    try {
        if (await isRoverServiceAvailable()) {
            const response = await roverservice.killProcess(pid, true);
            if (response.success) {
                log.info(`Successfully killed process ${pid} via RoverService`);
                return true;
            }
            log.warn(`RoverService failed to kill process ${pid}: ${response.error}`);
        }
    } catch (err: any) {
        log.warn(`RoverService call failed: ${err.message}`);
    }

    return false;
}

/**
 * 通过 PID 终止进程（本地方式）
 */
function killByPidLocal(pid: number): Promise<boolean> {
    return new Promise((resolve) => {
        if (process.platform === 'win32') {
            log.info(`Using taskkill to terminate process tree, PID: ${pid}`);
            const killer = spawn('taskkill', ['/pid', String(pid), '/f', '/t'], { stdio: 'ignore' });
            killer.once('error', (err) => {
                log.error(`taskkill execution failed: ${err.message}`);
                resolve(false);
            });
            killer.once('exit', (code) => {
                log.info(`taskkill completed, exit code: ${code}`);
                resolve(code === 0);
            });
            return;
        }

        try {
            process.kill(pid, 'SIGTERM');
        } catch (err: any) {
            log.warn(`Failed to send SIGTERM: ${err?.message || err}`);
        }
        setTimeout(() => {
            if (isProcessAlive(pid)) {
                try {
                    process.kill(pid, 'SIGKILL');
                } catch (err: any) {
                    log.warn(`Failed to send SIGKILL: ${err?.message || err}`);
                }
            }
            resolve(!isProcessAlive(pid));
        }, 800);
    });
}

/**
 * 本地 Sing-box 控制器
 *
 * 直接在本地启动 sing-box 进程
 */
export class LocalSingboxController implements CoreController {
    readonly type = 'local' as const;

    private process: ChildProcess | null = null;
    private pid: number | null = null;
    private startTime: number | null = null;
    private options: ControllerOptions;

    constructor(options?: ControllerOptions) {
        this.options = {
            portReleaseDelayMs: 600,
            startupGraceMs: 1500,
            ...options,
        };
    }

    async start(configPath: string, binaryPath: string): Promise<void> {
        // 检查现有进程
        const currentPid = this.process?.pid ?? this.pid;
        const ourProcessAlive = currentPid ? isProcessAlive(currentPid) : false;
        const systemPids = listSystemSingboxPids();
        const hasRunning = ourProcessAlive || systemPids.length > 0;

        if (hasRunning) {
            log.warn('Detected existing sing-box process, stopping first');
            // TUN mode on macOS: use full stop flow to restore DNS
            if (process.platform === 'darwin' && isTunModeEnabled()) {
                log.info('macOS TUN mode, using full stop flow to restore DNS');
                await stopSingbox();
            } else {
                await this.stop();
            }
            log.info(`Waiting ${this.options.portReleaseDelayMs}ms for port release`);
            await new Promise((r) => setTimeout(r, this.options.portReleaseDelayMs));
        } else if (this.process || this.pid) {
            log.info('Process exited, cleaning residual state');
            this.clearState();
        }

        // Ensure clash API port 9090 is released before starting (SIGTERM graceful exit reduces wait)
        // log.info('[Local] Waiting for clash API port 127.0.0.1:9090 to be bindable...');
        // await waitForPortBindable('127.0.0.1', 9090, 12000);
        // log.info('[Local] Port ready');

        const singboxLogPath = getSingboxLogPath();

        log.info(`[Local] Starting sing-box kernel`);
        log.info(`[Local] Config file: ${configPath}`);
        log.info(`[Local] Kernel log file: ${singboxLogPath}`);

        // Ensure log file exists and is writable (handle permission issues from previous service runs)
        try {
            if (fs.existsSync(singboxLogPath)) {
                // Check if we can write to the file
                fs.accessSync(singboxLogPath, fs.constants.W_OK);
            } else {
                // Create the file if it doesn't exist
                fs.writeFileSync(singboxLogPath, '', { mode: 0o644 });
            }
        } catch (err: any) {
            // If we can't access the file (e.g., owned by root from service mode), try to recreate it
            log.warn(`[Local] Log file not accessible (${err.message}), attempting to recreate...`);
            try {
                fs.unlinkSync(singboxLogPath);
                fs.writeFileSync(singboxLogPath, '', { mode: 0o644 });
                log.info('[Local] Log file recreated successfully');
            } catch (recreateErr: any) {
                log.error(`[Local] Failed to recreate log file: ${recreateErr.message}`);
                // Continue anyway, the spawn will handle stderr
            }
        }

        const logStream = fs.createWriteStream(singboxLogPath, { flags: 'a' });
        this.process = spawn(binaryPath, ['run', '-c', configPath], {
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: process.env,
            cwd: path.dirname(configPath)
        });

        this.pid = this.process.pid ?? null;
        this.startTime = Date.now();
        log.info(`[Local] sing-box process started, PID: ${this.pid ?? 'unknown'}`);

        this.process.stderr?.pipe(logStream);

        this.process.on('error', (err) => {
            log.error(`[Local] Failed to start sing-box: ${err.message}`);
            fs.appendFileSync(singboxLogPath, `ERROR: ${err.message}\n`);
            logStream.end();
        });

        this.process.on('exit', (code) => {
            log.info(`[Local] sing-box kernel exited, exit code: ${code}`);
            if (code !== 0) {
                fs.appendFileSync(singboxLogPath, `EXIT: status ${code}\n`);
            }
            logStream.end();
            this.clearState();
        });

        // 启动后短时间内退出通常表示配置错误/端口占用
        await this.waitForStartup(this.options.startupGraceMs!);
    }

    async stop(): Promise<void> {
        const currentPid = this.process?.pid ?? this.pid;
        const actuallyAlive = currentPid ? isProcessAlive(currentPid) : false;
        log.info(`[Local] Request to stop sing-box kernel, current status: ${actuallyAlive ? 'running' : 'not running'}`);

        // 进程已退出，直接清理状态
        if (currentPid && !actuallyAlive) {
            log.info(`[Local] Process exited, cleaning state, PID: ${currentPid}`);
            this.clearState();
            return;
        }

        if (!currentPid || !actuallyAlive) {
            const pids = listSystemSingboxPids();
            if (pids.length === 0) {
                this.clearState();
                return;
            }

            log.warn(`[Local] Detected system sing-box processes: ${pids.join(', ')}`);

            // 尝试终止
            for (const fallbackPid of pids) {
                await killByPid(fallbackPid);
            }

            const remaining = listSystemSingboxPids();
            if (remaining.length > 0) {
                log.warn(`[Local] Processes still running after stop: ${remaining.join(', ')}`);
                this.process = null;
                this.pid = remaining[0];
                throw new Error(t('main.errors.core.stopFailedStillRunning', { pids: remaining.join(', ') }));
            }

            this.clearState();
            return;
        }

        const stopped = await killByPid(currentPid);

        if (!stopped || isProcessAlive(currentPid)) {
            log.warn(`[Local] Process still running after stop, PID: ${currentPid}`);
            this.process = null;
            this.pid = currentPid;
            throw new Error(t('main.errors.core.stopFailedPidRunning', { pid: String(currentPid) }));
        }

        log.info(`[Local] sing-box kernel stopped, PID: ${currentPid}`);
        this.clearState();
    }

    async restart(configPath: string, binaryPath: string): Promise<void> {
        log.info('[Local] Restarting sing-box');
        await this.stop();
        await new Promise((r) => setTimeout(r, this.options.portReleaseDelayMs!));
        await this.start(configPath, binaryPath);
    }

    async getStatus(): Promise<SingboxStatus> {
        const currentPid = this.process?.pid ?? this.pid;
        const alive = currentPid ? isProcessAlive(currentPid) : false;

        if (!alive) {
            // 检查系统是否有 sing-box 进程
            const systemPids = listSystemSingboxPids();
            if (systemPids.length > 0) {
                return {
                    running: true,
                    pid: systemPids[0],
                };
            }
            return { running: false };
        }

        return {
            running: true,
            pid: currentPid ?? undefined,
            startTime: this.startTime ?? undefined,
        };
    }

    async isRunning(): Promise<boolean> {
        const status = await this.getStatus();
        return status.running;
    }

    getStartTime(): number | null {
        return this.startTime;
    }

    getPid(): number | null {
        return this.pid;
    }

    async isAvailable(): Promise<boolean> {
        return true; // 本地控制器始终可用
    }

    private clearState(): void {
        this.process = null;
        this.pid = null;
        this.startTime = null;
    }

    private async waitForStartup(graceMs: number): Promise<void> {
        const proc = this.process;
        if (!proc) {
            throw new Error(t('main.errors.core.processCreationFailed'));
        }

        return new Promise((resolve, reject) => {
            let settled = false;
            const cleanup = () => {
                clearTimeout(timer);
                proc.off('exit', onEarlyExit);
                proc.off('error', onEarlyError);
            };

            const onEarlyExit = (code: number | null, signal: string | null) => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(
                    new Error(
                        t('main.errors.core.exitedImmediately', {
                            code: String(code ?? 'null'),
                            signal: String(signal ?? 'null')
                        })
                    )
                );
            };

            const onEarlyError = (err: Error) => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(new Error(t('main.errors.core.failedToStart', { message: err.message })));
            };

            const timer = setTimeout(() => {
                if (settled) return;
                const currentPid = proc.pid ?? null;
                const alive = currentPid ? isProcessAlive(currentPid) : true;
                if (!alive) {
                    settled = true;
                    cleanup();
                    reject(new Error(t('main.errors.core.exitedImmediatelyShort')));
                    return;
                }
                settled = true;
                cleanup();
                resolve();
            }, graceMs);

            proc.once('exit', onEarlyExit);
            proc.once('error', onEarlyError);
        });
    }
}

// ============================================================================
// ServiceSingboxController - 通过 RoverService 服务启动 sing-box
// ============================================================================

import * as roverservice from './roverservice-client';

/**
 * Check if RoverService service is available
 */
async function isRoverServiceAvailable(): Promise<boolean> {
    try {
        return roverservice.isSupported() && roverservice.isServiceLoaded();
    } catch {
        return false;
    }
}

/**
 * Service Sing-box 控制器
 *
 * 通过 RoverService 服务启动 sing-box（需要管理员权限）
 */
export class ServiceSingboxController implements CoreController {
    readonly type = 'service' as const;

    private pid: number | null = null;
    private startTime: number | null = null;
    private options: ControllerOptions;

    constructor(options?: ControllerOptions) {
        this.options = {
            portReleaseDelayMs: 600,
            ...options,
        };
    }

    async start(configPath: string, binaryPath: string): Promise<void> {
        log.info('[Service] Using RoverService mode to start sing-box');
        log.info(`[Service] Config: ${configPath}`);
        log.info(`[Service] Binary: ${binaryPath}`);

        // 直接启动，让 RoverService 处理现有进程的停止
        // RoverService 的 startSingbox 内部会检查并停止现有进程
        // 这样可以减少一次 HTTP 请求，提高启动速度
        const response = await roverservice.startSingbox(configPath, binaryPath);

        if (!response.success) {
            // 如果错误是因为进程已在运行，先停止再启动
            if (response.error?.includes('already running')) {
                log.warn('[Service] sing-box already running, stopping first then starting');
                await roverservice.stopSingbox();
                await new Promise((r) => setTimeout(r, this.options.portReleaseDelayMs!));
                // 重试启动
                const retryResponse = await roverservice.startSingbox(configPath, binaryPath);
                if (!retryResponse.success) {
                    throw new Error(
                        t('main.errors.core.roverServiceStartFailed', {
                            detail: String(retryResponse.error || retryResponse.message || 'unknown error')
                        })
                    );
                }
                this.pid = retryResponse.data?.pid ?? null;
                this.startTime = retryResponse.data?.startTime ? retryResponse.data.startTime * 1000 : Date.now();
            } else {
                throw new Error(
                    t('main.errors.core.roverServiceStartFailed', {
                        detail: String(response.error || response.message || 'unknown error')
                    })
                );
            }
        } else {
            // 更新本地状态
            this.pid = response.data?.pid ?? null;
            this.startTime = response.data?.startTime ? response.data.startTime * 1000 : Date.now();
        }

        log.info(`[Service] Started via RoverService, PID: ${this.pid}`);
    }

    async stop(): Promise<void> {
        log.info('[Service] Using RoverService mode to stop sing-box');

        const response = await roverservice.stopSingbox();

        if (!response.success) {
            if (response.error?.includes('not running')) {
                log.info('[Service] RoverService reports sing-box not running');
            } else {
                throw new Error(
                    t('main.errors.core.roverServiceStopFailed', { detail: String(response.error || 'unknown error') })
                );
            }
        }

        this.clearState();
        log.info('[Service] Stopped via RoverService');
    }

    async restart(configPath: string, binaryPath: string): Promise<void> {
        log.info('[Service] Restarting sing-box');

        // 使用服务的 restart API
        const response = await roverservice.restartSingbox();

        if (!response.success) {
            // 如果 restart 失败，尝试手动 stop + start
            log.warn('[Service] restart API failed, trying manual stop + start');
            // TUN mode on macOS: use full stop flow to restore DNS
            if (process.platform === 'darwin' && isTunModeEnabled()) {
                log.info('macOS TUN mode, using full stop flow to restore DNS');
                await stopSingbox();
            } else {
                await this.stop();
            }
            await new Promise((r) => setTimeout(r, this.options.portReleaseDelayMs!));
            await this.start(configPath, binaryPath);
            return;
        }

        this.pid = response.data?.pid ?? null;
        this.startTime = response.data?.startTime ? response.data.startTime * 1000 : Date.now();

        log.info(`[Service] Restarted via RoverService, PID: ${this.pid}`);
    }

    async getStatus(): Promise<SingboxStatus> {
        const response = await roverservice.getSingboxStatus();
        if (response.success && response.data) {
            return {
                running: response.data.running,
                pid: response.data.pid,
                startTime: response.data.startTime ? response.data.startTime * 1000 : undefined,
                configPath: response.data.configPath,
                binaryPath: response.data.binaryPath,
            };
        }
        return { running: false };
    }

    async isRunning(): Promise<boolean> {
        const status = await this.getStatus();
        return status.running;
    }

    getStartTime(): number | null {
        return this.startTime;
    }

    getPid(): number | null {
        return this.pid;
    }

    async isAvailable(): Promise<boolean> {
        if (!roverservice.isSupported()) return false;
        return roverservice.isServiceLoaded();
    }

    private clearState(): void {
        this.pid = null;
        this.startTime = null;
    }
}

// ============================================================================
// Controller Factory
// ============================================================================

/**
 * 控制器工厂选项
 */
export interface CreateControllerOptions extends ControllerOptions {
    /** 是否强制使用本地模式 */
    forceLocal?: boolean;
    /** 是否强制使用服务模式 */
    forceService?: boolean;
    /** 自定义判断函数 */
    shouldUseService?: () => boolean;
}

/**
 * 创建 Sing-box 控制器
 *
 * 根据条件自动选择 Local 或 Service 控制器
 */
export async function createSingboxController(options?: CreateControllerOptions): Promise<CoreController> {
    // 强制使用本地模式
    if (options?.forceLocal) {
        log.info('Using local controller mode (forced)');
        return new LocalSingboxController(options);
    }

    // 强制使用服务模式
    if (options?.forceService) {
        log.info('Using service controller mode (forced)');
        const controller = new ServiceSingboxController(options);
        if (!(await controller.isAvailable())) {
            throw new Error(t('main.errors.core.roverServiceUnavailable'));
        }
        return controller;
    }

    // 自定义判断
    if (options?.shouldUseService) {
        if (options.shouldUseService()) {
            const controller = new ServiceSingboxController(options);
            if (await controller.isAvailable()) {
                log.info('Using service controller mode (custom check)');
                return controller;
            }
            log.warn('Service controller unavailable, falling back to local mode');
        }
        return new LocalSingboxController(options);
    }

    // 默认：检查服务是否可用
    const serviceController = new ServiceSingboxController(options);
    if (await serviceController.isAvailable()) {
        log.info('Using service controller mode (auto detected)');
        return serviceController;
    }

    log.info('Using local controller mode (auto detected)');
    return new LocalSingboxController(options);
}

/**
 * 创建本地控制器
 */
export function createLocalController(options?: ControllerOptions): LocalSingboxController {
    return new LocalSingboxController(options);
}

/**
 * 创建服务控制器
 */
export function createServiceController(options?: ControllerOptions): ServiceSingboxController {
    return new ServiceSingboxController(options);
}

// ============================================================================
// Singbox Manager - 高级管理功能
// ============================================================================

import { setTunDns, restoreDns, clearAllDns } from './dns-macos';

const managerLog = createLogger('Singbox');

// Controller 实例缓存
let controllerInstance: CoreController | null = null;

/**
 * 获取或创建 Controller 实例
 *
 * 简化逻辑：只有两种情况
 * 1. 不开启 TUN → 使用普通用户启动
 * 2. 开启 TUN → 使用 RootService 使用 root 权限
 */
async function getController(): Promise<CoreController> {
    if (controllerInstance) {
        return controllerInstance;
    }

    // 简化逻辑：TUN 模式启用 → 使用 ServiceSingboxController
    if (isTunModeEnabled()) {
        managerLog.info('TUN mode enabled, using ServiceSingboxController');
        controllerInstance = new ServiceSingboxController();
        return controllerInstance;
    }

    // TUN 模式未启用 → 使用 LocalSingboxController
        managerLog.info('TUN mode disabled, using LocalSingboxController');
    controllerInstance = new LocalSingboxController();
    return controllerInstance;
}

/**
 * 重置 Controller（用于切换模式时）
 *
 * 会先停止当前运行的 sing-box 进程，等待端口释放，然后重置控制器
 */
export async function resetController(): Promise<void> {
    if (controllerInstance) {
        try {
            const running = await controllerInstance.isRunning();
            if (running) {
                managerLog.info('Resetting controller, stopping sing-box process...');
                
                // 在重置控制器前先恢复DNS（如果是在TUN模式下）
                if (process.platform === 'darwin' && isTunModeEnabled()) {
                    managerLog.info('macOS TUN mode, restoring system DNS...');
                    await restoreDns();
                }
                
                await controllerInstance.stop();
                managerLog.info('sing-box process stopped');

                // 等待端口释放（TUN 模式下进程停止后端口释放可能较慢，尤其是 clash_api 9090）
                const portReleaseDelay = 600;
                managerLog.info(`Waiting ${portReleaseDelay}ms for port release...`);
                await new Promise((r) => setTimeout(r, portReleaseDelay));
                managerLog.info('Port release wait complete');
            }
        } catch (err: any) {
            managerLog.warn(`Error stopping sing-box process: ${err.message}`);
        }
    }
    controllerInstance = null;
    managerLog.info('Controller reset');
}

/**
 * 检查 TUN 模式是否启用
 */
export function isTunModeEnabled(): boolean {
    const settings = require('./db').getAllSettings();
    return settings['dashboard-tun-mode'] === 'true';
}

/**
 * 检查是否应该使用 RoverService 模式
 *
 * 简化逻辑：TUN 模式启用时需要使用 RoverService
 */
export function shouldUseRoverService(): boolean {
    return isTunModeEnabled();
}

/**
 * 启动 sing-box
 */
export async function startSingbox(configPath: string, binaryPath: string): Promise<void> {
    const ctrl = await getController();
    await ctrl.start(configPath, binaryPath);

    // macOS TUN 模式：设置系统 DNS
    if (process.platform === 'darwin' && isTunModeEnabled()) {
        managerLog.info('macOS TUN mode enabled, setting system DNS to 172.19.0.2...');
        const dnsResult = await setTunDns();
        if (!dnsResult) {
            managerLog.warn('Failed to set TUN DNS, but sing-box is running');
        }
    }
}

/**
 * 停止 sing-box
 */
export async function stopSingbox(): Promise<void> {
    const ctrl = await getController();
    
    // macOS TUN 模式：恢复系统 DNS
    if (process.platform === 'darwin' && isTunModeEnabled()) {
        managerLog.info('macOS TUN mode enabled, restoring system DNS before stopping sing-box...');
        await clearAllDns();
    }

    await ctrl.stop();
}

/**
 * 检查 sing-box 是否在运行（同步版本，兼容旧代码）
 */
export function isSingboxRunning(): boolean {
    // 如果有 controller，检查其状态
    if (controllerInstance) {
        const pid = controllerInstance.getPid();
        if (pid) {
            try {
                process.kill(pid, 0);
                return true;
            } catch {
                // 进程不存在
            }
        }
    }

    // 回退到检查系统进程
    return listSystemSingboxPids().length > 0;
}

/**
 * 异步检查 sing-box 是否在运行
 */
export async function isSingboxRunningAsync(): Promise<boolean> {
    const ctrl = await getController();
    return ctrl.isRunning();
}

/**
 * 获取 sing-box 启动时间
 */
export function getSingboxStartTime(): number | null {
    if (controllerInstance) {
        return controllerInstance.getStartTime();
    }
    return null;
}

/**
 * 获取当前 sing-box 进程 PID
 */
export function getSingboxPid(): number | null {
    if (controllerInstance) {
        return controllerInstance.getPid();
    }
    return null;
}

/**
 * 获取 sing-box 状态
 */
export async function getSingboxStatus(): Promise<SingboxStatus> {
    const ctrl = await getController();
    return ctrl.getStatus();
}

/**
 * 获取当前使用的 Controller 类型
 */
export function getControllerType(): 'local' | 'service' | null {
    return controllerInstance?.type ?? null;
}
