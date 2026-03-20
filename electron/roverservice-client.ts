/**
 * RoverService Client for macOS and Windows
 *
 * Provides HTTP client to communicate with the privileged helper daemon
 * via Unix domain socket (macOS) or Named Pipe (Windows).
 */

import * as http from 'node:http';
import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createLogger } from './logger';
import { getBuiltinResourcesPath } from './paths';

const log = createLogger('RoverService');

// Platform-specific socket path
// Must match the path defined in roverservice/main.go
const SOCKET_PATH = process.platform === 'win32'
    ? '\\\\.\\pipe\\roverservice'  // Windows: Named Pipe
    : '/var/run/roverservice.sock';  // macOS/Linux: Unix socket

// Service name
const SERVICE_NAME = 'RoverService';

// Target directory for binary
const TARGET_DIR = process.platform === 'win32'
    ? path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Rover', 'Helper')
    : '/Library/PrivilegedHelperTools';
// Binary name (must match the build output name)
const TARGET_NAME = process.platform === 'win32'
    ? 'roverservice.exe'
    : 'roverservice';
const TARGET_PATH = path.join(TARGET_DIR, TARGET_NAME);

// API endpoints
const API = {
    STATUS: '/status',
    SINGBOX_STATUS: '/singbox/status',
    SINGBOX_START: '/singbox/start',
    SINGBOX_STOP: '/singbox/stop',
    SINGBOX_RESTART: '/singbox/restart',
    PROCESSES_LIST: '/processes',
    PROCESSES_KILL: '/processes/kill',
} as const;

// Types
export interface RoverServiceStatus {
    version: string;
    pid: number;
    uptime: number;
    socketPath: string;
    platform: string;
}

export interface SingboxStatus {
    running: boolean;
    pid?: number;
    startTime?: number;
    configPath?: string;
    binaryPath?: string;
}

export interface StartRequest {
    configPath: string;
    binaryPath: string;
}


export interface ApiResponse<T = unknown> {
    success: boolean;
    message?: string;
    data?: T;
    error?: string;
}



/**
 * Check if the current platform is supported
 */
export function isSupported(): boolean {
    return process.platform === 'darwin' || process.platform === 'win32';
}

/**
 * Check if the current platform is macOS
 */
export function isMacOS(): boolean {
    return process.platform === 'darwin';
}

/**
 * Check if the current platform is Windows
 */
export function isWindows(): boolean {
    return process.platform === 'win32';
}

/**
 * Check if the RoverService socket is available
 * For Windows Named Pipe, we try to connect to check availability
 */
export function isSocketAvailable(): boolean {
    if (!isSupported()) return false;

    if (process.platform === 'win32') {
        // Windows: Try to connect to named pipe synchronously
        try {
            const socket = net.createConnection(SOCKET_PATH);
            socket.setTimeout(500);
            let available = false;
            socket.on('connect', () => {
                available = true;
                socket.destroy();
            });
            socket.on('error', () => {
                socket.destroy();
            });
            // Wait briefly for connection result
            const start = Date.now();
            while (!available && Date.now() - start < 300) {
                // Busy wait for a short time
            }
            return available;
        } catch {
            return false;
        }
    }

    // Unix: Check if socket file exists
    return fs.existsSync(SOCKET_PATH);
}

/**
 * Check if the RoverService daemon is installed
 */
export function isInstalled(): boolean {
    if (!isSupported()) return false;
    return fs.existsSync(TARGET_PATH);
}

/**
 * Check if the RoverService service is loaded
 * 
 * Note: On macOS, kardianos/service creates a LaunchDaemon plist file.
 * We check if the plist file exists to determine if the service is "installed".
 * The service may not be actively running (loaded by launchctl), but the
 * plist file indicates it's set up to run.
 */
export function isServiceLoaded(): boolean {
    if (!isSupported()) return false;

    if (process.platform === 'win32') {
        // Windows: Use sc query
        const result = spawnSync('sc', ['query', SERVICE_NAME], {
            encoding: 'utf8',
            windowsHide: true,
        });
        return result.status === 0 && result.stdout.includes('RUNNING');
    }

    // macOS: Check if the LaunchDaemon plist file exists
    // kardianos/service creates /Library/LaunchDaemons/{ServiceName}.plist
    const plistPath = `/Library/LaunchDaemons/${SERVICE_NAME}.plist`;
    return fs.existsSync(plistPath);
}

