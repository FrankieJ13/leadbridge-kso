@echo off
setlocal EnableExtensions DisableDelayedExpansion
set "OCR=C:\LeadBridgeKSO\tools\max-chat-ocr-postprocessor\max_chat_ocr.py"
set "REQ=C:\LeadBridgeKSO\tools\max-chat-ocr-postprocessor\requirements.txt"
set "OUT=C:\LeadBridgeKSO\ocr_results"
set "PYTHON_EXE="

if not exist "%OCR%" (
  echo OCR script not found: %OCR%
  pause
  exit /b 1
)

for /f "delims=" %%P in ('where py 2^>nul') do if not defined PYTHON_EXE set "PYTHON_EXE=%%P"
for /d %%D in ("%LocalAppData%\Programs\Python\Python3*") do if not defined PYTHON_EXE if exist "%%~fD\python.exe" set "PYTHON_EXE=%%~fD\python.exe"
for /f "delims=" %%P in ('where python 2^>nul') do if not defined PYTHON_EXE set "PYTHON_EXE=%%P"

if not defined PYTHON_EXE (
  echo Python 3.12 is not installed.
  echo Run this command in PowerShell:
  echo winget install --id Python.Python.3.12 -e --scope user
  echo Then close PowerShell, open it again and run this launcher.
  pause
  exit /b 2
)

"%PYTHON_EXE%" --version
if errorlevel 1 (
  echo Python was found but could not start: %PYTHON_EXE%
  pause
  exit /b 2
)

"%PYTHON_EXE%" -c "import PIL" >nul 2>nul
if errorlevel 1 (
  echo Installing OCR Python requirements...
  "%PYTHON_EXE%" -m ensurepip --upgrade
  "%PYTHON_EXE%" -m pip install -r "%REQ%"
  if errorlevel 1 (
    echo Failed to install Python requirements.
    pause
    exit /b 2
  )
)

where tesseract >nul 2>nul
if errorlevel 1 if exist "C:\Program Files\Tesseract-OCR\tesseract.exe" set "PATH=C:\Program Files\Tesseract-OCR;%PATH%"
where tesseract >nul 2>nul
if errorlevel 1 (
  echo Tesseract OCR is not installed.
  echo Run this command in PowerShell:
  echo winget install --id UB-Mannheim.TesseractOCR -e
  pause
  exit /b 2
)

echo Put MAX ZIP exports into C:\LeadBridgeKSO\exports
set /p "INPUT=Enter full path to MAX ZIP or extracted folder: "
if not defined INPUT exit /b 1
set "INPUT=%INPUT:"=%"

if not exist "%OUT%" mkdir "%OUT%"
"%PYTHON_EXE%" "%OCR%" "%INPUT%" --output "%OUT%"
if errorlevel 1 (
  echo.
  echo OCR failed. Review the error shown above.
) else (
  echo.
  echo Done. Use messages_ocr.json from C:\LeadBridgeKSO\ocr_results in LeadBridge.
)
pause
endlocal
