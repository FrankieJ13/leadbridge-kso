(function initMaxExporterOcrHost(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MaxExporterOcrHost = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMaxExporterOcrHost() {
  'use strict';

  const CLIENT_CHANNEL = 'leadbridge-ocr-client';
  const HOST_CHANNEL = 'leadbridge-ocr-host';
  let connectionPromise = null;
  let sequence = 0;

  function abortError() {
    const error = new Error('OCR остановлен пользователем.');
    error.name = 'AbortError';
    return error;
  }

  function randomToken() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function createConnection() {
    return new Promise((resolve, reject) => {
      const token = randomToken();
      const hostUrl = new URL(chrome.runtime.getURL('ocr_host.html'));
      hostUrl.hash = encodeURIComponent(token);
      const mount = document.createElement('span');
      mount.hidden = true;
      const shadow = mount.attachShadow({mode: 'closed'});
      const frame = document.createElement('iframe');
      frame.src = hostUrl.href;
      frame.hidden = true;
      frame.setAttribute('aria-hidden', 'true');
      shadow.append(frame);

      let settled = false;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        frame.remove();
        mount.remove();
        reject(error);
      };
      const timeout = setTimeout(() => fail(new Error('Встроенный OCR не запустился вовремя. Обнови расширение в chrome://extensions.')), 15_000);
      frame.addEventListener('error', () => {
        fail(new Error('Не удалось открыть внутренний OCR-модуль расширения.'));
      }, {once: true});
      frame.addEventListener('load', () => {
        const channel = new MessageChannel();
        const pending = new Map();
        const connection = {port: channel.port1, pending, frame, mount};
        channel.port1.onmessage = (event) => {
          const message = event.data || {};
          if (message.channel !== HOST_CHANNEL) return;
          if (message.type === 'ready') {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            resolve(connection);
            return;
          }
          const job = pending.get(String(message.id || ''));
          if (!job) return;
          if (message.type === 'progress') {
            job.onProgress(message.event || {});
          } else if (message.type === 'result') {
            pending.delete(message.id);
            job.cleanup();
            job.resolve(message.result);
          } else if (message.type === 'error') {
            pending.delete(message.id);
            job.cleanup();
            const error = new Error(message.error || 'Встроенный OCR завершился с ошибкой.');
            error.name = message.name || 'Error';
            job.reject(error);
          }
        };
        channel.port1.start();
        frame.contentWindow.postMessage({
          channel: CLIENT_CHANNEL,
          type: 'connect',
          token
        }, hostUrl.origin, [channel.port2]);
      }, {once: true});
      (document.documentElement || document.body).append(mount);
    });
  }

  async function connection() {
    if (!connectionPromise) connectionPromise = createConnection().catch((error) => {
      connectionPromise = null;
      throw error;
    });
    return connectionPromise;
  }

  async function processZip(archive, options = {}) {
    if (!(archive instanceof Blob)) throw new Error('Не выбран ZIP для OCR.');
    const signal = options.signal;
    if (signal?.aborted) throw abortError();
    const host = await connection();
    if (signal?.aborted) throw abortError();
    sequence += 1;
    const id = `ocr-${Date.now()}-${sequence}`;
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};

    return new Promise((resolve, reject) => {
      const abort = () => {
        host.port.postMessage({channel: CLIENT_CHANNEL, type: 'abort', id});
        host.pending.delete(id);
        cleanup();
        reject(abortError());
      };
      const cleanup = () => signal?.removeEventListener('abort', abort);
      host.pending.set(id, {resolve, reject, cleanup, onProgress});
      signal?.addEventListener('abort', abort, {once: true});
      host.port.postMessage({
        channel: CLIENT_CHANNEL,
        type: 'process',
        id,
        archive,
        archiveName: String(options.archiveName || '')
      });
    });
  }

  return {processZip};
});
