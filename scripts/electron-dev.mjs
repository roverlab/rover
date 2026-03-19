#!/usr/bin/env node
/**
 * Electron 开发脚本：启动 Rspack 开发服务器 + Electron
 * 替代 vite-plugin-electron 的 dev 流程
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

function waitForServer(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) {
          resolve();
          return;
        }
      } catch {
        // 继续重试
      }
      if (Date.now() - start > timeout) {
        reject(new Error(`Dev server did not start within ${timeout}ms`));
        return;
      }
      setTimeout(check, 200);
    };
    check();
  });
}

async function main() {
  // 1. 先构建 main + preload
  console.log('[electron-dev] Building main and preload...');
  const buildProc = spawn('npx', ['rspack', 'build'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, NODE_ENV: 'development' },
  });
  await new Promise((resolve, reject) => {
    buildProc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Build failed: ${code}`))));
  });

  // 2. 启动 Rspack 开发服务器（仅 renderer，确保 index.html 正确提供）
  console.log('[electron-dev] Starting Rspack dev server...');
  const devProc = spawn('npx', ['rspack', 'dev', '-c', 'rspack.config.renderer.mjs'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, NODE_ENV: 'development' },
  });

  await waitForServer(DEV_SERVER_URL).catch(() => {
    console.warn('[electron-dev] Could not verify server, launching Electron anyway...');
  });

  // 3. 启动 Electron
  console.log('[electron-dev] Launching Electron...');
  const electronProc = spawn('npx', ['electron', '.'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      DEV_SERVER_URL: DEV_SERVER_URL,
    },
  });

  electronProc.on('exit', (code) => {
    devProc.kill();
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error('[electron-dev]', err);
  process.exit(1);
});
