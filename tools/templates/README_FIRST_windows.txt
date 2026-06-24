LeadBridge KSO — Windows tools pack v6.4.24.1144

Что внутри:
- tools\leadbridge\ — локальная копия LeadBridge matcher.
- tools\max-chat-local-exporter\ — Chrome extension для экспорта MAX.
- tools\max-chat-ocr-postprocessor\ — OCR-процессор MAX ZIP/attachments.
- archives\ — исходные ZIP-архивы компонентов.
- exports\ — сюда удобно класть ZIP экспортов MAX.
- ocr_results\ — сюда складываются результаты OCR.

Быстрый запуск:
1. Распакуйте этот ZIP.
2. Запустите install_windows.ps1 через PowerShell.
   Если PowerShell блокирует файл, выполните:
   powershell -ExecutionPolicy Bypass -File .\install_windows.ps1
3. Инсталлятор создаст C:\LeadBridgeKSO и скопирует туда инструменты.
4. Откройте C:\LeadBridgeKSO\launchers\open_leadbridge.bat.

Chrome extension:
1. Chrome -> chrome://extensions
2. Включить Developer mode.
3. Load unpacked.
4. Выбрать папку C:\LeadBridgeKSO\tools\max-chat-local-exporter

OCR:
1. Положите ZIP MAX в C:\LeadBridgeKSO\exports
2. Запустите C:\LeadBridgeKSO\launchers\run_ocr_windows.bat
3. Для LeadBridge используйте messages_ocr.json из результата.

Данные MAX/amoCRM остаются локально на компьютере.
