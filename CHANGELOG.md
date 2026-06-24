# Changelog

## v6.4.24.1144

- Added responsive smartphone layout across forms, panels, actions, result tables and deal tables.
- Added PWA manifest, service worker and app icons for installable GitHub Pages usage.
- Added smartphone memory safeguards for heavy CSV/JSON/ZIP/folder inputs and batched mobile result rendering.
- Tightened the initial mobile screen with a compact ready state instead of an empty results area.
- Prepared GitHub-ready repository structure for GitHub Pages and GitHub Releases.
- Added native build ZIP packages for Windows WPF/WebView2 and macOS AppKit/WKWebView DMG wrappers.
- Added `releases/manifest.json` for version and package discovery from the Pages app.
- Added macOS and Windows tools installers plus local launchers.
- Added prominent in-app note that MAX, amoCRM and attachment files stay local on the user's computer.
- Added Pages-side package prompt that detects macOS or Windows and links to the matching tools ZIP.
- Kept LeadBridge matcher logic at `v6.4.24.1104`.

## LeadBridge matcher v6.4.24.1104

- Fixes borrower name extraction from OCR blocks.
- Keeps matching logic unchanged.
