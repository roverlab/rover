import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

// 导入项目中的转换函数
import { clashRuleSetToSingbox } from '../electron/clash-rule-set.ts';

// 获取当前文件的目录路径（ES Module 兼容）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 定义源目录和目标目录
const sourceDir = path.join(__dirname, '..', 'resources',"presets", 'rulesets');
const baseTargetDir = path.join(__dirname, '..', 'resources', 'rulesets');

// 配置
const CONCURRENT_LIMIT = 100;  // 并发数
const MAX_RETRIES = 3;        // 最大重试次数
const RETRY_DELAY = 500;     // 重试间隔（毫秒）

// 确保基础目标目录存在
if (!fs.existsSync(baseTargetDir)) {
    fs.mkdirSync(baseTargetDir, { recursive: true });
    console.log(`Created directory: ${baseTargetDir}`);
}

// 延迟函数
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 获取 sing-box 二进制路径
function getSingboxBinaryPath() {
    const binaryName = process.platform === 'win32' ? 'sing-box.exe' : 'sing-box';
    const candidates = [
        path.join(process.cwd(), 'resources', binaryName),
        path.join(__dirname, '..', 'resources', binaryName),
    ];
    const found = candidates.find((candidate) => fs.existsSync(candidate));
    return found ?? null;
}

// 将 Clash 规则集转换为 SRS 格式
function convertToSrs(clashContent, srsPath) {
    const singboxPath = getSingboxBinaryPath();
    if (!singboxPath) {
        throw new Error('sing-box binary not found');
    }

    // 1. 转换为 sing-box JSON 格式
    const ruleSet = clashRuleSetToSingbox(clashContent);
    
    // 2. 保存为临时 JSON 文件
    const tempJsonPath = srsPath.replace('.srs', '.json');
    fs.writeFileSync(tempJsonPath, JSON.stringify(ruleSet, null, 2), 'utf8');
    
    // 3. 使用 sing-box 编译为 .srs
    const result = spawnSync(singboxPath, ['rule-set', 'compile', tempJsonPath, '-o', srsPath], {
        encoding: 'utf8',
        timeout: 30000,
    });
    
    // 4. 删除临时 JSON 文件
    try {
        fs.unlinkSync(tempJsonPath);
    } catch {}
    
    if (result.status !== 0) {
        throw new Error(`sing-box compile failed: ${result.stderr || result.error}`);
    }
}

// 下载单个文件的函数（带重试）
async function downloadFile(url, targetPath, retries = 0) {
    try {
        await downloadFileInternal(url, targetPath);
    } catch (error) {
        if (retries < MAX_RETRIES) {
            console.log(`    ↻ Retry ${retries + 1}/${MAX_RETRIES} after ${RETRY_DELAY}ms...`);
            await delay(RETRY_DELAY * (retries + 1)); // 递增延迟
            return downloadFile(url, targetPath, retries + 1);
        }
        throw error;
    }
}

