(function initMaxExporterHandoffStore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MaxExporterHandoffStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMaxExporterHandoffStore() {
  'use strict';

  const DB_NAME = 'leadbridge-max-exporter';
  const STORE_NAME = 'ocr-handoffs';
  const DB_VERSION = 1;
  const MAX_AGE_MS = 24 * 60 * 60 * 1000;

  function randomId() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, {keyPath: 'id'});
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Не удалось открыть временное хранилище OCR.'));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Ошибка временного хранилища OCR.'));
      transaction.onabort = () => reject(transaction.error || new Error('Запись OCR была отменена браузером.'));
    });
  }

  async function purgeExpired(database, now = Date.now()) {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (now - Number(cursor.value?.createdAt || 0) > MAX_AGE_MS) cursor.delete();
      cursor.continue();
    };
    await transactionDone(transaction);
  }

  async function save({archive, archiveName, result, resultName = 'messages_ocr.json'}) {
    if (!(archive instanceof Blob)) throw new Error('Исходный ZIP недоступен для передачи в LeadBridge.');
    if (!result || typeof result !== 'object') throw new Error('Результат OCR недоступен для передачи в LeadBridge.');
    const database = await openDatabase();
    try {
      await navigator.storage?.persist?.().catch(() => false);
      await purgeExpired(database).catch(() => {});
      const id = randomId();
      const maxBlob = new Blob([JSON.stringify(result, null, 2)], {type: 'application/json;charset=utf-8'});
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put({
        id,
        createdAt: Date.now(),
        maxBlob,
        maxName: String(resultName || 'messages_ocr.json'),
        zipBlob: archive,
        zipName: String(archiveName || 'MAX_CHAT_EXPORT.zip')
      });
      await transactionDone(transaction);
      return id;
    } finally {
      database.close();
    }
  }

  async function get(id) {
    if (!/^[a-f0-9]{48}$/.test(String(id || ''))) return null;
    const database = await openDatabase();
    try {
      await purgeExpired(database).catch(() => {});
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const done = transactionDone(transaction);
      const request = transaction.objectStore(STORE_NAME).get(String(id));
      const result = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('Не удалось прочитать результат OCR.'));
      });
      await done;
      return result;
    } finally {
      database.close();
    }
  }

  async function remove(id) {
    if (!/^[a-f0-9]{48}$/.test(String(id || ''))) return;
    const database = await openDatabase();
    try {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(String(id));
      await transactionDone(transaction);
    } finally {
      database.close();
    }
  }

  return {save, get, remove};
});
