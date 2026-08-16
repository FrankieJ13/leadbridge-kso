(() => {
  'use strict';

  const CLIENT_CHANNEL = 'leadbridge-handoff-client';
  const HOST_CHANNEL = 'leadbridge-handoff-host';

  function handoffId() {
    const params = new URLSearchParams(location.hash.replace(/^#/, ''));
    const id = params.get('leadbridge_handoff') || '';
    return /^[a-f0-9]{48}$/.test(id) ? id : '';
  }

  function randomToken() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function waitFor(check, timeoutMs, errorText) {
    const startedAt = Date.now();
    return new Promise((resolve, reject) => {
      const poll = () => {
        const value = check();
        if (value) {
          resolve(value);
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(errorText));
          return;
        }
        setTimeout(poll, 100);
      };
      poll();
    });
  }

  function setNotice(text, bad = false) {
    const notice = document.querySelector('#notice');
    const title = document.querySelector('#noticeTitle');
    const copy = document.querySelector('#noticeCopy');
    if (notice) notice.className = bad ? 'notice bad' : 'notice';
    if (title) title.textContent = bad ? 'Внимание' : 'Загрузки';
    if (copy) copy.textContent = text;
  }

  function assignFile(input, blob, name, type) {
    if (!(blob instanceof Blob)) throw new Error(`Файл ${name} отсутствует во временном хранилище.`);
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], name, {type, lastModified: Date.now()}));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', {bubbles: true}));
  }

  async function attachFiles(payload) {
    const maxInput = await waitFor(
      () => document.querySelector('#fileMax'),
      15_000,
      'LeadBridge не показал поле Источник 1.'
    );
    const zipInput = await waitFor(
      () => document.querySelector('#fileZip'),
      15_000,
      'LeadBridge не показал поле исходного ZIP.'
    );
    setNotice('Подставляю messages_ocr.json и исходный ZIP MAX...');
    assignFile(maxInput, payload.maxBlob, payload.maxName || 'messages_ocr.json', 'application/json');
    await waitFor(
      () => document.querySelector('#infoMax')?.textContent?.includes(payload.maxName || 'messages_ocr.json'),
      120_000,
      'LeadBridge не успел прочитать messages_ocr.json.'
    );
    assignFile(zipInput, payload.zipBlob, payload.zipName || 'MAX_CHAT_EXPORT.zip', 'application/zip');
    await waitFor(
      () => document.querySelector('#infoImages')?.textContent?.trim()?.startsWith('OK:'),
      10 * 60_000,
      'LeadBridge не успел прочитать исходный ZIP MAX.'
    );
    setNotice('MAX и исходный ZIP уже загружены. Осталось выбрать Источник 2: amoCRM CSV или онлайн /exec.');
  }

  function removeHandoffHash() {
    try {
      history.replaceState(null, '', `${location.pathname}${location.search}`);
    } catch (_) {
      // The handoff is already one-time and contains no user data.
    }
  }

  async function start(id) {
    const token = randomToken();
    const hostUrl = new URL(chrome.runtime.getURL('handoff_host.html'));
    hostUrl.hash = encodeURIComponent(token);
    const mount = document.createElement('span');
    mount.hidden = true;
    const shadow = mount.attachShadow({mode: 'closed'});
    const frame = document.createElement('iframe');
    frame.src = hostUrl.href;
    frame.hidden = true;
    frame.setAttribute('aria-hidden', 'true');
    shadow.append(frame);
    (document.documentElement || document.body).append(mount);

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Внутренний канал передачи файлов не запустился.')), 15_000);
      frame.addEventListener('error', () => {
        clearTimeout(timeout);
        reject(new Error('Не удалось открыть внутренний канал передачи файлов.'));
      }, {once: true});
      frame.addEventListener('load', () => {
        const channel = new MessageChannel();
        channel.port1.onmessage = async (event) => {
          const message = event.data || {};
          if (message.channel !== HOST_CHANNEL) return;
          if (message.type === 'ready') {
            channel.port1.postMessage({channel: CLIENT_CHANNEL, type: 'get', id});
          } else if (message.type === 'payload' && message.id === id) {
            clearTimeout(timeout);
            try {
              await attachFiles(message.payload || {});
              channel.port1.postMessage({channel: CLIENT_CHANNEL, type: 'ack', id});
              removeHandoffHash();
              resolve();
            } catch (error) {
              reject(error);
            }
          } else if (message.type === 'error' && message.id === id) {
            clearTimeout(timeout);
            reject(new Error(message.error || 'Не удалось получить временные файлы OCR.'));
          }
        };
        channel.port1.start();
        frame.contentWindow.postMessage({channel: CLIENT_CHANNEL, type: 'connect', token}, hostUrl.origin, [channel.port2]);
      }, {once: true});
    });
  }

  const id = handoffId();
  if (!id || !globalThis.chrome?.runtime?.getURL) return;
  start(id).catch((error) => {
    setNotice(`Не удалось автоматически подставить файлы: ${error?.message || String(error)}. Вернись в MAX и повтори открытие LeadBridge.`, true);
  });
})();
