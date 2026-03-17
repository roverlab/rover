import { Tray, Menu, nativeImage, app, BrowserWindow, clipboard } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import * as singbox from './singbox';
import * as dbUtils from './db';
import { getSetting } from './db';

let tray: Tray | null = null;
let updateMenuFn: (() => Promise<void>) | null = null;

// 获取当前代理模式
async function getCurrentMode(): Promise<'rule' | 'global' | 'direct'> {
    try {
        // 从数据库获取保存的模式（与前端 Dashboard 使用相同的 key）
        const savedMode = getSetting('dashboard-mode', 'rule');
        if (savedMode && ['rule', 'global', 'direct'].includes(savedMode)) {
            return savedMode as 'rule' | 'global' | 'direct';
        }
        return 'rule';
    } catch {
        return 'rule';
    }
}

// 设置代理模式 - 只发送事件通知前端处理
async function setProxyMode(mode: 'rule' | 'global' | 'direct') {
    console.log(`[Tray] 请求切换代理模式: ${mode}`);
    
    // 通知前端处理模式切换
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('tray-mode-changed', mode);
    }
}

// 复制环境变量到剪贴板
function copyEnvVariables() {
    const settings = dbUtils.getAllSettings();
    const port = settings['mixed-port'] || '7890';
    
    let envText: string;
    if (process.platform === 'win32') {
        // Windows: 使用 set 命令
        envText = `set http_proxy=http://127.0.0.1:${port}
set https_proxy=http://127.0.0.1:${port}`;
    } else {
        // macOS/Linux: 使用 export
        envText = `export all_proxy="http://127.0.0.1:${port}"`;
    }
    
    clipboard.writeText(envText);
}

// 更新托盘菜单（供外部调用）
export function updateTrayMenu() {
    console.log('[Tray] updateTrayMenu called, updateMenuFn exists:', !!updateMenuFn);
    if (updateMenuFn) {
        updateMenuFn();
    }
}

export function createTray(mainWindow: BrowserWindow) {
    const publicDir = process.env.VITE_PUBLIC as string;
    console.log('[Tray] Creating tray icon, public dir:', publicDir);
    console.log('[Tray] Platform:', process.platform);
    let icon: Electron.NativeImage;
    try {
        if (process.platform === 'darwin') {
            // macOS: 使用 icon_tray.png，设为 template 以自适应亮色/暗色主题
            const iconPath = path.join(publicDir, 'icon_tray.png');
            console.log('[Tray] macOS tray icon path:', iconPath);
            console.log('[Tray] Icon exists:', fs.existsSync(iconPath));
            icon = nativeImage.createFromPath(iconPath);
            console.log('[Tray] Icon size:', icon.getSize());
            console.log('[Tray] Icon is empty:', icon.isEmpty());
            
            icon = icon.resize({
                width: 22,
                height: 22,
                quality: 'best' // 确保缩放质量
            });
            
            icon.setTemplateImage(true);
        } else {
            // Windows/Linux: 优先 icon.ico，开发环境可能未生成则回退到 icon.png
            const icoPath = path.join(publicDir, 'icon.ico');
            const pngPath = path.join(publicDir, 'icon.png');
            const iconPath = fs.existsSync(icoPath) ? icoPath : pngPath;
            icon = nativeImage.createFromPath(iconPath);
        }
        tray = new Tray(icon);
    } catch (e) {
        console.error('Failed to initialize tray with icon:', e);
        // On macOS, try fallback icon or continue without tray
        if (process.platform === 'darwin') {
            console.log('Trying fallback for macOS tray icon...');
            try {
                // Create a simple icon programmatically for macOS
                icon = nativeImage.createFromPath(path.join(publicDir, 'icon.png'));
                if (icon.isEmpty()) {
                    // Create a minimal 16x16 icon as last resort
                    icon = nativeImage.createFromBuffer(Buffer.alloc(16 * 16 * 4), { width: 16, height: 16 });
                } else {
                    // 缩放图标到 macOS 托盘标准尺寸
                    const size = icon.getSize();
                    if (size.width > 22 || size.height > 22) {
                        const scaleFactor = Math.min(22 / size.width, 22 / size.height);
                        icon = icon.resize({ 
                            width: Math.round(size.width * scaleFactor), 
                            height: Math.round(size.height * scaleFactor) 
                        });
                    }
                }
                icon.setTemplateImage(true);
                tray = new Tray(icon);
            } catch (fallbackError) {
                console.error('Failed to create fallback tray icon:', fallbackError);
                return;
            }
        } else {
            return;
        }
    }

    const updateMenu = async () => {
        const isRunning = singbox.isSingboxRunning();
        const currentMode = await getCurrentMode();

        const contextMenu = Menu.buildFromTemplate([
            {
                label: '显示',
                click: () => mainWindow.show()
            },
            {
                label: isRunning ? '停止' : '启动',
                click: async () => {
                    if (isRunning) {
                        console.log('[Tray] 停止服务');
                        mainWindow.webContents.send('tray-stop-service');
                    } else {
                        console.log('[Tray] 启动服务');
                        mainWindow.webContents.send('tray-start-service');
                    }
                }
            },
            ...(isRunning ? [{
                label: '重启',
                click: () => {
                    console.log('[Tray] 重启服务');
                    mainWindow.webContents.send('tray-restart-service');
                }
            }] : []),
            { type: 'separator' },
            {
                label: '规则',
                type: 'checkbox',
                checked: currentMode === 'rule',
                click: async () => {
                    await setProxyMode('rule');
                }
            },
            {
                label: '全局',
                type: 'checkbox',
                checked: currentMode === 'global',
                click: async () => {
                    await setProxyMode('global');
                }
            },
            {
                label: '直连',
                type: 'checkbox',
                checked: currentMode === 'direct',
                click: async () => {
                    await setProxyMode('direct');
                }
            },
            { type: 'separator' },
            {
                label: '复制环境变量',
                click: () => {
                    copyEnvVariables();
                }
            },
            { type: 'separator' },
            {
                label: '退出',
                click: async () => {
                    console.log('Quit from tray: stopping sing-box...');
                    await singbox.stopSingbox();
                    console.log('sing-box stopped, quitting app');
                    app.quit();
                }
            },
        ]);

        tray?.setContextMenu(contextMenu);
        tray?.setToolTip('Rover');
    };

    updateMenuFn = updateMenu;

    tray.on('double-click', () => {
        mainWindow.show();
    });

    updateMenu();
    // Update menu periodically to reflect status changes
    setInterval(updateMenu, 5000);
}
