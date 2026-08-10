# Снимок amoCRM через Google Apps Script

[Русская версия](#русская-версия) | [English version](#english-version)

## Русская версия

Эта интеграция открывает один лист приватной Google Таблицы как доступный только для чтения CSV-снимок для LeadBridge. LeadBridge отправляет отдельный токен доступа в теле POST-запроса, получает CSV и выполняет сопоставление локально на устройстве. Этот токен не является токеном Google OAuth.

### Настройка

1. Импортируй CSV из amoCRM в приватную Google Таблицу. Сохрани исходную строку заголовков. Формат из 143 колонок поддерживается по названиям, включая `-`, `Ответственный`, `Дата создания`, `Дата визита`, `Город`, `ФИО` и `Телефон`.
2. В этой таблице открой `Расширения -> Apps Script` (`Extensions -> Apps Script`).
3. Замени содержимое редактора кодом из файла `Code.gs` в этой папке и сохрани проект.
4. Вернись в таблицу и открой лист с базой amoCRM. В Apps Script выбери функцию `setupLeadBridgeSnapshot` и запусти её один раз. Разреши скрипту доступ к этой таблице.
5. Скопируй токен из появившегося окна. Он показывается только при создании и не хранится в открытом виде.
6. В Apps Script выбери `Развернуть -> Новое развертывание -> Веб-приложение` (`Deploy -> New deployment -> Web app`).
7. Укажи выполнение от имени владельца и доступ для всех, у кого есть ссылка. Данные дополнительно защищены отдельным токеном LeadBridge.
8. Скопируй адрес развертывания, который заканчивается на `/exec`.
9. В LeadBridge переключи источник amoCRM на `Онлайн /exec`, вставь адрес и токен, затем нажми `Загрузить слепок`.

Чтобы выбрать другой активный лист или сменить токен, снова запусти `setupLeadBridgeSnapshot`. Старый токен сразу перестанет работать. После изменения кода Apps Script создай новую версию развертывания.

### Что происходит с данными

- Google Apps Script только читает выбранный лист и формирует CSV. Запись или изменение таблицы не выполняются.
- Токен передаётся в теле POST-запроса и не добавляется в URL.
- В свойствах скрипта хранится только SHA-256 токена, ID таблицы и название листа.
- LeadBridge получает CSV-снимок и разбирает его локально. GitHub не получает содержимое amoCRM.
- При поддержке браузером CSV-снимок можно сразу сохранить на устройство. Иначе нормализованные строки хранятся только в текущем сеансе LeadBridge.

### Безопасность и ограничения

- Не отправляй кому-либо одновременно адрес `/exec` и токен. Имея оба значения, можно скачать CSV-снимок.
- Не используй `ScriptApp.getOAuthToken()` и не вставляй токен LeadBridge в URL.
- При подозрении на утечку снова запусти `setupLeadBridgeSnapshot`, чтобы сменить токен.
- Ограничь список редакторов Google Таблицы и проекта Apps Script.
- Google Apps Script сначала формирует CSV целиком. Очень большие таблицы ограничены временем выполнения, памятью и размером ответа Apps Script, хотя LeadBridge принимает ответ потоком.
- Content Service перенаправляет готовый ответ на `script.googleusercontent.com`; LeadBridge разрешает только этот документированный адрес перенаправления.

## English version

This integration exposes one read-only Google Sheet tab as a CSV snapshot for LeadBridge. LeadBridge sends a custom access token in a POST body, downloads the response and performs matching locally. The token is not a Google OAuth token.

### Setup

1. Import the amoCRM CSV into a private Google Sheet. Keep the original header row. The supplied 143-column format is supported by header names, including `-`, `Ответственный`, `Дата создания`, `Дата визита`, `Город`, `ФИО` and `Телефон`.
2. Open `Extensions -> Apps Script` from that spreadsheet.
3. Replace the editor content with `Code.gs` from this directory and save.
4. Return to the spreadsheet, select the amoCRM tab and run `setupLeadBridgeSnapshot` once from Apps Script. Grant the script access to this spreadsheet. Copy the token shown in the spreadsheet dialog.
5. Choose `Deploy -> New deployment -> Web app`. Execute as the owner and allow access to anyone who has the URL. The application-level token remains the data gate.
6. Copy the deployed URL ending in `/exec` into LeadBridge, switch amoCRM to `Онлайн /exec`, enter the token and load the snapshot.

Run `setupLeadBridgeSnapshot` again to select the currently active tab and rotate the token. Existing tokens stop working immediately. Create a new deployment version after changing the Apps Script code.

### Security and limits

- The endpoint accepts only POST action `leadbridge_amocrm_snapshot` and never writes to the sheet.
- The bound script requests access only to its current spreadsheet.
- Script Properties store only the token SHA-256, spreadsheet ID and sheet name.
- Do not use `ScriptApp.getOAuthToken()` and do not put the LeadBridge token in a URL.
- Google Apps Script Content Service redirects successful output to `script.googleusercontent.com`; LeadBridge permits only that documented redirect host.
- Apps Script creates the CSV before returning it. Very large sheets remain subject to Google Apps Script execution, memory and response limits. LeadBridge itself consumes the response as a stream.
- Anyone with both the `/exec` URL and token can download the snapshot. Rotate the token after suspected disclosure and limit editors of the Apps Script project.
