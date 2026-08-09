# Changelog

## v8.2.09.1733

- Hardened ZIP extraction against ZIP Slip, absolute paths, symlinks, suspicious compression and archive resource exhaustion.
- Sandboxed OCR attachment paths to the selected export root and added `unsafe_path` diagnostics.
- Fixed service-worker cache cleanup so caches belonging to other applications are preserved.
- Added spreadsheet-safe CSV export for untrusted MAX, amoCRM and OCR text.
- Restricted Chrome extension cross-origin fetches to HTTPS MAX/documented CDN domains with sender, count, length, type and size checks.
- Added SHA-256 and byte-size metadata plus `releases/SHA256SUMS` for release artifacts.
- Established `apps/leadbridge-web/` as canonical Web source with generated Pages, offline and native fallback copies.
- Extracted Web CSS/JS, removed inline event handlers and enabled a restrictive local-data CSP.
- Restored user zoom throughout the responsive/PWA interface.
- Added Python and JavaScript security/matching regression tests plus GitHub Actions CI.
- Added exporter/OCR/build diagnostics and unified current metadata on `v8.2.09.1733`.

## v6.4.24.1144

- Added responsive smartphone layout across forms, panels, actions, result tables and deal tables.
- Added PWA manifest, service worker and app icons for installable GitHub Pages usage.
- Added smartphone memory safeguards for heavy CSV/JSON/ZIP/folder inputs and batched mobile result rendering.
- Added chunked amoCRM CSV reading so large CSV files can be processed on smartphones without loading the whole file as one string.
- Hardened PWA cache refresh so installed smartphone apps pick up new matcher code more reliably.
- Refined mobile filters, report actions, stats, lower run button and PWA zoom behavior.
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
