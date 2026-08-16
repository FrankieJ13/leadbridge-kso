(function initLeadBridgeSecurity(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LeadBridgeSecurity = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function securityFactory() {
  'use strict';

  const CACHE_NAMESPACE = 'leadbridge-kso-pwa-';
  const FORMULA_PREFIX = /^[=+\-@\t\r]/;
  const DEFAULT_ZIP_POLICY = Object.freeze({
    maxEntries: 5000,
    maxEntryUncompressedBytes: 80 * 1024 * 1024,
    maxTotalUncompressedBytes: 512 * 1024 * 1024,
    maxCompressionRatio: 200,
    maxPathLength: 512,
    maxPathDepth: 24
  });

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

  function normalizeZipEntryName(value, policy = DEFAULT_ZIP_POLICY) {
    const raw = String(value || '').replace(/\\/g, '/');
    if (!raw || raw.includes('\0')) throw new Error('ZIP содержит пустой или повреждённый путь');
    if (raw.length > policy.maxPathLength) throw new Error('ZIP содержит слишком длинный путь');
    if (raw.startsWith('/') || /^[a-z]:\//i.test(raw)) throw new Error('ZIP содержит абсолютный путь');
    const parts = raw.split('/').filter((part) => part && part !== '.');
    if (parts.includes('..')) throw new Error('ZIP содержит переход за пределы архива');
    if (parts.length > policy.maxPathDepth) throw new Error('ZIP содержит слишком глубокий путь');
    return parts.join('/') + (raw.endsWith('/') ? '/' : '');
  }

  function isZipSymlink(versionMadeBy, externalAttributes) {
    const platform = (Number(versionMadeBy) >>> 8) & 0xff;
    if (platform !== 3) return false;
    const unixMode = (Number(externalAttributes) >>> 16) & 0xffff;
    return (unixMode & 0xf000) === 0xa000;
  }

  function validateZipEntry(entry, totals = {entries: 0, uncompressedBytes: 0}, policy = DEFAULT_ZIP_POLICY) {
    const name = normalizeZipEntryName(entry.name, policy);
    const compressedBytes = Number(entry.compressedBytes);
    const uncompressedBytes = Number(entry.uncompressedBytes);
    if (!Number.isSafeInteger(compressedBytes) || compressedBytes < 0
        || !Number.isSafeInteger(uncompressedBytes) || uncompressedBytes < 0) {
      throw new Error('ZIP содержит некорректный размер файла');
    }
    if ((Number(entry.flags) & 1) !== 0) throw new Error('Зашифрованные ZIP не поддерживаются');
    if (isZipSymlink(entry.versionMadeBy, entry.externalAttributes)) throw new Error('ZIP содержит символическую ссылку');
    if (uncompressedBytes > policy.maxEntryUncompressedBytes) throw new Error('Файл внутри ZIP слишком большой');
    if (uncompressedBytes > 0 && (compressedBytes === 0 || uncompressedBytes / compressedBytes > policy.maxCompressionRatio)) {
      throw new Error('ZIP имеет опасно высокую степень сжатия');
    }
    totals.entries += 1;
    totals.uncompressedBytes += uncompressedBytes;
    if (totals.entries > policy.maxEntries) throw new Error('В ZIP слишком много файлов');
    if (totals.uncompressedBytes > policy.maxTotalUncompressedBytes) throw new Error('Распакованный ZIP слишком большой');
    return name;
  }

  async function readLimitedStream(stream, maxBytes, errorMessage = 'Поток превысил допустимый размер') {
    const reader = stream.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel('size limit exceeded');
          throw new Error(errorMessage);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }

  function boundedLogText(value, maxChars = 40000, maxLines = 250) {
    let lines = String(value || '').split('\n');
    if (lines.length > maxLines + 1) lines = lines.slice(-(maxLines + 1));
    let text = lines.join('\n');
    if (text.length > maxChars) {
      text = text.slice(-maxChars);
      const firstNewline = text.indexOf('\n');
      if (firstNewline >= 0) text = text.slice(firstNewline + 1);
    }
    return text;
  }

  return {
    CACHE_NAMESPACE,
    DEFAULT_ZIP_POLICY,
    boundedLogText,
    cacheKeysToDelete,
    csvCell,
    excludeIdentifierPhones,
    escapeHtml,
    extractPhonesFromText,
    extractPhonesNearLabels,
    hostnameMatches,
    normalizePhone,
    safeHttpsUrl,
    spreadsheetSafe,
    isZipSymlink,
    normalizeZipEntryName,
    readLimitedStream,
    validateZipEntry
  };
}));
