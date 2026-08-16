LeadBridge KSO — macOS tools pack v8.2.10.0848

Что внутри:
- tools/leadbridge/ — локальная копия LeadBridge matcher.
- tools/max-chat-local-exporter/ — Chrome extension для экспорта MAX.
- tools/max-chat-ocr-postprocessor/ — OCR-процессор MAX ZIP/attachments.
- tools/ocr-bridge/ — локальный мост для кнопки «Запустить OCR» в расширении.
- integrations/google-apps-script-amocrm/ — шаблон защищённого онлайн CSV-снимка.
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
1. В расширении соберите чат и нажмите «Запустить OCR».
2. ZIP сохранится, OCR запустится автоматически, результат появится в ~/LeadBridgeKSO/ocr_results.
3. Ручной запасной запуск: ~/LeadBridgeKSO/launchers/run_ocr_macos.command.
4. Для LeadBridge используйте messages_ocr.json из результата.

MAX, OCR, матчинг и отчёты остаются локально. Онлайн amoCRM только скачивает read-only CSV-снимок с настроенного Apps Script.
