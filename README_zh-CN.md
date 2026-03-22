<p align="center">
  <img src="./public/icon.png" width="120">
</p>

<h1 align="center">Rover</h1>

<p align="center">
  <strong>🎨 全功能可视化配置 · 🌍 跨平台支持 · 🚀 极易上手</strong>
</p>

<p align="center">
  <em>新一代 sing-box GUI 桌面客户端，让代理配置所见即所得</em>
</p>

<p align="center">
  <img src="https://img.shields.io/github/v/release/roverlab/rover?style=flat-square&color=blue">
  <img src="https://img.shields.io/github/downloads/roverlab/rover/total?style=flat-square&color=orange">
  <img src="https://img.shields.io/github/stars/roverlab/rover?style=flat-square">
  <img src="https://img.shields.io/github/license/roverlab/rover?style=flat-square&color=green">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows-blue?style=flat-square">
  <img src="https://img.shields.io/badge/platform-macOS-black?style=flat-square">
  <img src="https://img.shields.io/badge/core-sing--box-red?style=flat-square">
</p>

<p align="center">
  <a href="#-核心亮点">核心亮点</a> •
  <a href="#-安装">安装</a> •
  <a href="#-截图预览">截图预览</a> •
  <a href="#-快速开始">快速开始</a> •
  <a href="./README.md">English</a>
</p>

---

# 🌟 核心亮点

## 📐 全功能可视化配置

告别繁琐的手工编辑 YAML/JSON 配置文件！Rover 提供完整的可视化配置界面：

### 🛤️ 路由规则可视化编辑
- **图形化规则编辑器** — 无需记忆复杂语法，鼠标点击即可完成配置
- **多规则类型全支持** — domain、ip_cidr、port、process_name、src_ip_cidr 等
- **逻辑规则组合** — 支持 AND/OR 逻辑组合，满足复杂分流需求
- **实时预览** — 配置即时生效，所见即所得

### 🌐 DNS 策略可视化管理
- **独立 DNS 策略配置** — 为不同域名指定专属 DNS 服务器
- **多协议 DNS 支持** — UDP、TCP、DoT、DoH、DoQ、HTTP/3 全覆盖
- **域名规则匹配** — 关键词、后缀、正则、泛域名通配符全支持
- **DNS 拦截** — 一键屏蔽广告、追踪域名

### 📦 规则集一键管理
- **内置规则集** — 预装 geosite、geoip、ACL4SSR、Clash 等主流规则集
- **远程订阅** — 支持自定义规则集 URL，自动更新
- **本地编辑** — 创建、编辑属于自己的规则集
- **格式自动转换** — binary/source 格式智能识别

---

## 🎯 内置模板，一键完成分流

不想折腾配置？预设模板帮你搞定！一键解决 DNS 泄漏、DNS 污染问题：

| 模板 | 说明 |
|------|------|
| **国内白名单 + 国外代理 (Clash)** | 基于 Clash 规则集，包含直连应用、私有网络、广告拦截、苹果服务、Google、Telegram 等 |
| **国内白名单 + 国外代理 (ACL4SSR)** | 结合 ACL4SSR + Geosite 规则，涵盖苹果、B站、国内直连、国外穿墙等 |
| **🚀 全能分流平衡方案** | 国内用阿里云 UDP 快速解析，国外用 Google DoT 加密 + FakeIP，有效解决 DNS 污染 |

**选择模板 → 一键应用 → 完成！** 无需任何手动配置。

---

## 🌍 跨平台支持

| 平台 | 支持情况 |
|------|----------|
| Windows | ✅ NSIS 安装包，开箱即用 |
| macOS | ✅ Apple Silicon 原生支持，Universal Binary |

统一的操作体验，无论你用什么系统，界面与功能完全一致。

---

## 🚀 极易上手，Clash 用户无缝迁移

如果你是 Clash 用户，Rover 让你倍感亲切：

- **熟悉的规则集** — 内置 Clash Premium 规则集，直接复用你熟悉的规则
- **订阅链接兼容** — 支持 Clash 订阅格式，一键导入现有配置
- **相似的操作逻辑** — 节点分组、延迟测试、模式切换，操作习惯零成本迁移
- **更强大的功能** — 在保留易用性的同时，提供 sing-box 的全部能力

---

# ✨ 更多功能

### 📊 仪表盘
- 实时上下行流量图表
- 节点状态与延迟显示
- 一键启停代理内核

### 🌍 节点管理
- 多分组展示（标签页/列表视图）
- 节点排序（默认/延迟/名称）
- 批量延迟测试

### 📂 订阅管理
- 远程订阅与本地配置支持
- 订阅自动更新
- 流量使用信息显示

### 🔍 连接监控
- 实时连接列表
- 连接详情追踪
- 一键关闭连接

### 📋 日志查看
- 多级别日志过滤
- 实时刷新
- 配置错误智能提示

### ⚙️ 系统设置
- 端口配置、局域网访问
- IPv6 开关、Hosts 覆盖
- 开机自启、托盘运行

### 🔒 协议支持
基于 sing-box 内核，支持：
- **Shadowsocks**
- **VMess / VLESS**
- **Trojan**
- **Hysteria2 / TUIC**
- **AnyTLS** 
- HTTP/HTTPS/SOCKS5

---

# 📸 截图预览

<p align="center">
  <img src="./assets/screenshot1.png" width="800">
</p>

<p align="center">
  <img src="./assets/screenshot2.png" width="800">
</p>

<p align="center">
  <img src="./assets/screenshot3.png" width="800">
</p>

---

# ⚡ 安装

前往 Releases 页面下载最新版本：

👉 https://github.com/roverlab/rover/releases

| 系统 | 格式 | 说明 |
|------|------|------|
| Windows | `.exe` | NSIS 安装包 |
| macOS | `.dmg` | Apple Silicon 原生支持 |

---

# 🚀 快速开始

### 1️⃣ 下载安装
从 Releases 下载对应平台的安装包，完成安装。

### 2️⃣ 导入配置
支持以下方式：
- **订阅 URL** — 粘贴订阅链接，一键导入
- **本地文件** — 导入 YAML/JSON 配置文件
- **手动配置** — 直接编辑配置内容

### 3️⃣ 选择模板
进入「策略」页面，选择内置模板一键应用，完成分流配置。

### 4️⃣ 开启代理
选择节点 → 点击启动 → 开始使用！

---

# 🔒 安全透明

- **完全开源** — 代码公开，可审计可信任
- **无广告** — 纯净体验，无任何干扰
- **无数据收集** — 隐私优先，你的数据只属于你

---

# 🤝 贡献

欢迎参与贡献！

- 提交 [Issue](https://github.com/roverlab/rover/issues) 报告 Bug 或建议
- 提交 Pull Request 贡献代码
- 帮助完善文档

---

# 📄 开源协议

本项目基于 [MIT License](./LICENSE) 开源。

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/roverlab">RoverLab</a>
</p>
