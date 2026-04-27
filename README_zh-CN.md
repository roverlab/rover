<div align="center">
  <img src="./public/icon.png" alt="Rover" width="120" height="120">

  <h1>Rover</h1>

  <p>
    <strong>一款跨平台 sing-box GUI 客户端，支持 Windows、macOS 和 Linux，提供完整的可视化配置体验</strong>
  </p>

  <p>
    <a href="#features">✨ 功能特性</a> •
    <a href="#screenshots">📸 截图预览</a> •
    <a href="#installation">⚡ 安装</a> •
    <a href="#quick-start">🚀 快速开始</a> •
    <a href="#development">🛠️ 开发</a>
  </p>

  <p>
    <a href="./README_zh-CN.md">🇨🇳 中文</a> •
    <a href="./README.md">🇺🇸 English</a>
  </p>

  <p>
    <a href="https://github.com/roverlab/rover/releases">
      <img src="https://img.shields.io/github/v/release/roverlab/rover?style=for-the-badge&logo=github" alt="GitHub release">
    </a>
    <img src="https://img.shields.io/github/downloads/roverlab/rover/total?style=for-the-badge&color=orange" alt="Downloads">
    <img src="https://img.shields.io/github/stars/roverlab/rover?style=for-the-badge" alt="Stars">
    <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=for-the-badge&logo=electron" alt="Platform">
    <img src="https://img.shields.io/badge/stack-Electron%20%2B%20React%2019%20%2B%20TypeScript-purple?style=for-the-badge" alt="Stack">
    <img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="License">
  </p>
</div>

---

## 概述

Rover 是一款现代化的 sing-box 桌面客户端，提供**完整的可视化（所见即所得）配置** — 无需再手动编辑 JSON 配置文件。它拥有图形化路由规则编辑器、可视化的 DNS 策略管理、内置分流模板，以及无缝的 Clash 订阅迁移功能。

## 功能特性

- **可视化路由规则编辑器** — 图形化编辑，完整支持所有规则类型（域名、IP CIDR、端口、进程名等），AND/OR 逻辑组合，实时预览
- **可视化 DNS 策略管理** — 为每个域名独立配置 DNS 策略，多协议支持（UDP/TCP/DoT/DoH/DoQ），广告和追踪域名拦截
- **一键规则集管理** — 内置 geosite、geoip、ACL4SSR、Clash 规则集；远程订阅自动更新；本地编辑智能格式转换
- **内置模板** — 国内白名单 + 全球代理（Clash/ACL4SSR），均衡分流方案；一键应用，无需手动配置
- **订阅管理** — 远程订阅 URL 和本地文件导入（Clash YAML / sing-box JSON），自动更新，流量使用显示
- **连接监控** — 实时连接列表与详情追踪，一键关闭连接
- **运行时仪表盘** — 实时上下行流量图表，节点状态与延迟显示
- **Clash 迁移** — 兼容 Mihomo（Clash Meta）规则集和订阅格式，Clash 用户零学习成本
- **桌面集成** — 系统托盘、开机自启、局域网代理访问、IPv6 开关、Hosts 覆盖
- **多语言支持** — 内置 `zh-CN`、`zh-TW`、`en`、`ko`、`ja`、`ru`、`es`、`fa`

## 支持的协议与格式

- **协议**: Shadowsocks, VMess/VLESS (支持 Reality), Trojan, Hysteria2/TUIC, AnyTLS, HTTP/SOCKS5
- **订阅格式**: Clash/Mihomo YAML, sing-box JSON

## 截图预览

<div align="center">
  <img src="./assets/screenshot1.png" alt="Rover 主界面" width="880">
  <p><em>主界面 — 可视化策略编辑器、连接监控与导航视图</em></p>
</div>

---

## 安装

从 [GitHub Releases](https://github.com/roverlab/rover/releases) 下载：

| 操作系统 | 格式 |
| --- | --- |
| Windows | `.exe` |
| macOS | `.dmg`（Apple Silicon & Intel）|
| Linux | `.AppImage` |

## 快速开始

1. 从 [Releases](https://github.com/roverlab/rover/releases) 下载并运行对应平台的安装包。
2. 在**配置文件**页面导入订阅 — 粘贴 URL 或导入本地文件。
3. 进入**策略**页面，选择内置模板并点击应用，完成分流配置。
4. 选择节点并启动代理 — 即可开始使用！

## 开发

```bash
# 安装依赖
npm install

# 启动开发模式
npm run dev

# 类型检查
npm run lint

# 构建 Windows 版本
npm run pack:win

# 下载内置规则集
npm run download:rulesets
```

## 架构

- **前端**: React 19 + TypeScript + Tailwind CSS v4 + i18next + Framer Motion
- **桥接层**: Electron IPC (`contextBridge`) 用于主进程 ↔ 渲染进程通信
- **后端**: Electron 主进程（Node.js），模块划分为 config、db、subscription、route-policy
- **构建工具**: Rspack 快速打包，electron-builder 打包分发
- **存储**: 基于 JSON 文件的本地持久化，用于保存应用设置、配置文件和策略

## 贡献

欢迎提交 Issue 和 Pull Request。

1. 在 [Issues](https://github.com/roverlab/rover/issues) 中报告 Bug
2. 在 [Discussions](https://github.com/roverlab/rover/discussions) 中提出建议
3. 请保持与现有架构和代码风格一致

## 致谢

- [Sing-Box](https://github.com/SagerNet/sing-box)
- [Electron](https://www.electronjs.org/)
- [React](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Rspack](https://rspack.dev/)

---

<div align="center">
  <p><strong>由 <a href="https://github.com/roverlab">RoverLab</a> 用 ❤️ 构建</strong></p>
  <p>
    <strong>声明：</strong>本项目仅供学习和交流使用。请遵守当地法律法规。
  </p>
</div>
