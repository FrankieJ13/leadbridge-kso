(function initLeadBridgeCsv(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LeadBridgeCsv = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function csvFactory() {
  'use strict';

  function detectDelimiter(text) {
    const value = String(text || '').replace(/^\uFEFF/, '');
    const firstLine = value.slice(0, value.indexOf('\n') === -1 ? value.length : value.indexOf('\n')).replace(/\r$/, '');
    const counts = { ',': 0, ';': 0, '\t': 0 };
    let quoted = false;
    for (let i = 0; i < firstLine.length; i += 1) {
      const char = firstLine[i];
      if (char === '"') {
        if (quoted && firstLine[i + 1] === '"') i += 1;
        else quoted = !quoted;
      } else if (!quoted && Object.prototype.hasOwnProperty.call(counts, char)) counts[char] += 1;
    }
    return counts['\t'] > counts[','] && counts['\t'] > counts[';'] ? '\t' : (counts[';'] > counts[','] ? ';' : ',');
  }

  function parseCsv(text, clean = (value) => String(value ?? '').trim()) {
    const source = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (!source.trim()) return { headers: [], rows: [], delimiter: ',' };
    const delimiter = detectDelimiter(source);
    const records = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < source.length; i += 1) {
      const char = source[i];
      if (char === '"') {
        if (quoted && source[i + 1] === '"') { cell += '"'; i += 1; }
        else quoted = !quoted;
      } else if (char === delimiter && !quoted) {
        row.push(cell); cell = '';
      } else if (char === '\n' && !quoted) {
        row.push(cell); cell = '';
        if (row.some((value) => String(value).trim() !== '')) records.push(row);
        row = [];
      } else cell += char;
    }
    row.push(cell);
    if (row.some((value) => String(value).trim() !== '')) records.push(row);
    if (!records.length) return { headers: [], rows: [], delimiter };
    return {
      headers: records[0].map(clean),
      rows: records.slice(1)
        .map((cells, index) => ({ __cells: cells.map(clean), __rownum: index + 2 }))
        .filter((record) => record.__cells.some(Boolean)),
      delimiter
    };
  }

  return { detectDelimiter, parseCsv };
}));
