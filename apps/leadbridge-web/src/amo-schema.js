(function initLeadBridgeAmoSchema(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LeadBridgeAmoSchema = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function amoSchemaFactory() {
  'use strict';

  function key(value) {
    return String(value || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
  }

  function first(headers, names, fallback) {
    const wanted = names.map(key);
    const index = headers.findIndex((header) => wanted.includes(key(header)));
    return index === -1 ? fallback : index;
  }

  function phoneColumns(headers) {
    const indexes = [];
    headers.forEach((header, index) => {
      const value = key(header);
      if (/^(?:(?:мобильный|рабочий|домашний) )?телефон(?: \d+)?$/.test(value) || /^phone(?: \d+)?$/.test(value)) {
        indexes.push(index);
      }
    });
    return indexes.length ? indexes : [21, 22, 23, 24, 25, 26, 30, 100];
  }

  function resolve(headersValue) {
    const headers = Array.isArray(headersValue) ? headersValue : [];
    return {
      id: first(headers, ['ID', '-'], 0),
      responsible: first(headers, ['Ответственный', 'CRM Ответственный'], 3),
      createdAt: first(headers, ['Дата создания сделки', 'Дата создания'], 4),
      closedAt: first(headers, ['Дата закрытия'], 8),
      tags: first(headers, ['Теги'], 9),
      stage: first(headers, ['Этап', 'Статус сделки'], 15),
      pipeline: first(headers, ['Воронка'], 16),
      fullName: first(headers, ['Полное имя контакта', 'ФИО', 'ФИО контакта'], 17),
      visitDate: first(headers, ['Дата визита'], 78),
      city: first(headers, ['Город'], 73),
      region: first(headers, ['REGION TIME - Область или город', 'Регион'], 38),
      closeReason: first(headers, ['Причина закрытия карточки'], 65),
      closeReasonOld: first(headers, ['Причина отказа old'], 99),
      comment: first(headers, ['Комментарий'], 81),
      phones: phoneColumns(headers)
    };
  }

  return { key, phoneColumns, resolve };
}));
