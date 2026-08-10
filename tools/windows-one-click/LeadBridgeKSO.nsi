Unicode true
RequestExecutionLevel admin
SetCompressor /SOLID lzma
SetCompressorDictSize 64
AutoCloseWindow true
ShowInstDetails show

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"

!ifndef STAGE
  !error "STAGE is required"
!endif
!ifndef VENDOR
  !error "VENDOR is required"
!endif
!ifndef OUTPUT
  !error "OUTPUT is required"
!endif
!ifndef ICON
  !error "ICON is required"
!endif

!define PRODUCT_NAME "LeadBridge KSO"
!define PRODUCT_VERSION "8.2.10.0848"
!define PRODUCT_PUBLISHER "LeadBridge KSO"
!define PRODUCT_REGKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\LeadBridgeKSO"
!define MUI_ICON "${ICON}"
!define MUI_UNICON "${ICON}"

Name "${PRODUCT_NAME} ${PRODUCT_VERSION}"
OutFile "${OUTPUT}"
InstallDir "C:\LeadBridgeKSO"
InstallDirRegKey HKLM "${PRODUCT_REGKEY}" "InstallLocation"
BrandingText "LeadBridge KSO"

VIProductVersion "8.2.10.848"
VIAddVersionKey /LANG=1049 "ProductName" "${PRODUCT_NAME}"
VIAddVersionKey /LANG=1049 "ProductVersion" "${PRODUCT_VERSION}"
VIAddVersionKey /LANG=1049 "FileDescription" "Автономный установщик LeadBridge KSO"
VIAddVersionKey /LANG=1049 "FileVersion" "${PRODUCT_VERSION}"
VIAddVersionKey /LANG=1049 "CompanyName" "${PRODUCT_PUBLISHER}"
VIAddVersionKey /LANG=1049 "LegalCopyright" "LeadBridge KSO"

!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Russian"

Var PythonExe
Var ExitCode

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "LeadBridge KSO поддерживает только 64-битную Windows 10/11."
    Quit
  ${EndIf}
  SetRegView 64
  SetShellVarContext all
FunctionEnd

