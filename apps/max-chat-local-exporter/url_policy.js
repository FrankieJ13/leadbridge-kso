(function initMaxExporterUrlPolicy(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MaxExporterUrlPolicy = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function urlPolicyFactory() {
  'use strict';

  const ALLOWED_DOMAINS = Object.freeze(['max.ru', 'oneme.ru', 'okcdn.ru']);
  const MAX_URL_LENGTH = 4096;
  const MAX_URL_CANDIDATES = 8;
  const MAX_ATTACHMENT_BYTES = 60 * 1024 * 1024;
  const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp',
    'image/tiff', 'image/avif', 'image/heic', 'image/heif'
  ]);

  function hostnameMatches(hostname, domain) {
    const host = String(hostname || '').toLowerCase().replace(/\.$/, '');
    return host === domain || host.endsWith(`.${domain}`);
  }

  function parseAllowedUrl(value) {
    const raw = String(value || '').trim();
    if (!raw || raw.length > MAX_URL_LENGTH) return null;
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:' || url.username || url.password) return null;
      if (!ALLOWED_DOMAINS.some((domain) => hostnameMatches(url.hostname, domain))) return null;
      return url;
    } catch (_) {
      return null;
    }
  }

  function credentialsFor(url) {
    return hostnameMatches(url.hostname, 'max.ru') ? 'include' : 'omit';
  }

  function isAllowedContentType(value) {
    const mime = String(value || '').split(';')[0].trim().toLowerCase();
    return ALLOWED_MIME_TYPES.has(mime);
  }

  function isTrustedSender(sender, extensionId) {
    if (!sender || sender.id !== extensionId) return false;
    const source = sender.tab?.url || sender.url || '';
    try {
      const url = new URL(source);
      return url.protocol === 'https:' && url.hostname === 'web.max.ru';
    } catch (_) {
      return false;
    }
  }

  return {
    ALLOWED_DOMAINS,
    MAX_ATTACHMENT_BYTES,
    MAX_URL_CANDIDATES,
    MAX_URL_LENGTH,
    credentialsFor,
    hostnameMatches,
    isAllowedContentType,
    isTrustedSender,
    parseAllowedUrl
  };
}));
