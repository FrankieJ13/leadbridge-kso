(function initLeadBridgeMatching(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LeadBridgeMatching = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function matchingFactory() {
  'use strict';

  function normalizeName(value) {
    return String(value || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
  }

  function splitClientNames(value) {
    return String(value || '')
      .split(/\s*(?:\/|;|\n)\s*/)
      .map((name) => name.trim())
      .filter(Boolean);
  }

  function uniqueClientNames(rows) {
    const names = [];
    const seen = new Set();
    (rows || []).forEach((row) => splitClientNames(row && row.fullName).forEach((name) => {
      const normalized = normalizeName(name);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      names.push(name);
    }));
    return names;
  }

  function clientNamePresentation(maxRows, amoRows) {
    const maxNames = uniqueClientNames(maxRows);
    const amoNames = uniqueClientNames(amoRows);
    const maxKeys = new Set(maxNames.map(normalizeName));
    const amoKeys = new Set(amoNames.map(normalizeName));
    const hasMismatch = Boolean(maxKeys.size && amoKeys.size && (
      maxKeys.size !== amoKeys.size
      || [...maxKeys].some((name) => !amoKeys.has(name))
      || [...amoKeys].some((name) => !maxKeys.has(name))
    ));
    return {
      primaryName: maxNames[0] || amoNames[0] || '',
      maxNames,
      amoNames,
      amoLine: hasMismatch ? amoNames.join(' / ') : '',
      hasMismatch
    };
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

  return { basicMatch, clientNamePresentation, groupByExactPhone, normalizeName, splitClientNames };
}));
