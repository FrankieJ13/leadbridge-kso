# Security

LeadBridge KSO is designed as a local data-processing tool. GitHub hosts source code, static Pages assets and release files; it does not receive selected MAX, amoCRM, OCR or image contents from the application.

## Trust Boundaries

- The MAX webpage and its changing DOM are untrusted input to the Chrome extension.
- Attachment URLs are untrusted and must pass the extension HTTPS/domain/sender/size/type policy.
- Exported ZIP, JSON, CSV, filenames and attachment paths are untrusted input to OCR and the matcher.
- OCR output is approximate untrusted text, not verified identity data.
- amoCRM CSV cells are untrusted text, including when exported back to spreadsheets.
- The browser matcher processes selected files in local browser memory under a restrictive CSP.
- Generated CSV, Markdown and HTML reports must still be reviewed before operational use.

## Guarantees

- ZIP extraction validates every member before writing and rejects traversal, absolute paths, symlinks, suspicious compression and configured resource-limit violations.
- OCR resolves attachments only inside the selected export root; unsafe records receive `unsafe_path` diagnostics and are not read.
- Web application connections are restricted to the same origin. There is no application backend, analytics or telemetry.
- The extension is not a general authenticated fetch proxy. It runs on `web.max.ru`, validates message senders and allows only HTTPS `max.ru`, `oneme.ru` and `okcdn.ru` attachment hosts.
- CSV output prefixes formula-like untrusted text before normal CSV escaping.
- Service-worker cache cleanup is namespaced to LeadBridge.
- Release ZIP files have build-generated SHA-256 and byte-size metadata.

## Limits

- The exporter depends on the current MAX DOM and only sees content loaded into the page.
- OCR does not guarantee complete or correct recognition.
- Matching results, especially boundary and OCR-derived cases, require operator review.
- Browser and smartphone memory limits still apply to very large files.
- SHA-256 provides integrity checking, not publisher identity. Native builds are unsigned source/build packages; unsigned public binaries are not a trusted distribution channel.
- macOS public distribution requires Developer ID signing and notarization. Windows distribution should use an appropriate code-signing certificate.

Do not include real personal data, session tokens, cookies or authorization headers in issue reports. Report a security issue privately to the repository owner before public disclosure.
