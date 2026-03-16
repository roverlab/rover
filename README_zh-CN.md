<p align="center">
  <img src="./public/icon.png" width="120">
</p>

<h1 align="center">Rover</h1>

<p align="center">
  <strong>🚀 功能完备 · 界面精美 · 免费开源</strong>
</p>

<p align="center">
  <em>新一代 sing-box GUI 桌面客户端，让代理管理更专业、更简单</em>
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
  <a href="#-功能特性">功能特性</a> •
  <a href="#-安装">安装</a> •
  <a href="#-截图预览">截图预览</a> •
  <a href="#-快速开始">快速开始</a> •
  <a href="./README.md">English</a>
</p>

---

# ✨ 功能特性

### 🎨 精美界面
- **玻璃拟态设计** — 现代化 UI，视觉体验极佳
- **深浅模式自适应** — 自动跟随系统主题切换
- **流畅动画效果** — 基于 Framer Motion 的丝滑交互

### ⚡ 极致易用
- **三步完成安装** — 下载即用，无需复杂配置
- **一键导入订阅** — 支持订阅 URL、YAML、JSON 多种格式
- **自动节点测速** — 批量延迟测试，智能筛选最优节点

### 💪 核心功能

#### 📊 仪表盘
- 实时上下行流量监控与图表展示
- 当前节点状态与延迟显示
- 一键启动/停止代理内核
- 总流量统计

#### 🌍 节点管理
- 多分组节点展示（标签页/列表视图）
- 节点排序（默认/延迟/名称）
- 单节点延迟测试与批量测速
- 节点切换即时生效
- 紧凑/标准布局切换

#### 📂 订阅管理
- 远程订阅与本地配置支持
- 订阅自动更新（可配置间隔）
- 流量使用信息显示（已用/总量/过期时间）
- 订阅内容在线编辑
- 配置导入/导出

#### 🛡️ 策略规则系统
- **可视化规则编辑器** — 图形化界面配置路由规则
- **规则集支持** — 内置 geosite/geoip/acl 等规则集
- **规则模板** — 预置常用分流策略，一键导入
- **多规则类型** — domain、ip_cidr、port、process_name 等全支持
- **逻辑规则组合** — 支持 AND/OR 逻辑组合

#### 🌐 DNS 策略管理
- **独立 DNS 策略** — 为不同域名指定不同 DNS 服务器
- **域名规则匹配** — 支持域名关键词、后缀、正则匹配
- **泛域名支持** — 支持通配符域名规则（如 `*.example.com`）
- **规则集联动** — DNS 规则可引用 geosite/acl 规则集
- **DNS 拦截** — 一键拦截广告、追踪域名

#### 📡 DNS 服务器配置
- **多协议支持** — UDP、TCP、DoT、DoH、DoQ、HTTP/3
- **Hosts 重写** — 类似 Windows hosts 格式，支持泛解析（`*.example.com`）
- **FakeIP 模式** — 游戏/流媒体优化
- **预定义解析** — 自定义域名到 IP 的映射

#### 📦 规则集管理
- 远程规则集订阅更新
- 本地规则集创建与编辑
- 规则格式自动转换（binary/source）
- 规则预览与调试

#### 🔍 连接监控
- 实时连接列表（WebSocket）
- 连接详情（主机、协议、链路、规则）
- 单连接关闭 / 全部关闭
- 连接搜索过滤

#### 📋 日志查看
- 多级别日志（debug/info/warn/error）
- 日志实时刷新
- 日志暂停/清空
- 配置错误智能提示

#### ⚙️ 系统设置
- **基础设置** — 端口配置、局域网访问、日志级别
- **DNS 设置** — 自定义 DNS 服务器、DNS 规则
- **高级设置** — 
  - IPv6 开关
  - Hosts 覆盖
  - 规则覆写
  - 自定义 User-Agent
- **应用设置** — 
  - 开机自启
  - 启动时自动开启代理
- **配置管理** — 配置导出/导入

#### 🖥️ 系统集成
- **系统托盘** — 最小化到托盘，后台运行
- **托盘菜单** — 快速启停、节点切换
- **开机自启** — 支持 Windows/macOS 登录启动
- **管理员权限** — 支持 UAC 提升权限运行

### 🔒 安全透明
- **完全开源** — 代码公开，可审计
- **无广告** — 纯净体验
- **无数据收集** — 隐私优先

### 🌐 协议支持
基于 sing-box 内核，支持主流代理协议：
- **Shadowsocks** (SS)
- **VMess**
- **VLESS** (含 Reality)
- **Trojan**
- **Hysteria2**
- **TUIC**
- **AnyTLS** (sing-box 1.12.0+)
- HTTP/HTTPS
- SOCKS5

> 注：不支持 SSR 协议，建议迁移至以上协议

---

# 📸 截图预览

<p align="center">
  <img src="./assets/screenshot1.png" width="800">
</p>

---

# ⚡ 安装

前往 Releases 页面下载最新版本：

👉 https://github.com/roverlab/rover/releases

支持平台：

| 系统 | 格式 | 说明 |
|------|------|------|
| Windows | `.exe` | NSIS 安装包 |
| macOS | `.dmg` | Apple Silicon 原生支持 |

---

# 🚀 快速开始

### 1️⃣ 下载安装

从 Releases 下载对应平台的安装包，完成安装。

### 2️⃣ 导入配置

支持以下方式导入：
- **订阅 URL** — 粘贴订阅链接，一键导入
- **本地文件** — 导入 YAML/JSON 配置文件
- **手动配置** — 直接编辑配置内容

### 3️⃣ 选择节点

进入「节点」页面，选择或测速选择最优节点。

### 4️⃣ 开启代理

点击仪表盘开关，即刻开始科学上网！

---

# 📖 功能模块一览

| 模块 | 功能描述 |
|------|----------|
| 📊 **仪表盘** | 实时流量图表、内核启停、状态监控 |
| 🌍 **节点** | 分组管理、延迟测试、快速切换 |
| 📂 **订阅** | 订阅管理、自动更新、流量信息 |
| 🛡️ **策略** | 可视化规则编辑、规则模板、DNS 策略 |
| 📦 **规则集** | 远程/本地规则集管理 |
| 🛤️ **路由** | 查看当前生效的路由规则 |
| 🔍 **连接** | 实时连接监控、请求追踪 |
| 📋 **日志** | 内核日志查看与调试 |
| ⚙️ **设置** | 系统配置、DNS 配置、应用设置 |

---

# 🤝 贡献

欢迎参与贡献！你可以：

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