/**
 * Make HTTP request to RoverService
 * Uses socketPath for both Unix socket and Windows Named Pipe
 * @param timeoutMs - Optional timeout in milliseconds (default: 10000 for most operations)
 */
async function request<T>(method: string, endpoint: string, body?: unknown, timeoutMs?: number): Promise<ApiResponse<T>> {
    // Default timeout: 10 seconds for most operations
    const timeout = timeoutMs ?? 10000;

    return new Promise((resolve, reject) => {
        // Create AbortController for reliable timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
            reject(new Error('Request timeout'));
        }, timeout);

        // For both Unix socket and Windows Named Pipe, we use socketPath option
        // Node.js http module supports named pipes via socketPath on Windows
        const options: http.RequestOptions = {
            socketPath: SOCKET_PATH,
            path: endpoint,
            method,
            headers: {
                'Content-Type': 'application/json',
            },
            signal: controller.signal,
        };

        const req = http.request(options, (res) => {
            // Clear timeout on successful response
            clearTimeout(timeoutId);

            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const response = JSON.parse(data) as ApiResponse<T>;
                    resolve(response);
                } catch (err) {
                    reject(new Error(`Failed to parse response: ${data}`));
                }
            });
        });

        req.on('error', (err) => {
            clearTimeout(timeoutId);
            // Check if error is due to abort
            if ((err as any).name === 'AbortError') {
                reject(new Error('Request timeout'));
            } else {
                reject(new Error(`Failed to connect to RoverService: ${err.message}`));
            }
        });

        // Additional socket timeout as backup
        req.setTimeout(timeout, () => {
            clearTimeout(timeoutId);
            req.destroy();
            reject(new Error('Request timeout'));
        });

        if (body) {
            req.write(JSON.stringify(body));
        }

        req.end();
    });
}

/**
 * Get RoverService daemon status
 */
export async function getStatus(): Promise<ApiResponse<RoverServiceStatus>> {
    log.info('Getting RoverService status...');
    try {
        const response = await request<RoverServiceStatus>('GET', API.STATUS);
        if (response.success) {
            log.info(`RoverService running, PID: ${response.data?.pid}`);
        }
        return response;
    } catch (err: any) {
        log.error(`Failed to get status: ${err.message}`);
        return { success: false, error: err.message };
    }
}

/**
 * Get sing-box process status
 */
export async function getSingboxStatus(): Promise<ApiResponse<SingboxStatus>> {
    log.info('Getting sing-box status from RoverService...');
    try {
        const response = await request<SingboxStatus>('GET', API.SINGBOX_STATUS);
        if (response.success && response.data?.running) {
            log.info(`sing-box running, PID: ${response.data.pid}`);
        }
        return response;
    } catch (err: any) {
        log.error(`Failed to get sing-box status: ${err.message}`);
        return { success: false, error: err.message };
    }
}

/**
 * Start sing-box via RoverService
 * 
 * Note: Starting sing-box (especially in TUN mode) can take longer because:
 * 1. It may need to stop existing processes first
 * 2. TUN mode requires creating virtual network adapters
 * 3. Windows process termination can be slow for network processes
 * 
 * We use a longer timeout (60s) to accommodate these operations.
 */
export async function startSingbox(configPath: string, binaryPath: string): Promise<ApiResponse<SingboxStatus>> {
    log.info(`Starting sing-box via RoverService...`);
    log.info(`Config: ${configPath}`);
    log.info(`Binary: ${binaryPath}`);

    try {
        // Use 60 second timeout for starting sing-box
        // This is longer than default because TUN mode setup and process cleanup can be slow
        const response = await request<SingboxStatus>('POST', API.SINGBOX_START, {
            configPath,
            binaryPath,
        }, 60000);

        if (response.success) {
            log.info(`sing-box started successfully, PID: ${response.data?.pid}`);
        } else {
            log.error(`Failed to start sing-box: ${response.error}`);
        }

        return response;
    } catch (err: any) {
        log.error(`Failed to start sing-box: ${err.message}`);
        return { success: false, error: err.message };
    }
}

/**
 * Stop sing-box via RoverService
 *
 * RoverService uses taskkill /F /IM sing-box.exe /T (same as Task Manager), typically <1s.
 * 5s timeout is sufficient; previous 30s was for old slow kill path.
 */
