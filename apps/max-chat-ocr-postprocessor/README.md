# MAX Chat OCR Postprocessor v0.3.1

Локальный OCR-процессор для ZIP/папки экспорта MAX.

## Что делает

- читает `messages.json` и `attachments/` из экспорта MAX;
- распознаёт изображения через локальный Tesseract OCR (`rus+eng`);
- формирует человекочитаемые и машинные файлы:
  - `index_ocr.html`
  - `messages_ocr.txt`
  - `messages_ocr.json`
  - `forms_structured.json`
  - `forms_flat.csv`
  - `forms_md/`
  - `ocr_summary.csv`
  - `cases_summary.csv`

## Что изменилось в v0.3.1

Добавлена сквозная передача ссылок MAX:

- `message_url`
- `message_url_source`
- `max_chat_url`
- `local_export_anchor`

Если Chrome-расширение v0.4.0 смогло вытащить permalink конкретного сообщения MAX, ссылка попадёт в `messages_ocr.json`, `forms_structured.json`, `forms_flat.csv`, `messages_ocr.txt`, `index_ocr.html` и в MD-файлы анкет.

Это важно для LeadBridge: в отчёте можно быстро открыть исходное сообщение MAX.

## Установка

```powershell
py -m pip install -r requirements.txt
```

Tesseract должен быть установлен отдельно. Для русского OCR в `tesseract --list-langs` должен быть `rus`.

## Запуск

```powershell
py max_chat_ocr.py "C:\MAX_EXPORTS\MAX_CHAT_EXPORT.zip"
```

Или по распакованной папке:

```powershell
py max_chat_ocr.py "C:\MAX_EXPORTS\MAX_CHAT_EXPORT"
```

## Главный файл для LeadBridge

Для LeadBridge используй:

```text
messages_ocr.json
```

В нём есть и OCR-анкеты, и обычные текстовые сообщения MAX. Это важно для поиска телефонов по всей выгрузке.

`forms_structured.json` и `forms_flat.csv` остаются полезными для проверки только OCR-анкет, но для полного матчинга LeadBridge нужен `messages_ocr.json`.
