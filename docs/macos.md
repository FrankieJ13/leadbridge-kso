# LeadBridge KSO на macOS

## Обычный сценарий без установки

Для OCR не нужны `install_macos.command`, Homebrew, Python, системный Tesseract и локальная служба.

1. Установите MAX Chat Local Exporter в Chrome.
2. В чате MAX нажмите «Весь чат».
3. Нажмите «Запустить OCR» или выберите ранее скачанный ZIP кнопкой «Выбрать ZIP для OCR».
4. Дождитесь скачивания `messages_ocr.json` и выберите его в LeadBridge.

Всё распознавание выполняется внутри Chrome. ZIP, изображения и распознанный текст не отправляются на сервер.

## Расширение Chrome

1. Распакуйте `max-chat-local-exporter-v8.2.10.0848.zip`.
2. Откройте `chrome://extensions`.
3. Включите режим разработчика.
4. Нажмите «Загрузить распакованное расширение» и выберите распакованную папку.

## Необязательный tools pack

`leadbridge-kso-tools-macos-v8.2.10.0848.zip` оставлен для разработки, ручного запуска старого Python-процессора и нативного ускорения. Для работы кнопок OCR в актуальном расширении он не нужен.

Если вы сознательно используете этот дополнительный пакет и macOS блокирует `install_macos.command`:

1. Попробуйте открыть файл один раз.
2. Откройте «Системные настройки» → «Конфиденциальность и безопасность».
3. Внизу окна найдите сообщение о заблокированном `install_macos.command` и нажмите «Всё равно открыть».
4. Подтвердите запуск паролем или Touch ID.

После ручной установки пакет создаёт:

The installer creates:

```text
~/LeadBridgeKSO/
  exports/
  ocr_results/
  tools/
    leadbridge/
    max-chat-local-exporter/
    max-chat-ocr-postprocessor/
    ocr-bridge/
  integrations/
    google-apps-script-amocrm/
  archives/
  launchers/
    open_leadbridge.command
    run_ocr_macos.command
```

Старый launcher `~/LeadBridgeKSO/launchers/run_ocr_macos.command` остаётся только запасным профессиональным режимом.
