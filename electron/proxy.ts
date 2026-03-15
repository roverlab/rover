import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as dbUtils from './db';

const execAsync = promisify(exec);

export async function setSystemProxy(enable: boolean, host: string = '127.0.0.1') {
    // 从数据库读取 mixed-port 配置
    const settings = dbUtils.getAllSettings();
    const port = parseInt(settings['mixed-port'], 10) || 7890;

    if (process.platform === 'win32') {
        if (enable) {
            await execAsync(`reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 1 /f`);
            await execAsync(`reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer /t REG_SZ /d "${host}:${port}" /f`);
        } else {
            await execAsync(`reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 0 /f`);
        }
        // Refresh settings
        await execAsync(`setx ALL_PROXY "" && setx HTTP_PROXY "" && setx HTTPS_PROXY ""`);
    } else if (process.platform === 'darwin') {
        const state = enable ? 'on' : 'off';
        const networkService = 'Wi-Fi'; // Simplified, should ideally detect active service
        
        // 设置 HTTP 和 HTTPS 代理
        await execAsync(`networksetup -setwebproxy "${networkService}" ${host} ${port}`);
        await execAsync(`networksetup -setsecurewebproxy "${networkService}" ${host} ${port}`);
        
        // 设置 SOCKS 代理
        await execAsync(`networksetup -setsocksfirewallproxy "${networkService}" ${host} ${port}`);
        
        // 启用/禁用代理状态
        await execAsync(`networksetup -setwebproxystate "${networkService}" ${state}`);
        await execAsync(`networksetup -setsecurewebproxystate "${networkService}" ${state}`);
        await execAsync(`networksetup -setsocksfirewallproxystate "${networkService}" ${state}`);
    }
}

export async function getSystemProxyStatus() {
    if (process.platform === 'win32') {
        const { stdout } = await execAsync(`reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable`);
        return stdout.includes('0x1');
    }
    return false; // Stub for other platforms
}