export async function stopSingbox(): Promise<ApiResponse<null>> {
    log.info('Stopping sing-box via RoverService...');

    try {
        const response = await request<null>('POST', API.SINGBOX_STOP, undefined, 5000);
        if (response.success) {
            log.info('sing-box stopped successfully');
        } else {
            log.error(`Failed to stop sing-box: ${response.error}`);
        }
        return response;
    } catch (err: any) {
        log.error(`Failed to stop sing-box: ${err.message}`);
        return { success: false, error: err.message };
    }
}

/**
 * Restart sing-box via RoverService
 * 
 * Note: Restarting involves stop + start, which can take time.
 * We use a longer timeout (60s) to accommodate both operations.
 */
export async function restartSingbox(): Promise<ApiResponse<SingboxStatus>> {
    log.info('Restarting sing-box via RoverService...');

    try {
        // Use 60 second timeout for restarting sing-box (stop + start)
        const response = await request<SingboxStatus>('POST', API.SINGBOX_RESTART, undefined, 60000);
        if (response.success) {
            log.info(`sing-box restarted successfully, PID: ${response.data?.pid}`);
        } else {
            log.error(`Failed to restart sing-box: ${response.error}`);
        }
        return response;
    } catch (err: any) {
        log.error(`Failed to restart sing-box: ${err.message}`);
        return { success: false, error: err.message };
    }
}

/**
 * Process info from RoverService
 */
export interface ProcessInfo {
    pid: number;
    ppid: number;
    name: string;
    user: string;
    state: string;
}

/**
 * List all sing-box processes via RoverService
 */
export async function listSingboxProcesses(): Promise<ApiResponse<ProcessInfo[]>> {
    log.info('Listing sing-box processes via RoverService...');

    try {
        const response = await request<ProcessInfo[]>('GET', API.PROCESSES_LIST);
        if (response.success) {
            log.info(`Found ${response.data?.length || 0} sing-box processes`);
        }
        return response;
    } catch (err: any) {
        log.error(`Failed to list processes: ${err.message}`);
        return { success: false, error: err.message };
    }
}

/**
 * Kill a process via RoverService (with elevated privileges)
 * @param pid - Process ID to kill
 * @param force - Whether to force kill
 */
export async function killProcess(pid: number, force: boolean = true): Promise<ApiResponse<null>> {
    log.info(`Killing process ${pid} via RoverService (force: ${force})...`);

    try {
        const response = await request<null>('POST', API.PROCESSES_KILL, {
            pid,
            force,
        });
        if (response.success) {
            log.info(`Process ${pid} killed successfully`);
        } else {
            log.error(`Failed to kill process ${pid}: ${response.error}`);
        }
        return response;
    } catch (err: any) {
        log.error(`Failed to kill process ${pid}: ${err.message}`);
        return { success: false, error: err.message };
    }
}





/**
 * Open system preferences to install the privileged helper
 */
export function openInstallGuide(): void {
    if (!isSupported()) {
        log.warn('RoverService is not supported on this platform');
        return;
    }

    // Open the directory containing the helper
    if (fs.existsSync(TARGET_DIR)) {
        if (process.platform === 'win32') {
            spawn('explorer', [TARGET_DIR]);
        } else {
            spawn('open', [TARGET_DIR]);
        }
    }

    log.info('Opened install guide');
}

/**
 * Get the helper installation status with details
 */
export interface InstallationStatus {
    platform: string;
    supported: boolean;
    socketAvailable: boolean;
    binaryInstalled: boolean;
    serviceLoaded: boolean;
    running: boolean;
    pid?: number;
    version?: string;
}

export async function getInstallationStatus(): Promise<InstallationStatus> {
    const status: InstallationStatus = {
        platform: process.platform,
        supported: isSupported(),
        socketAvailable: false,
        binaryInstalled: false,
        serviceLoaded: false,
        running: false,
    };

    if (!status.supported) {
        return status;
    }

    status.binaryInstalled = isInstalled();
    status.serviceLoaded = isServiceLoaded();

    // Try to connect and get status
    try {
        const response = await getStatus();
        if (response.success && response.data) {
            status.socketAvailable = true;
            status.running = true;
            status.pid = response.data.pid;
            status.version = response.data.version;
        }
    } catch {
        // Ignore errors
    }

    return status;
}

/**
 * Install the privileged helper (requires user to authorize)
 * Uses kardianos/service's built-in install command
 */
