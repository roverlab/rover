<div align="center">
  <img src="./public/icon.png" alt="Rover" width="120" height="120">

  <h1>Rover</h1>

  <p>
    <strong>A cross-platform sing-box GUI client with full visual configuration for Windows, macOS, and Linux</strong>
  </p>

  <p>
    <a href="#features">✨ Features</a> •
    <a href="#screenshots">📸 Screenshots</a> •
    <a href="#installation">⚡ Installation</a> •
    <a href="#quick-start">🚀 Quick Start</a> •
    <a href="#development">🛠️ Development</a>
  </p>

  <p>
    <a href="./README_zh-CN.md">🇨🇳 中文</a> •
    <a href="./README.md">🇺🇸 English</a>
  </p>

  <p>
    <a href="https://github.com/roverlab/rover/releases">
      <img src="https://img.shields.io/github/v/release/roverlab/rover?style=for-the-badge&logo=github" alt="GitHub release">
    </a>
    <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=for-the-badge&logo=electron" alt="Platform">
    <img src="https://img.shields.io/badge/stack-Electron%20%2B%20React%2019%20%2B%20TypeScript-purple?style=for-the-badge" alt="Stack">
    <img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="License">
  </p>
</div>

---

## Overview

Rover is a modern sing-box desktop client that provides **full visual (WYSIWYG) configuration** — no more manual JSON editing. It features a graphical route rule editor, visual DNS policy management, built-in traffic splitting templates, and seamless Clash subscription migration.

## Features

- **Visual Route Rule Editor** — Graphical editing with full type support (domain, IP CIDR, port, process name, etc.), AND/OR logic combination, real-time preview
- **Visual DNS Policy Management** — Independent DNS policy per domain, multi-protocol support (UDP/TCP/DoT/DoH/DoQ), ad & tracking domain blocking
- **One-click Rule Set Management** — Built-in geosite, geoip, ACL4SSR, Clash rule sets; remote subscription with auto-update; local editing with smart format conversion
- **Built-in Templates** — China Whitelist + Global Proxy (Clash/ACL4SSR), Balanced Traffic Splitting; one-click apply, no manual config needed
- **Subscription Management** — Remote subscription URL and local file import (Clash YAML / sing-box JSON), auto-update, traffic usage display
- **Connection Monitor** — Real-time connection list with detail tracking, one-click close connections
- **Runtime Dashboard** — Real-time up/down traffic charts, node status and latency display
- **Clash Migration** — Compatible with Mihomo (Clash Meta) rule sets and subscription format, zero learning curve for Clash users
- **Desktop Integration** — System tray, auto-start on boot, LAN proxy access, IPv6 toggle, hosts override
- **Localization** — Built-in `zh-CN`, `zh-TW`, `en`, `ko`, `ja`, `ru`, `es`, `fa`

## Supported Protocols & Formats

- **Protocols**: Shadowsocks, VMess/VLESS (with Reality), Trojan, Hysteria2/TUIC, AnyTLS, HTTP/SOCKS5
- **Subscription Formats**: Clash/Mihomo YAML, sing-box JSON

## Screenshots

<div align="center">
  <img src="./assets/screenshot11.png" alt="Rover Interface" width="880">
  <p><em>Main interface with visual policy editor, connection monitor, and navigation views</em></p>
</div>

---

## Installation

Download from [GitHub Releases](https://github.com/roverlab/rover/releases):

| OS | Format |
| --- | --- |
| Windows | `.exe`  |
| macOS | `.dmg` (Apple Silicon & Intel) |
| Linux | `.AppImage` |

## Quick Start

1. Download and run the installer for your platform from [Releases](https://github.com/roverlab/rover/releases).
2. Import a subscription on the **Profiles** page — paste a URL or import a local file.
3. Go to **Policy**, select a built-in template and click apply to configure traffic splitting.
4. Pick a node and start the proxy — ready to go!

## Development

```bash
# Install dependencies
npm install

# Start development
npm run dev

# Type check
npm run lint

# Build for Windows
npm run pack:win

# Download built-in rulesets
npm run download:rulesets
```

## Architecture

- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 + i18next + Framer Motion
- **Bridge layer**: Electron IPC (`contextBridge`) for main ↔ renderer communication
- **Backend**: Electron Main Process (Node.js), with modules split into config, db, subscription, route-policy
- **Build tooling**: Rspack for fast bundling, electron-builder for packaging
- **Storage**: JSON file-based local persistence for app settings, profiles, and policies

## Contributing

Issues and pull requests are welcome.

1. Report bugs in [Issues](https://github.com/roverlab/rover/issues)
2. Propose ideas in [Discussions](https://github.com/roverlab/rover/discussions)
3. Keep changes aligned with existing architecture and code style

## Acknowledgments

- [Sing-Box](https://github.com/SagerNet/sing-box)
- [Electron](https://www.electronjs.org/)
- [React](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Rspack](https://rspack.dev/)

---

<div align="center">
  <p><strong>Built with ❤️ by <a href="https://github.com/roverlab">RoverLab</a></strong></p>
  <p>
    <strong>Disclaimer:</strong> This project is for learning and communication purposes only. Please comply with local laws and regulations.
  </p>
</div>
