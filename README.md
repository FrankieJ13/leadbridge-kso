# LeadBridge KSO

LeadBridge KSO `v8.2.09.1733` is a local-first matcher for MAX questionnaires and amoCRM CSV exports. GitHub Pages serves only the application files. Selected MAX JSON/ZIP, OCR results, amoCRM CSV and images are processed on the user's device and are not uploaded to an application backend.

Live app: <https://frankiej13.github.io/leadbridge-kso/>

## Components

```text
apps/
  leadbridge-web/              canonical Web/PWA source
  max-chat-local-exporter/     Chrome extension
  max-chat-ocr-postprocessor/  local Python/Tesseract OCR
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
4. Select `messages_ocr.json`, the amoCRM CSV and the MAX ZIP or `attachments` folder.
5. Run matching and export CSV, Markdown or HTML ZIP reports.

Large amoCRM CSV files are parsed in chunks. Mobile browsers still have finite memory, especially for large MAX JSON and ZIP/image previews.

## Security Guarantees

- ZIP members are preflighted before extraction; absolute paths, traversal, symlinks and archive limit violations are rejected.
- OCR attachment paths are confined to the selected export root.
- Spreadsheet-controlled text is neutralized before CSV quoting.
- The extension fetch bridge accepts only HTTPS MAX and documented MAX CDN domains, validates its sender and limits URL count, URL length, type and attachment size.
- The Web CSP restricts scripts, styles and connections to the application origin; local data is never sent by application code.
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

The build creates seven deterministic ZIP files for Web, exporter, OCR, tools packs and native build sources. It records the real build-time Git commit, regenerates `releases/manifest.json` and writes `releases/SHA256SUMS`. Release signing is not yet configured; no fake signature is generated. A future detached signature belongs at `releases/SHA256SUMS.sig`.

Before manual installation, verify a package:

```bash
shasum -a 256 releases/packages/leadbridge-kso-tools-macos-v8.2.09.1733.zip
```

```powershell
Get-FileHash .\releases\packages\leadbridge-kso-tools-windows-v8.2.09.1733.zip -Algorithm SHA256
```

Compare the result with `releases/SHA256SUMS`. For public distribution, upload the same ZIP files to GitHub Release `v8.2.09.1733`; committed packages remain available for the current Pages download flow.

## Native Wrappers

- Windows: WPF + WebView2 source package, with canonical Web fallback.
- macOS: AppKit + WKWebView DMG source package, with canonical Web fallback.

Native wrappers add no telemetry or data-processing backend. Public macOS distribution still requires Developer ID signing and notarization.
