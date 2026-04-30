<div align="center">
  <img src="./public/icon.png" alt="Rover Logo" width="100">

  <h1>Rover</h1>
  <p><strong>クロスプラットフォーム sing-box GUIクライアント · 真のビジュアル設定体験</strong></p>

<p>
  <img src="https://img.shields.io/github/v/release/roverlab/rover?style=for-the-badge&logo=github" alt="Release">
  <img src="https://img.shields.io/github/downloads/roverlab/rover/total?style=for-the-badge&color=orange" alt="Downloads">
  <img src="https://img.shields.io/github/stars/roverlab/rover?style=for-the-badge" alt="Stars">
  <img src="https://img.shields.io/badge/Platform-Win%20%7C%20Mac%20%7C%20Linux-blue?style=for-the-badge&logo=electron" alt="Platform">

  <a href="./README.md">English</a> | <a href="./README_zh-CN.md">简体中文</a> | <a href="./README_zh-TW.md">繁體中文</a> | <a href="./README_ja.md">日本語</a> | <a href="./README_ko.md">한국어</a> | <a href="./README_ru.md">Русский</a> | <a href="./README_es.md">Español</a> | <a href="./README_fa.md">فارسی</a>
</p>

</div>

**Rover** はモダンな sing-box デスクトップクライアントです。面倒な手書き JSON 設定から解放され、真の**WYSIWYG（見たままが結果）**プロキシ体験を提供します。

## ✨ 主な機能

- 🎨 **完全ビジュアル化**：**ルーティングルール**と**カスタム DNS** をグラフィカルに編集。マルチプロトコルおよび広告ブロックに対応。
- 🛡️ **TUN モード**：TUN 仮想ネットワークインターフェースをネイティブサポート。ワンクリックでシステム全体のトラフィックを接管。
- 🔄 **Clash とのシームレスな互換性**：Clash / Mihomo のサブスクリプションとルールセットに完全対応。既存ユーザーは移行コストゼロ。
- 📦 **すぐに使える**：クラシックなルーティングテンプレート（国内ホワイトリスト / グローバルモードなど）を内蔵。複雑な設定不要。
- 📊 **リアルタイム監視**：アップロード/ダウンロード速度、ノードレイテンシ、アクティブな接続をリアルタイムで確認。

## 🌐 対応プロトコル
`Shadowsocks` / `VMess` / `VLESS (Reality)` / `Trojan` / `Hysteria2` / `TUIC` / `AnyTLS` / `HTTP/SOCKS5`

## 📸 スクリーンショット

<div align="center">
  <img src="./assets/screenshot11.png" alt="Rover メイン画面" width="800" style="border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
</div>

## ⚡ クイックスタート

1. **ダウンロード**：[Releases](https://github.com/roverlab/rover/releases) から Windows / macOS / Linux 版を取得。
2. **インポート**：「プロファイル」ページでサブスクリプションリンクを貼り付けるか、ローカルファイルをインポート。
3. **接続**：「ポリシー」ページで内蔵テンプレートを適用し、プロキシ（または TUN モード）を有効化して利用開始。

## 🛠️ 開発とビルド

```bash
npm install
npm run dev        # 開発モードを起動
npm run pack:win   # Windows 版をビルド
```

## 🤝 コントリビュート

コントリビュートを歓迎します！
- 🐛 バグを見つけた？[Issue](https://github.com/roverlab/rover/issues) を提出
- 💡 アイデアがある？[Discussion](https://github.com/roverlab/rover/discussions) を開始
- 🛠️ PR を提出する前に、コードスタイルが既存のアーキテクチャと一致することを確認してください。

**スペシャルサンクス**：[Sing-Box](https://github.com/SagerNet/sing-box) | [Electron](https://www.electronjs.org/) | [React](https://react.dev/) | [Tailwind CSS](https://tailwindcss.com/) | [Rspack](https://rspack.dev/)

---

<div align="center">
  <p><strong><a href="https://github.com/roverlab">RoverLab</a></strong> が ❤️ で構築</p>
  <p><em>このプロジェクトは学習・交流目的のみです。現地の法律法规を遵守してください。</em></p>
</div>
