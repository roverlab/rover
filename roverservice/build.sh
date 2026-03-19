#!/bin/bash
# Build script for RoverService (macOS/Linux)
# This script builds executables for multiple platforms

set -e

OUTPUT_DIR="${1:-../resources}"
VERSION="${2:-1.0.0}"

echo -e "\033[36mBuilding RoverService...\033[0m"
echo "Output directory: $OUTPUT_DIR"

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Change to script directory
cd "$(dirname "$0")"

# Initialize Go module if needed
if [ ! -f "go.sum" ]; then
    echo -e "\033[33mDownloading dependencies...\033[0m"
    go mod tidy
    go mod download
fi

# Build for macOS amd64
echo -e "\033[33mBuilding for macOS amd64...\033[0m"
GOOS=darwin GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-s -w" -o "$OUTPUT_DIR/roverservice-darwin-amd64" .
echo -e "\033[32mBuilt: $OUTPUT_DIR/roverservice-darwin-amd64\033[0m"

# Build for macOS arm64 (Apple Silicon)
echo -e "\033[33mBuilding for macOS arm64...\033[0m"
GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 go build -ldflags="-s -w" -o "$OUTPUT_DIR/roverservice-darwin-arm64" .
echo -e "\033[32mBuilt: $OUTPUT_DIR/roverservice-darwin-arm64\033[0m"

# Create universal binary for macOS
echo -e "\033[33mCreating universal binary for macOS...\033[0m"
lipo -create -output "$OUTPUT_DIR/roverservice" \
    "$OUTPUT_DIR/roverservice-darwin-amd64" \
    "$OUTPUT_DIR/roverservice-darwin-arm64"
echo -e "\033[32mBuilt: $OUTPUT_DIR/roverservice (universal)\033[0m"

# Clean up intermediate files
rm -f "$OUTPUT_DIR/roverservice-darwin-amd64"
rm -f "$OUTPUT_DIR/roverservice-darwin-arm64"

# Build for Windows amd64 (optional)
echo -e "\033[33mBuilding for Windows amd64...\033[0m"
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-s -w" -o "$OUTPUT_DIR/roverservice.exe" .
echo -e "\033[32mBuilt: $OUTPUT_DIR/roverservice.exe\033[0m"

# Build for Windows arm64 (optional)
echo -e "\033[33mBuilding for Windows arm64...\033[0m"
GOOS=windows GOARCH=arm64 CGO_ENABLED=0 go build -ldflags="-s -w" -o "$OUTPUT_DIR/roverservice-arm64.exe" .
echo -e "\033[32mBuilt: $OUTPUT_DIR/roverservice-arm64.exe\033[0m"

echo -e "\033[32m"
echo "Build completed successfully!"
echo -e "\033[0m"
echo "Output files are in: $OUTPUT_DIR"
echo ""
echo -e "\033[36mTo install on macOS:\033[0m"
echo "  sudo ./roverservice install"
echo ""
echo -e "\033[36mTo uninstall on macOS:\033[0m"
echo "  sudo ./roverservice uninstall"
echo ""
echo -e "\033[36mTo install on Windows (run as Administrator):\033[0m"
echo "  .\\roverservice.exe install"
echo ""
echo -e "\033[36mTo uninstall on Windows (run as Administrator):\033[0m"
echo "  .\\roverservice.exe uninstall"
