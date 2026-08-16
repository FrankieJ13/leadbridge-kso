(function initMaxExporterMessageIdentity(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MaxExporterMessageIdentity = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function messageIdentityFactory() {
  'use strict';

  const EXPLICIT_ID_KEYS = new Set(['id', 'data-message-id', 'data-msg-id', 'data-id']);

  function stableMessageIdentity(linkInfo) {
    if (linkInfo?.url) return `url:${String(linkInfo.url)}`;
    const domIds = linkInfo?.domIds || {};
    for (const [rawKey, rawValue] of Object.entries(domIds)) {
      const key = String(rawKey || '').toLowerCase();
      const value = String(rawValue || '').trim();
      if (!value || key === 'data-testid' || key === 'aria-label') continue;
      if (EXPLICIT_ID_KEYS.has(key) || /(?:message|msg|item|entry).*(?:id|key)|(?:id|key).*(?:message|msg|item|entry)/i.test(key)) {
        return `dom:${key}:${value}`;
      }
    }
    return '';
  }

  function recordKeyForElement(element, linkInfo, elementKeys, nextElementId) {
    const stable = stableMessageIdentity(linkInfo);
    if (stable) return stable;
    if (elementKeys.has(element)) return elementKeys.get(element);
    const key = `element:${nextElementId()}`;
    elementKeys.set(element, key);
    return key;
  }

  function reconcileViewport(previousValue, currentValue, nextRecordKey) {
    const previous = Array.isArray(previousValue) ? previousValue : [];
    const current = (Array.isArray(currentValue) ? currentValue : []).map((entry) => ({
      ...entry,
      recordKey: String(entry.recordKey || entry.stableKey || '')
    }));
    const usedPrevious = new Set();

    current.forEach((entry) => {
      if (!entry.recordKey) return;
      const index = previous.findIndex((candidate, candidateIndex) => (
        !usedPrevious.has(candidateIndex) && candidate.recordKey === entry.recordKey
      ));
      if (index >= 0) usedPrevious.add(index);
    });

    const previousIndexes = previous
      .map((entry, index) => ({entry, index}))
      .filter(({entry, index}) => !usedPrevious.has(index) && entry.fingerprint);
    const currentIndexes = current
      .map((entry, index) => ({entry, index}))
      .filter(({entry}) => !entry.recordKey && entry.fingerprint);

    const rows = previousIndexes.length;
    const columns = currentIndexes.length;
    const lcs = Array.from({length: rows + 1}, () => new Uint16Array(columns + 1));
    for (let row = rows - 1; row >= 0; row -= 1) {
      for (let column = columns - 1; column >= 0; column -= 1) {
        lcs[row][column] = previousIndexes[row].entry.fingerprint === currentIndexes[column].entry.fingerprint
          ? lcs[row + 1][column + 1] + 1
          : Math.max(lcs[row + 1][column], lcs[row][column + 1]);
      }
    }

    let row = 0;
    let column = 0;
    while (row < rows && column < columns) {
      const previousItem = previousIndexes[row];
      const currentItem = currentIndexes[column];
      if (previousItem.entry.fingerprint === currentItem.entry.fingerprint) {
        current[currentItem.index].recordKey = previousItem.entry.recordKey;
        usedPrevious.add(previousItem.index);
        row += 1;
        column += 1;
      } else if (lcs[row + 1][column] >= lcs[row][column + 1]) {
        row += 1;
      } else {
        column += 1;
      }
    }

    current.forEach((entry) => {
      if (!entry.recordKey) entry.recordKey = nextRecordKey();
    });
    return current;
  }

  return { reconcileViewport, stableMessageIdentity, recordKeyForElement };
}));
