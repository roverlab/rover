/**
 * Sing-box Manager
 *
 * 提供 sing-box 内核管理的统一入口，支持两种模式：
 * 1. 本地模式: 不开启 TUN 时，直接使用普通用户启动 sing-box 进程
 * 2. 服务模式: 开启 TUN 时，通过 RoverService 服务启动（需要 root 权限）
 *
 * 内部使用 ISingboxController 接口抽象实现
 */

import { app } from 'electron';
import { createLogger } from './logger';
import { getSingboxBinaryPath as getSingboxBinaryPathFromPaths } from './paths';
import {
    ISingboxController,
    LocalSingboxController,
    ServiceSingboxController,
    SingboxStatus,
    CreateControllerOptions,
} from './singbox-controller';
import { setTunDns, restoreDns } from './dns-macos';

const log = createLogger('Singbox');

// Controller 实例
let controller: ISingboxController | null = null;

/**
 * 获取或创建 Controller 实例
 * 
 * 简化逻辑：只有两种情况
 * 1. 不开启 TUN → 使用普通用户启动
 * 2. 开启 TUN → 使用 RootService 使用 root 权限
 */
async function getController(): Promise<ISingboxController> {
    if (controller) {
        return controller;
    }

    // 简化逻辑：TUN 模式启用 → 使用 ServiceSingboxController
    if (isTunModeEnabled()) {
        log.info('TUN 模式已启用，使用 ServiceSingboxController');
        controller = new ServiceSingboxController();
        return controller;
    }

    // TUN 模式未启用 → 使用 LocalSingboxController
    log.info('TUN 模式未启用，使用 LocalSingboxController');
    controller = new LocalSingboxController();
    return controller;
}

/**
 * 重置 Controller（用于切换模式时）
 * 
 * 会先停止当前运行的 sing-box 进程，等待端口释放，然后重置控制器
 */
export async function resetController(): Promise<void> {
    if (controller) {
        try {
            const running = await controller.isRunning();
            if (running) {
                log.info('重置控制器前停止 sing-box 进程...');
                await controller.stop();
                log.info('sing-box 进程已停止');
                
                // 等待端口释放（进程停止后端口可能需要一些时间才能释放）
                const portReleaseDelay = 600;
                log.info(`等待 ${portReleaseDelay}ms 以确保端口释放...`);
                await new Promise((r) => setTimeout(r, portReleaseDelay));
                log.info('端口释放等待完成');
            }
        } catch (err: any) {
            log.warn(`停止 sing-box 进程时出错: ${err.message}`);
        }
    }
    controller = null;
    log.info('控制器已重置');
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
 * 检查 RoverService 是否可用
 */
export function isRoverServiceAvailable(): boolean {
    const roverservice = require('./roverservice-client');
    if (!roverservice.isSupported()) return false;
    return roverservice.isServiceLoaded();
}

/**
 * 启动 sing-box
 */
export async function startSingbox(configPath: string, binaryPath: string): Promise<void> {
    const ctrl = await getController();
    await ctrl.start(configPath, binaryPath);

    // macOS TUN 模式：设置系统 DNS
    if (process.platform === 'darwin' && isTunModeEnabled()) {
        log.info('macOS TUN mode enabled, setting system DNS to 172.19.0.2...');
        const dnsResult = await setTunDns();
        if (!dnsResult) {
            log.warn('Failed to set TUN DNS, but sing-box is running');
        }
    }
}

/**
 * 停止 sing-box
 */
export async function stopSingbox(): Promise<void> {
    // macOS TUN 模式：恢复系统 DNS
    if (process.platform === 'darwin') {
        log.info('macOS, restoring system DNS...');
        await restoreDns();
    }

    const ctrl = await getController();
    await ctrl.stop();
}

/**
 * 检查 sing-box 是否在运行（同步版本，兼容旧代码）
 */
export function isSingboxRunning(): boolean {
    // 如果有 controller，检查其状态
    if (controller) {
        const pid = controller.getPid();
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
    const { listSystemSingboxPids } = require('./singbox-controller');
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
    if (controller) {
        return controller.getStartTime();
    }
    return null;
}

/**
 * 获取当前 sing-box 进程 PID
 */
export function getSingboxPid(): number | null {
    if (controller) {
        return controller.getPid();
    }
    return null;
}

/**
 * 获取 sing-box 二进制文件路径
 */
export function getSingboxBinaryPath(): string {
    return getSingboxBinaryPathFromPaths();
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
    return controller?.type ?? null;
}

// 导出 RoverService 相关函数和类型
export * from './singbox-controller';
