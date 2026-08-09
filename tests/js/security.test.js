'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const security = require('../../apps/leadbridge-web/src/security.js');
const csv = require('../../apps/leadbridge-web/src/csv.js');
const matching = require('../../apps/leadbridge-web/src/matching.js');
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
    security.cacheKeysToDelete(['another-app-v1', 'leadbridge-kso-pwa-old', 'leadbridge-kso-pwa-v8.2.09.1733'], 'leadbridge-kso-pwa-v8.2.09.1733'),
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
