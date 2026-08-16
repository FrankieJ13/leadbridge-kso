(function initMaxExporterOcrPolicy(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MaxExporterOcrPolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMaxExporterOcrPolicy() {
  'use strict';

  const BRIDGE_RUN_URL = 'http://127.0.0.1:17848/run';
  const BRIDGE_HEADER = 'leadbridge-kso-ocr-v1';
  const EXPORT_ARCHIVE_RE = /^MAX_CHAT_EXPORT_\d+msg_\d+att_\d{2}-\d{2}-\d{2}_\d{2}-\d{2}(?: \(\d+\))?\.zip$/;

  function sanitizeArchiveName(value) {
    const name = String(value || '').trim();
    if (!name || name.includes('/') || name.includes('\\') || !EXPORT_ARCHIVE_RE.test(name)) return '';
    return name;
  }

  function isTrustedExportBlob(value) {
    const url = String(value || '');
    return /^blob:https:\/\/web\.max\.ru\/[0-9a-f-]+$/i.test(url);
  }

  function ocrRequest(filename) {
    return {
      url: BRIDGE_RUN_URL,
      options: {
        method: 'POST',
        cache: 'no-store',
        credentials: 'omit',
        headers: {
          'Content-Type': 'application/json',
          'X-LeadBridge-Bridge': BRIDGE_HEADER
        },
        body: JSON.stringify({ path: filename })
      }
    };
  }

  return {
    BRIDGE_RUN_URL,
    BRIDGE_HEADER,
    EXPORT_ARCHIVE_RE,
    sanitizeArchiveName,
    isTrustedExportBlob,
    ocrRequest
  };
});
