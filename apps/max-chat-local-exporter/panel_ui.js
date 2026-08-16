(function initMaxExporterPanelUi(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MaxExporterPanelUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMaxExporterPanelUi() {
  'use strict';

  const ICONS = {
    arrowUp: '<path d="m18 15-6-6-6 6"/><path d="M12 19V9"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronsUp: '<path d="m17 11-5-5-5 5"/><path d="m17 18-5-5-5 5"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    fileArchive: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6M10 12h4M10 16h4M12 12v4"/>',
    fileText: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20M12 2a15.3 15.3 0 0 0 0 20"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.1.1l2-2A5 5 0 0 0 12 4l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/>',
    message: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8M8 13h5"/>',
    scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10m-4-4 4 4-4 4"/>',
    shieldCheck: '<path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3z"/><path d="m9 12 2 2 4-4"/>',
    square: '<rect width="12" height="12" x="6" y="6" rx="1"/>',
    table: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>'
  };

  function icon(name) {
    return `<svg class="maxle-icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
  }

  function action(id, styleClass, iconName, title, subtitle, disabled = false) {
    return `<button class="maxle-action ${styleClass}" id="${id}" type="button"${disabled ? ' disabled' : ''}>
      <span class="maxle-action-icon">${icon(iconName)}</span>
      <span class="maxle-action-copy"><strong>${title}</strong><small>${subtitle}</small></span>
    </button>`;
  }

  function format(kind, iconName, extension) {
    return `<button class="maxle-format maxle-format-${kind}" data-maxle-export="${kind}" type="button">
      <span class="maxle-format-icon">${icon(iconName)}</span>
      <span><strong>${kind.toUpperCase()}</strong><small>.${extension}</small></span>
    </button>`;
  }

  function markup() {
    return `
      <div class="maxle-header">
        <div class="maxle-brand">
          <span class="maxle-brandmark">${icon('arrowUp')}</span>
          <span class="maxle-brand-copy">
            <strong class="maxle-title">MAX Chat Exporter</strong>
            <span class="maxle-subtitle">Экспортируй чат MAX в удобном формате</span>
          </span>
        </div>
        <span class="maxle-header-actions">
          <button class="maxle-collapse" id="maxle-collapse" type="button" title="Свернуть" aria-label="Свернуть панель" aria-expanded="true">${icon('chevronDown')}</button>
          <button class="maxle-close" id="maxle-close" type="button" title="Скрыть" aria-label="Скрыть панель">${icon('x')}</button>
        </span>
      </div>
      <div class="maxle-body">
        <div class="maxle-step-heading">
          <span class="maxle-step-number">1</span>
          <strong>Собрать чат</strong>
        </div>
        <div class="maxle-action-grid">
          ${action('maxle-auto', 'maxle-primary', 'chevronsUp', 'Весь чат', 'До самого начала')}
          ${action('maxle-scan', '', 'scan', 'Этот экран', 'Только видимые сообщения')}
          ${action('maxle-stop', 'maxle-danger', 'square', 'Стоп', 'Остановить процесс', true)}
          ${action('maxle-clear', '', 'trash', 'Очистить', 'Начать заново')}
        </div>
        <div class="maxle-status-shell" role="status" aria-live="polite">
          <span class="maxle-status-icon">${icon('info')}</span>
          <div class="maxle-status" id="maxle-status">Открой нужный чат и нажми «Весь чат». После завершения нажми «Запустить OCR».</div>
        </div>
        <div class="maxle-options">
          <label class="maxle-option">
            <input type="checkbox" id="maxle-oldest-first" checked>
            <span class="maxle-checkbox">${icon('check')}</span>
            <span class="maxle-option-icon">${icon('history')}</span>
            <span>Старые сообщения сверху при экспорте</span>
          </label>
          <label class="maxle-option">
            <input type="checkbox" id="maxle-scan-before-export" checked>
            <span class="maxle-checkbox">${icon('check')}</span>
            <span class="maxle-option-icon">${icon('scan')}</span>
            <span>Сканировать текущий экран перед экспортом</span>
          </label>
        </div>
        <div class="maxle-step-heading maxle-step-heading-export">
          <span class="maxle-step-number">2</span>
          <strong>Запустить обработку</strong>
        </div>
        <button class="maxle-ocr" id="maxle-ocr" type="button">
          <span class="maxle-ocr-icon">${icon('scan')}</span>
          <span><strong>Запустить OCR</strong><small>Архив скачается и обработается</small></span>
        </button>
        <div class="maxle-secondary-actions">
          <button class="maxle-pick-ocr" id="maxle-pick-ocr" type="button">${icon('fileArchive')}<span>Выбрать ZIP для OCR</span></button>
          <button class="maxle-download-only" data-maxle-export="zip" type="button">${icon('fileArchive')}<span>Только скачать ZIP</span></button>
        </div>
        <div class="maxle-section-title">Или один файл</div>
        <div class="maxle-format-grid">
          ${format('json', 'database', 'json')}
          ${format('txt', 'fileText', 'txt')}
          ${format('html', 'globe', 'html')}
          ${format('csv', 'table', 'csv')}
        </div>
        <div class="maxle-note">
          <div class="maxle-note-copy">
            <span class="maxle-note-shield">${icon('shieldCheck')}</span>
            <p>В архиве будут сообщения, все найденные изображения и готовый HTML-отчёт.</p>
          </div>
        </div>
      </div>`;
  }

  return { markup };
});
