(() => {
  'use strict';

  async function fetchOne(url) {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'force-cache',
      redirect: 'follow'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const mime = contentType.split(';')[0].trim() || 'application/octet-stream';
    return {
      dataUrl: `data:${mime};base64,${uint8ToBase64(bytes)}`,
      mime,
      byteLength: bytes.byteLength,
      finalUrl: response.url || url
    };
  }

  function uint8ToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'MAX_EXPORTER_FETCH_ATTACHMENT') return false;

    (async () => {
      const urls = Array.isArray(message.urls) ? message.urls : [message.url].filter(Boolean);
      const safeUrls = urls
        .map((url) => String(url || '').trim())
        .filter((url) => /^https?:\/\//i.test(url));

      let lastError = 'Нет подходящего URL';
      for (const url of safeUrls) {
        try {
          const result = await fetchOne(url);
          sendResponse({ ok: true, sourceUrl: url, ...result });
          return;
        } catch (error) {
          lastError = `${url}: ${error?.message || String(error)}`;
        }
      }

      sendResponse({ ok: false, error: lastError });
    })();

    return true;
  });
})();
