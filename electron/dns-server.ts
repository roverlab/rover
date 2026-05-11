/**
 * Rover DNS 服务启停管理
 * 独立模块，避免 app-utils 与 config-file 之间的循环依赖
 */

import { app } from 'electron';
import path from 'node:path';
import * as dbUtils from './db';
import { getDataDir } from './paths';
import { createLogger } from './logger';

const log = createLogger('RoverDNS');

/** 内部实现：发送启动请求到 roverservice */
async function doStartDnsServer(): Promise<void> {
    const settings = dbUtils.getAllSettings();
    const dnsPort = settings['dns-server-port'] || '5353';

    const req: any = {
        address: `127.0.0.1:${dnsPort}`,
        cert_dir: path.join(getDataDir(), 'dns'),
        enable_log: !app.isPackaged,
    };

    const roverservice = await import('./roverservice-client');
    const result = await roverservice.startDnsServer(req);
    if (result.success) {
        log.info(`Started on 127.0.0.1:${dnsPort}`);
    } else {
        log.warn(`Failed to start: ${result.error}`);
    }
}

/**
 * 确保 rover DNS 服务与配置一致
 * 检查 dns-server-enabled 设置，如果开启但实际 DNS 服务未运行则自动启动
 * 适用于应用启动时同步 DNS 服务状态
 */
export async function ensureRoverDns(): Promise<void> {
    log.info('ensureRoverDns() called');
    try {
        const settings = dbUtils.getAllSettings();
        const dnsServerEnabled = settings['dns-server-enabled'] !== 'false';

        if (!dnsServerEnabled) {
            log.info('DNS server is disabled, skipping');
            return;
        }

        // 检查 DNS 服务实际运行状态
        const roverservice = await import('./roverservice-client');
        const statusResult = await roverservice.getDnsStatus();

        if (statusResult.success && statusResult.data?.running) {
            log.info(`DNS server is already running on ${statusResult.data.address || 'unknown address'}`);
            return;
        }

        log.info('DNS server is enabled but not running, starting...');
        await doStartDnsServer();
    } catch (err: any) {
        log.warn(`ensureRoverDns error: ${err?.message || err}`);
    }
}

/**
 * 启动 rover DNS 服务
 * 供 IPC 调用使用（如 dns-server-enabled 设置变更时）
 * 内部会检查配置和运行状态，避免重复启动
 */
export async function startRoverDns(): Promise<void> {
    log.info('startRoverDns() called');
    try {
        await ensureRoverDns();
    } catch (err: any) {
        log.warn(`startRoverDns error: ${err?.message || err}`);
    }
}

/**
 * 停止 rover DNS 服务
 * 跟 sing-box 同步停止
 */
export async function stopRoverDns(): Promise<void> {
    log.info('stopRoverDns() called');
    try {
        const roverservice = await import('./roverservice-client');
        const result = await roverservice.stopDnsServer();
        if (result.success) {
            log.info('Stopped successfully');
        } else {
            log.warn(`Stop returned non-success: ${result.error || 'unknown error'}`);
        }
    } catch (err: any) {
        log.warn(`Stop error: ${err?.message || err}`);
    }
}
