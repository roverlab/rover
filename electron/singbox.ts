import { spawn, spawnSync, ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import { app } from 'electron';
import * as fs from 'node:fs';
import { createLogger } from './logger';
import { getSingboxLogPath, getSingboxBinaryPath as getSingboxBinaryPathFromPaths } from './paths';

const log = createLogger('Singbox');

let singboxProcess: ChildProcess | null = null;
let singboxPid: number | null = null;
let singboxStartTime: number | null = null;

// getSingboxLogPath 现在由 paths.ts 模块统一管理

function isProcessAlive(pid: number | null | undefined): boolean {
    if (!pid || pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function clearSingboxState() {
    singboxProcess = null;
    singboxPid = null;
    singboxStartTime = null;
}

function killByPid(pid: number): Promise<boolean> {
    return new Promise((resolve) => {
        if (process.platform === 'win32') {
            log.info(`使用 taskkill 终止进程树，PID: ${pid}`);
            const killer = spawn('taskkill', ['/pid', String(pid), '/f', '/t'], { stdio: 'ignore' });
            killer.once('error', (err) => {
                log.error(`taskkill 执行失败: ${err.message}`);
                resolve(false);
            });
            killer.once('exit', (code) => {
                log.info(`taskkill 执行完成，退出码: ${code}`);
                resolve(code === 0);
            });
            return;
        }

        try {
            process.kill(pid, 'SIGTERM');
        } catch (err: any) {
            log.warn(`发送 SIGTERM 失败: ${err?.message || err}`);
        }
        setTimeout(() => {
            if (isProcessAlive(pid)) {
                try {
                    process.kill(pid, 'SIGKILL');
                } catch (err: any) {
                    log.warn(`发送 SIGKILL 失败: ${err?.message || err}`);
                }
            }
            resolve(!isProcessAlive(pid));
        }, 800);
    });
}

function listSystemSingboxPids(): number[] {
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

/** 停止旧进程后等待端口释放的时长（毫秒），Windows 下端口释放有延迟 */
const PORT_RELEASE_DELAY_MS = 600;

export async function startSingbox(configPath: string, binaryPath: string) {
    const pid = singboxProcess?.pid ?? singboxPid;
    const ourProcessAlive = pid ? isProcessAlive(pid) : false;
    const systemPids = listSystemSingboxPids();
    const hasRunning = ourProcessAlive || systemPids.length > 0;

    if (hasRunning) {
        log.warn('检测到已有 sing-box 进程，先停止');
        await stopSingbox();
        log.info(`等待 ${PORT_RELEASE_DELAY_MS}ms 以便端口释放`);
        await new Promise((r) => setTimeout(r, PORT_RELEASE_DELAY_MS));
    } else if (singboxProcess || singboxPid) {
        // 有残留状态但进程已死，直接清理，无需 taskkill
        log.info('进程已退出，清理残留状态');
        clearSingboxState();
    }

    const singboxLogPath = getSingboxLogPath();

    log.info(`启动 sing-box 内核`);
    log.info(`配置文件: ${configPath}`);
    log.info(`内核日志文件: ${singboxLogPath}`);

    const logStream = fs.createWriteStream(singboxLogPath, { flags: 'a' });
    singboxProcess = spawn(binaryPath, ['run', '-c', configPath], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
        cwd: path.dirname(configPath)
    });

    singboxPid = singboxProcess.pid ?? null;
    singboxStartTime = Date.now();
    log.info(`sing-box 进程已启动，PID: ${singboxPid ?? '未知'}`);

    // 只记录错误输出，不记录正常输出
    singboxProcess.stderr?.pipe(logStream);

    singboxProcess.on('error', (err) => {
        log.error(`启动 sing-box 失败: ${err.message}`);
        fs.appendFileSync(singboxLogPath, `ERROR: ${err.message}\n`);
        logStream.end();
    });

    singboxProcess.on('exit', (code) => {
        log.info(`sing-box 内核已退出，退出码: ${code}`);
        if (code !== 0) {
            fs.appendFileSync(singboxLogPath, `EXIT: status ${code}\n`);
        }
        logStream.end();
        clearSingboxState();
    });

    // 启动后短时间内退出通常表示配置错误/端口占用，直接让 start 抛错给前端
    const startupGraceMs = 1500;
    await new Promise<void>((resolve, reject) => {
        const proc = singboxProcess;
        if (!proc) {
            reject(new Error('sing-box 进程创建失败'));
            return;
        }

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
            reject(new Error(`sing-box 启动后立即退出（code=${code ?? 'null'}, signal=${signal ?? 'null'}），请检查配置和内核日志`));
        };

        const onEarlyError = (err: Error) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(new Error(`启动 sing-box 失败: ${err.message}`));
        };

        const timer = setTimeout(() => {
            if (settled) return;
            const pid = proc.pid ?? null;
            const alive = pid ? isProcessAlive(pid) : true;
            if (!alive) {
                settled = true;
                cleanup();
                reject(new Error('sing-box 启动后立即退出，请检查配置和内核日志'));
                return;
            }
            settled = true;
            cleanup();
            resolve();
        }, startupGraceMs);

        proc.once('exit', onEarlyExit);
        proc.once('error', onEarlyError);
    });
}

export async function stopSingbox(): Promise<void> {
    const pid = singboxProcess?.pid ?? singboxPid;
    const actuallyAlive = pid ? isProcessAlive(pid) : false;
    log.info(`请求停止 sing-box 内核，当前状态: ${actuallyAlive ? '运行中' : '未运行'}`);

    // 进程已退出，直接清理状态，无需 taskkill
    if (pid && !actuallyAlive) {
        log.info(`进程已退出，清理状态，PID: ${pid}`);
        clearSingboxState();
        return;
    }

    if (!pid || !actuallyAlive) {
        const pids = listSystemSingboxPids();
        if (pids.length === 0) {
            if (!singboxProcess) {
                log.warn('请求停止但内核未在运行');
            }
            clearSingboxState();
            return;
        }

        log.warn(`本地状态未记录运行中，但检测到系统 sing-box 进程: ${pids.join(', ')}`);
        let hasFailedKill = false;
        for (const fallbackPid of pids) {
            const ok = await killByPid(fallbackPid);
            if (!ok) hasFailedKill = true;
        }
        const remaining = listSystemSingboxPids();
        if (remaining.length > 0) {
            log.warn(`兜底停止后仍有进程存活: ${remaining.join(', ')}`);
            singboxProcess = null;
            singboxPid = remaining[0];
            throw new Error(`停止失败，仍有 sing-box 进程在运行（PID: ${remaining.join(', ')}），可能是权限不足`);
        }
        // taskkill 失败但进程已消失（可能已自行退出），视为成功
        if (hasFailedKill) {
            log.info('taskkill 返回异常但进程已消失，视为已停止');
        }
        log.info('兜底停止成功，已终止系统中的 sing-box 进程');
        clearSingboxState();
        return;
    }

    const stopped = await killByPid(pid);

    if (!stopped || isProcessAlive(pid)) {
        // 此时不应误报“未运行”，保留 PID 供下次 stop 再次尝试
        log.warn(`停止后进程仍在运行，PID: ${pid}`);
        singboxProcess = null;
        singboxPid = pid;
        throw new Error(`停止失败，进程仍在运行（PID: ${pid}），可能是权限不足`);
    }

    log.info(`sing-box 内核已停止，PID: ${pid}`);
    clearSingboxState();
}

export function isSingboxRunning() {
    if (singboxProcess) return true;
    if (isProcessAlive(singboxPid)) return true;
    if (listSystemSingboxPids().length > 0) return true;
    if (singboxPid) singboxPid = null;
    return false;
}

export function getSingboxStartTime() {
    return singboxStartTime;
}

/** 获取当前 sing-box 进程 PID（用于 launcher 模式状态上报） */
export function getSingboxPid(): number | null {
    return singboxPid;
}

/**
 * 获取 sing-box 二进制文件路径
 * 自动判断平台，按优先级查找内核
 * 委托给 paths.ts 中的统一实现
 */
export function getSingboxBinaryPath(): string {
    const binaryPath = getSingboxBinaryPathFromPaths();
    return binaryPath;
}
