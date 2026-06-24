LeadBridge KSO — macOS tools pack v6.4.24.1144

Что внутри:
- tools/leadbridge/ — локальная копия LeadBridge matcher.
- tools/max-chat-local-exporter/ — Chrome extension для экспорта MAX.
- tools/max-chat-ocr-postprocessor/ — OCR-процессор MAX ZIP/attachments.
- archives/ — исходные ZIP-архивы компонентов.
- exports/ — сюда удобно класть ZIP экспортов MAX.
- ocr_results/ — сюда складываются результаты OCR.

Быстрый запуск:
1. Распакуйте этот ZIP.
2. Дважды кликните install_macos.command.
   Если macOS блокирует файл, выполните в Terminal:
   chmod +x install_macos.command
   ./install_macos.command
3. Инсталлятор создаст ~/LeadBridgeKSO и скопирует туда инструменты.
4. Откройте ~/LeadBridgeKSO/launchers/open_leadbridge.command.

Chrome extension:
1. Chrome -> chrome://extensions
2. Включить Developer mode.
3. Load unpacked.
4. Выбрать папку ~/LeadBridgeKSO/tools/max-chat-local-exporter

OCR:
1. Положите ZIP MAX в ~/LeadBridgeKSO/exports
2. Запустите ~/LeadBridgeKSO/launchers/run_ocr_macos.command
3. Для LeadBridge используйте messages_ocr.json из результата.

Данные MAX/amoCRM остаются локально на компьютере.