export async function installHelper(): Promise<{ success: boolean; error?: string; isUserCanceled?: boolean }> {
    if (!isSupported()) {
        return { success: false, error: 'RoverService is not supported on this platform' };
    }

    log.info('Installing RoverService...');

    const sourceBinary = path.join(getBuiltinResourcesPath(), TARGET_NAME);
    log.info(`Helper binary path: ${sourceBinary}`);

    if (!fs.existsSync(sourceBinary)) {
        log.error('RoverService binary not found');
        return { success: false, error: 'RoverService binary not found. Please build it first.' };
    }

    if (process.platform === 'win32') {
        return installWindows(sourceBinary);
    }
    return installMacOS(sourceBinary);
}

/**
 * Install on macOS using osascript for privilege escalation
 */
async function installMacOS(sourceBinary: string): Promise<{ success: boolean; error?: string; isUserCanceled?: boolean }> {
    // Escape single quotes in paths for shell safety
    // In shell single quotes, we need to replace ' with '\''
    const escapeShell = (str: string) => str.replace(/'/g, "'\\''");
    const safeTargetDir = escapeShell(TARGET_DIR);
    const safeTargetPath = escapeShell(TARGET_PATH);

    // Due to macOS TCC (Transparency, Consent, and Control) restrictions,
    // a privileged script cannot access files in user directories (like ~/Documents).
    // We need to copy the binary to /tmp first (as normal user), then let the
    // privileged script copy it from /tmp to the target location.
    const tempBinaryPath = `/tmp/roverservice-temp-${Date.now()}`;

    try {
        // Step 1: Copy binary to /tmp as normal user (bypasses TCC restrictions)
        fs.copyFileSync(sourceBinary, tempBinaryPath);
        log.info(`Copied binary to temp location: ${tempBinaryPath}`);
    } catch (err: any) {
        log.error(`Failed to copy binary to temp location: ${err.message}`);
        return { success: false, error: `Failed to prepare binary for installation: ${err.message}` };
    }

    const safeTempPath = escapeShell(tempBinaryPath);

    // Step 2: Use privileged script to install from /tmp to target location
    // Add set -e to exit on error
    const script = `
        set -e
        if [ ! -f '${safeTempPath}' ]; then
            echo "Error: Temp binary not found: '${safeTempPath}'" >&2
            exit 1
        fi
        mkdir -p '${safeTargetDir}'
        cp '${safeTempPath}' '${safeTargetPath}'
        chmod 755 '${safeTargetPath}'
        chown root:wheel '${safeTargetPath}'
        codesign --sign - '${safeTargetPath}' 2>/dev/null || true
        '${safeTargetPath}' install
        rm -f '${safeTempPath}'
    `;

    const result = await runWithAdminPrivileges(script);

    // Clean up temp file if it's still there (in case of failure)
    try {
        if (fs.existsSync(tempBinaryPath)) {
            fs.unlinkSync(tempBinaryPath);
        }
    } catch {
        // Ignore cleanup errors
    }

    return result;
}

/**
 * Install on Windows using elevation
 */
async function installWindows(sourceBinary: string): Promise<{ success: boolean; error?: string; isUserCanceled?: boolean }> {
    // On Windows, we need to:
    // 1. Copy the binary to Program Files
    // 2. Install as Windows Service

    const script = `
        if not exist "${TARGET_DIR}" mkdir "${TARGET_DIR}"
        copy /Y "${sourceBinary}" "${TARGET_PATH}"
        "${TARGET_PATH}" install
    `;

    return runWindowsElevated(script, sourceBinary);
}

/**
 * Run a shell script with administrator privileges using osascript (macOS)
 */
function runWithAdminPrivileges(script: string): Promise<{ success: boolean; error?: string; isUserCanceled?: boolean }> {
    return new Promise((resolve) => {
        // Write script to a temp file and execute it with admin privileges
        // This avoids all escaping issues with osascript
        const tempScriptPath = `/tmp/rover-install-${Date.now()}.sh`;

        // Clean up the script: trim lines and remove empty lines, but preserve structure
        const cleanedScript = script.trim().split('\n').map(s => s.trim()).filter(Boolean).join('\n');

        log.info(`Writing install script to: ${tempScriptPath}`);
        log.info(`Script content:\n${cleanedScript}`);

        try {
            fs.writeFileSync(tempScriptPath, cleanedScript, { mode: 0o700 });
        } catch (err: any) {
            log.error(`Failed to write temp script: ${err.message}`);
            resolve({ success: false, error: `Failed to write temp script: ${err.message}` });
            return;
        }

        // Use osascript to run the temp script with administrator privileges
        const osaScript = `do shell script "/bin/sh '${tempScriptPath}'" with administrator privileges`;

        log.info(`Running privileged script...`);

        const proc = spawn('osascript', ['-e', osaScript]);

        let stdout = '';
        let stderr = '';

        proc.stdout?.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr?.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            // Clean up temp script
            try {
                fs.unlinkSync(tempScriptPath);
            } catch {
                // Ignore cleanup errors
            }

            if (code === 0) {
                log.info('Privileged script completed successfully');
                if (stdout) log.info(`Output: ${stdout}`);
                resolve({ success: true });
            } else {
                log.error(`Privileged script failed: ${stderr}`);
                // Check if user canceled the authorization prompt
                const isUserCanceled = stderr.includes('User canceled') || stderr.includes('用户取消');
                resolve({ success: false, error: isUserCanceled ? undefined : (stderr || 'Operation failed'), isUserCanceled });
            }
        });

        proc.on('error', (err) => {
            log.error(`Failed to run privileged script: ${err.message}`);
            resolve({ success: false, error: err.message });
        });
    });
}

