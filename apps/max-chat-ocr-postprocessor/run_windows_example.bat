@echo off
set /p EXPORT_PATH="Перетащите сюда ZIP или папку экспорта MAX и нажмите Enter: "
python max_chat_ocr.py %EXPORT_PATH%
pause
