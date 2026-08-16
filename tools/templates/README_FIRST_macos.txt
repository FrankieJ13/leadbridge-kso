LeadBridge KSO — macOS tools pack v8.2.10.0848 (необязательный)

ВАЖНО: для обычной работы OCR этот пакет устанавливать не нужно.
MAX Chat Exporter уже распознаёт выбранный ZIP прямо в Chrome и скачивает messages_ocr.json.
Python, Homebrew, Tesseract и install_macos.command для этого не требуются.

Что внутри:
- tools/leadbridge/ — локальная копия LeadBridge matcher.
- tools/max-chat-local-exporter/ — Chrome extension для экспорта MAX.
- tools/max-chat-ocr-postprocessor/ — OCR-процессор MAX ZIP/attachments.
- tools/ocr-bridge/ — локальный мост для кнопки «Запустить OCR» в расширении.
- integrations/google-apps-script-amocrm/ — шаблон защищённого онлайн CSV-снимка.
- archives/ — исходные ZIP-архивы компонентов.
- exports/ — сюда удобно класть ZIP экспортов MAX.
- ocr_results/ — сюда складываются результаты OCR.

Ручная установка дополнительных инструментов:
1. Распакуйте этот ZIP.
2. Дважды кликните install_macos.command.
   Если macOS блокирует файл: один раз попробуйте его открыть, затем откройте
   «Системные настройки» -> «Конфиденциальность и безопасность» и нажмите
   «Всё равно открыть» напротив сообщения об install_macos.command.
3. Инсталлятор создаст ~/LeadBridgeKSO и скопирует туда инструменты.
4. Откройте ~/LeadBridgeKSO/launchers/open_leadbridge.command.

Chrome extension:
1. Chrome -> chrome://extensions
2. Включить Developer mode.
3. Load unpacked.
4. Выбрать папку ~/LeadBridgeKSO/tools/max-chat-local-exporter

OCR:
1. В расширении соберите чат и нажмите «Запустить OCR».
2. Расширение обработает ZIP прямо в Chrome и скачает messages_ocr.json.
3. Установка этого tools pack для двух предыдущих шагов не нужна.
4. Ручной запасной запуск Python: ~/LeadBridgeKSO/launchers/run_ocr_macos.command.

MAX, OCR, матчинг и отчёты остаются локально. Онлайн amoCRM только скачивает read-only CSV-снимок с настроенного Apps Script.
