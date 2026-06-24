@echo off
set OCR=C:\LeadBridgeKSO\tools\max-chat-ocr-postprocessor\max_chat_ocr.py
set OUT=C:\LeadBridgeKSO\ocr_results

if not exist "%OCR%" (
  echo OCR script not found: %OCR%
  pause
  exit /b 1
)

echo Put MAX ZIP exports into C:\LeadBridgeKSO\exports
set /p INPUT=Enter full path to MAX ZIP or extracted folder:
if "%INPUT%"=="" exit /b 1

py "%OCR%" "%INPUT%" --output "%OUT%"
if errorlevel 1 (
  echo.
  echo OCR failed. Check Python, requirements and Tesseract.
) else (
  echo.
  echo Done. Use messages_ocr.json from C:\LeadBridgeKSO\ocr_results in LeadBridge.
)
pause
