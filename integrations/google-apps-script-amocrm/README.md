# amoCRM CSV snapshot through Google Apps Script

This integration exposes one read-only Google Sheet tab as a CSV snapshot for LeadBridge. LeadBridge sends a custom access token in a POST body, downloads the response and performs matching locally. The token is not a Google OAuth token.

## Setup

1. Import the amoCRM CSV into a private Google Sheet. Keep the original header row. The supplied 143-column format is supported by header names, including `-`, `Ответственный`, `Дата создания`, `Дата визита`, `Город`, `ФИО` and `Телефон`.
2. Open `Extensions -> Apps Script` from that spreadsheet.
3. Replace the editor content with `Code.gs` from this directory and save.
4. Return to the spreadsheet, select the amoCRM tab and run `setupLeadBridgeSnapshot` once from Apps Script. Grant the script access to this spreadsheet. Copy the token shown in the spreadsheet dialog.
5. Choose `Deploy -> New deployment -> Web app`. Execute as the owner and allow access to anyone who has the URL. The application-level token remains the data gate.
6. Copy the deployed URL ending in `/exec` into LeadBridge, switch amoCRM to `Онлайн /exec`, enter the token and load the snapshot.

Run `setupLeadBridgeSnapshot` again to select the currently active tab and rotate the token. Existing tokens stop working immediately.

## Security and limits

- The endpoint accepts only POST action `leadbridge_amocrm_snapshot` and never writes to the sheet.
- The bound script requests access only to its current spreadsheet.
- Script Properties store only the token SHA-256, spreadsheet ID and sheet name.
- Do not use `ScriptApp.getOAuthToken()` and do not put the LeadBridge token in a URL.
- Google Apps Script Content Service redirects successful output to `script.googleusercontent.com`; LeadBridge permits only that documented redirect host.
- Apps Script creates the CSV before returning it. Very large sheets remain subject to Google Apps Script execution, memory and response limits. LeadBridge itself consumes the response as a stream.
- Anyone with both the `/exec` URL and token can download the snapshot. Rotate the token after suspected disclosure and limit editors of the Apps Script project.
