(function initMaxExporterBrowserOcr(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MaxExporterBrowserOcr = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMaxExporterBrowserOcr() {
  'use strict';

  const VERSION = '8.2.10.0848';
  const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tif', 'tiff']);
  const MAX_ZIP_FILES = 25_000;
  const MAX_ENTRY_BYTES = 512 * 1024 * 1024;
  const MAX_MESSAGES_JSON_BYTES = 64 * 1024 * 1024;
  const MAX_TOTAL_IMAGE_BYTES = 8 * 1024 * 1024 * 1024;
  const MAX_PATH_LENGTH = 512;
  const MAX_PATH_DEPTH = 24;

  function cleanText(value) {
    return String(value ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function safeArchivePath(value) {
    const raw = String(value || '').replace(/\\/g, '/').trim();
    if (!raw || raw.length > MAX_PATH_LENGTH || raw.includes('\0') || raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) return '';
    const parts = raw.split('/').filter((part) => part && part !== '.');
    if (!parts.length || parts.length > MAX_PATH_DEPTH || parts.some((part) => part === '..')) return '';
    return parts.join('/');
  }

  function firstPresent(object, keys, fallback = '') {
    for (const key of keys) {
      if (object && object[key] !== undefined && object[key] !== null && object[key] !== '') return object[key];
    }
    return fallback;
  }

  function normalizeAttachmentPath(item) {
    if (typeof item === 'string') return safeArchivePath(item);
    if (!item || typeof item !== 'object') return '';
    return safeArchivePath(firstPresent(item, ['path', 'relativePath', 'relative_path', 'localPath', 'local_path', 'file', 'fileName', 'filename', 'name']));
  }

  function normalizeMessages(data) {
    const source = Array.isArray(data)
      ? data
      : (Array.isArray(data?.messages) ? data.messages : (Array.isArray(data?.items) ? data.items : (Array.isArray(data?.data) ? data.data : [])));

    return source.map((raw, position) => {
      const item = raw && typeof raw === 'object' ? raw : { text: cleanText(raw) };
      const indexValue = Number(String(firstPresent(item, ['message_index', 'index', 'ordinal', 'number', 'n'], position + 1)).replace(/^#/, ''));
      const messageIndex = Number.isInteger(indexValue) && indexValue > 0 ? indexValue : position + 1;
      const attachmentsValue = firstPresent(item, ['attachments', 'attachment_paths', 'files', 'media'], []);
      const attachmentPaths = Array.isArray(attachmentsValue)
        ? attachmentsValue.map(normalizeAttachmentPath).filter(Boolean)
        : String(attachmentsValue || '').split(/[|;\n]/).map(safeArchivePath).filter(Boolean);
      const reply = item.reply && typeof item.reply === 'object' ? item.reply : {};
      const replyIndexValue = Number(String(firstPresent(reply, ['targetMessageNumber', 'target_message_number', 'reply_to_message_index'], 0)).replace(/^#/, ''));

      return {
        message_index: messageIndex,
        message_id: cleanText(firstPresent(item, ['message_id', 'id', 'uid'], `msg_${String(messageIndex).padStart(4, '0')}`)),
        author: cleanText(firstPresent(item, ['author', 'sender', 'from', 'name'])),
        datetime: cleanText(firstPresent(item, ['datetime', 'date', 'time', 'timestamp'])),
        message_url: cleanText(firstPresent(item, ['messageUrl', 'message_url', 'max_message_link', 'maxMessageLink', 'permalink', 'link', 'url'])),
        message_url_source: cleanText(firstPresent(item, ['messageUrlSource', 'message_url_source', 'url_source', 'link_source'])),
        max_chat_url: cleanText(firstPresent(item, ['maxChatUrl', 'max_chat_url', 'chatUrl', 'chat_url', 'sourceUrl', 'source_url'])),
        local_export_anchor: cleanText(firstPresent(item, ['localExportAnchor', 'local_export_anchor', 'anchor'])),
        text: cleanText(firstPresent(item, ['bodyText', 'body', 'message', 'content', 'textContent', 'text'])),
        text_full: cleanText(firstPresent(item, ['text', 'textFull', 'fullText'])),
        attachment_paths: [...new Set(attachmentPaths)],
        attachment_ocr: [],
        reply_to_message_index: Number.isInteger(replyIndexValue) && replyIndexValue > 0 ? replyIndexValue : 0,
        reply_to_message_id: cleanText(firstPresent(reply, ['targetMessageId', 'target_message_id'])),
        reply_text: cleanText(firstPresent(reply, ['text', 'quote', 'quotedText']))
      };
    });
  }

  function normalizePhone(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length === 11 && /^[78]/.test(digits)) return `7${digits.slice(1)}`;
    if (digits.length === 10) return `7${digits}`;
    return '';
  }

  function extractPhones(text) {
    const phones = [];
    const seen = new Set();
    const labels = /(?:тел(?:ефон)?|моб(?:ильный)?|сотовый|контакт(?:ное лицо)?|рабочий|домашний|phone)/i;
    for (const line of String(text || '').split(/\r?\n/)) {
      if (!labels.test(line)) continue;
      const candidates = line.match(/(?:\+?7|8)?[\s(.-]*\d{3}[\s).-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}/g) || [];
      for (const candidate of candidates) {
        const normalized = normalizePhone(candidate);
        if (normalized && !seen.has(normalized)) {
          seen.add(normalized);
          phones.push(normalized);
        }
      }
    }
    return phones;
  }

  function extractNames(text) {
    const names = [];
    const seen = new Set();
    const label = /(?:фио|за[её]мщик|клиент)\s*[:\-]?\s*([А-ЯЁ][а-яё-]+(?:\s+[А-ЯЁ][а-яё-]+){1,2})/giu;
    for (const match of String(text || '').matchAll(label)) {
      const name = cleanText(match[1]);
      const key = name.toLocaleLowerCase('ru-RU');
      if (name && !seen.has(key)) {
        seen.add(key);
        names.push(name);
      }
    }
    return names;
  }

  function imageMime(path) {
    const extension = String(path || '').split('.').pop().toLowerCase();
    if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
    if (extension === 'tif' || extension === 'tiff') return 'image/tiff';
    return `image/${extension || 'png'}`;
  }

  function concatChunks(chunks, total) {
    const output = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }
    return output;
  }

  function abortError() {
    const error = new Error('OCR остановлен пользователем.');
    error.name = 'AbortError';
    return error;
  }

  function throwIfAborted(signal) {
    if (signal?.aborted) throw abortError();
  }

  async function streamZipEntries(blob, shouldRead, onEntry, options = {}) {
    const unzipApi = options.fflateApi || globalThis.fflate;
    if (!unzipApi?.Unzip || !unzipApi?.UnzipInflate) throw new Error('Встроенный модуль ZIP не загружен. Обнови расширение.');
    const signal = options.signal;
    let entryCount = 0;
    let failure = null;
    const active = new Set();

    const unzip = new unzipApi.Unzip((entry) => {
      if (failure) return;
      entryCount += 1;
      if (entryCount > MAX_ZIP_FILES) {
        failure = new Error(`В ZIP больше ${MAX_ZIP_FILES} файлов. Обработка остановлена.`);
        return;
      }
      const path = safeArchivePath(entry.name);
      if (!path) {
        failure = new Error(`Небезопасный путь внутри ZIP: ${String(entry.name || '').slice(0, 160)}`);
        return;
      }
      if (!shouldRead(path, entry)) return;
      if (Number(entry.originalSize || 0) > MAX_ENTRY_BYTES) {
        failure = new Error(`Файл в ZIP слишком большой: ${path}`);
        return;
      }

      const chunks = [];
      let total = 0;
      let completionResolve;
      let completionReject;
      const completion = new Promise((resolve, reject) => {
        completionResolve = resolve;
        completionReject = reject;
      });
      active.add(completion);
      completion.then(() => active.delete(completion), () => active.delete(completion));

      entry.ondata = (error, chunk, final) => {
        if (error) {
          completionReject(error);
          return;
        }
        if (chunk?.length) {
          total += chunk.length;
          if (total > MAX_ENTRY_BYTES) {
            completionReject(new Error(`Файл в ZIP превысил лимит: ${path}`));
            return;
          }
          chunks.push(chunk);
        }
        if (final) {
          Promise.resolve(onEntry(path, concatChunks(chunks, total), entry))
            .then(completionResolve, completionReject);
        }
      };
      try {
        entry.start();
      } catch (error) {
        completionReject(error);
      }
    });
    unzip.register(unzipApi.UnzipInflate);

    const reader = blob.stream().getReader();
    try {
      while (true) {
        throwIfAborted(signal);
        if (failure) throw failure;
        const { done, value } = await reader.read();
        unzip.push(value || new Uint8Array(), done);
        if (done) break;
      }
      await Promise.all([...active]);
      if (failure) throw failure;
    } finally {
      reader.releaseLock();
    }
  }

  async function readMessagesJson(blob, options = {}) {
    const candidates = [];
    await streamZipEntries(
      blob,
      (path, entry) => /(^|\/)messages\.json$/i.test(path) && Number(entry.originalSize || 0) <= MAX_MESSAGES_JSON_BYTES,
      (path, bytes) => {
        if (bytes.length > MAX_MESSAGES_JSON_BYTES) throw new Error('messages.json слишком большой для безопасной обработки.');
        candidates.push({ path, bytes });
      },
      options
    );
    if (!candidates.length) throw new Error('В ZIP не найден messages.json. Выбери архив, созданный MAX Chat Exporter.');
    candidates.sort((a, b) => a.path.split('/').length - b.path.split('/').length || a.path.length - b.path.length);
    const selected = candidates[0];
    let data;
    try {
      data = JSON.parse(new TextDecoder('utf-8').decode(selected.bytes));
    } catch (error) {
      throw new Error(`messages.json повреждён: ${error?.message || String(error)}`);
    }
    const slash = selected.path.lastIndexOf('/');
    return { data, rootPrefix: slash >= 0 ? selected.path.slice(0, slash) : '' };
  }

  function attachmentLookup(messages, rootPrefix) {
    const lookup = new Map();
    const uniquePaths = new Set();
    messages.forEach((message) => {
      message.attachment_ocr = message.attachment_paths.map((path, index) => {
        const extension = path.split('.').pop().toLowerCase();
        const attachment = {
          attachment_index: index + 1,
          original_path: path,
          file_name: path.split('/').pop() || path,
          ocr_text: '',
          phones: [],
          names: [],
          status: IMAGE_EXTENSIONS.has(extension) ? 'pending' : 'skipped',
          error: IMAGE_EXTENSIONS.has(extension) ? '' : 'Формат вложения не поддерживается браузерным OCR.',
          raw_ocr_path: '',
          case_key: '',
          version_index: 1,
          version_total: 1,
          version_status: 'CURRENT',
          superseded_by_message_index: 0,
          superseded_by_attachment_path: '',
          version_reason: 'browser_ocr',
          structured: {}
        };
        if (attachment.status === 'pending') {
          uniquePaths.add(path.toLocaleLowerCase('en-US'));
          const candidates = [safeArchivePath(path), safeArchivePath(rootPrefix ? `${rootPrefix}/${path}` : path)].filter(Boolean);
          for (const candidate of candidates) {
            const key = candidate.toLocaleLowerCase('en-US');
            if (!lookup.has(key)) lookup.set(key, []);
            lookup.get(key).push(attachment);
          }
        }
        return attachment;
      });
    });
    return { lookup, total: uniquePaths.size };
  }

  function finishAttachment(attachment, text) {
    const ocrText = cleanText(text);
    const phones = extractPhones(ocrText);
    const names = extractNames(ocrText);
    attachment.ocr_text = ocrText;
    attachment.phones = phones;
    attachment.names = names;
    attachment.status = 'ok';
    attachment.case_key = phones[0] ? `phone:${phones[0]}` : '';
    attachment.structured = {
      type: 'credit_application',
      fields: {
        ocr_text: ocrText,
        borrower_full_name: names[0] || '',
        full_name: names[0] || ''
      },
      normalized: {
        all_phones_norm: phones,
        borrower_full_name_key: (names[0] || '').toLocaleLowerCase('ru-RU')
      },
      match_keys: phones.map((phone) => `phone:${phone}`),
      quality: { needs_review: !phones.length }
    };
  }

  async function createOcrWorker(options = {}) {
    const tesseractApi = options.tesseractApi || globalThis.Tesseract;
    if (!tesseractApi?.createWorker) throw new Error('Встроенный OCR-движок не загружен. Обнови расширение.');
    const getURL = options.getURL || ((path) => globalThis.chrome?.runtime?.getURL(path) || path);
    const worker = await tesseractApi.createWorker(['rus', 'eng'], tesseractApi.OEM?.LSTM_ONLY ?? 1, {
      workerPath: getURL('vendor/tesseract/worker.min.js'),
      corePath: getURL('vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js'),
      langPath: getURL('vendor/tesseract/lang'),
      workerBlobURL: false,
      cacheMethod: 'write',
      logger: options.logger || (() => {})
    });
    await worker.setParameters({
      tessedit_pageseg_mode: tesseractApi.PSM?.SINGLE_BLOCK ?? '6',
      preserve_interword_spaces: '1'
    });
    return worker;
  }

  async function processZip(blob, options = {}) {
    if (!(blob instanceof Blob)) throw new Error('Не выбран ZIP для OCR.');
    const signal = options.signal;
    const progress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
    throwIfAborted(signal);
    progress({ phase: 'archive', text: 'Читаю структуру ZIP…', current: 0, total: 0 });

    const archive = await readMessagesJson(blob, options);
    const messages = normalizeMessages(archive.data);
    if (!messages.length) throw new Error('В messages.json нет сообщений для обработки.');
    const { lookup, total } = attachmentLookup(messages, archive.rootPrefix);
    if (!total) {
      return {
        filename: 'messages_ocr.json',
        data: buildOutput(archive.rootPrefix, messages, { total: 0, completed: 0, failed: 0 })
      };
    }

    let current = 0;
    let failed = 0;
    let worker = null;
    let activePath = '';
    const abortWorker = () => { Promise.resolve(worker?.terminate()).catch(() => {}); };
    signal?.addEventListener('abort', abortWorker, { once: true });

    try {
      progress({ phase: 'engine', text: 'Запускаю встроенный OCR в Chrome…', current: 0, total });
      worker = await createOcrWorker({
        ...options,
        logger: (event) => {
          const percent = Math.round(Number(event?.progress || 0) * 100);
          const suffix = event?.status === 'recognizing text' ? ` · ${percent}%` : '';
          progress({ phase: 'recognize', text: `OCR ${current + 1}/${total}${suffix}\n${activePath}`, current, total, percent });
        }
      });
      throwIfAborted(signal);

      let totalImageBytes = 0;
      let recognitionChain = Promise.resolve();
      await streamZipEntries(
        blob,
        (path) => lookup.has(path.toLocaleLowerCase('en-US')),
        (path, bytes) => {
          const task = recognitionChain.then(async () => {
            throwIfAborted(signal);
            const attachments = lookup.get(path.toLocaleLowerCase('en-US')) || [];
            if (!attachments.length || attachments.every((attachment) => attachment.status !== 'pending')) return;
            totalImageBytes += bytes.length;
            if (totalImageBytes > MAX_TOTAL_IMAGE_BYTES) throw new Error('Суммарный размер изображений превысил безопасный лимит 8 ГБ.');
            activePath = attachments[0].original_path;
            progress({ phase: 'recognize', text: `OCR ${current + 1}/${total}\n${activePath}`, current, total, percent: 0 });
            try {
              const image = new Blob([bytes], { type: imageMime(path) });
              const result = await worker.recognize(image, { rotateAuto: true });
              attachments.forEach((attachment) => finishAttachment(attachment, result?.data?.text || ''));
            } catch (error) {
              if (signal?.aborted) throw abortError();
              failed += 1;
              attachments.forEach((attachment) => {
                attachment.status = 'error';
                attachment.error = cleanText(error?.message || String(error));
              });
            }
            current += 1;
            progress({ phase: 'recognize', text: `Обработано ${current}/${total}`, current, total, percent: 100 });
          });
          recognitionChain = task.catch(() => {});
          return task;
        },
        options
      );
      throwIfAborted(signal);
    } finally {
      signal?.removeEventListener('abort', abortWorker);
      if (worker) await Promise.resolve(worker.terminate()).catch(() => {});
    }

    messages.forEach((message) => {
      message.attachment_ocr.forEach((attachment) => {
        if (attachment.status === 'pending') {
          attachment.status = 'missing';
          attachment.error = 'Изображение не найдено внутри ZIP.';
          failed += 1;
        }
      });
    });

    const data = buildOutput(archive.rootPrefix, messages, { total, completed: current, failed });
    progress({ phase: 'done', text: `OCR завершён: ${current - failed}/${total}`, current, total, percent: 100 });
    return { filename: 'messages_ocr.json', data };
  }

  function buildOutput(sourceExport, messages, stats) {
    return {
      source_export: sourceExport || 'MAX_CHAT_EXPORT',
      generated_at: new Date().toISOString(),
      processor: {
        name: 'MAX Chat Exporter Browser OCR',
        version: VERSION,
        engine: 'Tesseract.js 7.0.0',
        local: true,
        network_uploads: false
      },
      stats,
      cases: {},
      messages
    };
  }

  return {
    VERSION,
    safeArchivePath,
    normalizeMessages,
    normalizePhone,
    extractPhones,
    extractNames,
    processZip,
    buildOutput
  };
});
