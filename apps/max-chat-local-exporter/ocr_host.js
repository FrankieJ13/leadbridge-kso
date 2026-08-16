(() => {
  'use strict';

  const CLIENT_CHANNEL = 'leadbridge-ocr-client';
  const HOST_CHANNEL = 'leadbridge-ocr-host';
  const ALLOWED_PARENT_ORIGIN = 'https://web.max.ru';
  const expectedToken = decodeURIComponent(location.hash.slice(1));
  const jobs = new Map();
  let connected = false;

  function send(port, message) {
    port.postMessage({channel: HOST_CHANNEL, ...message});
  }

  async function processArchive(port, message) {
    const id = String(message.id || '');
    if (!id || jobs.has(id)) return;
    const controller = new AbortController();
    jobs.set(id, controller);
    try {
      const result = await MaxExporterBrowserOcr.processZip(message.archive, {
        signal: controller.signal,
        getURL: (path) => chrome.runtime.getURL(path),
        onProgress: (event) => send(port, {type: 'progress', id, event})
      });
      let handoffId = '';
      let handoffError = '';
      try {
        handoffId = await MaxExporterHandoffStore.save({
          archive: message.archive,
          archiveName: String(message.archiveName || ''),
          result: result.data,
          resultName: result.filename
        });
      } catch (error) {
        handoffError = error?.message || String(error);
      }
      result.handoffId = handoffId;
      result.handoffError = handoffError;
      send(port, {type: 'result', id, result});
    } catch (error) {
      send(port, {
        type: 'error',
        id,
        name: error?.name || 'Error',
        error: error?.message || String(error)
      });
    } finally {
      jobs.delete(id);
    }
  }

  function connect(port) {
    port.onmessage = (event) => {
      const message = event.data || {};
      if (message.channel !== CLIENT_CHANNEL) return;
      if (message.type === 'process') {
        processArchive(port, message);
      } else if (message.type === 'abort') {
        jobs.get(String(message.id || ''))?.abort();
      }
    };
    port.start();
    send(port, {type: 'ready'});
  }

  window.addEventListener('message', (event) => {
    const message = event.data || {};
    if (!expectedToken) return;
    if (connected || event.source !== parent || event.origin !== ALLOWED_PARENT_ORIGIN) return;
    if (message.channel !== CLIENT_CHANNEL || message.type !== 'connect' || message.token !== expectedToken) return;
    const port = event.ports?.[0];
    if (!port) return;
    connected = true;
    connect(port);
  });
})();
