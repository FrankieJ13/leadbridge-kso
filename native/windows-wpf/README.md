# LeadBridge KSO: сборка Windows WPF

Этот пакет собирает нативную оболочку LeadBridge KSO для Windows 10/11 на WPF и Microsoft Edge WebView2.

По умолчанию приложение открывает опубликованную версию GitHub Pages:

```text
https://frankiej13.github.io/leadbridge-kso/
```

Если GitHub Pages недоступен, приложение загружает вложенную офлайн-копию `Web/index.html`. Файлы MAX, amoCRM и изображений выбираются пользователем и обрабатываются локально в WebView2.

## Требования

- Windows 10/11
- .NET SDK 8 или новее
- Microsoft Edge WebView2 Runtime, обычно уже установлен вместе с Edge

## Сборка

Откройте PowerShell в этой папке и выполните:

```powershell
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

Если появляется ошибка, что команда `dotnet` не найдена, запустите автоматическую установку .NET SDK 8:

```powershell
powershell -ExecutionPolicy Bypass -File .\build.ps1 -InstallDependencies
```

После установки может потребоваться заново открыть PowerShell и повторить обычную команду сборки.

Результат:

```text
dist\LeadBridgeKSO-Windows-WPF-v8.2.10.0848\
dist\LeadBridgeKSO-Windows-WPF-v8.2.10.0848.zip
```

## Настройка

Адрес GitHub Pages задаётся в файле:

```text
LeadBridgeKSO.Windows\AppSettings.cs
```

Пакет сборки уже содержит резервную Web-копию в `LeadBridgeKSO.Windows\Web\`. При сборке из полного репозитория `build.ps1` также умеет подготовить её из основной папки `apps/leadbridge-web/`.
