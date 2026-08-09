# LeadBridge Web v8.2.09.1733

This directory is the canonical Web/PWA source. Edit files here, then run:

```bash
python3 tools/sync_web_assets.py
```

The sync tool generates root GitHub Pages assets and `offline_phone_matcher.html`. CI runs `--verify` and fails on drift. Release tooling copies this same source into offline and native fallback packages.

`index.html` loads local `app.css`, `app.js` and `src/*.js`, so it remains usable when opened directly from the unpacked offline package. The application reads files only after explicit browser selection and does not upload MAX, amoCRM or attachment data.

The CSP restricts scripts, styles and connections to the local application origin. Blob/data image sources remain available for selected questionnaire previews and generated reports.
