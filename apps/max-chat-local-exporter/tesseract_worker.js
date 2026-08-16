(() => {
  'use strict';

  function isTesseractDiagnostic(args) {
    const text = args.map((value) => String(value ?? '')).join(' ').trim();
    return /^Detected \d+ diacritics$/i.test(text)
      || /^Estimating resolution as \d+$/i.test(text);
  }

  for (const method of ['log', 'warn', 'error']) {
    const original = console[method].bind(console);
    console[method] = (...args) => {
      if (!isTesseractDiagnostic(args)) original(...args);
    };
  }

  importScripts('vendor/tesseract/worker.min.js');
})();
