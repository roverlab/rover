/**
 * sing-box 内核日志维护（用户数据目录）
 * 每日 0 点（本地时间）将 sing-box.log 复制到 logs/singbox-YYYY-MM-DD.log 并清空原文件；
 * 删除 logs 目录下超过保留天数的按日归档：singbox-、app- 前缀的 YYYY-MM-DD.log。
 */

import fs from 'node:fs';
import path from 'node:path';
import { getLogsDir, getSingboxLogPath } from './paths';
import { createLogger } from './logger';

const log = createLogger('SingboxLogMaint');

const RETENTION_DAYS = 7;
/** sing-box 按日归档 */
const SINGBOX_ARCHIVE_RE = /^singbox-(\d{4}-\d{2}-\d{2})\.log$/;
/** 应用主进程日志按日文件（见 logger.ts） */
const APP_ARCHIVE_RE = /^app-(\d{4}-\d{2}-\d{2})\.log$/;

function extractDailyArchiveDate(fileName: string): string | null {
    let m = SINGBOX_ARCHIVE_RE.exec(fileName);
    if (m) return m[1];
    m = APP_ARCHIVE_RE.exec(fileName);
    return m ? m[1] : null;
}

let midnightTimer: NodeJS.Timeout | null = null;

function formatLocalDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function msUntilNextLocalMidnight(): number {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    return Math.max(1000, next.getTime() - now.getTime());
}

/** 将 sing-box.log 复制到 logs/singbox-YYYY-MM-DD.log 并清空原文件 */
export function archiveAndTruncateSingboxLog(): void {
    const src = getSingboxLogPath();
    try {
        if (!fs.existsSync(src)) return;
        const st = fs.statSync(src);
        if (st.size === 0) return;

        const logsDir = getLogsDir();
        const day = formatLocalDate(new Date());
        const dest = path.join(logsDir, `singbox-${day}.log`);

        fs.copyFileSync(src, dest);
        fs.truncateSync(src, 0);
        log.info(`sing-box log archived: ${dest}, original file cleared`);
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn(`sing-box log archive failed: ${msg}`);
    }
}

/** 删除 logs 目录下早于保留期限的 singbox-、app- 按日归档日志 */
export function pruneOldSingboxArchives(): void {
    const logsDir = getLogsDir();
    const now = new Date();
    const cutoffStr = formatLocalDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - RETENTION_DAYS));

    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(logsDir, { withFileTypes: true });
    } catch {
        return;
    }

    for (const ent of entries) {
        if (!ent.isFile()) continue;
        const dateStr = extractDailyArchiveDate(ent.name);
        if (!dateStr) continue;
        if (dateStr >= cutoffStr) continue;

        const full = path.join(logsDir, ent.name);
        try {
            fs.unlinkSync(full);
            log.info(`Deleted expired archive: ${ent.name}`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            log.warn(`Failed to delete expired log ${ent.name}: ${msg}`);
        }
    }
}

function scheduleMidnightTick(): void {
    if (midnightTimer) clearTimeout(midnightTimer);
    midnightTimer = setTimeout(() => {
        midnightTimer = null;
        archiveAndTruncateSingboxLog();
        pruneOldSingboxArchives();
        scheduleMidnightTick();
    }, msUntilNextLocalMidnight());
}

/** 启动：启动时先清理过期归档；每日 0 点本地时间归档并再次清理 */
export function startSingboxLogMaintenance(): void {
    stopSingboxLogMaintenance();
    pruneOldSingboxArchives();
    scheduleMidnightTick();
    log.info(
        `sing-box log daily archive enabled (daily at midnight), singbox-/app- daily logs in logs folder retained for ${RETENTION_DAYS} days`
    );
}

export function stopSingboxLogMaintenance(): void {
    if (midnightTimer) {
        clearTimeout(midnightTimer);
        midnightTimer = null;
    }
}
