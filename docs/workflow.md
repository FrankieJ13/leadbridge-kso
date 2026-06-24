# LeadBridge KSO Workflow

LeadBridge is intentionally offline-first:

```text
GitHub = code, release files and the launch page
User computer = MAX exports, amoCRM CSV, OCR, images and matching
```

The browser can open LeadBridge from GitHub Pages, but it cannot silently read files from disk. The operator must explicitly select each local file or folder.

## Standard Flow

1. Open the GitHub Pages URL.
2. Select MAX OCR data: use `messages_ocr.json`.
3. Select the amoCRM CSV export.
4. Select the original MAX ZIP or extracted `attachments` folder.
5. Click `ЗАПУСК`.
6. Export CSV, Markdown or HTML ZIP reports from the result toolbar.

## Why `messages_ocr.json`

`messages_ocr.json` contains both OCR анкеты and ordinary text messages from MAX. That lets LeadBridge search phone numbers across the full local MAX export.

`forms_structured.json` and `forms_flat.csv` are still useful for OCR-only inspection, but they do not include every text message.

## Privacy Boundary

No server processing is added. GitHub Pages serves static HTML/JS/CSS only. Local files are read through browser file inputs and processed in the browser memory of the user's machine.

Do not convert this project into a hosted server app unless there is a separate privacy/security decision for storing and processing personal data.
