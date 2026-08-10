# Установка в Windows

## Один файл — рекомендуемый способ

Скачайте `LeadBridgeKSO-Setup-Windows-v8.2.10.0848.exe`, откройте двойным кликом и подтвердите стандартный запрос Windows на права администратора. Установщик работает автономно и сам:

- устанавливает LeadBridge в `C:\LeadBridgeKSO`;
- устанавливает Python 3.12, Pillow, Tesseract и модели `rus+eng`;
- создаёт ярлыки LeadBridge и OCR на рабочем столе;
- сразу открывает LeadBridge после завершения.

Команды PowerShell, `winget` и ручная установка зависимостей не требуются. Windows-службы не создаются, потому что вся обработка запускается локально только по команде пользователя.

## Установка tools pack

ZIP ниже остаётся запасным вариантом для ручной установки и разработки.

1. Скачайте `leadbridge-kso-tools-windows-v8.2.10.0848.zip` и полностью распакуйте его.
2. Откройте распакованную папку: рядом с `install_windows.ps1` должны находиться `tools`, `launchers`, `integrations` и `archives`.
3. Запустите `install_windows.ps1` через PowerShell.

Если запуск сценариев заблокирован:

```powershell
powershell -ExecutionPolicy Bypass -File .\install_windows.ps1
```

Установщик создаёт:

```text
C:\LeadBridgeKSO\
  exports\
  ocr_results\
  tools\
    leadbridge\
    max-chat-local-exporter\
    max-chat-ocr-postprocessor\
  integrations\
    google-apps-script-amocrm\
  archives\
  launchers\
    open_leadbridge.bat
    run_ocr_windows.bat
```

Установщик проверяет Python 3.10+, при необходимости устанавливает Python 3.12 через `winget`, ставит зависимости OCR и проверяет Tesseract.

## Расширение Chrome

1. Откройте `chrome://extensions`.
2. Включите режим разработчика.
3. Нажмите «Загрузить распакованное расширение».
4. Выберите `C:\LeadBridgeKSO\tools\max-chat-local-exporter`.

## OCR

Если команда `py` не найдена при ручном запуске OCR, выполните:

```powershell
winget install --id Python.Python.3.12 -e --scope user
```

Закройте PowerShell, откройте заново и проверьте `py --version`. Для Tesseract:

```powershell
winget install --id UB-Mannheim.TesseractOCR -e
```

Запускайте OCR через готовый launcher:

```text
C:\LeadBridgeKSO\launchers\run_ocr_windows.bat
```

Launcher сам проверяет Python, Pillow и Tesseract. Готовый `messages_ocr.json` находится в `C:\LeadBridgeKSO\ocr_results`.