// 内部下载函数
function downloadFileInternal(url, targetPath) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        
        const request = protocol.get(url, { timeout: 30000 }, (response) => {
            // 处理重定向
            if (response.statusCode === 301 || response.statusCode === 302) {
                if (response.headers.location) {
                    downloadFileInternal(response.headers.location, targetPath)
                        .then(resolve)
                        .catch(reject);
                    return;
                }
            }

            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }

            // 确保目标目录存在
            const targetDir = path.dirname(targetPath);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            const fileStream = fs.createWriteStream(targetPath);
            response.pipe(fileStream);

            fileStream.on('finish', () => {
                fileStream.close();
                resolve();
            });

            fileStream.on('error', (err) => {
                fs.unlink(targetPath, () => {});
                reject(err);
            });
        });

        request.on('error', (err) => {
            reject(err);
        });

        request.on('timeout', () => {
            request.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

// 并发控制函数
async function runWithConcurrency(tasks, limit) {
    const results = [];
    const executing = [];

    for (const [index, task] of tasks.entries()) {
        const promise = task().then(result => ({ status: 'fulfilled', value: result, index }))
                               .catch(error => ({ status: 'rejected', reason: error, index }));
        
        results.push(promise);

        if (tasks.length >= limit) {
            const e = promise.then(() => executing.splice(executing.indexOf(e), 1));
            executing.push(e);
            if (executing.length >= limit) {
                await Promise.race(executing);
            }
        }
    }

    return Promise.all(results);
}

// 读取并处理 JSON 文件
async function processJsonFile(jsonPath) {
    const content = fs.readFileSync(jsonPath, 'utf-8');
    const rulesets = JSON.parse(content);
    
    console.log(`\nProcessing: ${path.basename(jsonPath)}`);
    console.log(`Found ${rulesets.length} ruleset(s)`);

    // 过滤出需要下载的规则集
    const downloadTasks = [];
    
    for (const item of rulesets) {
        if (!item.enabled) {
            console.log(`  ⊘ Skipped (disabled): ${item.name || item.id}`);
            continue;
        }

        if (!item.url || !item.path) {
            console.log(`  ⊘ Skipped (missing url or path): ${item.name || item.id}`);
            continue;
        }

        const targetPath = path.join(baseTargetDir, item.path);
        
        // 创建下载任务
        const task = async () => {
            const startTime = Date.now();
            try {
                process.stdout.write(`  ↓ [${item.name || item.id}] `);
                
                // 下载到临时文件
                const tempPath = targetPath + '.tmp';
                await downloadFile(item.url, tempPath);
                
                // 读取下载内容
                const content = fs.readFileSync(tempPath, 'utf8');
                
                // 根据类型处理
                if (item.type === 'clash' && targetPath.endsWith('.srs')) {
                    // Clash 格式需要转换为 SRS
                    convertToSrs(content, targetPath);
                    fs.unlinkSync(tempPath); // 删除临时文件
                    console.log(`✓ [converted] (${Date.now() - startTime}ms)`);
                } else {
                    // 直接保存
                    fs.renameSync(tempPath, targetPath);
                    console.log(`✓ (${Date.now() - startTime}ms)`);
                }
                
                return { success: true, item };
            } catch (error) {
                const duration = Date.now() - startTime;
                console.log(`✗ (${error.message}, ${duration}ms)`);
                // 清理临时文件
                try {
                    const tempPath = targetPath + '.tmp';
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                } catch {}
                return { success: false, item, error: error.message };
            }
        };
        
        downloadTasks.push(task);
    }

    if (downloadTasks.length === 0) {
        return { successCount: 0, failCount: 0 };
    }

    console.log(`  Starting ${downloadTasks.length} download(s) with max ${CONCURRENT_LIMIT} concurrent...`);

    // 使用并发控制执行下载
    const results = await runWithConcurrency(downloadTasks, CONCURRENT_LIMIT);
    
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failedItems = results
        .filter(r => r.status === 'rejected' || (r.value && !r.value.success))
        .map(r => {
            if (r.status === 'rejected') {
                return { name: 'Unknown', error: r.reason?.message || String(r.reason) };
            }
            return { name:  r.value.item?.id || 'Unknown', error: r.value.error };
        });
    const failCount = failedItems.length;

    return { successCount, failCount, failedItems };
}

// 主函数
async function main() {
    console.log('=== Ruleset Downloader ===');
    console.log(`Source: ${sourceDir}`);
    console.log(`Target: ${baseTargetDir}`);
    console.log(`Concurrent: ${CONCURRENT_LIMIT}, Max Retries: ${MAX_RETRIES}`);

    // 获取所有 json 文件
    const files = fs.readdirSync(sourceDir);
    const jsonFiles = files.filter(file => file.endsWith('.json'));

    if (jsonFiles.length === 0) {
        console.log(`\nNo JSON files found in ${sourceDir}`);
        return;
    }

    console.log(`\nFound ${jsonFiles.length} JSON file(s) to process`);

    let totalSuccess = 0;
    let totalFail = 0;
    const failedItems = [];

    for (const file of jsonFiles) {
        const jsonPath = path.join(sourceDir, file);
        try {
            const result = await processJsonFile(jsonPath);
            totalSuccess += result.successCount;
            totalFail += result.failCount;
            if (result.failedItems) {
                for (const item of result.failedItems) failedItems.push(item);
            }
        } catch (error) {
            console.error(`  ✗ Error processing ${file}: ${error.message}`);
        }
    }

    console.log(`\n=== Download Summary ===`);
    console.log(`Total Success: ${totalSuccess}`);
    console.log(`Total Failed: ${totalFail}`);
    
    if (failedItems.length > 0) {
        console.log('\nFailed items:');
        for (const item of failedItems) {
            console.log(`  ✗ ${item.name}: ${item.error}`);
        }
    }
    
    console.log('Done!');
}

// 运行主函数
main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
