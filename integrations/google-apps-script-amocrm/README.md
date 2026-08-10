# Снимок amoCRM через Google Apps Script

[Русская версия](#русская-версия) | [English version](#english-version)

## Русская версия

Эта интеграция открывает один лист приватной Google Таблицы как доступный только для чтения CSV-снимок для LeadBridge. LeadBridge отправляет отдельный токен доступа в теле POST-запроса, получает CSV и выполняет сопоставление локально на устройстве. Этот токен не является токеном Google OAuth.

### Настройка

1. Импортируй CSV из amoCRM в приватную Google Таблицу. Сохрани исходную строку заголовков. Формат из 143 колонок поддерживается по названиям, включая `-`, `Ответственный`, `Дата создания`, `Дата визита`, `Город`, `ФИО` и `Телефон`.
2. В этой таблице открой `Расширения -> Apps Script` (`Extensions -> Apps Script`).
3. Замени содержимое редактора кодом из файла `Code.gs` в этой папке и сохрани проект.
4. Вернись в таблицу и открой лист с базой amoCRM. В Apps Script выбери функцию `setupLeadBridgeSnapshot` и запусти её один раз. Разреши скрипту доступ к Google Таблицам.
5. Скопируй токен из появившегося окна. Он показывается только при создании и не хранится в открытом виде.
6. Выбери функцию `testLeadBridgeSnapshot` и запусти её. Подтверди разрешения владельца, если Google запросит их. Должно появиться окно с названием листа и количеством строк и столбцов.
7. В Apps Script выбери `Развернуть -> Новое развертывание -> Веб-приложение` (`Deploy -> New deployment -> Web app`).
8. Укажи выполнение от имени владельца и доступ для всех, у кого есть ссылка. Данные дополнительно защищены отдельным токеном LeadBridge.
9. Скопируй адрес развертывания, который заканчивается на `/exec`.
10. В LeadBridge переключи источник amoCRM на `Онлайн /exec`, вставь адрес и токен, затем нажми `Загрузить слепок`.

Чтобы выбрать другой активный лист или сменить токен, снова запусти `setupLeadBridgeSnapshot`. Старый токен сразу перестанет работать.

После изменения кода недостаточно нажать «Сохранить». Сначала запусти `testLeadBridgeSnapshot` и подтверди новое разрешение, затем открой `Развернуть -> Управление развертываниями`, нажми значок редактирования, выбери `Новая версия` и нажми `Развернуть`. Адрес `/exec` при этом останется прежним. Если обновляется только код в существующем проекте, прежний токен продолжит работать.

Шаблон не использует `@OnlyCurrentDoc`: опубликованный `doPost` работает вне интерфейса открытой таблицы и открывает сохранённую таблицу по ID. Для этого владельцу нужно один раз разрешить Apps Script доступ к Google Таблицам. Сама конечная точка по-прежнему читает только сохранённый лист и ничего не записывает.

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
4. Return to the spreadsheet, select the amoCRM tab and run `setupLeadBridgeSnapshot` once from Apps Script. Grant the script access to Google Sheets. Copy the token shown in the spreadsheet dialog.
5. Run `testLeadBridgeSnapshot`, approve the owner's permissions if prompted, and verify that the dialog reports the configured tab dimensions.
6. Choose `Deploy -> New deployment -> Web app`. Execute as the owner and allow access to anyone who has the URL. The application-level token remains the data gate.
7. Copy the deployed URL ending in `/exec` into LeadBridge, switch amoCRM to `Онлайн /exec`, enter the token and load the snapshot.

Run `setupLeadBridgeSnapshot` again to select the currently active tab and rotate the token. Existing tokens stop working immediately. After changing the code, use `Deploy -> Manage deployments`, edit the web app, select `New version`, and deploy. Saving the code alone does not update `/exec`; its URL remains unchanged. Run `testLeadBridgeSnapshot` again after updating. The existing token remains valid unless setup is run again.

### Security and limits

- The endpoint accepts only POST action `leadbridge_amocrm_snapshot` and never writes to the sheet.
- The deployed `doPost` opens the configured spreadsheet by ID, so the owner must grant the Apps Script project Google Sheets access. The endpoint still reads only the saved tab and never writes to it.
- Script Properties store only the token SHA-256, spreadsheet ID and sheet name.
- Do not use `ScriptApp.getOAuthToken()` and do not put the LeadBridge token in a URL.
- Google Apps Script Content Service redirects successful output to `script.googleusercontent.com`; LeadBridge permits only that documented redirect host.
- Apps Script creates the CSV before returning it. Very large sheets remain subject to Google Apps Script execution, memory and response limits. LeadBridge itself consumes the response as a stream.
- Anyone with both the `/exec` URL and token can download the snapshot. Rotate the token after suspected disclosure and limit editors of the Apps Script project.
