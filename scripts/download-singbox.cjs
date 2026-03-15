/**
 * 从 SagerNet/sing-box 官方 release 下载指定版本的 sing-box 二进制到 resources/
 * 用于 CI 构建和本地打包
 *
 * 用法: node scripts/download-singbox.cjs [version]
 * 默认版本: 1.12.16
 */

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const VERSION = process.argv[2] || '1.12.16';
// 支持通过参数指定目标平台，用于交叉编译
// 用法: node scripts/download-singbox.cjs [version] [platform] [arch]
const targetPlatform = process.argv[3];
const targetArch = process.argv[4];
const platform = targetPlatform || process.platform;
const arch = targetArch || process.arch;

const archMap = { x64: 'amd64', arm64: 'arm64' };
const sbArch = archMap[arch] || 'amd64';

let archiveUrl, archiveName, binaryName, extractDir;

if (platform === 'win32') {
    archiveUrl = `https://github.com/SagerNet/sing-box/releases/download/v${VERSION}/sing-box-${VERSION}-windows-${sbArch}.zip`;
    archiveName = `sing-box-${VERSION}-windows-${sbArch}.zip`;
    binaryName = 'sing-box.exe';
    extractDir = `sing-box-${VERSION}-windows-${sbArch}`;
} else if (platform === 'darwin') {
    archiveUrl = `https://github.com/SagerNet/sing-box/releases/download/v${VERSION}/sing-box-${VERSION}-darwin-${sbArch}.tar.gz`;
    archiveName = `sing-box-${VERSION}-darwin-${sbArch}.tar.gz`;
    binaryName = 'sing-box';
    extractDir = `sing-box-${VERSION}-darwin-${sbArch}`;
} else {
    console.error('Unsupported platform:', platform);
    process.exit(1);
}

const projectRoot = path.join(__dirname, '..');
const resourcesDir = path.join(projectRoot, 'resources');
const archivePath = path.join(projectRoot, archiveName);

if (!fs.existsSync(resourcesDir)) {
    fs.mkdirSync(resourcesDir, { recursive: true });
}

function download() {
    return new Promise((resolve, reject) => {
        console.log('[DEBUG] Starting download from:', archiveUrl);
        console.log('[DEBUG] Archive will be saved to:', archivePath);

        let file = null;
        let downloaded = 0;
        let contentLength = 0;
        let lastProgressTime = Date.now();

        const doRequest = (url, redirectCount = 0) => {
            console.log('[DEBUG] Requesting URL:', url);

            // 解析 URL 以确定使用 http 还是 https
            const urlObj = new URL(url);
            const httpModule = urlObj.protocol === 'http:' ? require('node:http') : https;

            const req = httpModule.get(url, {
                headers: {
                    'User-Agent': 'Rover/1.0',
                    'Accept': '*/*'
                }
            }, (res) => {
                console.log('[DEBUG] Response status code:', res.statusCode);
                console.log('[DEBUG] Response headers:', JSON.stringify(res.headers, null, 2));

                // 处理重定向 (301, 302, 303, 307, 308)
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    console.log('[DEBUG] Redirect #' + (redirectCount + 1) + ' to:', res.headers.location);
                    if (redirectCount >= 10) {
                        reject(new Error('Too many redirects'));
                        return;
                    }
                    // 消费当前响应体
                    res.resume();
                    doRequest(res.headers.location, redirectCount + 1);
                    return;
                }

                if (res.statusCode !== 200) {
                    reject(new Error(`Download failed with status ${res.statusCode}`));
                    return;
                }

                // 获取文件大小
                contentLength = parseInt(res.headers['content-length'], 10) || 0;
                if (contentLength) {
                    console.log('[DEBUG] File size:', (contentLength / 1024 / 1024).toFixed(2), 'MB');
                } else {
                    console.log('[DEBUG] File size unknown (chunked encoding or no content-length)');
                }

                // 创建写入流（在最终响应后创建）
                file = fs.createWriteStream(archivePath);

                // 监听数据事件
                res.on('data', (chunk) => {
                    downloaded += chunk.length;
                    const now = Date.now();
                    // 每 500ms 更新一次进度显示，避免输出太频繁
                    if (now - lastProgressTime >= 500 || downloaded === contentLength) {
                        lastProgressTime = now;
                        if (contentLength) {
                            const percent = ((downloaded / contentLength) * 100).toFixed(1);
                            process.stdout.write(`\r[DEBUG] Download progress: ${percent}% (${(downloaded / 1024 / 1024).toFixed(2)} MB / ${(contentLength / 1024 / 1024).toFixed(2)} MB)`);
                        } else {
                            process.stdout.write(`\r[DEBUG] Downloaded: ${(downloaded / 1024 / 1024).toFixed(2)} MB`);
                        }
                    }
                });

                res.pipe(file);

                file.on('finish', () => {
                    console.log('\n[DEBUG] Download completed, total bytes:', downloaded);
                    file.close();
                    resolve();
                });

                file.on('error', (err) => {
                    console.error('[DEBUG] File write error:', err.message);
                    fs.unlinkSync(archivePath);
                    reject(err);
                });
            });

            req.on('error', (err) => {
                console.error('[DEBUG] Request error:', err.message);
                reject(err);
            });

            // 设置超时
            req.setTimeout(60000, () => {
                console.error('[DEBUG] Request timeout after 60s');
                req.destroy();
                reject(new Error('Request timeout'));
            });
        };

        doRequest(archiveUrl);
    });
}

