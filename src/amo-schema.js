(function initLeadBridgeAmoSchema(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LeadBridgeAmoSchema = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function amoSchemaFactory() {
  'use strict';

  function key(value) {
    const raw = String(value || '').trim();
    if (raw === '-') return '-';
    return raw.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
  }

  function first(headers, names) {
    const wanted = names.map(key);
    const index = headers.findIndex((header) => wanted.includes(key(header)));
    return index;
  }

  function phoneColumns(headers) {
    const indexes = [];
    headers.forEach((header, index) => {
      const value = key(header);
      if (/^(?:(?:мобильный|рабочий|домашний) )?телефон(?: \d+)?$/.test(value) || /^phone(?: \d+)?$/.test(value)) {
        indexes.push(index);
      }
    });
    return indexes;
  }

  function resolve(headersValue) {
    const headers = Array.isArray(headersValue) ? headersValue : [];
    return {
      id: first(headers, ['ID', '-']),
      responsible: first(headers, ['Ответственный', 'CRM Ответственный']),
      createdAt: first(headers, ['Дата создания сделки', 'Дата создания']),
      closedAt: first(headers, ['Дата закрытия']),
      tags: first(headers, ['Теги']),
      stage: first(headers, ['Этап', 'Статус сделки']),
      pipeline: first(headers, ['Воронка']),
      fullName: first(headers, ['Полное имя контакта', 'ФИО', 'ФИО контакта']),
      visitDate: first(headers, ['Дата визита']),
      city: first(headers, ['Город']),
      region: first(headers, ['REGION TIME - Область или город', 'Регион']),
      closeReason: first(headers, ['Причина закрытия карточки']),
      closeReasonOld: first(headers, ['Причина отказа old']),
      comment: first(headers, ['Комментарий']),
      phones: phoneColumns(headers)
    };
  }

  function validate(columns) {
    const missing = [];
    if (!columns || columns.id < 0) missing.push('ID сделки');
    if (!columns || !Array.isArray(columns.phones) || !columns.phones.length) missing.push('Телефон');
    return missing;
  }

  return { key, phoneColumns, resolve, validate };
}));
