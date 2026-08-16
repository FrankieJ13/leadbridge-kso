'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const security = require('../../apps/leadbridge-web/src/security.js');
const csv = require('../../apps/leadbridge-web/src/csv.js');
const matching = require('../../apps/leadbridge-web/src/matching.js');
const amoSchema = require('../../apps/leadbridge-web/src/amo-schema.js');
const onlineCsv = require('../../apps/leadbridge-web/src/online-csv.js');
const amoSnapshotCache = require('../../apps/leadbridge-web/src/amo-snapshot-cache.js');
const exporterPolicy = require('../../apps/max-chat-local-exporter/url_policy.js');
const messageIdentity = require('../../apps/max-chat-local-exporter/message_identity.js');
const mediaIdentity = require('../../apps/max-chat-local-exporter/media_identity.js');
const panelUi = require('../../apps/max-chat-local-exporter/panel_ui.js');
const panelMotion = require('../../apps/max-chat-local-exporter/panel_motion.js');
const ocrBridgePolicy = require('../../apps/max-chat-local-exporter/ocr_bridge_policy.js');

test('normalizePhone accepts Russian phone formats and rejects long identifiers', () => {
  assert.equal(security.normalizePhone('8 (912) 345-67-89'), '9123456789');
  assert.equal(security.normalizePhone('+7 912 345 67 89'), '9123456789');
  assert.equal(security.normalizePhone('123456789012'), '');
  assert.deepEqual(security.extractPhonesFromText('ИНН 1234567890; паспорт 4510 123456'), []);
});

