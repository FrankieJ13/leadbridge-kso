(function initMaxExporterMessageIdentity(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MaxExporterMessageIdentity = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function messageIdentityFactory() {
  'use strict';

  const EXPLICIT_ID_KEYS = new Set(['id', 'data-message-id', 'data-msg-id', 'data-id']);

  function stableMessageIdentity(linkInfo) {
    if (linkInfo?.url) return `url:${String(linkInfo.url)}`;
    const domIds = linkInfo?.domIds || {};
    for (const [rawKey, rawValue] of Object.entries(domIds)) {
      const key = String(rawKey || '').toLowerCase();
      const value = String(rawValue || '').trim();
      if (!value || key === 'data-testid' || key === 'aria-label') continue;
      if (EXPLICIT_ID_KEYS.has(key) || /(?:message|msg|item|entry).*(?:id|key)|(?:id|key).*(?:message|msg|item|entry)/i.test(key)) {
        return `dom:${key}:${value}`;
      }
    }
    return '';
  }

  function recordKeyForElement(element, linkInfo, elementKeys, nextElementId) {
    const stable = stableMessageIdentity(linkInfo);
    if (stable) return stable;
    if (elementKeys.has(element)) return elementKeys.get(element);
    const key = `element:${nextElementId()}`;
    elementKeys.set(element, key);
    return key;
  }

  return { stableMessageIdentity, recordKeyForElement };
}));
