(function initLeadBridgeSecurity(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LeadBridgeSecurity = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function securityFactory() {
  'use strict';

  const CACHE_NAMESPACE = 'leadbridge-kso-pwa-';
  const FORMULA_PREFIX = /^[=+\-@\t\r]/;

  function normalizePhone(raw) {
    const digits = String(raw ?? '').replace(/\D/g, '');
    if (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')) return digits.slice(1);
    if (digits.length === 10) return digits;
    return '';
  }

  function extractPhonesFromText(value) {
    const text = String(value ?? '');
    const phones = new Set();
    const phoneLike = /(^|[^\d])((?:\+?7|8)?[\s\-(]*\d{3}[\s\-)]*\d{3}[\s-]*\d{2}[\s-]*\d{2})(?=$|[^\d])/g;
    let match;
    while ((match = phoneLike.exec(text)) !== null) {
      const context = text.slice(Math.max(0, match.index - 32), match.index + match[1].length).toLowerCase();
      if (/(?:инн|паспорт|серия|номер\s+документа)\s*[:№#-]*\s*$/.test(context)) continue;
      const phone = normalizePhone(match[2]);
      if (phone) phones.add(phone);
    }
    const digits = text.replace(/\D/g, '');
    if (!/(?:инн|паспорт|серия|номер\s+документа)/i.test(text)
        && (digits.length === 10 || (digits.length === 11 && (digits[0] === '7' || digits[0] === '8')))) {
      const phone = normalizePhone(digits);
      if (phone) phones.add(phone);
    }
    return [...phones];
  }

  function extractPhonesNearLabels(value) {
    const lines = String(value ?? '').split(/\r?\n/);
    const phones = new Set();
    const phoneLabel = /(?:мобил|сотов|контактн|рабоч)[^\n]{0,24}(?:телефон|номер)|(?:телефон|тел\.)[^\n]{0,24}(?:за[её]мщик|клиент|контакт|супруг|родствен|работ)|(?:^|\s)(?:телефон|тел\.)(?:\s|:|№|$)/i;
    const blockedLabel = /паспорт|серия|инн|снилс|номер\s+документа|код\s+подразделения/i;
    for (let index = 0; index < lines.length; index += 1) {
      const labelLine = lines[index] || '';
      if (!phoneLabel.test(labelLine) || blockedLabel.test(labelLine)) continue;
      const own = extractPhonesFromText(labelLine);
      own.forEach((phone) => phones.add(phone));
      if (own.length) continue;
      for (let offset = 1; offset <= 2 && index + offset < lines.length; offset += 1) {
        const nextLine = lines[index + offset] || '';
        if (blockedLabel.test(nextLine)) break;
        const found = extractPhonesFromText(`${labelLine} ${nextLine}`);
        found.forEach((phone) => phones.add(phone));
        if (found.length) break;
      }
    }
    return [...phones];
  }

  function excludeIdentifierPhones(phones, identifierValues) {
    const blocked = new Set((identifierValues || []).map(normalizePhone).filter(Boolean));
    return [...new Set(phones || [])].filter((phone) => !blocked.has(normalizePhone(phone)));
  }

  function spreadsheetSafe(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    const text = String(value);
    return FORMULA_PREFIX.test(text) ? `'${text}` : text;
  }

  function csvCell(value) {
    return `"${spreadsheetSafe(value).replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[char]));
  }

  function hostnameMatches(hostname, allowedDomain) {
    const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
    const domain = String(allowedDomain || '').toLowerCase().replace(/^\./, '').replace(/\.$/, '');
    return Boolean(host && domain && (host === domain || host.endsWith(`.${domain}`)));
  }

  function safeHttpsUrl(value, allowedDomains) {
    try {
      const url = new URL(String(value || ''));
      if (url.protocol !== 'https:' || url.username || url.password) return '';
      if (Array.isArray(allowedDomains) && allowedDomains.length
          && !allowedDomains.some((domain) => hostnameMatches(url.hostname, domain))) return '';
      return url.href;
    } catch (_) {
      return '';
    }
  }

  function cacheKeysToDelete(keys, currentCacheName) {
    return Array.from(keys || []).filter((key) => (
      String(key).startsWith(CACHE_NAMESPACE) && key !== currentCacheName
    ));
  }

  return {
    CACHE_NAMESPACE,
    cacheKeysToDelete,
    csvCell,
    excludeIdentifierPhones,
    escapeHtml,
    extractPhonesFromText,
    extractPhonesNearLabels,
    hostnameMatches,
    normalizePhone,
    safeHttpsUrl,
    spreadsheetSafe
  };
}));