test('OCR phone extraction requires phone labels and rejects document identifiers', () => {
  const text = [
    'Паспорт',
    '8 692 095-10-05',
    'Серия и номер документа',
    '8 951 151-87-74',
    'Мобильный телефон',
    '8 906 950-87-19',
    'Контактное лицо, телефон',
    '8 922 183-70-57'
  ].join('\n');
  assert.deepEqual(security.extractPhonesNearLabels(text), ['9069508719', '9221837057']);
  assert.deepEqual(
    security.excludeIdentifierPhones(['9069508719', '4510123456'], ['4510 123456']),
    ['9069508719']
  );
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

test('amoCRM schema never guesses phone or metadata columns by position', () => {
  const headers = Array.from({ length: 143 }, (_, index) => `Произвольное поле ${index + 1}`);
  const resolved = amoSchema.resolve(headers);
  assert.equal(resolved.id, -1);
  assert.equal(resolved.comment, -1);
  assert.equal(resolved.fullName, -1);
  assert.deepEqual(resolved.phones, []);
  assert.deepEqual(amoSchema.validate(resolved), ['ID сделки', 'Телефон']);
});

test('exporter keeps identical messages separate without a stable message id', () => {
  const elementKeys = new WeakMap();
  let sequence = 0;
  const nextId = () => { sequence += 1; return sequence; };
  const firstElement = {};
  const secondElement = {};
  const emptyLink = {url: '', domIds: {}};
  const firstKey = messageIdentity.recordKeyForElement(firstElement, emptyLink, elementKeys, nextId);
  assert.equal(messageIdentity.recordKeyForElement(firstElement, emptyLink, elementKeys, nextId), firstKey);
  assert.notEqual(messageIdentity.recordKeyForElement(secondElement, emptyLink, elementKeys, nextId), firstKey);

  const stableLink = {url: '', domIds: {'data-message-id': 'msg-42'}};
  assert.equal(
    messageIdentity.recordKeyForElement({}, stableLink, elementKeys, nextId),
    messageIdentity.recordKeyForElement({}, stableLink, elementKeys, nextId)
  );
  assert.equal(messageIdentity.stableMessageIdentity({domIds: {'data-testid': 'message-row'}}), '');
});

test('exporter reconciles virtualized viewport messages without collapsing identical neighbors', () => {
  let sequence = 2;
  const previous = [
    {fingerprint: 'same-message', recordKey: 'element:1'},
    {fingerprint: 'same-message', recordKey: 'element:2'},
    {fingerprint: 'tail-message', recordKey: 'element:3'}
  ];
  const current = messageIdentity.reconcileViewport(previous, [
    {fingerprint: 'new-older-message'},
    {fingerprint: 'same-message'},
    {fingerprint: 'same-message'},
    {fingerprint: 'tail-message'}
  ], () => `element:new-${sequence += 1}`);
  assert.equal(current[0].recordKey, 'element:new-3');
  assert.deepEqual(current.slice(1).map((entry) => entry.recordKey), ['element:1', 'element:2', 'element:3']);
  assert.notEqual(current[1].recordKey, current[2].recordKey);
});

test('exporter keeps stable ids authoritative during viewport reconciliation', () => {
  const current = messageIdentity.reconcileViewport(
    [{fingerprint:'same',recordKey:'dom:data-message-id:old'}],
    [{fingerprint:'same',stableKey:'dom:data-message-id:new'}],
    () => 'unused'
  );
  assert.equal(current[0].recordKey, 'dom:data-message-id:new');
});

test('exporter carries identities through consecutive upward virtualized viewports', () => {
  let sequence = 0;
  const nextKey = () => `element:${sequence += 1}`;
  const first = messageIdentity.reconcileViewport([], [
    {fingerprint:'message-c'},
    {fingerprint:'message-d'},
    {fingerprint:'message-e'}
  ], nextKey);
  const second = messageIdentity.reconcileViewport(first, [
    {fingerprint:'message-a'},
    {fingerprint:'message-b'},
    {fingerprint:'message-c'},
    {fingerprint:'message-d'}
  ], nextKey);
  const third = messageIdentity.reconcileViewport(second, [
    {fingerprint:'message-new'},
    {fingerprint:'message-a'},
    {fingerprint:'message-b'}
  ], nextKey);
  assert.deepEqual(second.slice(2).map((entry) => entry.recordKey), first.slice(0,2).map((entry) => entry.recordKey));
  assert.deepEqual(third.slice(1).map((entry) => entry.recordKey), second.slice(0,2).map((entry) => entry.recordKey));
  assert.equal(new Set([...first, ...second, ...third].map((entry) => entry.recordKey)).size, 6);
});

test('exporter keeps MAX CDN image identity while dropping only expiry metadata', () => {
  const first = mediaIdentity.normalizeMediaUrl('https://i.oneme.ru/i?r=image-one&expires=100');
  const refreshed = mediaIdentity.normalizeMediaUrl('https://i.oneme.ru/i?expires=200&r=image-one');
  const second = mediaIdentity.normalizeMediaUrl('https://i.oneme.ru/i?r=image-two&expires=100');

  assert.equal(first, refreshed);
  assert.notEqual(first, second);
  assert.match(first, /r=image-one/);
  assert.doesNotMatch(first, /expires=/);
});

test('exporter assigns a rendered image only to its closest DOM candidate', () => {
  const image = {primaryUrl: 'https://i.oneme.ru/i?r=form-1&expires=100'};
  const result = mediaIdentity.selectViewportMedia([
    {area: 120000, media: [{...image, ownerDistance: 5}]},
    {area: 30000, media: [{...image, ownerDistance: 2}]},
    {area: 8000, media: [{...image, ownerDistance: 1}]}
  ]);

  assert.deepEqual(result.mediaByCandidate.map((items) => items.length), [0, 0, 1]);
  assert.equal(result.claimedKeys.size, 1);
  assert.equal(result.skipped, 2);
});

test('exporter skips media already owned by an earlier viewport', () => {
  const image = {primaryUrl: 'https://i.oneme.ru/i?r=form-2&expires=100', ownerDistance: 1};
  const existingKey = mediaIdentity.mediaKey(image);
  const result = mediaIdentity.selectViewportMedia([{area: 1000, media: [image]}], new Set([existingKey]));

  assert.deepEqual(result.mediaByCandidate, [[]]);
  assert.equal(result.claimedKeys.size, 0);
  assert.equal(result.skipped, 1);
});

test('exporter panel keeps every functional control in the redesigned markup', () => {
  const markup = panelUi.markup();
  ['maxle-collapse', 'maxle-close', 'maxle-scan', 'maxle-auto', 'maxle-stop', 'maxle-clear', 'maxle-ocr', 'maxle-pick-ocr', 'maxle-ocr-feedback', 'maxle-status', 'maxle-oldest-first', 'maxle-scan-before-export']
    .forEach((id) => assert.match(markup, new RegExp(`id="${id}"`)));
  ['json', 'txt', 'html', 'csv', 'zip']
    .forEach((format) => assert.match(markup, new RegExp(`data-maxle-export="${format}"`)));
  assert.match(markup, />1<\/span>[\s\S]*Собрать чат/);
  assert.match(markup, />2<\/span>[\s\S]*Запустить обработку/);
  assert.match(markup, /Выбрать ZIP для OCR/);
  assert.match(markup, /Только скачать ZIP/);
});

test('one-click OCR accepts only exporter blob URLs and archive names', () => {
  assert.equal(
    ocrBridgePolicy.sanitizeArchiveName('MAX_CHAT_EXPORT_120msg_44att_16-08-26_14-30.zip'),
    'MAX_CHAT_EXPORT_120msg_44att_16-08-26_14-30.zip'
  );
  assert.equal(
    ocrBridgePolicy.sanitizeArchiveName('MAX_CHAT_EXPORT_120msg_44att_16-08-26_14-30 (2).zip'),
    'MAX_CHAT_EXPORT_120msg_44att_16-08-26_14-30 (2).zip'
  );
  assert.equal(ocrBridgePolicy.sanitizeArchiveName('../../private.zip'), '');
  assert.equal(ocrBridgePolicy.sanitizeArchiveName('other.zip'), '');
  assert.equal(ocrBridgePolicy.isTrustedExportBlob('blob:https://web.max.ru/1f81a296-8551-4b32-8d1d-8a5f4d2f4409'), true);
  assert.equal(ocrBridgePolicy.isTrustedExportBlob('blob:https://example.com/1f81a296-8551-4b32-8d1d-8a5f4d2f4409'), false);

  const request = ocrBridgePolicy.ocrRequest('C:\\Users\\User\\Downloads\\MAX_CHAT_EXPORT_120msg_44att_16-08-26_14-30.zip');
  assert.equal(request.url, 'http://127.0.0.1:17848/run');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['X-LeadBridge-Bridge'], 'leadbridge-kso-ocr-v1');

  const pickRequest = ocrBridgePolicy.ocrPickRequest();
  assert.equal(pickRequest.url, 'http://127.0.0.1:17848/pick-and-run');
  assert.equal(pickRequest.options.method, 'POST');
  assert.equal(pickRequest.options.body, '{}');
  assert.equal(pickRequest.options.headers['X-LeadBridge-Bridge'], 'leadbridge-kso-ocr-v1');

  const healthRequest = ocrBridgePolicy.ocrHealthRequest();
  assert.equal(healthRequest.url, 'http://127.0.0.1:17848/health');
  assert.equal(healthRequest.options.method, 'GET');

  const statusRequest = ocrBridgePolicy.ocrStatusRequest();
  assert.equal(statusRequest.url, 'http://127.0.0.1:17848/status');
  assert.equal(statusRequest.options.method, 'GET');
});

test('extension grants only the permissions needed for local OCR handoff', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../../apps/max-chat-local-exporter/manifest.json'), 'utf8'));
  assert.equal(manifest.permissions.includes('downloads'), true);
  assert.equal(manifest.permissions.includes('storage'), true);
  assert.equal(manifest.host_permissions.includes('http://127.0.0.1/*'), true);
  assert.equal(manifest.host_permissions.includes('<all_urls>'), false);
});

