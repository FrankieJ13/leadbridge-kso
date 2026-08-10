'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const security = require('../../apps/leadbridge-web/src/security.js');
const csv = require('../../apps/leadbridge-web/src/csv.js');
const matching = require('../../apps/leadbridge-web/src/matching.js');
const amoSchema = require('../../apps/leadbridge-web/src/amo-schema.js');
const onlineCsv = require('../../apps/leadbridge-web/src/online-csv.js');
const amoSnapshotCache = require('../../apps/leadbridge-web/src/amo-snapshot-cache.js');
const exporterPolicy = require('../../apps/max-chat-local-exporter/url_policy.js');

test('normalizePhone accepts Russian phone formats and rejects long identifiers', () => {
  assert.equal(security.normalizePhone('8 (912) 345-67-89'), '9123456789');
  assert.equal(security.normalizePhone('+7 912 345 67 89'), '9123456789');
  assert.equal(security.normalizePhone('123456789012'), '');
  assert.deepEqual(security.extractPhonesFromText('ИНН 1234567890; паспорт 4510 123456'), []);
});

test('CSV parser handles delimiter, quotes and multiline cells', () => {
  const parsed = csv.parseCsv('name;phone;note\r\n"Иванов; И.И.";"+7 912 345-67-89";"строка 1\nстрока 2"');
  assert.equal(parsed.delimiter, ';');
  assert.deepEqual(parsed.headers, ['name', 'phone', 'note']);
  assert.equal(parsed.rows[0].__cells[0], 'Иванов; И.И.');
  assert.equal(parsed.rows[0].__cells[2], 'строка 1\nстрока 2');
});

test('streaming CSV parser preserves quoted records split across chunks', async () => {
  async function* chunks() {
    yield { text: '\uFEFFname;phone;note\r\n"Иван', loaded: 24, total: 72 };
    yield { text: 'ов";"+7 912 345-67-89";"строка 1\nстр', loaded: 61, total: 72 };
    yield { text: 'ока 2"\r\n', loaded: 72, total: 72 };
  }
  const rows = [];
  const parsed = await csv.parseCsvChunks(chunks(), { onRow: (row) => rows.push(row) });
  assert.equal(parsed.delimiter, ';');
  assert.deepEqual(parsed.headers, ['name', 'phone', 'note']);
  assert.equal(rows[0].__cells[0], 'Иванов');
  assert.equal(rows[0].__cells[2], 'строка 1\nстрока 2');
});

test('current 143-column amoCRM schema is resolved by headers, not old positions', () => {
  const headers = Array.from({ length: 143 }, (_, index) => `Поле ${index + 1}`);
  headers[0] = '-';
  headers[3] = 'Воронка';
  headers[4] = 'Этап';
  headers[5] = 'Дата создания';
  headers[7] = 'Дата закрытия';
  headers[8] = 'Ответственный';
  headers[31] = 'Комментарий';
  headers[36] = 'Дата визита';
  headers[37] = 'Город';
  headers[46] = 'Source phone';
  headers[53] = 'Причина закрытия карточки';
  headers[100] = 'ФИО';
  headers[107] = 'Телефон';
  headers[132] = 'Source phone';
  headers[137] = 'REGION TIME - Область или город';
  const resolved = amoSchema.resolve(headers);
  assert.equal(resolved.id, 0);
  assert.equal(resolved.createdAt, 5);
  assert.equal(resolved.fullName, 100);
  assert.equal(resolved.visitDate, 36);
  assert.equal(resolved.city, 37);
  assert.equal(resolved.region, 137);
  assert.deepEqual(resolved.phones, [107]);
});

test('online amoCRM request keeps token out of URL and restricts Apps Script redirects', () => {
  const token = 'test-token-1234567890-abcdef';
  const endpoint = 'https://script.google.com/macros/s/AKfycbx12345678901234567890/exec';
  const request = onlineCsv.createSnapshotRequest(endpoint, token);
  assert.equal(request.url, endpoint);
  assert.equal(request.url.includes(token), false);
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.cache, 'no-store');
  assert.equal(request.options.headers['Content-Type'], 'text/plain;charset=UTF-8');
  assert.deepEqual(JSON.parse(request.options.body), { action: 'leadbridge_amocrm_snapshot', token });
  assert.equal(onlineCsv.isAllowedResponseUrl('https://script.googleusercontent.com/macros/echo?user_content_key=x'), true);
  assert.equal(onlineCsv.isAllowedResponseUrl('https://evil.test/macros/echo'), false);
  assert.equal(onlineCsv.parseExecUrl(`${endpoint}?token=${token}`), null);
  assert.equal(onlineCsv.parseExecUrl('https://script.googleusercontent.com/macros/s/id/exec'), null);
});

test('amoCRM local snapshot cache chunks rows and excludes token metadata', () => {
  const rows = Array.from({ length: 1201 }, (_, index) => ({id: String(index + 1)}));
  const chunks = amoSnapshotCache.partitionRows(rows);
  assert.deepEqual(chunks.map(chunk => chunk.length), [500, 500, 201]);
  const meta = amoSnapshotCache.normalizeMeta({
    snapshotId: 'amo-test',
    formatVersion: amoSnapshotCache.CACHE_FORMAT_VERSION,
    createdAt: 123,
    fileName: 'snapshot.csv',
    sizeBytes: 456,
    rowCount: rows.length,
    phoneCount: 789,
    token: 'must-not-be-stored'
  });
  assert.equal(meta.token, undefined);
  assert.deepEqual(Object.keys(meta), ['key', 'snapshotId', 'formatVersion', 'createdAt', 'fileName', 'sizeBytes', 'rowCount', 'phoneCount']);
});

