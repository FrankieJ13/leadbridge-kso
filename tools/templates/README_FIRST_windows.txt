LeadBridge KSO — Windows tools pack v8.2.10.0848

Для обычного пользователя рекомендуется единый автономный файл:
LeadBridgeKSO-Setup-Windows-v8.2.10.0848.exe
Он сам ставит LeadBridge со встроенными Python, Pillow, Tesseract и OCR-моделями, создаёт ярлыки и запускает продукт. Системный Python не затрагивается.

Этот ZIP предназначен для ручной установки или разработки.

Что внутри:
- tools\leadbridge\ — локальная копия LeadBridge matcher.
- tools\max-chat-local-exporter\ — Chrome extension для экспорта MAX.
- tools\max-chat-ocr-postprocessor\ — OCR-процессор MAX ZIP/attachments.
- tools\ocr-bridge\ — локальный мост для кнопки «Запустить OCR» в расширении.
- integrations\google-apps-script-amocrm\ — шаблон защищённого онлайн CSV-снимка.
- archives\ — исходные ZIP-архивы компонентов.
- exports\ — сюда удобно класть ZIP экспортов MAX.
- ocr_results\ — сюда складываются результаты OCR.

Быстрый запуск:
1. Полностью распакуйте ZIP. Не запускайте установщик прямо из архива и не копируйте отдельно install_windows.ps1.
2. Откройте распакованную папку LeadBridgeKSO-Windows-v8.2.10.0848: рядом с install_windows.ps1 должны находиться папки tools, launchers, integrations и archives.
3. Запустите install_windows.ps1 через PowerShell.
   Если PowerShell блокирует файл, выполните:
   powershell -ExecutionPolicy Bypass -File .\install_windows.ps1
4. Инсталлятор создаст C:\LeadBridgeKSO и скопирует туда инструменты.
5. Откройте C:\LeadBridgeKSO\launchers\open_leadbridge.bat.

Python и OCR:
- установщик автоматически ставит Python 3.12 через winget, если Python отсутствует;
- затем устанавливает requirements.txt и проверяет Tesseract;
- если команда py не найдена при ручном запуске, выполните:
  winget install --id Python.Python.3.12 -e --scope user
  после установки закройте PowerShell и откройте заново.

Chrome extension:
1. Chrome -> chrome://extensions
2. Включить Developer mode.
3. Load unpacked.
4. Выбрать папку C:\LeadBridgeKSO\tools\max-chat-local-exporter

OCR:
1. В расширении соберите чат и нажмите «Запустить OCR».
2. ZIP сохранится, OCR запустится автоматически, результат появится в C:\LeadBridgeKSO\ocr_results.
3. Ручной запасной запуск: C:\LeadBridgeKSO\launchers\run_ocr_windows.bat.
4. Для LeadBridge используйте messages_ocr.json из результата.

MAX, OCR, матчинг и отчёты остаются локально. Онлайн amoCRM только скачивает read-only CSV-снимок с настроенного Apps Script.