test('exporter panel movement stays inside the visible tab area', () => {
  assert.deepEqual(panelMotion.clampPosition(-100, -50, 240, 450, 1280, 900), {left: 8, top: 8});
  assert.deepEqual(panelMotion.clampPosition(1200, 800, 240, 450, 1280, 900), {left: 1032, top: 442});
  assert.deepEqual(panelMotion.clampPosition(50, 40, 500, 700, 390, 640), {left: 8, top: 8});
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
  const context = {};
  vm.runInNewContext(`${code}\nthis.csvRowForTest = csvRow_; this.constantTimeEqualsForTest = constantTimeEquals_;`, context);
  assert.equal(context.csvRowForTest(['=IMPORTXML("https://evil.test")']), '"\'=IMPORTXML(""https://evil.test"")"');
  assert.equal(context.csvRowForTest(['-12']), '"-12"');
  assert.equal(context.constantTimeEqualsForTest('same-token-hash', 'same-token-hash'), true);
  assert.equal(context.constantTimeEqualsForTest('same-token-hash', 'different-token-hash'), false);
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
  assert.equal(exporterPolicy.credentialsFor(new URL('https://web.max.ru/image')), 'include');
  assert.equal(exporterPolicy.credentialsFor(new URL('https://untrusted.max.ru/image')), 'omit');
  assert.equal(exporterPolicy.parseAllowedRedirect('https://iu.oneme.ru/image', new URL('https://web.max.ru/file')).hostname, 'iu.oneme.ru');
  assert.equal(exporterPolicy.parseAllowedRedirect('https://evil.test/image', new URL('https://web.max.ru/file')), null);
});

