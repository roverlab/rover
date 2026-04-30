<div align="center">
  <img src="./public/icon.png" alt="Rover Logo" width="100">

  <h1>Rover</h1>
  <p><strong>跨平台 sing-box 图形客户端 · 真正的可视化配置体验</strong></p>

<p>
  <img src="https://img.shields.io/github/v/release/roverlab/rover?style=for-the-badge&logo=github" alt="Release">
  <img src="https://img.shields.io/github/downloads/roverlab/rover/total?style=for-the-badge&color=orange" alt="Downloads">
  <img src="https://img.shields.io/github/stars/roverlab/rover?style=for-the-badge" alt="Stars">
  <img src="https://img.shields.io/badge/Platform-Win%20%7C%20Mac%20%7C%20Linux-blue?style=for-the-badge&logo=electron" alt="Platform">


  <a href="./README.md">English</a> | <a href="./README_zh-CN.md">简体中文</a> | <a href="./README_zh-TW.md">繁體中文</a> | <a href="./README_ja.md">日本語</a> | <a href="./README_ko.md">한국어</a> | <a href="./README_ru.md">Русский</a> | <a href="./README_es.md">Español</a> | <a href="./README_fa.md">فارسی</a>
</p>

</div>

**Rover** 是一款现代化的 sing-box 桌面客户端，告别繁琐的手写 JSON 配置，为您提供**所见即所得**的代理体验。

## ✨ 核心特性

- 🎨 **完全可视化**：图形化编辑**路由规则**与**自定义 DNS**，支持多协议及广告拦截。
- 🛡️ **TUN 模式**：原生支持 TUN 虚拟网卡，一键接管系统级全局流量。
- 🔄 **无缝接轨 Clash**：完美兼容 Clash / Mihomo 订阅与规则集，老用户零成本无缝迁移。
- 📦 **开箱即用**：内置多套经典分流模板（如国内白名单/全局），免去繁琐配置。
- 📊 **状态监控**：实时查看上下行速率、节点延迟及活动连接

## 🌐 协议支持
`Shadowsocks` / `VMess` / `VLESS (Reality)` / `Trojan` / `Hysteria2` / `TUIC` / `AnyTLS` / `HTTP/SOCKS5`

## 📸 截图预览

<div align="center">
  <img src="./assets/screenshot1.png" alt="Rover 主界面" width="800" style="border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
</div>

## ⚡ 快速开始

1. **下载**：前往 [Releases](https://github.com/roverlab/rover/releases) 获取 Windows / macOS / Linux 版本。
2. **导入**：在「配置文件」页粘贴订阅链接或导入本地文件。
3. **连接**：在「策略」页应用内置模板，开启代理（或 TUN 模式）即可畅游网络。

## 🛠️ 开发与构建

```bash
npm install
npm run dev        # 启动开发
npm run pack:win   # 构建 Windows 版本
```

## 🤝 参与贡献

我们非常欢迎您的参与！
- 🐛 发现 Bug？提交 [Issue](https://github.com/roverlab/rover/issues)
- 💡 有好点子？发起 [Discussion](https://github.com/roverlab/rover/discussions)
- 🛠️ 提交 PR 前，请确保代码风格与现有架构保持一致。

**特别鸣谢**：[Sing-Box](https://github.com/SagerNet/sing-box) | [Electron](https://www.electronjs.org/) | [React](https://react.dev/) | [Tailwind CSS](https://tailwindcss.com/) | [Rspack](https://rspack.dev/)

---

<div align="center">
  <p>由 <strong><a href="https://github.com/roverlab">RoverLab</a></strong> 用 ❤️ 构建</p>
  <p><em>本项目仅供学习交流使用，请务必遵守当地法律法规。</em></p>
</div>