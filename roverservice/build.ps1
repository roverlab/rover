# PowerShell build script for RoverService (Windows)
# This script builds the Windows executable

param(
    [string]$OutputDir = "..\resources",
    [string]$Version = "1.0.0"
)

$ErrorActionPreference = "Stop"

Write-Host "Building RoverService for Windows..." -ForegroundColor Cyan
Write-Host "Output directory: $OutputDir" -ForegroundColor Gray

# Ensure output directory exists
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

# Change to script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# Initialize Go module if needed
if (-not (Test-Path "go.sum")) {
    Write-Host "Downloading dependencies..." -ForegroundColor Yellow
    go mod tidy
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to download dependencies" -ForegroundColor Red
        exit 1
    }
}

# Build for Windows amd64
Write-Host "Building for Windows amd64..." -ForegroundColor Yellow
$env:GOOS = "windows"
$env:GOARCH = "amd64"
$env:CGO_ENABLED = "0"

$outputPath = Join-Path $OutputDir "roverservice.exe"
go build -ldflags="-s -w -X main.Version=$Version" -o $outputPath .

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed for Windows amd64" -ForegroundColor Red
    exit 1
}

Write-Host "Built: $outputPath" -ForegroundColor Green

# Reset environment
$env:GOOS = ""
$env:GOARCH = ""

Write-Host ""
Write-Host "Build completed successfully!" -ForegroundColor Green
Write-Host "Output files are in: $OutputDir" -ForegroundColor Gray
Write-Host ""
Write-Host "To install the service:" -ForegroundColor Cyan
Write-Host "  1. Run PowerShell as Administrator" -ForegroundColor Gray
Write-Host "  2. Execute: .\roverservice.exe install" -ForegroundColor Gray
Write-Host ""
Write-Host "To uninstall the service:" -ForegroundColor Cyan
Write-Host "  1. Run PowerShell as Administrator" -ForegroundColor Gray
Write-Host "  2. Execute: .\roverservice.exe uninstall" -ForegroundColor Gray