async function main() {
    console.log('===== sing-box Download Script =====');
    console.log('[DEBUG] Version:', VERSION);
    console.log('[DEBUG] Platform:', platform);
    console.log('[DEBUG] Arch:', arch, '-> sing-box arch:', sbArch);
    console.log('[DEBUG] Project root:', projectRoot);
    console.log('[DEBUG] Resources dir:', resourcesDir);
    console.log('[DEBUG] Archive name:', archiveName);
    console.log('[DEBUG] Extract dir:', extractDir);
    console.log('[DEBUG] Binary name:', binaryName);
    console.log('[DEBUG] Archive URL:', archiveUrl);
    console.log('=====================================');

    console.log('\n[DEBUG] Checking if resources directory exists...');
    if (!fs.existsSync(resourcesDir)) {
        console.log('[DEBUG] Creating resources directory...');
        fs.mkdirSync(resourcesDir, { recursive: true });
        console.log('[DEBUG] Resources directory created');
    } else {
        console.log('[DEBUG] Resources directory already exists');
    }

    console.log('\nDownloading sing-box', VERSION, `(${platform}-${arch})...`);
    await download();

    console.log('\n[DEBUG] Checking if archive file exists...');
    if (fs.existsSync(archivePath)) {
        const stats = fs.statSync(archivePath);
        console.log('[DEBUG] Archive file size:', (stats.size / 1024 / 1024).toFixed(2), 'MB');
    } else {
        console.error('[DEBUG] ERROR: Archive file not found at:', archivePath);
        process.exit(1);
    }

    console.log('\nExtracting...');
    console.log('[DEBUG] Extract command will run in:', projectRoot);
    if (platform === 'win32') {
        const extractCmd = `Expand-Archive -Path "${archiveName}" -DestinationPath "." -Force`;
        console.log('[DEBUG] Running PowerShell command:', extractCmd);
        execSync(extractCmd, {
            stdio: 'inherit',
            cwd: projectRoot,
            shell: 'powershell.exe'
        });
    } else {
        const extractCmd = `tar -xzf "${archiveName}" -C "${projectRoot}"`;
        console.log('[DEBUG] Running tar command:', extractCmd);
        execSync(extractCmd, { stdio: 'inherit', cwd: projectRoot });
    }
    console.log('[DEBUG] Extraction completed');

    const srcBinary = path.join(projectRoot, extractDir, binaryName);
    const destBinary = path.join(resourcesDir, binaryName);

    console.log('\n[DEBUG] Source binary path:', srcBinary);
    console.log('[DEBUG] Destination binary path:', destBinary);

    console.log('[DEBUG] Checking if extracted binary exists...');
    if (!fs.existsSync(srcBinary)) {
        console.error('[DEBUG] ERROR: Binary not found at:', srcBinary);
        console.log('[DEBUG] Listing files in project root:');
        try {
            const files = fs.readdirSync(projectRoot);
            files.forEach(f => console.log('  -', f));
        } catch (e) {
            console.log('[DEBUG] Could not list directory:', e.message);
        }
        process.exit(1);
    }
    console.log('[DEBUG] Binary found at source location');

    console.log('[DEBUG] Moving binary to resources directory...');
    fs.renameSync(srcBinary, destBinary);
    console.log('[DEBUG] Binary moved successfully');

    if (platform !== 'win32') {
        console.log('[DEBUG] Setting executable permissions...');
        fs.chmodSync(destBinary, 0o755);
        console.log('[DEBUG] Permissions set to 755');
    }

    console.log('\n[DEBUG] Cleaning up...');
    console.log('[DEBUG] Removing extract directory:', extractDir);
    fs.rmSync(path.join(projectRoot, extractDir), { recursive: true, force: true });
    console.log('[DEBUG] Removing archive file:', archivePath);
    fs.unlinkSync(archivePath);
    console.log('[DEBUG] Cleanup completed');

    // 验证安装的二进制文件版本
    console.log('\n[DEBUG] Verifying sing-box version...');
    try {
        const versionOutput = execSync(`"${destBinary}" version`, {
            encoding: 'utf-8',
            timeout: 10000
        });
        console.log('[DEBUG] sing-box version output:\n' + versionOutput);
    } catch (e) {
        console.log('[DEBUG] Could not get version (this may be normal on some platforms):', e.message);
    }

    console.log('\n===== Download Complete =====');
    console.log('sing-box', VERSION, 'installed to', destBinary);
    console.log('=============================');
}

main().catch((err) => {
    console.error('\n[DEBUG] ===== ERROR =====');
    console.error('[DEBUG] Error message:', err.message);
    console.error('[DEBUG] Error stack:', err.stack);
    console.error('[DEBUG] ===================');
    process.exit(1);
});