Section "Установка" SEC_MAIN
  SetOverwrite on
  SetOutPath "$INSTDIR"
  File /r "${STAGE}\*"

  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File /oname=python-installer.exe "${VENDOR}\python-3.12.10-amd64.exe"
  File /oname=tesseract-installer.exe "${VENDOR}\tesseract-ocr-w64-setup-5.5.3.20260724.exe"
  File /oname=pillow.whl "${VENDOR}\pillow-12.3.0-cp312-cp312-win_amd64.whl"
  File /oname=rus.traineddata "${VENDOR}\rus.traineddata"
  File /oname=eng.traineddata "${VENDOR}\eng.traineddata"

  DetailPrint "Проверка Python 3.12..."
  StrCpy $PythonExe "$PROGRAMFILES64\Python312\python.exe"
  ${IfNot} ${FileExists} "$PythonExe"
    StrCpy $PythonExe "$LOCALAPPDATA\Programs\Python\Python312\python.exe"
  ${EndIf}
  ${IfNot} ${FileExists} "$PythonExe"
    DetailPrint "Установка Python 3.12..."
    StrCpy $PythonExe "$PROGRAMFILES64\Python312\python.exe"
    nsExec::ExecToLog '"$PLUGINSDIR\python-installer.exe" /quiet InstallAllUsers=1 TargetDir="$PROGRAMFILES64\Python312" PrependPath=1 Include_launcher=1 InstallLauncherAllUsers=1 Include_pip=1 Include_test=0 SimpleInstall=1'
    Pop $ExitCode
    ${If} $ExitCode != 0
      MessageBox MB_ICONSTOP "Не удалось установить Python 3.12. Код: $ExitCode"
      Abort
    ${EndIf}
  ${EndIf}
  ${IfNot} ${FileExists} "$PythonExe"
    MessageBox MB_ICONSTOP "Python 3.12 установлен, но python.exe не найден."
    Abort
  ${EndIf}

  DetailPrint "Установка Pillow без доступа к интернету..."
  nsExec::ExecToLog '"$PythonExe" -m pip install --disable-pip-version-check --no-index --force-reinstall "$PLUGINSDIR\pillow.whl"'
  Pop $ExitCode
  ${If} $ExitCode != 0
    MessageBox MB_ICONSTOP "Не удалось установить Pillow. Код: $ExitCode"
    Abort
  ${EndIf}

  DetailPrint "Проверка Tesseract OCR..."
  ${IfNot} ${FileExists} "$PROGRAMFILES64\Tesseract-OCR\tesseract.exe"
    DetailPrint "Установка Tesseract OCR..."
    nsExec::ExecToLog '"$PLUGINSDIR\tesseract-installer.exe" /S'
    Pop $ExitCode
    ${If} $ExitCode != 0
      MessageBox MB_ICONSTOP "Не удалось установить Tesseract OCR. Код: $ExitCode"
      Abort
    ${EndIf}
  ${EndIf}
  ${IfNot} ${FileExists} "$PROGRAMFILES64\Tesseract-OCR\tesseract.exe"
    MessageBox MB_ICONSTOP "Tesseract установлен, но tesseract.exe не найден."
    Abort
  ${EndIf}

  CreateDirectory "$PROGRAMFILES64\Tesseract-OCR\tessdata"
  CopyFiles /SILENT "$PLUGINSDIR\rus.traineddata" "$PROGRAMFILES64\Tesseract-OCR\tessdata\rus.traineddata"
  CopyFiles /SILENT "$PLUGINSDIR\eng.traineddata" "$PROGRAMFILES64\Tesseract-OCR\tessdata\eng.traineddata"

  DetailPrint "Проверка OCR-зависимостей..."
  nsExec::ExecToLog '"$PythonExe" -c "import PIL; print(PIL.__version__)"'
  Pop $ExitCode
  ${If} $ExitCode != 0
    MessageBox MB_ICONSTOP "Pillow не прошёл проверку. Код: $ExitCode"
    Abort
  ${EndIf}
  nsExec::ExecToLog '"$PROGRAMFILES64\Tesseract-OCR\tesseract.exe" --list-langs'
  Pop $ExitCode
  ${If} $ExitCode != 0
    MessageBox MB_ICONSTOP "Tesseract не прошёл проверку. Код: $ExitCode"
    Abort
  ${EndIf}

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "${PRODUCT_REGKEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKLM "${PRODUCT_REGKEY}" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKLM "${PRODUCT_REGKEY}" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr HKLM "${PRODUCT_REGKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${PRODUCT_REGKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKLM "${PRODUCT_REGKEY}" "NoModify" 1
  WriteRegDWORD HKLM "${PRODUCT_REGKEY}" "NoRepair" 1

  CreateDirectory "$SMPROGRAMS\LeadBridge KSO"
  CreateShortCut "$SMPROGRAMS\LeadBridge KSO\LeadBridge KSO.lnk" "$WINDIR\explorer.exe" '"$INSTDIR\tools\leadbridge\index.html"' "$INSTDIR\LeadBridgeKSO.ico"
  CreateShortCut "$SMPROGRAMS\LeadBridge KSO\Запустить OCR.lnk" "$INSTDIR\launchers\run_ocr_windows.bat" "" "$INSTDIR\LeadBridgeKSO.ico"
  CreateShortCut "$SMPROGRAMS\LeadBridge KSO\Удалить LeadBridge KSO.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortCut "$DESKTOP\LeadBridge KSO.lnk" "$WINDIR\explorer.exe" '"$INSTDIR\tools\leadbridge\index.html"' "$INSTDIR\LeadBridgeKSO.ico"
  CreateShortCut "$DESKTOP\LeadBridge OCR.lnk" "$INSTDIR\launchers\run_ocr_windows.bat" "" "$INSTDIR\LeadBridgeKSO.ico"

  ${IfNot} ${Silent}
    DetailPrint "Готово. Запуск LeadBridge KSO..."
    ExecShell "open" "$INSTDIR\tools\leadbridge\index.html"
  ${EndIf}
SectionEnd

Section "Uninstall"
  SetShellVarContext all
  Delete "$DESKTOP\LeadBridge KSO.lnk"
  Delete "$DESKTOP\LeadBridge OCR.lnk"
  RMDir /r "$SMPROGRAMS\LeadBridge KSO"
  DeleteRegKey HKLM "${PRODUCT_REGKEY}"
  RMDir /r "$INSTDIR"
SectionEnd
