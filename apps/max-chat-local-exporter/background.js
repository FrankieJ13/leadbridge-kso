importScripts('url_policy.js');
importScripts('ocr_bridge_policy.js');

(() => {
  'use strict';

  const policy = MaxExporterUrlPolicy;
  const ocrPolicy = MaxExporterOcrPolicy;
  const OCR_PENDING_KEY = 'maxExporterPendingOcrDownloads';
  const processingDownloads = new Set();

  async function readPendingDownloads() {
    const stored = await chrome.storage.local.get(OCR_PENDING_KEY);
    return stored[OCR_PENDING_KEY] && typeof stored[OCR_PENDING_KEY] === 'object'
      ? stored[OCR_PENDING_KEY]
      : {};
  }

  async function writePendingDownloads(pending) {
    await chrome.storage.local.set({ [OCR_PENDING_KEY]: pending });
  }

  async function rememberPendingDownload(downloadId, item) {
    const pending = await readPendingDownloads();
    pending[String(downloadId)] = item;
    await writePendingDownloads(pending);
  }

  async function takePendingDownload(downloadId) {
    const pending = await readPendingDownloads();
    const key = String(downloadId);
    const item = pending[key] || null;
    if (item) {
      delete pending[key];
      await writePendingDownloads(pending);
    }
    return item;
  }

  function notifyOcrStatus(tabId, text, kind = 'info') {
    if (!Number.isInteger(tabId)) return;
    chrome.tabs.sendMessage(tabId, {
      type: 'MAX_EXPORTER_OCR_STATUS',
      text,
      kind
    }).catch(() => {});
  }

  async function callLocalOcrBridge(request) {
    const response = await fetch(request.url, {
      ...request.options,
      targetAddressSpace: 'local'
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || `OCR-мост вернул HTTP ${response.status}`);
    }
    return payload;
  }

  async function launchLocalOcr(filename) {
    return callLocalOcrBridge(ocrPolicy.ocrRequest(filename));
  }

  async function pickAndLaunchLocalOcr(sender) {
    if (!policy.isTrustedSender(sender, chrome.runtime.id)) throw new Error('Недоверенный источник запроса');
    return callLocalOcrBridge(ocrPolicy.ocrPickRequest());
  }

  async function processCompletedOcrDownload(downloadId) {
    if (processingDownloads.has(downloadId)) return;
    processingDownloads.add(downloadId);
    try {
      const pending = await takePendingDownload(downloadId);
      if (!pending) return;
      const [download] = await chrome.downloads.search({ id: downloadId });
      if (!download || download.state !== 'complete' || !download.filename) {
        notifyOcrStatus(pending.tabId, 'Архив не был сохранён. OCR не запущен.', 'error');
        return;
      }
      try {
        const result = await launchLocalOcr(download.filename);
        notifyOcrStatus(
          pending.tabId,
          `OCR запущен.\nАрхив: ${pending.filename}\nРезультат появится в ${result.outputDir || 'LeadBridgeKSO/ocr_results'}.`,
          'success'
        );
      } catch (error) {
        notifyOcrStatus(
          pending.tabId,
          `Архив скачан, но OCR не запущен.\n${error?.message || String(error)}\nПереустанови пакет LeadBridge KSO, чтобы включить локальный OCR-мост.`,
          'error'
        );
      }
    } finally {
      processingDownloads.delete(downloadId);
    }
  }

  async function startOcrDownload(message, sender) {
    if (!policy.isTrustedSender(sender, chrome.runtime.id)) throw new Error('Недоверенный источник запроса');
    const filename = ocrPolicy.sanitizeArchiveName(message.filename);
    if (!filename) throw new Error('Недопустимое имя OCR-архива');
    if (!ocrPolicy.isTrustedExportBlob(message.url)) throw new Error('Недопустимый источник OCR-архива');

    const downloadId = await chrome.downloads.download({
      url: message.url,
      filename,
      conflictAction: 'uniquify',
      saveAs: false
    });
    await rememberPendingDownload(downloadId, {
      tabId: sender.tab?.id,
      filename,
      createdAt: new Date().toISOString()
    });

    const [download] = await chrome.downloads.search({ id: downloadId });
    if (download?.state === 'complete') processCompletedOcrDownload(downloadId);
    return { ok: true, downloadId, message: 'Архив сохраняется. После загрузки OCR запустится автоматически.' };
  }

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
    if (message?.type === 'MAX_EXPORTER_PICK_AND_OCR') {
      pickAndLaunchLocalOcr(sender)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;
    }

    if (message?.type === 'MAX_EXPORTER_DOWNLOAD_AND_OCR') {
      startOcrDownload(message, sender)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
      return true;
    }

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

  chrome.downloads.onChanged.addListener((delta) => {
    if (delta.state?.current === 'complete') {
      processCompletedOcrDownload(delta.id).catch(() => {});
      return;
    }
    if (delta.state?.current === 'interrupted') {
      takePendingDownload(delta.id).then((pending) => {
        if (pending) notifyOcrStatus(pending.tabId, 'Скачивание архива прервано. OCR не запущен.', 'error');
      }).catch(() => {});
    }
  });

  async function resumePendingDownloads() {
    const pending = await readPendingDownloads();
    for (const key of Object.keys(pending)) {
      const downloadId = Number(key);
      if (!Number.isInteger(downloadId)) continue;
      const [download] = await chrome.downloads.search({ id: downloadId });
      if (download?.state === 'complete') processCompletedOcrDownload(downloadId);
      if (!download || download.state === 'interrupted') {
        const item = await takePendingDownload(downloadId);
        if (item) notifyOcrStatus(item.tabId, 'Скачивание архива не завершено. OCR не запущен.', 'error');
      }
    }
  }

  resumePendingDownloads().catch(() => {});
})();
