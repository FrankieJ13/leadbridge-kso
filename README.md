# LeadBridge KSO

LeadBridge KSO `v8.2.10.0848` is a local-first matcher for MAX questionnaires and amoCRM CSV exports. amoCRM can be loaded from a local file or downloaded as a read-only snapshot from a token-protected Google Apps Script `/exec`. Matching, filtering and reports remain on the user's device.

Live app: <https://frankiej13.github.io/leadbridge-kso/>

## Components

```text
apps/
  leadbridge-web/              canonical Web/PWA source
  max-chat-local-exporter/     Chrome extension
  max-chat-ocr-postprocessor/  local Python/Tesseract OCR
integrations/
  google-apps-script-amocrm/   read-only Google Sheet -> CSV /exec template
tools/
  sync_web_assets.py           generates and verifies Pages/offline copies
  build_release_packages.py    deterministic release build + SHA-256
releases/
  manifest.json                version, build commit and artifact integrity
  SHA256SUMS                   checksums for release ZIP files
  packages/                    Pages-compatible downloadable ZIP files
tests/
  python/                      OCR archive/path security tests
  js/                          Web, matching, CSV, cache and URL-policy tests
```

`apps/leadbridge-web/` is the only manually maintained Web source. Root Pages assets, `offline_phone_matcher.html` and native/offline bundles are generated from it.

## Operator Flow

1. Export a loaded MAX chat with `apps/max-chat-local-exporter`.
2. Run `apps/max-chat-ocr-postprocessor/max_chat_ocr.py` locally.
3. Open LeadBridge from Pages or the offline package.
4. Select `messages_ocr.json`, then either a local amoCRM CSV or `Онлайн /exec`, and the MAX ZIP or `attachments` folder.
5. Run matching and export CSV, Markdown or HTML ZIP reports.

Large amoCRM CSV files are parsed in chunks. Mobile browsers still have finite memory, especially for large MAX JSON and ZIP/image previews.

## Online amoCRM snapshot

The optional online mode accepts only an HTTPS Google Apps Script deployment URL shaped like `https://script.google.com/macros/s/.../exec`. LeadBridge sends the custom access token in a POST body with cookies omitted. The token is not added to the URL, local storage, logs or generated reports. Only the validated `/exec` URL may be remembered locally.

The response is parsed as a stream. LeadBridge stores the latest normalized snapshot in chunked browser IndexedDB and restores it locally on the next launch without calling Apps Script. The interface shows the snapshot date and provides explicit refresh and delete controls. The token is never stored and is required again only for refresh. On browsers with the File System Access API, LeadBridge can additionally write the original stream to a separate local CSV file while parsing it. Mobile operating systems may evict site storage under critical storage pressure.

Setup instructions and the ready Apps Script are in [`integrations/google-apps-script-amocrm/`](integrations/google-apps-script-amocrm/README.md). Google Apps Script creates its response before download, so its own quotas still constrain very large sheets even though the LeadBridge client is streaming.

## Security Guarantees

- ZIP members are preflighted before extraction; absolute paths, traversal, symlinks and archive limit violations are rejected.
- OCR attachment paths are confined to the selected export root.
- Spreadsheet-controlled text is neutralized before CSV quoting.
- The extension fetch bridge accepts only HTTPS MAX and documented MAX CDN domains, validates its sender and limits URL count, URL length, type and attachment size.
- The Web CSP restricts scripts/styles to the application origin and permits connections only to the app plus official Apps Script response hosts. MAX/OCR/ZIP data is never sent by application code.
- Online amoCRM URLs are restricted to Google Apps Script `/exec`; requests omit cookies and put the short-lived custom token only in the POST body.
- The service worker removes only old `leadbridge-kso-pwa-` caches.
- Every generated release ZIP has `sha256` and `size_bytes` in `releases/manifest.json` and a matching entry in `releases/SHA256SUMS`.

See [SECURITY.md](SECURITY.md) for trust boundaries and limitations.

## Development And Tests

Requirements: Python 3.10+, Node.js 20+ and Tesseract for real OCR runs. Pillow is release-pinned in `requirements.txt`.

```bash
python3 -m unittest discover -s tests/python -v
node --test tests/js/*.test.js
python3 tools/sync_web_assets.py --verify
python3 tools/build_release_packages.py --verify
```

To update generated Pages copies after editing canonical Web files:

```bash
python3 tools/sync_web_assets.py
```

## Release Build

```bash
python3 tools/build_release_packages.py
python3 tools/build_release_packages.py --verify
```

The build creates seven deterministic component ZIP files plus `leadbridge-kso-full-project-v8.2.10.0848.zip`. When the autonomous Windows setup EXE or native macOS DMG is present in `releases/packages`, it is included in the manifest and full archive as well. The Windows EXE embeds Python, Pillow, Tesseract and `rus+eng` OCR models for an offline one-click install. The build records the real build-time Git commit, regenerates `releases/manifest.json` and writes `releases/SHA256SUMS`. Code-signing certificates are not configured.

Before manual installation, verify a package:

```bash
shasum -a 256 releases/packages/leadbridge-kso-tools-macos-v8.2.10.0848.zip
```

```powershell
Get-FileHash .\releases\packages\leadbridge-kso-tools-windows-v8.2.10.0848.zip -Algorithm SHA256
```

Compare the result with `releases/SHA256SUMS`. For public distribution, upload the same ZIP files to GitHub Release `v8.2.10.0848`; committed packages remain available for the current Pages download flow.

## Native Wrappers

- Windows: autonomous NSIS setup EXE for normal users plus a WPF + WebView2 source package for native development.
- macOS: Universal 2 AppKit + WKWebView DMG for Apple Silicon and Intel, with canonical Web fallback and minimum macOS 12.

Native wrappers add no telemetry or data-processing backend. Public macOS distribution still requires Developer ID signing and notarization.
