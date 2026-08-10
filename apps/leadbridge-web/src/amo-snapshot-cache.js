(function initLeadBridgeAmoSnapshotCache(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LeadBridgeAmoSnapshotCache = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function amoSnapshotCacheFactory(root) {
  'use strict';

  const DB_NAME = 'leadbridge-kso-local';
  const DB_VERSION = 1;
  const META_STORE = 'amoSnapshotMeta';
  const ROW_STORE = 'amoSnapshotRows';
  const LATEST_KEY = 'latest';
  const CACHE_FORMAT_VERSION = 1;
  const ROWS_PER_CHUNK = 500;
  let databasePromise = null;

  function isSupported() {
    return !!(root && root.indexedDB && root.IDBKeyRange);
  }

  function partitionRows(rows, chunkSize = ROWS_PER_CHUNK) {
    const source = Array.isArray(rows) ? rows : [];
    const size = Math.max(1, Number(chunkSize) || ROWS_PER_CHUNK);
    const chunks = [];
    for (let index = 0; index < source.length; index += size) chunks.push(source.slice(index, index + size));
    return chunks;
  }

  function normalizeMeta(value) {
    if (!value || typeof value !== 'object') return null;
    const snapshotId = String(value.snapshotId || '');
    if (!snapshotId) return null;
    return {
      key: LATEST_KEY,
      snapshotId,
      formatVersion: Number(value.formatVersion || 0),
      createdAt: Number(value.createdAt || 0),
      fileName: String(value.fileName || ''),
      sizeBytes: Math.max(0, Number(value.sizeBytes || 0)),
      rowCount: Math.max(0, Number(value.rowCount || 0)),
      phoneCount: Math.max(0, Number(value.phoneCount || 0))
    };
  }

  function openDatabase() {
    if (!isSupported()) return Promise.reject(new Error('IndexedDB недоступен в этом браузере.'));
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = root.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(META_STORE)) database.createObjectStore(META_STORE, {keyPath: 'key'});
        if (!database.objectStoreNames.contains(ROW_STORE)) {
          const store = database.createObjectStore(ROW_STORE, {keyPath: ['snapshotId', 'index']});
          store.createIndex('snapshotId', 'snapshotId', {unique: false});
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        databasePromise = null;
        reject(request.error || new Error('Не удалось открыть локальное хранилище.'));
      };
      request.onblocked = () => {
        databasePromise = null;
        reject(new Error('Локальное хранилище заблокировано другой вкладкой LeadBridge.'));
      };
    });
    return databasePromise;
  }

  function transactionComplete(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Ошибка локального хранилища.'));
      transaction.onabort = () => reject(transaction.error || new Error('Запись в локальное хранилище отменена.'));
    });
  }

  async function getLatestMeta() {
    if (!isSupported()) return null;
    const database = await openDatabase();
    return await new Promise((resolve, reject) => {
      const request = database.transaction(META_STORE, 'readonly').objectStore(META_STORE).get(LATEST_KEY);
      request.onsuccess = () => resolve(normalizeMeta(request.result));
      request.onerror = () => reject(request.error || new Error('Не удалось прочитать сведения о слепке.'));
    });
  }

  async function putRecord(storeName, record) {
    const database = await openDatabase();
    const transaction = database.transaction(storeName, 'readwrite');
    const complete = transactionComplete(transaction);
    transaction.objectStore(storeName).put(record);
    await complete;
  }

  async function deleteSnapshotRows(snapshotId) {
    if (!snapshotId || !isSupported()) return;
    const database = await openDatabase();
    const transaction = database.transaction(ROW_STORE, 'readwrite');
    const complete = transactionComplete(transaction);
    const store = transaction.objectStore(ROW_STORE);
    const request = store.index('snapshotId').openKeyCursor(root.IDBKeyRange.only(snapshotId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
    await complete;
  }

  function createSnapshotId() {
    const random = root.crypto && typeof root.crypto.randomUUID === 'function'
      ? root.crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    return 'amo-' + Date.now() + '-' + random;
  }

  async function saveLatest(options) {
    if (!isSupported()) throw new Error('IndexedDB недоступен в этом браузере.');
    const rows = Array.isArray(options && options.rows) ? options.rows : [];
    if (!rows.length) throw new Error('Нельзя сохранить пустой слепок amoCRM.');
    const previous = await getLatestMeta();
    const snapshotId = createSnapshotId();
    const chunks = partitionRows(rows);
    try {
      for (let index = 0; index < chunks.length; index += 1) {
        await putRecord(ROW_STORE, {snapshotId, index, rows: chunks[index]});
      }
      const meta = normalizeMeta({
        snapshotId,
        formatVersion: CACHE_FORMAT_VERSION,
        createdAt: options.createdAt || Date.now(),
        fileName: options.fileName,
        sizeBytes: options.sizeBytes,
        rowCount: rows.length,
        phoneCount: options.phoneCount
      });
      await putRecord(META_STORE, meta);
      if (previous && previous.snapshotId !== snapshotId) {
        await deleteSnapshotRows(previous.snapshotId).catch(() => null);
      }
      return meta;
    } catch (error) {
      await deleteSnapshotRows(snapshotId).catch(() => null);
      throw error;
    }
  }

  async function readSnapshotRows(snapshotId) {
    const database = await openDatabase();
    const records = [];
    const transaction = database.transaction(ROW_STORE, 'readonly');
    const complete = transactionComplete(transaction);
    const request = transaction.objectStore(ROW_STORE).index('snapshotId').openCursor(root.IDBKeyRange.only(snapshotId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      records.push(cursor.value);
      cursor.continue();
    };
    await complete;
    records.sort((left, right) => Number(left.index || 0) - Number(right.index || 0));
    return records.flatMap(record => Array.isArray(record.rows) ? record.rows : []);
  }

  async function loadLatest() {
    const meta = await getLatestMeta();
    if (!meta) return null;
    if (meta.formatVersion !== CACHE_FORMAT_VERSION) throw new Error('Локальный слепок создан несовместимой версией LeadBridge. Обнови его через /exec.');
    const rows = await readSnapshotRows(meta.snapshotId);
    if (rows.length !== meta.rowCount) throw new Error('Локальный слепок повреждён или сохранён не полностью.');
    return {meta, rows};
  }

  async function deleteLatest() {
    const meta = await getLatestMeta();
    if (!meta) return false;
    const database = await openDatabase();
    const transaction = database.transaction(META_STORE, 'readwrite');
    const complete = transactionComplete(transaction);
    transaction.objectStore(META_STORE).delete(LATEST_KEY);
    await complete;
    await deleteSnapshotRows(meta.snapshotId).catch(() => null);
    return true;
  }

  async function requestPersistence() {
    const storage = root && root.navigator && root.navigator.storage;
    if (!storage || typeof storage.persist !== 'function') return false;
    try { return await storage.persist(); } catch (_) { return false; }
  }

  return {
    CACHE_FORMAT_VERSION,
    ROWS_PER_CHUNK,
    deleteLatest,
    getLatestMeta,
    isSupported,
    loadLatest,
    normalizeMeta,
    partitionRows,
    requestPersistence,
    saveLatest
  };
}));