test('Apps Script deployment can open the configured spreadsheet by ID', () => {
  const code = fs.readFileSync(path.join(__dirname, '../../integrations/google-apps-script-amocrm/Code.gs'), 'utf8');
  assert.equal(code.includes('@OnlyCurrentDoc'), false);
  assert.equal(code.includes('SpreadsheetApp.openById(spreadsheetId)'), true);
  assert.equal(code.includes("error: 'spreadsheet_access_denied'"), true);
  assert.equal(code.includes('function testLeadBridgeSnapshot()'), true);
});

test('CSV cells neutralize spreadsheet formulas but preserve numbers, phones and URLs', () => {
  assert.equal(security.csvCell('=HYPERLINK("https://evil.test")'), '"\'=HYPERLINK(""https://evil.test"")"');
  assert.equal(security.csvCell('+CMD'), '"\'+CMD"');
  assert.equal(security.csvCell('@SUM(A1:A2)'), '"\'@SUM(A1:A2)"');
  assert.equal(security.csvCell('-1+2'), '"\'-1+2"');
  assert.equal(security.csvCell('обычный текст'), '"обычный текст"');
  assert.equal(security.csvCell('89123456789'), '"89123456789"');
  assert.equal(security.csvCell('https://max.ru/chat'), '"https://max.ru/chat"');
  assert.equal(security.csvCell(-12), '"-12"');
});

test('HTML escaping and safe HTTPS URL policy reject active content', () => {
  assert.equal(security.escapeHtml('<img src=x onerror="x">'), '&lt;img src=x onerror=&quot;x&quot;&gt;');
  assert.equal(security.safeHttpsUrl('javascript:alert(1)', ['max.ru']), '');
  assert.equal(security.safeHttpsUrl('https://evil.test/', ['max.ru']), '');
  assert.equal(security.safeHttpsUrl('https://web.max.ru/chat', ['max.ru']), 'https://web.max.ru/chat');
});

test('service worker cache cleanup keeps caches owned by other apps', () => {
  assert.deepEqual(
    security.cacheKeysToDelete(['another-app-v1', 'leadbridge-kso-pwa-old', 'leadbridge-kso-pwa-v8.2.10.0848'], 'leadbridge-kso-pwa-v8.2.10.0848'),
    ['leadbridge-kso-pwa-old']
  );
});

test('extension fetch policy only accepts HTTPS MAX and documented CDN domains', () => {
  assert.equal(exporterPolicy.parseAllowedUrl('https://web.max.ru/file').hostname, 'web.max.ru');
  assert.equal(exporterPolicy.parseAllowedUrl('https://iu.oneme.ru/image').hostname, 'iu.oneme.ru');
  assert.equal(exporterPolicy.parseAllowedUrl('https://vu.okcdn.ru/video').hostname, 'vu.okcdn.ru');
  assert.equal(exporterPolicy.parseAllowedUrl('https://127.0.0.1/private'), null);
  assert.equal(exporterPolicy.parseAllowedUrl('http://web.max.ru/file'), null);
  assert.equal(exporterPolicy.parseAllowedUrl('https://example.com/file'), null);
  assert.equal(exporterPolicy.isTrustedSender({ id: 'ext', tab: { url: 'https://web.max.ru/chat' } }, 'ext'), true);
  assert.equal(exporterPolicy.isTrustedSender({ id: 'ext', tab: { url: 'https://example.com/' } }, 'ext'), false);
  assert.equal(exporterPolicy.credentialsFor(new URL('https://iu.oneme.ru/image')), 'omit');
});

test('synthetic matching fixtures preserve exact-phone matches and unmatched rows', () => {
  const phone = security.normalizePhone('+7 (912) 345-67-89');
  const maxRows = [
    { id: 'max-current', phones: [phone], fullName: 'Ёлкин Иван', versionStatus: 'CURRENT', reply: { targetMessageNumber: 1 } },
    { id: 'max-old', phones: [phone], fullName: 'Елкин Ивн', versionStatus: 'SUPERSEDED' },
    { id: 'max-only', phones: ['9000000001'], fullName: 'Тест MAX' }
  ];
  const amoRows = [
    { id: 'deal-1', phones: [security.normalizePhone('8 912 345-67-89')], fullName: 'Елкин Иван' },
    { id: 'deal-2', phones: [phone], fullName: 'Ёлкин Иван' },
    { id: 'amo-only', phones: ['9000000002'], fullName: 'Тест amo' }
  ];
  const result = matching.basicMatch(maxRows, amoRows);
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].max.length, 2);
  assert.equal(result.matches[0].amoAll.length, 2);
  assert.equal(result.matches[0].max[0].reply.targetMessageNumber, 1);
  assert.equal(matching.normalizeName('Ёлкин Иван'), matching.normalizeName('Елкин Иван'));
  assert.deepEqual(result.unmatchedMax.map((row) => row.id), ['max-only']);
  assert.deepEqual(result.unmatchedAmo.map((row) => row.id), ['amo-only']);
});
