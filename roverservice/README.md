# RoverService

Cross-platform privileged helper daemon for managing sing-box with elevated privileges.

## Overview

RoverService is a system service that runs with administrator/root privileges and provides an HTTP API for:
- Starting, stopping, and restarting sing-box
- Managing sing-box processes
- File operations with elevated privileges

It is managed by the Electron application via IPC.

## Supported Platforms

- **macOS** (Intel & Apple Silicon) - Uses Unix Domain Socket
- **Windows** (x64 & ARM64) - Uses Named Pipe

## Architecture

```
┌──────────────────────┐
│   Electron App       │
│   (User Interface)   │
└─────────┬────────────┘
          │ IPC
          ▼
┌──────────────────────┐
│  roverservice-client   │
│  (TypeScript)        │
└─────────┬────────────┘
          │ HTTP over Socket
          ▼
┌──────────────────────┐
│   RoverService Daemon  │
│   (Go, runs as root) │
└─────────┬────────────┘
          │ Process Management
          ▼
┌──────────────────────┐
│     sing-box         │
│   (TUN/Proxy)        │
└──────────────────────┘
```

## Building

### Prerequisites

- Go 1.21 or later
- For Windows builds: PowerShell
- For macOS builds: Xcode Command Line Tools (for `lipo`)

### Build for All Platforms

**macOS/Linux:**
```bash
chmod +x build.sh
./build.sh
```

**Windows:**
```powershell
.\build.ps1
```

This will produce:
- `roverservice` - macOS universal binary (Intel + Apple Silicon)
- `roverservice.exe` - Windows x64
- `roverservice-arm64.exe` - Windows ARM64

### Build for Specific Platform

```bash
# macOS amd64
GOOS=darwin GOARCH=amd64 go build -o roverservice .

# macOS arm64 (Apple Silicon)
GOOS=darwin GOARCH=arm64 go build -o roverservice .

# Windows amd64
GOOS=windows GOARCH=amd64 go build -o roverservice.exe .

# Windows arm64
GOOS=windows GOARCH=arm64 go build -o roverservice-arm64.exe .
```

## Installation

### macOS

The helper should be installed to `/Library/PrivilegedHelperTools/`.

**Manual Installation (requires administrator password):**
```bash
# Copy binary to target location
sudo mkdir -p /Library/PrivilegedHelperTools
sudo cp roverservice /Library/PrivilegedHelperTools/roverservice
sudo chmod 755 /Library/PrivilegedHelperTools/roverservice
sudo chown root:wheel /Library/PrivilegedHelperTools/roverservice

# Ad-hoc code sign (required for macOS)
sudo codesign --sign - /Library/PrivilegedHelperTools/roverservice

# Install and start the service
sudo /Library/PrivilegedHelperTools/roverservice install
```

**Or use the one-line installer:**
```bash
sudo ./roverservice install
```

### Windows

The helper should be installed to `C:\Program Files\Rover\Helper\`.

**Manual Installation (requires Administrator):**
```powershell
# Run PowerShell as Administrator

# Create target directory
New-Item -ItemType Directory -Path "C:\Program Files\Rover\Helper" -Force

# Copy binary
Copy-Item roverservice.exe "C:\Program Files\Rover\Helper\roverservice.exe"

# Install and start the service
& "C:\Program Files\Rover\Helper\roverservice.exe" install
```

**Or use the one-line installer:**
```powershell
# Run as Administrator
.\roverservice.exe install
```

## Uninstallation

### macOS

```bash
# Stop and uninstall the service
sudo /Library/PrivilegedHelperTools/roverservice uninstall

# Remove binary
sudo rm -f /Library/PrivilegedHelperTools/roverservice
```

### Windows

```powershell
# Run PowerShell as Administrator

# Stop and uninstall the service
& "C:\Program Files\Rover\Helper\roverservice.exe" uninstall

# Remove binary
Remove-Item "C:\Program Files\Rover\Helper" -Recurse -Force
```

## Command Line Interface

```
Usage:
  roverservice           Run as a service (managed by launchd/Windows Service)
  roverservice install   Install and start the service
  roverservice uninstall Stop and uninstall the service
  roverservice start     Start the service
  roverservice stop      Stop the service
  roverservice restart   Restart the service
  roverservice status    Check service status
  roverservice run       Run directly (for debugging)
  roverservice help      Show this help message
```

## HTTP API

The daemon listens on:
- **macOS:** Unix socket at `/var/run/roverservice.sock`
- **Windows:** Named Pipe at `\\.\pipe\roverservice`

### Why Named Pipe on Windows?

Named Pipes are used on Windows instead of TCP ports because:
1. **No port conflicts** - Unlike TCP ports, named pipes don't conflict with other applications
2. **Better security** - Access is controlled by Windows ACLs
3. **Consistent with Unix approach** - Similar security model to Unix domain sockets
4. **Automatic cleanup** - Named pipes are automatically removed when the server closes

### Endpoints

#### Daemon Status

```
GET /status
GET /version
```

Response:
```json
{
  "success": true,
  "data": {
    "version": "1.0.0",
    "pid": 12345,
    "uptime": 1700000000,
    "socketPath": "/var/run/roverservice.sock",
    "platform": "darwin"
  }
}
```

#### Sing-box Management

```
GET /singbox/status
```

Response:
```json
{
  "success": true,
  "data": {
    "running": true,
    "pid": 12346,
    "startTime": 1700000000,
    "configPath": "/path/to/config.json",
    "binaryPath": "/path/to/sing-box"
  }
}
```

```
POST /singbox/start
Content-Type: application/json

