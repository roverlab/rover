<div align="center">
  <img src="./public/icon.png" alt="Rover Logo" width="100">

  <h1>Rover</h1>
  <p><strong>크로스 플랫폼 sing-box GUI 클라이언트 · 진정한 비주얼 설정 경험</strong></p>

<p>
  <img src="https://img.shields.io/github/v/release/roverlab/rover?style=for-the-badge&logo=github" alt="Release">
  <img src="https://img.shields.io/github/downloads/roverlab/rover/total?style=for-the-badge&color=orange" alt="Downloads">
  <img src="https://img.shields.io/github/stars/roverlab/rover?style=for-the-badge" alt="Stars">
  <img src="https://img.shields.io/badge/Platform-Win%20%7C%20Mac%20%7C%20Linux-blue?style=for-the-badge&logo=electron" alt="Platform">

  <a href="./README.md">English</a> | <a href="./README_zh-CN.md">简体中文</a> | <a href="./README_zh-TW.md">繁體中文</a> | <a href="./README_ja.md">日本語</a> | <a href="./README_ko.md">한국어</a> | <a href="./README_ru.md">Русский</a> | <a href="./README_es.md">Español</a> | <a href="./README_fa.md">فارسی</a>
</p>

</div>

**Rover**는 모던한 sing-box 데스크톱 클라이언트입니다. 번거로운 수동 JSON 작성에서 벗어나, 진정한 **위지위그(WYSIWYG)** 프록시 경험을 제공합니다.

## ✨ 주요 기능

- 🎨 **완전 비주얼화**: **라우팅 규칙**과 **커스텀 DNS**를 그래픽으로 편집. 다중 프로토콜 및 광고 차단 지원.
- 🛡️ **TUN 모드**: TUN 가상 네트워크 인터페이스를 네이티브 지원. 원클릭으로 시스템 전체 트래픽을 제어.
- 🔄 **Clash와 원활한 호환**: Clash / Mihomo 구독 및 규칙 세트와 완벽 호환. 기존 사용자는 마이그레이션 비용 제로.
- 📦 **즉시 사용 가능**: 클래식 라우팅 템플릿(국내 화이트리스트 / 글로벌 모드 등) 내장. 복잡한 설정 불필요.
- 📊 **실시간 모니터링**: 업로드/다운로드 속도, 노드 레이턴시, 활성 연결을 실시간으로 확인.

## 🌐 지원 프로토콜
`Shadowsocks` / `VMess` / `VLESS (Reality)` / `Trojan` / `Hysteria2` / `TUIC` / `AnyTLS` / `HTTP/SOCKS5`

## 📸 스크린샷

<div align="center">
  <img src="./assets/screenshot11.png" alt="Rover 메인 인터페이스" width="800" style="border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
</div>

## ⚡ 빠른 시작

1. **다운로드**: [Releases](https://github.com/roverlab/rover/releases)에서 Windows / macOS / Linux 버전을 다운로드.
2. **가져오기**: "프로필" 페이지에서 구독 링크를 붙여넣거나 로컬 파일을 가져오기.
3. **연결**: "정책" 페이지에서 내장 템플릿을 적용한 후, 프록시(또는 TUN 모드)를 활성화하여 사용 시작.

## 🛠️ 개발 및 빌드

```bash
npm install
npm run dev        # 개발 모드 시작
npm run pack:win   # Windows 버전 빌드
```

## 🤝 기여하기

여러분의 기여를 환영합니다!
- 🐛 버그를 발견하셨나요? [Issue](https://github.com/roverlab/rover/issues)를 제출해 주세요
- 💡 아이디어가 있으신가요? [Discussion](https://github.com/roverlab/rover/discussions)을 시작해 주세요
- 🛠️ PR을 제출하기 전에 코드 스타일이 기존 아키텍처와 일치하는지 확인해 주세요.

**특별히 감사합니다**: [Sing-Box](https://github.com/SagerNet/sing-box) | [Electron](https://www.electronjs.org/) | [React](https://react.dev/) | [Tailwind CSS](https://tailwindcss.com/) | [Rspack](https://rspack.dev/)

---

<div align="center">
  <p><strong><a href="https://github.com/roverlab">RoverLab</a></strong>이 ❤️로 제작</p>
  <p><em>이 프로젝트는 학습 및 교류 목적으로만 사용됩니다. 현지 법률과 규정을 준수해 주세요.</em></p>
</div>
