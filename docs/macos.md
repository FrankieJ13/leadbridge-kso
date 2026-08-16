# macOS Install

## Install Tools Pack

1. Download `leadbridge-kso-tools-macos-v8.2.10.0848.zip` from GitHub Releases or from `releases/packages/` and verify it against `releases/SHA256SUMS`.
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
    ocr-bridge/
  integrations/
    google-apps-script-amocrm/
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

Основной способ: соберите чат в расширении и нажмите «Запустить OCR». Расширение сохранит ZIP и передаст его локальному мосту; `messages_ocr.json` появится в `~/LeadBridgeKSO/ocr_results`.

Ручной launcher остаётся запасным вариантом.

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
