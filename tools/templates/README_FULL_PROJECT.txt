LeadBridge KSO v8.2.10.0848 — полный проект

В этом архиве находятся:
- исходный код Web/PWA и локальная HTML-версия;
- MAX Chat Local Exporter и OCR Postprocessor;
- установщики и launchers для Windows и macOS;
- интеграция Google Apps Script для онлайн-снимка amoCRM;
- исходники нативных сборок Windows WPF и macOS DMG;
- актуальные ZIP-пакеты компонентов в releases/packages.

Быстрый локальный запуск Web-версии:
1. Полностью распакуйте архив.
2. Откройте offline_phone_matcher.html в браузере.
3. Выберите MAX JSON, amoCRM CSV или онлайн-снимок /exec, затем ZIP MAX либо папку attachments.

Установка набора инструментов Windows:
1. Откройте PowerShell в корне распакованного проекта.
2. Выполните:
   powershell -ExecutionPolicy Bypass -File .\tools\installers\install_windows.ps1

Установка набора инструментов macOS:
1. Откройте Terminal в корне распакованного проекта.
2. Выполните:
   chmod +x ./tools/installers/install_macos.command
   ./tools/installers/install_macos.command

Все выбранные MAX, OCR, CSV, ZIP и изображения обрабатываются на устройстве пользователя. GitHub Pages не получает эти файлы. В онлайн-режиме amoCRM браузер отправляет токен только выбранному Google Apps Script /exec и получает CSV-снимок, который затем обрабатывается локально.
