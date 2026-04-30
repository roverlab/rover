<div align="center">
  <img src="./public/icon.png" alt="Rover Logo" width="100">

  <h1>Rover</h1>
  <p><strong>Cross-platform sing-box GUI client · A truly visual configuration experience</strong></p>

<p>
  <img src="https://img.shields.io/github/v/release/roverlab/rover?style=for-the-badge&logo=github" alt="Release">
  <img src="https://img.shields.io/github/downloads/roverlab/rover/total?style=for-the-badge&color=orange" alt="Downloads">
  <img src="https://img.shields.io/github/stars/roverlab/rover?style=for-the-badge" alt="Stars">
  <img src="https://img.shields.io/badge/Platform-Win%20%7C%20Mac%20%7C%20Linux-blue?style=for-the-badge&logo=electron" alt="Platform">

  <a href="./README.md">English</a> | <a href="./README_zh-CN.md">简体中文</a> | <a href="./README_zh-TW.md">繁體中文</a> | <a href="./README_ja.md">日本語</a> | <a href="./README_ko.md">한국어</a> | <a href="./README_ru.md">Русский</a> | <a href="./README_es.md">Español</a> | <a href="./README_fa.md">فارسی</a>
</p>

</div>

**Rover** is a modern desktop client for sing-box, избавing you from tedious handwritten JSON configurations and delivering a true **what-you-see-is-what-you-get** proxy experience.

## ✨ Key Features

- 🎨 **Fully Visualized**: Graphical editing of **routing rules** and **custom DNS**, with support for multiple protocols and ad blocking.
- 🛡️ **TUN Mode**: Native support for TUN virtual network interfaces, enabling one-click takeover of system-wide traffic.
- 🔄 **Seamless Clash Compatibility**: Fully compatible with Clash / Mihomo subscriptions and rule sets, allowing zero-cost migration for existing users.
- 📦 **Out-of-the-box**: Built-in classic routing templates (e.g., domestic whitelist / global mode), eliminating complex setup.
- 📊 **Real-time Monitoring**: View upload/download speeds, node latency, and active connections in real time.

## 🌐 Supported Protocols
`Shadowsocks` / `VMess` / `VLESS (Reality)` / `Trojan` / `Hysteria2` / `TUIC` / `AnyTLS` / `HTTP/SOCKS5`

## 📸 Screenshots

<div align="center">
  <img src="./assets/screenshot11.png" alt="Rover Main Interface" width="800" style="border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
</div>

## ⚡ Quick Start

1. **Download**: Visit [Releases](https://github.com/roverlab/rover/releases) to get the Windows / macOS / Linux versions.
2. **Import**: Paste your subscription link or import a local file in the "Profiles" page.
3. **Connect**: Apply a built-in template in the "Policies" page, then enable the proxy (or TUN mode) to get started.

## 🛠️ Development & Build

```bash
npm install
npm run dev        # Start development
npm run pack:win   # Build Windows version
````

## 🤝 Contributing

We warmly welcome your contributions!

* 🐛 Found a bug? Submit an [Issue](https://github.com/roverlab/rover/issues)
* 💡 Have ideas? Start a [Discussion](https://github.com/roverlab/rover/discussions)
* 🛠️ Before submitting a PR, please ensure your code style aligns with the existing architecture.

**Special Thanks**: [Sing-Box](https://github.com/SagerNet/sing-box) | [Electron](https://www.electronjs.org/) | [React](https://react.dev/) | [Tailwind CSS](https://tailwindcss.com/) | [Rspack](https://rspack.dev/)

---

<div align="center">
  <p>Built with ❤️ by <strong><a href="https://github.com/roverlab">RoverLab</a></strong></p>
  <p><em>This project is for learning and communication purposes only. Please comply with local laws and regulations.</em></p>
</div>
