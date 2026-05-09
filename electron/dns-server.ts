/**
 * Rover DNS 服务启停管理
 * 独立模块，避免 app-utils 与 config-file 之间的循环依赖
 */

import { app } from 'electron';
import path from 'node:path';
import * as dbUtils from './db';
import { getDataDir } from './paths';
import { createLogger } from './logger';

const log = createLogger('DnsServer');

/**
 * 启动 rover DNS 服务
 * 跟 sing-box 同步启停，每次启动内核前调用 /dns/start
 */
export async function startRoverDns(): Promise<void> {
    log.info('[RoverDNS] startRoverDns() called');
    try {
        const settings = dbUtils.getAllSettings();

        // 检查 DNS 服务是否启用
        const dnsServerEnabled = settings['dns-server-enabled'] !== 'false';
        if (!dnsServerEnabled) {
            log.info('[RoverDNS] DNS server is disabled, skipping start');
            return;
        }

        const dnsPort = settings['dns-server-port'] || '5353';

        const req: any = {
            address: `127.0.0.1:${dnsPort}`,
            cert_dir: path.join(getDataDir(), 'dns'),
            enable_log: !app.isPackaged,
        };

        const roverservice = await import('./roverservice-client');
        const result = await roverservice.startDnsServer(req);
        if (result.success) {
            log.info(`[RoverDNS] Started on 127.0.0.1:${dnsPort}`);
        } else {
            log.warn(`[RoverDNS] Failed to start: ${result.error}`);
        }
    } catch (err: any) {
        log.warn(`[RoverDNS] Error: ${err?.message || err}`);
    }
}

/**
 * 停止 rover DNS 服务
 * 跟 sing-box 同步停止
 */
export async function stopRoverDns(): Promise<void> {
    log.info('[RoverDNS] stopRoverDns() called');
    try {
        const roverservice = await import('./roverservice-client');
        const result = await roverservice.stopDnsServer();
        if (result.success) {
            log.info('[RoverDNS] Stopped successfully');
        } else {
            log.warn(`[RoverDNS] Stop returned non-success: ${result.error || 'unknown error'}`);
        }
    } catch (err: any) {
        log.warn(`[RoverDNS] Stop error: ${err?.message || err}`);
    }
}
