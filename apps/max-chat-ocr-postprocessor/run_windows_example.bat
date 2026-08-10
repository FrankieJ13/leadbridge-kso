@echo off
setlocal EnableExtensions DisableDelayedExpansion
set "PYTHON_EXE="
for /f "delims=" %%P in ('where py 2^>nul') do if not defined PYTHON_EXE set "PYTHON_EXE=%%P"
for /d %%D in ("%LocalAppData%\Programs\Python\Python3*") do if not defined PYTHON_EXE if exist "%%~fD\python.exe" set "PYTHON_EXE=%%~fD\python.exe"
for /f "delims=" %%P in ('where python 2^>nul') do if not defined PYTHON_EXE set "PYTHON_EXE=%%P"

if not defined PYTHON_EXE (
  echo Python 3.12 is not installed.
  echo Run: winget install --id Python.Python.3.12 -e --scope user
  pause
  exit /b 2
)

"%PYTHON_EXE%" -c "import PIL" >nul 2>nul
if errorlevel 1 "%PYTHON_EXE%" -m pip install -r "%~dp0requirements.txt"
if errorlevel 1 (
  echo Failed to install Python requirements.
  pause
  exit /b 2
)

set /p "EXPORT_PATH=Drag the MAX export ZIP or folder here and press Enter: "
if not defined EXPORT_PATH exit /b 1
set "EXPORT_PATH=%EXPORT_PATH:"=%"
"%PYTHON_EXE%" "%~dp0max_chat_ocr.py" "%EXPORT_PATH%"
pause
endlocal
