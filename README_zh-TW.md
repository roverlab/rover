<div align="center">
  <img src="./public/icon.png" alt="Rover Logo" width="100">

  <h1>Rover</h1>
  <p><strong>跨平台 sing-box 圖形用戶端 · 真正的視覺化設定體驗</strong></p>

<p>
  <img src="https://img.shields.io/github/v/release/roverlab/rover?style=for-the-badge&logo=github" alt="Release">
  <img src="https://img.shields.io/github/downloads/roverlab/rover/total?style=for-the-badge&color=orange" alt="Downloads">
  <img src="https://img.shields.io/github/stars/roverlab/rover?style=for-the-badge" alt="Stars">
  <img src="https://img.shields.io/badge/Platform-Win%20%7C%20Mac%20%7C%20Linux-blue?style=for-the-badge&logo=electron" alt="Platform">

  <a href="./README.md">English</a> | <a href="./README_zh-CN.md">简体中文</a> | <a href="./README_zh-TW.md">繁體中文</a> | <a href="./README_ja.md">日本語</a> | <a href="./README_ko.md">한국어</a> | <a href="./README_ru.md">Русский</a> | <a href="./README_es.md">Español</a> | <a href="./README_fa.md">فارسی</a>
</p>

</div>

**Rover** 是一款現代化的 sing-box 桌面用戶端，告別繁瑣的手寫 JSON 設定，為您提供**所見即所得**的代理體驗。

## ✨ 核心特性

- 🎨 **完全視覺化**：圖形化編輯**路由規則**與**自訂 DNS**，支援多協定及廣告攔截。
- 🛡️ **TUN 模式**：原生支援 TUN 虛擬網卡，一鍵接管系統級全域流量。
- 🔄 **無縫接軌 Clash**：完美相容 Clash / Mihomo 訂閱與規則集，老用戶零成本無縫遷移。
- 📦 **開箱即用**：內建多套經典分流模板（如國內白名單/全域），免去繁瑣設定。
- 📊 **狀態監控**：即時查看上下行速率、節點延遲及活動連線。

## 🌐 協定支援
`Shadowsocks` / `VMess` / `VLESS (Reality)` / `Trojan` / `Hysteria2` / `TUIC` / `AnyTLS` / `HTTP/SOCKS5`

## 📸 截圖預覽

<div align="center">
  <img src="./assets/screenshot11.png" alt="Rover 主介面" width="800" style="border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
</div>

## ⚡ 快速開始

1. **下載**：前往 [Releases](https://github.com/roverlab/rover/releases) 取得 Windows / macOS / Linux 版本。
2. **匯入**：在「設定在「設定檔」頁貼上訂閱連結或匯入本機檔案。
3. **連線**：在「策略」頁套用內建模板，開啟代理（或 TUN 模式）即可暢遊網路。

## 🛠️ 開發與建置

```bash
npm install
npm run dev        # 啟動開發
npm run pack:win   # 建置 Windows 版本
```

## 🤝 參與貢獻

我們非常歡迎您的參與！
- 🐛 發現 Bug？提交 [Issue](https://github.com/roverlab/rover/issues)
- 💡 有好點子？發起 [Discussion](https://github.com/roverlab/rover/discussions)
- 🛠️ 提交 PR 前，請確保程式碼風格與現有架構保持一致。

**特別鳴謝**：[Sing-Box](https://github.com/SagerNet/sing-box) | [Electron](https://www.electronjs.org/) | [React](https://react.dev/) | [Tailwind CSS](https://tailwindcss.com/) | [Rspack](https://rspack.dev/)

---

<div align="center">
  <p>由 <strong><a href="https://github.com/roverlab">RoverLab</a></strong> 用 ❤️ 建構</p>
  <p><em>本專案僅供學習交流使用，請務必遵守當地法律法規。</em></p>
</div>
