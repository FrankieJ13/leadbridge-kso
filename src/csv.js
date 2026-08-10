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

  async function parseCsvChunks(chunks, handlers = {}, clean = (value) => String(value ?? '').trim()) {
    const maxDelimiterSample = 256 * 1024;
    let delimiter = null;
    let sample = '';
    let headers = null;
    let dataRows = 0;
    let row = [];
    let cell = '';
    let quoted = false;
    let pendingQuote = false;
    let firstChunk = true;

    const emitRecord = (cells) => {
      if (!cells.some((value) => String(value).trim() !== '')) return;
      if (!headers) {
        headers = cells.map(clean);
        if (handlers.onHeaders) handlers.onHeaders(headers, delimiter);
        return;
      }
      const cleaned = cells.map(clean);
      if (!cleaned.some(Boolean)) return;
      const record = { __cells: cleaned, __rownum: dataRows + 2 };
      if (handlers.onRow) handlers.onRow(record, dataRows);
      dataRows += 1;
    };

    const consume = (text) => {
      const source = String(text || '');
      for (let i = 0; i < source.length; i += 1) {
        const char = source[i];
        const next = source[i + 1];
        if (pendingQuote) {
          if (char === '"') {
            cell += '"';
            pendingQuote = false;
            continue;
          }
          pendingQuote = false;
          quoted = false;
        }
        if (char === '"') {
          if (quoted && next === '"') { cell += '"'; i += 1; }
          else if (quoted && i === source.length - 1) pendingQuote = true;
          else quoted = !quoted;
        } else if (char === delimiter && !quoted) {
          row.push(cell); cell = '';
        } else if ((char === '\n' || char === '\r') && !quoted) {
          row.push(cell); cell = '';
          emitRecord(row);
          row = [];
          if (char === '\r' && next === '\n') i += 1;
        } else {
          cell += char;
        }
      }
    };

    for await (const rawChunk of chunks) {
      const chunk = typeof rawChunk === 'string' ? { text: rawChunk } : (rawChunk || {});
      let text = String(chunk.text || '');
      if (firstChunk) {
        text = text.replace(/^\uFEFF/, '');
        firstChunk = false;
      }
      if (delimiter === null) {
        sample += text;
        if (!/[\r\n]/.test(sample) && sample.length < maxDelimiterSample) {
          if (handlers.onProgress) handlers.onProgress({ loaded: chunk.loaded || 0, total: chunk.total || 0, rows: dataRows });
          continue;
        }
        delimiter = detectDelimiter(sample);
        consume(sample);
        sample = '';
      } else {
        consume(text);
      }
      if (handlers.onProgress) handlers.onProgress({ loaded: chunk.loaded || 0, total: chunk.total || 0, rows: dataRows });
    }

    if (delimiter === null) {
      delimiter = detectDelimiter(sample);
      consume(sample);
    }
    if (pendingQuote) {
      pendingQuote = false;
      quoted = false;
    }
    row.push(cell);
    emitRecord(row);
    return { headers: headers || [], delimiter, rows: dataRows };
  }

  return { detectDelimiter, parseCsv, parseCsvChunks };
}));
