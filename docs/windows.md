# Windows Install

## Install Tools Pack

1. Download `leadbridge-kso-tools-windows-v6.4.24.1144.zip` from GitHub Releases or from `releases/packages/`.
2. Unzip it.
3. Right-click `install_windows.ps1` and run with PowerShell.

If script execution is blocked, open PowerShell in the unzipped folder and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\install_windows.ps1
```

The installer creates:

```text
C:\LeadBridgeKSO\
  exports\
  ocr_results\
  tools\
    leadbridge\
    max-chat-local-exporter\
    max-chat-ocr-postprocessor\
  archives\
  launchers\
    open_leadbridge.bat
    run_ocr_windows.bat
```

## Chrome Extension

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select `C:\LeadBridgeKSO\tools\max-chat-local-exporter`.

## OCR

The installer checks Python packages and tries to install Tesseract through `winget` when available. If needed, install Tesseract manually and make sure `tesseract.exe` is in `PATH`.

Run OCR with:

```text
C:\LeadBridgeKSO\launchers\run_ocr_windows.bat
```

Use `messages_ocr.json` from `C:\LeadBridgeKSO\ocr_results` in LeadBridge.
