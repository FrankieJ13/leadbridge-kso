LeadBridge KSO v8.2.10.0848 — полный проект

В этом архиве находятся:
- исходный код Web/PWA и локальная HTML-версия;
- MAX Chat Local Exporter и OCR Postprocessor;
- установщики и launchers для Windows и macOS;
- интеграция Google Apps Script для онлайн-снимка amoCRM;
- исходники нативных сборок Windows WPF и macOS DMG;
- актуальные ZIP-пакеты компонентов в releases/packages.
- автономный установщик Windows `LeadBridgeKSO-Setup-Windows-v8.2.10.0848.exe` в releases/packages.

Быстрый локальный запуск Web-версии:
1. Полностью распакуйте архив.
2. Откройте offline_phone_matcher.html в браузере.
3. Выберите MAX JSON, amoCRM CSV или онлайн-снимок /exec, затем ZIP MAX либо папку attachments.

Установка набора инструментов Windows:
1. Откройте PowerShell в корне распакованного проекта.
2. Выполните:
   powershell -ExecutionPolicy Bypass -File .\tools\installers\install_windows.ps1

OCR на macOS и Windows без установки:
1. Загрузите папку apps/max-chat-local-exporter как распакованное расширение Chrome.
2. В панели расширения нажмите «Запустить OCR» или выберите готовый ZIP.
3. Расширение обработает архив прямо в Chrome и скачает messages_ocr.json.

Скрипты в tools/installers нужны только для необязательного старого Python-процессора и разработки.

Все выбранные MAX, OCR, CSV, ZIP и изображения обрабатываются на устройстве пользователя. GitHub Pages не получает эти файлы. В онлайн-режиме amoCRM браузер отправляет токен только выбранному Google Apps Script /exec и получает CSV-снимок, который затем обрабатывается локально.