/**
 * Run a script with elevated privileges on Windows
 */
function runWindowsElevated(script: string, sourceBinary: string): Promise<{ success: boolean; error?: string; isUserCanceled?: boolean }> {
    return new Promise((resolve) => {
        // Use PowerShell to run elevated
        // Create a temp script file and run it with -Verb RunAs
        const tempDir = process.env.TEMP || process.env.TMP || 'C:\\Temp';
        const tempScript = path.join(tempDir, 'rover-install.ps1');

        // PowerShell script for installation
        const psScript = `
$ErrorActionPreference = 'Stop'

# Create target directory
if (-not (Test-Path "${TARGET_DIR}")) {
    New-Item -ItemType Directory -Path "${TARGET_DIR}" -Force | Out-Null
}

# Copy binary
Copy-Item -Path "${sourceBinary}" -Destination "${TARGET_PATH}" -Force

# Install service
Start-Process -FilePath "${TARGET_PATH}" -ArgumentList "install" -Wait -NoNewWindow

Write-Host "Installation completed successfully"
`;

        try {
            fs.writeFileSync(tempScript, psScript, 'utf8');
        } catch (err: any) {
            log.error(`Failed to write temp script: ${err.message}`);
            resolve({ success: false, error: `Failed to write temp script: ${err.message}` });
            return;
        }

        log.info('Running elevated PowerShell script...');

        // Use PowerShell's Start-Process -Verb RunAs to elevate
        const elevateCmd = `Start-Process powershell -ArgumentList '-ExecutionPolicy Bypass -File "${tempScript}"' -Verb RunAs -Wait`;

        const proc = spawn('powershell', ['-Command', elevateCmd], {
            windowsHide: true,
        });

        let stderr = '';
        proc.stderr?.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            // Clean up temp script
            try {
                fs.unlinkSync(tempScript);
            } catch {
                // Ignore cleanup errors
            }

            if (code === 0) {
                log.info('Windows installation completed');
                resolve({ success: true });
            } else {
                log.error(`Windows installation failed: ${stderr}`);
                // When user cancels UAC, Start-Process throws an InvalidOperationException
                // The error message contains "InvalidOperationException" or Chinese localized message
                // Common patterns: "InvalidOperationException" or starts with non-ASCII garbled text (Chinese error message)
                const isUserCanceled = stderr.includes('InvalidOperationException') ||
                    stderr.includes('FullyQualifiedErrorId : InvalidOperationException') ||
                    // Chinese: 用户取消了操作 (garbled in console as ?????)
                    (code === 1 && stderr.includes('CategoryInfo') && stderr.includes('Start-Process'));
                resolve({ success: false, error: isUserCanceled ? undefined : (stderr || 'Installation failed'), isUserCanceled });
            }
        });

        proc.on('error', (err) => {
            log.error(`Failed to run elevated script: ${err.message}`);
            resolve({ success: false, error: err.message });
        });
    });
}

/**
 * Uninstall the privileged helper (requires user to authorize)
 * Uses kardianos/service's built-in uninstall command
 * 
 * This will:
 * 1. Stop sing-box via RoverService API first
 * 2. Uninstall the service (which also stops sing-box as part of service shutdown)
 * 3. Remove all helper files
 */
