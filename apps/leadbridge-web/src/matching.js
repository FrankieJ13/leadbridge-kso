(function initLeadBridgeMatching(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LeadBridgeMatching = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function matchingFactory() {
  'use strict';

  function normalizeName(value) {
    return String(value || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
  }

  function groupByExactPhone(maxRows, amoRows) {
    const map = new Map();
    const add = (phone, side, row) => {
      if (!map.has(phone)) map.set(phone, { phone, max: [], amoAll: [], amo: [] });
      map.get(phone)[side].push(row);
    };
    (maxRows || []).forEach((row) => (row.phones || []).forEach((phone) => add(phone, 'max', row)));
    (amoRows || []).forEach((row) => (row.phones || []).forEach((phone) => add(phone, 'amoAll', row)));
    return map;
  }

  function basicMatch(maxRows, amoRows) {
    const map = groupByExactPhone(maxRows, amoRows);
    const matches = [...map.values()].filter((group) => group.max.length && group.amoAll.length);
    const matchedPhones = new Set(matches.map((group) => group.phone));
    return {
      matches,
      unmatchedMax: (maxRows || []).filter((row) => !(row.phones || []).some((phone) => matchedPhones.has(phone))),
      unmatchedAmo: (amoRows || []).filter((row) => !(row.phones || []).some((phone) => matchedPhones.has(phone)))
    };
  }

  return { basicMatch, groupByExactPhone, normalizeName };
}));
