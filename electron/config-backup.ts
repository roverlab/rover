/**
 * 应用配置导出/导入
 * 第一版：备份整个 database.json，zip 格式，含格式版本
 */

import fs from 'node:fs';
import AdmZip from 'adm-zip';
import { createLogger } from './logger';
import { t } from './i18n-main';
import { getDbPath, getDataDir, getBuildInfoPath } from './paths';

const log = createLogger('ConfigBackup');

/** 导出格式版本，用于导入时兼容性校验 */
export const CONFIG_BACKUP_FORMAT_VERSION = 1;

/** 支持的格式版本 */
const SUPPORTED_FORMAT_VERSIONS = [1];

export interface BackupManifest {
    /** 格式版本 */
    formatVersion: number;
    /** 创建时间 ISO 字符串 */
    createdAt: string;
    /** 应用标识 */
    app: string;
    /** 应用版本号 */
    appVersion?: string;
    /** sing-box 内核版本号 */
    singboxVersion?: string;
}

const MANIFEST_APP = 'roverlab.rover';

/**
 * 创建备份 zip 的 Buffer（供 main 进程调用，配合 dialog 保存）
 */
export function createBackupZipBuffer(): Buffer {
    getDataDir();
    const dbPath = getDbPath();
    if (!fs.existsSync(dbPath)) {
        throw new Error(t('main.errors.configBackup.dbMissing'));
    }

    const zip = new AdmZip();
    const dbContent = fs.readFileSync(dbPath, 'utf8');

    // 读取版本信息
    let appVersion = 'unknown';
    let singboxVersion = 'unknown';
    try {
        const buildInfoPath = getBuildInfoPath();
        if (fs.existsSync(buildInfoPath)) {
            const buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, 'utf8'));
            appVersion = buildInfo.appVersion || 'unknown';
            singboxVersion = buildInfo.singboxVersion || 'unknown';
        }
    } catch (err) {
        log.warn('[Export] failed to read build.json, using unknown versions');
    }

    const manifest: BackupManifest = {
        formatVersion: CONFIG_BACKUP_FORMAT_VERSION,
        createdAt: new Date().toISOString(),
        app: MANIFEST_APP,
        appVersion,
        singboxVersion,
    };

    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
    zip.addFile('database.json', Buffer.from(dbContent, 'utf8'));

    log.info(`[Export] created backup zip, formatVersion=${CONFIG_BACKUP_FORMAT_VERSION}, appVersion=${appVersion}, singboxVersion=${singboxVersion}`);
    return zip.toBuffer();
}

/**
 * 从 zip 恢复配置到 database.json
 * @param zipPath 用户选择的 zip 文件路径
 */
export function restoreFromZip(zipPath: string): void {
    if (!fs.existsSync(zipPath)) {
        throw new Error(t('main.errors.configBackup.zipMissing'));
    }

    const zip = new AdmZip(zipPath);
    const manifestEntry = zip.getEntry('manifest.json');
    const dbEntry = zip.getEntry('database.json');

    if (!manifestEntry || !dbEntry) {
        throw new Error(t('main.errors.configBackup.invalidMissingFiles'));
    }

    const manifestRaw = zip.readAsText(manifestEntry);
    let manifest: BackupManifest;
    try {
        manifest = JSON.parse(manifestRaw) as BackupManifest;
    } catch {
        throw new Error(t('main.errors.configBackup.invalidManifestJson'));
    }

    if (typeof manifest.formatVersion !== 'number') {
        throw new Error(t('main.errors.configBackup.invalidNoFormatVersion'));
    }

    if (!SUPPORTED_FORMAT_VERSIONS.includes(manifest.formatVersion)) {
        throw new Error(
            t('main.errors.configBackup.unsupportedFormatVersion', {
                version: String(manifest.formatVersion),
                supported: SUPPORTED_FORMAT_VERSIONS.join(', ')
            })
        );
    }

    const dbContent = zip.readAsText(dbEntry);
    try {
        JSON.parse(dbContent); // 校验 JSON 格式
    } catch {
        throw new Error(t('main.errors.configBackup.invalidDatabaseJson'));
    }

    getDataDir();
    const dbPath = getDbPath();
    fs.writeFileSync(dbPath, dbContent, 'utf8');
    log.info(`[Import] restored database from zip, formatVersion=${manifest.formatVersion}`);
}