test('web ZIP policy rejects traversal, symlinks, bombs and oversized totals', () => {
  const policy = {...security.DEFAULT_ZIP_POLICY, maxEntries: 2, maxEntryUncompressedBytes: 100, maxTotalUncompressedBytes: 120, maxCompressionRatio: 10};
  assert.throws(() => security.normalizeZipEntryName('../secret.jpg', policy), /пределы/);
  assert.throws(() => security.normalizeZipEntryName('C:/secret.jpg', policy), /абсолютный/);
  assert.throws(() => security.validateZipEntry({name:'link.jpg',compressedBytes:4,uncompressedBytes:4,versionMadeBy:3 << 8,externalAttributes:0xa000 << 16}, {entries:0,uncompressedBytes:0}, policy), /символическую/);
  assert.throws(() => security.validateZipEntry({name:'bomb.jpg',compressedBytes:5,uncompressedBytes:100,versionMadeBy:0,externalAttributes:0}, {entries:0,uncompressedBytes:0}, policy), /степень сжатия/);
  const totals={entries:0,uncompressedBytes:0};
  security.validateZipEntry({name:'one.jpg',compressedBytes:10,uncompressedBytes:60,versionMadeBy:0,externalAttributes:0},totals,policy);
  assert.throws(() => security.validateZipEntry({name:'two.jpg',compressedBytes:10,uncompressedBytes:70,versionMadeBy:0,externalAttributes:0},totals,policy), /Распакованный ZIP/);
});

test('web ZIP runtime stream guard cancels output beyond the actual byte limit', async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(6));
      controller.enqueue(new Uint8Array(6));
    },
    cancel() { cancelled = true; }
  });
  await assert.rejects(() => security.readLimitedStream(stream, 10, 'runtime ZIP limit'), /runtime ZIP limit/);
  assert.equal(cancelled, true);
});

test('bounded log keeps only recent lines and complete records', () => {
  const input = Array.from({length: 12}, (_, index) => `line-${index}`).join('\n') + '\n';
  const bounded = security.boundedLogText(input, 1000, 5);
  assert.equal(bounded.includes('line-0'), false);
  assert.equal(bounded.includes('line-11'), true);
  assert.ok(bounded.split('\n').length <= 6);
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

test('compact client presentation only exposes the amoCRM name line when names differ', () => {
  const same = matching.clientNamePresentation(
    [{fullName: 'Ёлкин Иван'}],
    [{fullName: 'Елкин Иван'}]
  );
  assert.equal(same.hasMismatch, false);
  assert.equal(same.amoLine, '');

  const different = matching.clientNamePresentation(
    [{fullName: 'Гилева Наталья Валерьевна'}],
    [{fullName: 'Гилев Роман Владимирович / Гилева Наталья Валерьевна'}]
  );
  assert.equal(different.primaryName, 'Гилева Наталья Валерьевна');
  assert.equal(different.hasMismatch, true);
  assert.match(different.amoLine, /Гилев Роман/);
});

test('phone groups with the same selected amoCRM deal merge into one card', () => {
  const form = {messageIndex: '15', attachmentPath: 'attachments/msg_0015/att_01.webp', sourceKind: 'анкета', comment: ''};
  const deal = {id: '32290199', fullName: 'Гилев Роман', phones: ['9069508719']};
  const secondContact = {id: '32290199', fullName: 'Гилева Наталья', phones: ['9221837057']};
  const merged = matching.mergeGroupsBySelectedDeal([
    {phone: '9069508719', max: [form], amo: [deal], amoAll: [deal]},
    {phone: '9221837057', max: [form], amo: [secondContact], amoAll: [secondContact]}
  ]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].phones, ['9069508719', '9221837057']);
  assert.equal(merged[0].max.length, 1);
  assert.equal(merged[0].amo.length, 1);
  assert.deepEqual(merged[0].amo[0].phones, ['9069508719', '9221837057']);
  assert.equal(merged[0].amo[0].fullName, 'Гилев Роман / Гилева Наталья');

  const separate = matching.mergeGroupsBySelectedDeal([
    {phone: '9000000001', max: [{messageIndex: '1'}], amo: [{id: '1'}], amoAll: [{id: '1'}]},
    {phone: '9000000002', max: [{messageIndex: '2'}], amo: [{id: '2'}], amoAll: [{id: '2'}]}
  ]);
  assert.equal(separate.length, 2);
});

test('card phone presentation accents matches and keeps other form phones secondary', () => {
  const phones = matching.groupPhonePresentation({
    phone: '9069508719',
    phones: ['9069508719'],
    max: [
      {phones: ['9069508719', '9221837057', '9000000011']},
      {phones: ['9221837057', '9000000022']}
    ]
  });
  assert.deepEqual(phones.matched, ['9069508719']);
  assert.deepEqual(phones.additional, ['9221837057', '9000000011', '9000000022']);
  assert.deepEqual(phones.all, ['9069508719', '9221837057', '9000000011', '9000000022']);
});
