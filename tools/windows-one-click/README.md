# LeadBridge KSO Windows One-Click Setup

Сборщик создаёт единый автономный `LeadBridgeKSO-Setup-Windows-v8.2.10.0848.exe` для 64-битной Windows 10/11.

Внутрь установщика входят LeadBridge Web, MAX exporter, OCR postprocessor, переносимый Python 3.12.10, Pillow 12.3.0, Tesseract 5.5.3 и модели `rus+eng`. Они живут в `C:\LeadBridgeKSO\runtime`, не конфликтуют с системным Python и удаляются вместе с LeadBridge. После скачивания EXE интернет для установки не требуется.

Пользовательский сценарий:

1. Дважды открыть EXE.
2. Подтвердить стандартный запрос прав администратора Windows.
3. Дождаться автоматического запуска LeadBridge.

Установщик создаёт `C:\LeadBridgeKSO`, ярлыки LeadBridge и OCR на рабочем столе и пункт удаления в меню «Пуск». Никакие Windows-службы не создаются: обработка остаётся локальной и запускается только по команде пользователя.

Сборка на macOS/Linux с Python 3.10+ и NSIS 3:

```bash
python3 tools/windows-one-click/build_setup.py --download
```

Зависимости скачиваются из зафиксированных официальных источников и проверяются по SHA-256. Готовый EXE пока не имеет Authenticode-подписи; для устранения предупреждения SmartScreen нужен сертификат подписи кода Windows.
