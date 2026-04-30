<div align="center">
  <img src="./public/icon.png" alt="Rover Logo" width="100">

  <h1>Rover</h1>
  <p><strong>Кроссплатформенный GUI-клиент для sing-box · Настоящий визуальный опыт настройки</strong></p>

<p>
  <img src="https://img.shields.io/github/v/release/roverlab/rover?style=for-the-badge&logo=github" alt="Release">
  <img src="https://img.shields.io/github/downloads/roverlab/rover/total?style=for-the-badge&color=orange" alt="Downloads">
  <img src="https://img.shields.io/github/stars/roverlab/rover?style=for-the-badge" alt="Stars">
  <img src="https://img.shields.io/badge/Platform-Win%20%7C%20Mac%20%7C%20Linux-blue?style=for-the-badge&logo=electron" alt="Platform">

  <a href="./README.md">English</a> | <a href="./README_zh-CN.md">简体中文</a> | <a href="./README_zh-TW.md">繁體中文</a> | <a href="./README_ja.md">日本語</a> | <a href="./README_ko.md">한국어</a> | <a href="./README_ru.md">Русский</a> | <a href="./README_es.md">Español</a> | <a href="./README_fa.md">فارسی</a>
</p>

</div>

**Rover** — это современный десктопный клиент для sing-box, избавляющий от утомительного ручного написания JSON-конфигураций и предоставляющий настоящий **WYSIWYG** прокси-опыт.

## ✨ Ключевые особенности

- 🎨 **Полная визуализация**: Графическое редактирование **правил маршрутизации** и **пользовательского DNS** с поддержкой множества протоколов и блокировки рекламы.
- 🛡️ **TUN-режим**: Нативная поддержка виртуальных сетевых интерфейсов TUN для одномоментного перехвата всего системного трафика.
- 🔄 **Бесшовная совместимость с Clash**: Полная совместимость с подписками и наборами правил Clash / Mihomo — нулевая стоимость миграции для существующих пользователей.
- 📦 **Готов к использованию**: Встроенные классические шаблоны маршрутизации (например, внутренний белый список / глобальный режим), устраняющие сложную настройку.
- 📊 **Мониторинг в реальном времени**: Просмотр скоростей загрузки/выгрузки, задержки узлов и активных соединений в реальном времени.

## 🌐 Поддерживаемые протоколы
`Shadowsocks` / `VMess` / `VLESS (Reality)` / `Trojan` / `Hysteria2` / `TUIC` / `AnyTLS` / `HTTP/SOCKS5`

## 📸 Скриншоты

<div align="center">
  <img src="./assets/screenshot11.png" alt="Главный интерфейс Rover" width="800" style="border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
</div>

## ⚡ Быстрый старт

1. **Скачайте**: Перейдите в [Releases](https://github.com/roverlab/rover/releases), чтобы получить версии для Windows / macOS / Linux.
2. **Импортируйте**: Вставьте ссылку на подписку или импортируйте локальный файл на странице «Профили».
3. **Подключитесь**: Примените встроенный шаблон на странице «Политики», затем включите прокси (или TUN-режим) для начала работы.

## 🛠️ Разработка и сборка

```bash
npm install
npm run dev        # Запуск в режиме разработки
npm run pack:win   # Сборка версии для Windows
```

## 🤝 Участие в разработке

Мы рады вашему участию!
- 🐛 Нашли баг? Создайте [Issue](https://github.com/roverlab/rover/issues)
- 💡 Есть идеи? Начните [Discussion](https://github.com/roverlab/rover/discussions)
- 🛠️ Перед отправкой PR убедитесь, что стиль кода соответствует существующей архитектуре.

**Особая благодарность**: [Sing-Box](https://github.com/SagerNet/sing-box) | [Electron](https://www.electronjs.org/) | [React](https://react.dev/) | [Tailwind CSS](https://tailwindcss.com/) | [Rspack](https://rspack.dev/)

---

<div align="center">
  <p>Создано с ❤️ командой <strong><a href="https://github.com/roverlab">RoverLab</a></strong></p>
  <p><em>Этот проект предназначен только для обучения и обмена информацией. Пожалуйста, соблюдайте местные законы и правила.</em></p>
</div>
