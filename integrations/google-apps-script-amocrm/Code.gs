const LEADBRIDGE_ACTION = 'leadbridge_amocrm_snapshot';
const LEADBRIDGE_TOKEN_HASH = 'LEADBRIDGE_TOKEN_SHA256';
const LEADBRIDGE_SPREADSHEET_ID = 'LEADBRIDGE_SPREADSHEET_ID';
const LEADBRIDGE_SHEET_NAME = 'LEADBRIDGE_SHEET_NAME';

function setupLeadBridgeSnapshot() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet && spreadsheet.getActiveSheet();
  if (!spreadsheet || !sheet) throw new Error('Открой нужную Google Таблицу и активируй лист с amoCRM.');

  const token = createLeadBridgeToken_();
  PropertiesService.getScriptProperties().setProperties({
    [LEADBRIDGE_TOKEN_HASH]: sha256Hex_(token),
    [LEADBRIDGE_SPREADSHEET_ID]: spreadsheet.getId(),
    [LEADBRIDGE_SHEET_NAME]: sheet.getName()
  });

  SpreadsheetApp.getUi().alert(
    'LeadBridge: новый токен',
    'Скопируй токен сейчас. Он сохранён только как SHA-256 и повторно показан не будет.\n\n' + token,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function testLeadBridgeSnapshot() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty(LEADBRIDGE_SPREADSHEET_ID);
  const sheetName = properties.getProperty(LEADBRIDGE_SHEET_NAME);
  if (!spreadsheetId || !sheetName) {
    throw new Error('Сначала запусти setupLeadBridgeSnapshot на нужном листе.');
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error('Настроенный лист не найден: ' + sheetName);

  const range = sheet.getDataRange();
  const rows = range.getNumRows();
  const columns = range.getNumColumns();
  if (!rows || !columns) throw new Error('Настроенный лист пуст.');

  SpreadsheetApp.getUi().alert(
    'LeadBridge: доступ подтверждён',
    'Таблица: ' + spreadsheet.getName() + '\nЛист: ' + sheetName + '\nСтрок: ' + rows + '\nСтолбцов: ' + columns,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function doGet() {
  return jsonOutput_({ ok: true, service: 'leadbridge_amocrm_snapshot', method: 'POST' });
}

function doPost(event) {
  try {
    const body = event && event.postData ? String(event.postData.contents || '') : '';
    const request = JSON.parse(body || '{}');
    if (request.action !== LEADBRIDGE_ACTION) return jsonOutput_({ ok: false, error: 'unsupported_action' });

    const properties = PropertiesService.getScriptProperties();
    const expectedHash = properties.getProperty(LEADBRIDGE_TOKEN_HASH) || '';
    const suppliedToken = String(request.token || '');
    if (!expectedHash || !suppliedToken || !constantTimeEquals_(sha256Hex_(suppliedToken), expectedHash)) {
      return jsonOutput_({ ok: false, error: 'access_denied' });
    }

    const spreadsheetId = properties.getProperty(LEADBRIDGE_SPREADSHEET_ID);
    const sheetName = properties.getProperty(LEADBRIDGE_SHEET_NAME);
    if (!spreadsheetId || !sheetName) return jsonOutput_({ ok: false, error: 'snapshot_not_configured' });

    let spreadsheet;
    try {
      spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    } catch (error) {
      console.error('LeadBridge spreadsheet access error', error && error.stack ? error.stack : error);
      return jsonOutput_({ ok: false, error: 'spreadsheet_access_denied' });
    }
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) return jsonOutput_({ ok: false, error: 'sheet_not_found' });

    let values;
    try {
      values = sheet.getDataRange().getDisplayValues();
    } catch (error) {
      console.error('LeadBridge spreadsheet read error', error && error.stack ? error.stack : error);
      return jsonOutput_({ ok: false, error: 'snapshot_limit_exceeded' });
    }
    if (!values.length) return jsonOutput_({ ok: false, error: 'sheet_is_empty' });
    const csv = '\uFEFF' + values.map(csvRow_).join('\r\n');
    return ContentService.createTextOutput(csv).setMimeType(ContentService.MimeType.CSV);
  } catch (error) {
    console.error('LeadBridge snapshot error', error && error.stack ? error.stack : error);
    return jsonOutput_({ ok: false, error: 'snapshot_failed' });
  }
}

function csvRow_(row) {
  return row.map(function (value) {
    const text = csvSafeValue_(value);
    return '"' + text.replace(/"/g, '""') + '"';
  }).join(',');
}

function csvSafeValue_(value) {
  const text = String(value == null ? '' : value);
  if (!/^[=+\-@\t\r]/.test(text)) return text;
  if (/^-?\d+(?:[.,]\d+)?$/.test(text)) return text;
  return "'" + text;
}

function jsonOutput_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function sha256Hex_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8)
    .map(function (byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); })
    .join('');
}

function constantTimeEquals_(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    diff |= (a.charCodeAt(index % Math.max(1, a.length)) || 0) ^ (b.charCodeAt(index % Math.max(1, b.length)) || 0);
  }
  return diff === 0;
}

function createLeadBridgeToken_() {
  const material = Utilities.getUuid() + Utilities.getUuid() + new Date().getTime();
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, material))
    .replace(/=+$/g, '');
}
