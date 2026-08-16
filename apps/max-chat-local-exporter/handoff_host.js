(() => {
  'use strict';

  const CLIENT_CHANNEL = 'leadbridge-handoff-client';
  const HOST_CHANNEL = 'leadbridge-handoff-host';
  const ONLINE_ORIGIN = 'https://frankiej13.github.io';
  const expectedToken = decodeURIComponent(location.hash.slice(1));
  let connected = false;

  function send(port, message) {
    port.postMessage({channel: HOST_CHANNEL, ...message});
  }

  function allowedParentOrigin(origin) {
    return origin === ONLINE_ORIGIN || origin === location.origin;
  }

  function connect(port) {
    port.onmessage = async (event) => {
      const message = event.data || {};
      if (message.channel !== CLIENT_CHANNEL) return;
      const id = String(message.id || '');
      if (message.type === 'get') {
        try {
          const record = await MaxExporterHandoffStore.get(id);
          if (!record) throw new Error('Временные файлы OCR не найдены или уже были открыты.');
          send(port, {
            type: 'payload',
            id,
            payload: {
              maxBlob: record.maxBlob,
              maxName: record.maxName,
              zipBlob: record.zipBlob,
              zipName: record.zipName
            }
          });
        } catch (error) {
          send(port, {type: 'error', id, error: error?.message || String(error)});
        }
      } else if (message.type === 'ack') {
        await MaxExporterHandoffStore.remove(id).catch(() => {});
        send(port, {type: 'removed', id});
      }
    };
    port.start();
    send(port, {type: 'ready'});
  }

  window.addEventListener('message', (event) => {
    const message = event.data || {};
    if (!expectedToken || connected || event.source !== parent || !allowedParentOrigin(event.origin)) return;
    if (message.channel !== CLIENT_CHANNEL || message.type !== 'connect' || message.token !== expectedToken) return;
    const port = event.ports?.[0];
    if (!port) return;
    connected = true;
    connect(port);
  });
})();