{
  "configPath": "/path/to/config.json",
  "binaryPath": "/path/to/sing-box"
}
```

```
POST /singbox/stop
```

```
POST /singbox/restart
```

#### Process Management

```
GET /processes
```

Response:
```json
{
  "success": true,
  "data": [
    {
      "pid": 12346,
      "ppid": 12345,
      "name": "sing-box",
      "user": "root",
      "state": "S"
    }
  ]
}
```

```
POST /processes/kill
Content-Type: application/json

{
  "pid": 12346,
  "force": false
}
```

#### File Operations

```
POST /check-path
Content-Type: application/json

{
  "path": "/path/to/check"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "exists": true,
    "isDir": false,
    "size": 1024,
    "mode": "-rw-r--r--"
  }
}
```

```
POST /read-file
Content-Type: application/json

{
  "path": "/path/to/file",
  "maxBytes": 1048576
}
```

Response:
```json
{
  "success": true,
  "data": {
    "content": "file contents...",
    "size": 1024
  }
}
```

## Electron Integration

### Installation from Electron App

The Electron app uses the `roverservice-client.ts` module to manage the helper:

```typescript
import { installHelper, uninstallHelper, getInstallationStatus } from './roverservice-client';

// Check status
const status = await getInstallationStatus();
console.log(`Installed: ${status.binaryInstalled}`);
console.log(`Running: ${status.running}`);

// Install (prompts for administrator password)
const result = await installHelper();
if (result.success) {
  console.log('Installed successfully');
}

// Uninstall
const result = await uninstallHelper();
```

### Using the Helper

```typescript
import { startSingbox, stopSingbox, getSingboxStatus } from './roverservice-client';

// Start sing-box
const result = await startSingbox('/path/to/config.json', '/path/to/sing-box');

// Check status
const status = await getSingboxStatus();
if (status.data?.running) {
  console.log(`sing-box running with PID ${status.data.pid}`);
}

// Stop sing-box
await stopSingbox();
```

## Security Considerations

1. **macOS:** The helper binary must be code-signed. An ad-hoc signature is sufficient for local use.
2. **Windows:** The helper runs as a Windows Service under the Local System account.
3. **macOS:** The Unix socket has permissions `0666` allowing local connections.
4. **Windows:** The Named Pipe uses ACL `D:(A;;GA;;;BA)(A;;GA;;;SY)` allowing Administrators and System access.
5. No authentication is required - security is provided by the socket/pipe permissions.

## Service Management

### macOS (launchd)

The service is installed as a launch daemon at:
`/Library/LaunchDaemons/RoverService.plist`

Check status:
```bash
sudo launchctl list RoverService
```

View logs:
```bash
log show --predicate 'process == "roverservice"' --last 1h
```

### Windows (Windows Service)

The service is installed as a Windows Service named `RoverService`.

Check status:
```powershell
sc query RoverService
```

View logs:
```powershell
Get-EventLog -LogName Application -Source RoverService -Newest 10
```

## Development

### Debug Mode

Run the helper directly without installing as a service:

```bash
# macOS
sudo ./roverservice run

# Windows (Administrator PowerShell)
.\roverservice.exe run
```

### Testing the API

Using curl (macOS):
```bash
# Connect via unix socket
curl --unix-socket /var/run/roverservice.sock http://localhost/status
```

Using PowerShell (Windows):
```powershell
# Note: Windows Named Pipes cannot be tested directly with curl
# Use the Node.js client or write a simple test script

# Check if the service is running
sc query RoverService
```

## Troubleshooting

### macOS

**Service not starting:**
```bash
# Check if the binary exists
ls -la /Library/PrivilegedHelperTools/roverservice

# Check if the service is loaded
sudo launchctl list | grep rover

# Try starting manually
sudo /Library/PrivilegedHelperTools/roverservice run
```

**Permission denied:**
```bash
# Fix permissions
sudo chmod 755 /Library/PrivilegedHelperTools/roverservice
sudo chown root:wheel /Library/PrivilegedHelperTools/roverservice
```

**Socket not accessible:**
```bash
# Check socket permissions
ls -la /var/run/roverservice.sock

# Remove stale socket
sudo rm -f /var/run/roverservice.sock
sudo /Library/PrivilegedHelperTools/roverservice restart
```

### Windows

**Service not starting:**
```powershell
# Check service status
sc query RoverService

# Check if binary exists
Test-Path "C:\Program Files\Rover\Helper\roverservice.exe"

# Try starting manually
& "C:\Program Files\Rover\Helper\roverservice.exe" run
```

**Cannot connect to service:**
```powershell
# The named pipe should exist when service is running
# Check if the pipe exists using PowerShell
[System.IO.Directory]::GetFiles("\\.\\pipe\\") | Where-Object { $_ -like "*roverservice*" }

# If pipe doesn't exist, the service may not be running
sc query RoverService
```

## License

MIT License
