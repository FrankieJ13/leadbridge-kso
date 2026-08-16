importScripts('url_policy.js');

(() => {
  'use strict';

  const policy = MaxExporterUrlPolicy;

  function uint8ToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  async function readLimitedBytes(response) {
    if (!response.body?.getReader) {
      const fallback = new Uint8Array(await response.arrayBuffer());
      if (fallback.byteLength > policy.MAX_ATTACHMENT_BYTES) throw new Error('attachment is too large');
      return fallback;
    }
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > policy.MAX_ATTACHMENT_BYTES) {
          await reader.cancel('attachment size limit exceeded');
          throw new Error('attachment is too large');
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

  async function fetchOne(url) {
    let currentUrl = url;
    let response;
    for (let redirectCount = 0; redirectCount <= policy.MAX_REDIRECTS; redirectCount += 1) {
      response = await fetch(currentUrl.href, {
        method: 'GET',
        credentials: policy.credentialsFor(currentUrl),
        cache: 'force-cache',
        redirect: 'manual'
      });
      if (response.status < 300 || response.status >= 400) break;
      if (redirectCount === policy.MAX_REDIRECTS) throw new Error('too many redirects');
      const nextUrl = policy.parseAllowedRedirect(response.headers.get('location'), currentUrl);
      if (!nextUrl) throw new Error('redirect target is not allowed');
      currentUrl = nextUrl;
    }

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const finalUrl = policy.parseAllowedUrl(response.url || currentUrl.href);
    if (!finalUrl) throw new Error('redirect target is not allowed');

    const contentType = response.headers.get('content-type') || '';
    if (!policy.isAllowedContentType(contentType)) throw new Error('unsupported attachment content type');

    const declaredSize = Number(response.headers.get('content-length') || 0);
    if (declaredSize > policy.MAX_ATTACHMENT_BYTES) throw new Error('attachment is too large');

    const bytes = await readLimitedBytes(response);
    const mime = contentType.split(';')[0].trim().toLowerCase();
    return {
      dataUrl: `data:${mime};base64,${uint8ToBase64(bytes)}`,
      mime,
      byteLength: bytes.byteLength,
      finalUrl: finalUrl.href
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'MAX_EXPORTER_FETCH_ATTACHMENT') return false;
    if (!policy.isTrustedSender(sender, chrome.runtime.id)) {
      sendResponse({ ok: false, error: 'Недоверенный источник запроса' });
      return false;
    }

    (async () => {
      const candidates = (Array.isArray(message.urls) ? message.urls : [message.url])
        .slice(0, policy.MAX_URL_CANDIDATES)
        .map(policy.parseAllowedUrl)
        .filter(Boolean);

      let lastError = 'Нет разрешённого HTTPS URL MAX/CDN';
      for (const url of candidates) {
        try {
          const result = await fetchOne(url);
          sendResponse({ ok: true, sourceUrl: url.href, ...result });
          return;
        } catch (error) {
          lastError = `${url.hostname}: ${error?.message || String(error)}`;
        }
      }
      sendResponse({ ok: false, error: lastError });
    })();

    return true;
  });
})();
