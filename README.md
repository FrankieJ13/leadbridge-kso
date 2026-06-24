# LeadBridge KSO

LeadBridge KSO is an offline browser matcher for KSO анкеты from MAX and amoCRM CSV exports.

The GitHub Pages site only serves the HTML/JS/CSS application. The selected `messages_ocr.json`, amoCRM CSV, MAX ZIP and `attachments` folder are read locally by the browser on the user's computer and are not uploaded to a server.

## GitHub Pages

Publish this repository with GitHub Pages from the repository root. The root `index.html` opens the current stable LeadBridge matcher:

```text
https://YOUR_GITHUB_USER.github.io/leadbridge-kso/
```

The same app is also kept in `apps/leadbridge-web/index.html` for a clean repo layout.

## Repository Layout

```text
apps/
  leadbridge-web/              HTML/JS/CSS matcher for GitHub Pages
  max-chat-local-exporter/     Chrome extension v0.4.1
  max-chat-ocr-postprocessor/  Python OCR postprocessor v0.3.1
tools/
  installers/                  macOS, Windows and Python install helpers
  launcher/                    local launchers copied into installed packs
releases/
  manifest.json                current versions and downloadable assets
  packages/                    ZIP files ready to upload to GitHub Releases
docs/
  macos.md
  windows.md
  workflow.md
```

## Current Versions

- LeadBridge matcher: `v6.4.24.1104`
- LeadBridge tools package: `v6.4.24.1144`
- MAX Chat Local Exporter: `v0.4.1`
- MAX Chat OCR Postprocessor: `v0.3.1`

## Release Assets

Upload these files from `releases/packages/` to a GitHub Release:

- `leadbridge-kso-tools-macos-v6.4.24.1144.zip`
- `leadbridge-kso-tools-windows-v6.4.24.1144.zip`
- `max-chat-local-exporter-v0.4.1.zip`
- `max-chat-ocr-postprocessor-v0.3.1.zip`
- `leadbridge-offline-html-v6.4.24.1104.zip`

The Pages app reads `releases/manifest.json`, detects macOS or Windows and shows a download button for the matching tools package. A browser cannot install local tools automatically, so the user still downloads the ZIP, unpacks it and runs `install_macos.command` or `install_windows.ps1`.

By default `manifest.json` points to the ZIP files committed under `releases/packages/`, so the prompt works immediately on GitHub Pages. If you prefer to serve only from GitHub Releases, upload the same files as release assets and replace each `download_url` with:

```text
https://github.com/YOUR_GITHUB_USER/leadbridge-kso/releases/download/v6.4.24.1144/ASSET_NAME.zip
```

## Local Workflow

1. Export MAX with `apps/max-chat-local-exporter`.
2. Run OCR locally with `apps/max-chat-ocr-postprocessor`.
3. Open LeadBridge from GitHub Pages or local HTML.
4. Select `messages_ocr.json`.
5. Select amoCRM CSV.
6. Select the MAX ZIP or extracted `attachments` folder for image previews and HTML reports.

See [docs/workflow.md](docs/workflow.md) for the operator workflow and [docs/macos.md](docs/macos.md) / [docs/windows.md](docs/windows.md) for installation notes.
