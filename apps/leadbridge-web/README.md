# LeadBridge Web v8.2.10.0848

This directory is the canonical Web/PWA source. Edit files here, then run:

```bash
python3 tools/sync_web_assets.py
```

The sync tool generates root GitHub Pages assets and `offline_phone_matcher.html`. CI runs `--verify` and fails on drift. Release tooling copies this same source into offline and native fallback packages.

`index.html` loads local `app.css`, `app.js` and `src/*.js`, so it remains usable when opened directly from the unpacked offline package. MAX/OCR/ZIP data is read only after explicit browser selection. amoCRM can come from a local CSV or from a token-protected Google Apps Script snapshot; matching and reports stay on the device.

The CSP restricts scripts and styles to the local application origin. Connections are limited to the application origin and the two official Apps Script Content Service hosts. The `/exec` URL is validated, the token is sent only in a POST body and is never persisted by LeadBridge.
