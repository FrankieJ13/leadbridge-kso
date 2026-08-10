# Security

LeadBridge KSO is designed as a local data-processing tool. GitHub hosts source code, static Pages assets and release files; it does not receive selected MAX, amoCRM, OCR or image contents from the application. Optional online amoCRM mode downloads a read-only snapshot from an operator-configured Google Apps Script endpoint.

## Trust Boundaries

- The MAX webpage and its changing DOM are untrusted input to the Chrome extension.
- Attachment URLs are untrusted and must pass the extension HTTPS/domain/sender/size/type policy.
- Exported ZIP, JSON, CSV, filenames and attachment paths are untrusted input to OCR and the matcher.
- OCR output is approximate untrusted text, not verified identity data.
- amoCRM CSV cells are untrusted text, including when exported back to spreadsheets.
- The configured Apps Script `/exec`, its response and all Google Sheet cells are untrusted network input.
- The browser matcher processes selected files in local browser memory under a restrictive CSP.
- Generated CSV, Markdown and HTML reports must still be reviewed before operational use.

## Guarantees

- ZIP extraction validates every member before writing and rejects traversal, absolute paths, symlinks, suspicious compression and configured resource-limit violations.
- OCR resolves attachments only inside the selected export root; unsafe records receive `unsafe_path` diagnostics and are not read.
- Web application connections are restricted to the same origin plus `script.google.com` and the documented Content Service redirect host `script.googleusercontent.com`. There is no LeadBridge backend, analytics or telemetry.
- The online endpoint must be HTTPS `/macros/s/.../exec`; credentials and referrer are omitted. The custom token is sent only in the POST body, never persisted by LeadBridge and never written to logs or reports.
- Online CSV is parsed as a stream. Optional direct-to-disk saving uses the browser File System Access API and does not pass through LeadBridge storage.
- The extension is not a general authenticated fetch proxy. It runs on `web.max.ru`, validates message senders and allows only HTTPS `max.ru`, `oneme.ru` and `okcdn.ru` attachment hosts.
- CSV output prefixes formula-like untrusted text before normal CSV escaping.
- Service-worker cache cleanup is namespaced to LeadBridge.
- Release ZIP files have build-generated SHA-256 and byte-size metadata.

## Limits

- The exporter depends on the current MAX DOM and only sees content loaded into the page.
- OCR does not guarantee complete or correct recognition.
- Matching results, especially boundary and OCR-derived cases, require operator review.
- Browser and smartphone memory limits still apply to very large files.
- Online mode requires a network connection. Without direct-to-disk browser support, the snapshot exists only as normalized rows in the current tab session.
- Google Apps Script builds the CSV response server-side and is subject to Google execution, memory and response quotas. Possession of both the `/exec` URL and custom token grants snapshot read access until token rotation.
- SHA-256 provides integrity checking, not publisher identity. Native builds are unsigned source/build packages; unsigned public binaries are not a trusted distribution channel.
- macOS public distribution requires Developer ID signing and notarization. Windows distribution should use an appropriate code-signing certificate.

Do not include real personal data, session tokens, cookies or authorization headers in issue reports. Report a security issue privately to the repository owner before public disclosure.
