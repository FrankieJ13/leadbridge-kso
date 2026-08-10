# Changelog

## v8.2.10.0848

- Added offline/online amoCRM source selection with token-protected Google Apps Script `/exec` snapshots.
- Restricted online requests to HTTPS `script.google.com/macros/s/.../exec` and documented `script.googleusercontent.com` redirects.
- Kept access tokens out of URLs, local storage, logs, diagnostics and generated reports.
- Added streaming network CSV parsing, cancellation and optional direct-to-disk snapshot saving where supported.
- Added header-based support for the current 143-column amoCRM export while preserving legacy column fallbacks.
- Added a read-only Google Sheet Apps Script template with SHA-256 token verification and token rotation.
- Fixed the Apps Script spreadsheet authorization scope for deployed `/exec` requests and added an owner-side access test with precise client diagnostics.
- Added a persistent chunked IndexedDB cache for the latest normalized amoCRM snapshot with timestamp, automatic local restore, explicit refresh and deletion controls.
- Added masked token entry with an explicit show/hide control.
- Split the interface into `Источники` and `Результаты` tabs with automatic result switching after a successful run.
- Aligned the three source cards and three information cards into compact desktop rows and fixed their light-theme heading contrast.
- Extended CSP, PWA cache, release packages, security documentation and regression tests for online snapshots.

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
