# macOS Install

## Install Tools Pack

1. Download `leadbridge-kso-tools-macos-v6.4.24.1144.zip` from GitHub Releases or from `releases/packages/`.
2. Unzip it.
3. Run `install_macos.command`.

If macOS blocks the script, open Terminal in the unzipped folder and run:

```bash
chmod +x install_macos.command
./install_macos.command
```

The installer creates:

```text
~/LeadBridgeKSO/
  exports/
  ocr_results/
  tools/
    leadbridge/
    max-chat-local-exporter/
    max-chat-ocr-postprocessor/
  archives/
  launchers/
    open_leadbridge.command
    run_ocr_macos.command
```

## Chrome Extension

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select `~/LeadBridgeKSO/tools/max-chat-local-exporter`.

## OCR

The installer checks for Homebrew, Tesseract and Python requirements. If Homebrew is missing, install it first and then run:

```bash
brew install tesseract tesseract-lang
python3 -m pip install -r ~/LeadBridgeKSO/tools/max-chat-ocr-postprocessor/requirements.txt
```

Run OCR with:

```text
~/LeadBridgeKSO/launchers/run_ocr_macos.command
```

Use `messages_ocr.json` from `~/LeadBridgeKSO/ocr_results` in LeadBridge.
