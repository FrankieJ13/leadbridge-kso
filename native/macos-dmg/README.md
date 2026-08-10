# LeadBridge KSO: сборка macOS DMG

Этот пакет собирает нативное приложение LeadBridge KSO для macOS на AppKit и WKWebView.

По умолчанию приложение открывает опубликованную версию GitHub Pages:

```text
https://frankiej13.github.io/leadbridge-kso/
```

Если GitHub Pages недоступен, приложение загружает вложенную офлайн-копию `Web/index.html`. MAX, amoCRM и изображения выбираются пользователем и обрабатываются локально в WKWebView.

Готовая сборка Universal 2 поддерживает Apple Silicon и Intel, минимальная версия системы — macOS 12.

## Требования

- macOS с Xcode Command Line Tools
- `swiftc`
- `hdiutil`

Если инструменты не установлены:

```bash
xcode-select --install
```

## Сборка

Запустите из этой папки:

```bash
chmod +x build_dmg.sh
./build_dmg.sh
```

Результат:

```text
build/LeadBridge KSO.app
dist/LeadBridgeKSO-macOS-DMG-v8.2.10.0848.dmg
```

## Подпись и распространение

Скрипт создаёт локальную ad-hoc подпись, чтобы проверить целостность приложения. Сертификат Apple Developer ID и notarization в неё не входят. На другом Mac при первом запуске может потребоваться открыть приложение через контекстное меню Finder → «Открыть».

Для публичного распространения без предупреждений Gatekeeper подпишите приложение сертификатом Developer ID Application и выполните notarization до создания итогового DMG.

## Настройка

Адрес GitHub Pages задаётся в файле:

```text
Sources/LeadBridgeKSOApp.swift
```

Пакет сборки содержит резервную папку `Web/`. При сборке непосредственно из репозитория `build_dmg.sh` подготавливает её из основной папки `apps/leadbridge-web/`.
