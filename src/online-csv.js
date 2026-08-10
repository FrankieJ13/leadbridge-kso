(function initLeadBridgeOnlineCsv(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LeadBridgeOnlineCsv = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function onlineCsvFactory() {
  'use strict';

  const REQUEST_HOST = 'script.google.com';
  const RESPONSE_HOSTS = new Set(['script.google.com', 'script.googleusercontent.com']);
  const EXEC_PATH = /^\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec\/?$/;
  const MAX_ENDPOINT_LENGTH = 2048;
  const MIN_TOKEN_LENGTH = 16;
  const MAX_TOKEN_LENGTH = 512;
  const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024 * 1024;

  function parseExecUrl(value) {
    const text = String(value || '').trim();
    if (!text || text.length > MAX_ENDPOINT_LENGTH) return null;
    try {
      const url = new URL(text);
      if (url.protocol !== 'https:' || url.hostname !== REQUEST_HOST || url.port) return null;
      if (url.username || url.password || url.search || url.hash) return null;
      if (!EXEC_PATH.test(url.pathname)) return null;
      return url;
    } catch (_) {
      return null;
    }
  }

  function normalizeToken(value) {
    const token = String(value || '').trim();
    if (token.length < MIN_TOKEN_LENGTH || token.length > MAX_TOKEN_LENGTH || /[\r\n\0]/.test(token)) return '';
    return token;
  }

  function createSnapshotRequest(endpoint, token) {
    const url = parseExecUrl(endpoint);
    const secret = normalizeToken(token);
    if (!url) throw new Error('Укажи корректный HTTPS URL Google Apps Script, который заканчивается на /exec.');
    if (!secret) throw new Error(`Токен должен содержать от ${MIN_TOKEN_LENGTH} до ${MAX_TOKEN_LENGTH} символов.`);
    return {
      url: url.href,
      options: {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8',
          'Accept': 'text/csv,application/json;q=0.9,text/plain;q=0.8'
        },
        body: JSON.stringify({ action: 'leadbridge_amocrm_snapshot', token: secret }),
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'follow',
        referrerPolicy: 'no-referrer'
      }
    };
  }

  function isAllowedResponseUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return url.protocol === 'https:' && !url.username && !url.password && !url.port && RESPONSE_HOSTS.has(url.hostname);
    } catch (_) {
      return false;
    }
  }

  function snapshotFileName(now = new Date()) {
    const pad = (value) => String(value).padStart(2, '0');
    return `amocrm_snapshot_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.csv`;
  }

  function safeErrorMessage(value) {
    return String(value || 'Не удалось получить CSV-снимок.')
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300) || 'Не удалось получить CSV-снимок.';
  }

  return {
    MAX_SNAPSHOT_BYTES,
    createSnapshotRequest,
    isAllowedResponseUrl,
    normalizeToken,
    parseExecUrl,
    safeErrorMessage,
    snapshotFileName
  };
}));