export async function uninstallHelper(): Promise<{ success: boolean; error?: string; isUserCanceled?: boolean }> {
    if (!isSupported()) {
        return { success: false, error: 'RoverService is not supported on this platform' };
    }

    log.info('Uninstalling RoverService...');

    // Step 1: Try to stop sing-box via API first
    // This ensures sing-box is stopped even if the service uninstall fails
    try {
        log.info('Stopping sing-box before uninstall...');
        const stopResp = await stopSingbox();
        if (stopResp.success) {
            log.info('sing-box stopped successfully via API');
        } else {
            log.warn(`Failed to stop sing-box via API: ${stopResp.error}`);
        }
    } catch (err: any) {
        log.warn(`Error stopping sing-box: ${err.message}`);
    }

    // Step 2: Uninstall the service
    if (process.platform === 'win32') {
        return uninstallWindows();
    }
    return uninstallMacOS();
}

/**
 * Uninstall on macOS
 */
async function uninstallMacOS(): Promise<{ success: boolean; error?: string; isUserCanceled?: boolean }> {
    // Use single quotes for shell paths to avoid quote escaping issues in osascript
    const script = `
        '${TARGET_PATH}' uninstall 2>/dev/null || true
        rm -f '${TARGET_PATH}'
        rm -f /var/run/roverservice.sock
        rm -f /var/run/roverservice.pid
    `;

    return runWithAdminPrivileges(script);
}

/**
 * Uninstall on Windows
 * Uses binary uninstall first; falls back to sc/taskkill if binary fails or is missing
 */
async function uninstallWindows(): Promise<{ success: boolean; error?: string; isUserCanceled?: boolean }> {
    const tempDir = process.env.TEMP || process.env.TMP || 'C:\\Temp';
    const tempScript = path.join(tempDir, 'rover-uninstall.ps1');

    const psScript = `
$ErrorActionPreference = 'SilentlyContinue'

# Step 1: Try binary uninstall (stops service, kills process, deletes service)
if (Test-Path "${TARGET_PATH}") {
    $proc = Start-Process -FilePath "${TARGET_PATH}" -ArgumentList "uninstall" -Wait -NoNewWindow -PassThru
    if ($proc.ExitCode -ne 0) { Write-Warn "Binary uninstall exited with code $($proc.ExitCode)" }
}

# Step 2: Fallback - ensure service is gone (handles binary missing or failed)
sc stop ${SERVICE_NAME} 2>$null
Start-Sleep -Seconds 2
taskkill /F /IM roverservice.exe /T 2>$null
Start-Sleep -Seconds 1
sc delete ${SERVICE_NAME} 2>$null

# Step 3: Remove files
Remove-Item -Path "${TARGET_PATH}" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "${TARGET_DIR}" -Force -Recurse -ErrorAction SilentlyContinue

Write-Host "Uninstallation completed successfully"
`;

    try {
        fs.writeFileSync(tempScript, psScript, 'utf8');
    } catch (err: any) {
        log.error(`Failed to write temp script: ${err.message}`);
        return Promise.resolve({ success: false, error: `Failed to write temp script: ${err.message}` });
    }

    return new Promise((resolve) => {
        const elevateCmd = `Start-Process powershell -ArgumentList '-ExecutionPolicy Bypass -File "${tempScript}"' -Verb RunAs -Wait`;

        const proc = spawn('powershell', ['-Command', elevateCmd], {
            windowsHide: true,
        });

        let stderr = '';
        proc.stderr?.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            try {
                fs.unlinkSync(tempScript);
            } catch {
                // Ignore cleanup errors
            }

            if (code === 0) {
                log.info('Windows uninstallation completed');
                resolve({ success: true });
            } else {
                log.error(`Windows uninstallation failed: ${stderr}`);
                // When user cancels UAC, Start-Process throws an InvalidOperationException
                const isUserCanceled = stderr.includes('InvalidOperationException') ||
                    stderr.includes('FullyQualifiedErrorId : InvalidOperationException') ||
                    (code === 1 && stderr.includes('CategoryInfo') && stderr.includes('Start-Process'));
                resolve({ success: false, error: isUserCanceled ? undefined : (stderr || 'Uninstallation failed'), isUserCanceled });
            }
        });

        proc.on('error', (err) => {
            log.error(`Failed to run elevated script: ${err.message}`);
            resolve({ success: false, error: err.message });
        });
    });
}

// Export all functions
export default {
    isSupported,
    isMacOS,
    isWindows,
    isSocketAvailable,
    isInstalled,
    isServiceLoaded,
    getStatus,
    getSingboxStatus,
    startSingbox,
    stopSingbox,
    restartSingbox,
    listSingboxProcesses,
    killProcess,
    openInstallGuide,
    getInstallationStatus,
    installHelper,
    uninstallHelper,
};
