(() => {
  'use strict';

  const APP_ID = 'max-local-exporter-panel';
  const EXPORTER_VERSION = '0.4.1';
  const STORAGE_VERSION = 3;

  const state = {
    records: new Map(),
    running: false,
    batch: 0,
    seq: 0,
    lastStatus: '',
    lastRootLabel: '',
    lastScrollerLabel: ''
  };

  const IMAGE_EXT_BY_MIME = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'image/svg+xml': 'svg',
    'image/avif': 'avif',
    'image/heic': 'heic',
    'image/heif': 'heif'
  };

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function cleanText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function normalizeForKey(value) {
    return cleanText(value).toLowerCase().replace(/\s+/g, ' ').slice(0, 1200);
  }


  function normalizeForMatch(value) {
    return cleanText(value).toLowerCase().replace(/[«»"'`]+/g, '').replace(/\s+/g, ' ').trim();
  }

  function textIncludesLoose(haystack, needle) {
    const h = normalizeForMatch(haystack);
    const n = normalizeForMatch(needle);
    if (!h || !n) return false;
    if (n.length <= 12) return h === n || h.includes(n);
    if (h.includes(n) || n.includes(h)) return true;
    const nWords = n.split(/\s+/).filter((w) => w.length > 2);
    if (nWords.length < 3) return false;
    const hits = nWords.filter((w) => h.includes(w)).length;
    return hits >= Math.max(3, Math.ceil(nWords.length * 0.72));
  }

  function fnv1a(str) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i += 1) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }

  function isElementVisible(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
    if (el.id === APP_ID || el.closest(`#${APP_ID}`)) return false;
    const style = window.getComputedStyle(el);
    if (!style || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width >= 8 && rect.height >= 8;
  }

  function isInteractiveChrome(el) {
    const tag = el.tagName?.toLowerCase();
    if (['button', 'input', 'textarea', 'select', 'option', 'svg', 'path'].includes(tag)) return true;
    if (el.getAttribute('role') === 'button') return true;
    if (el.closest('[contenteditable="true"]')) return true;
    return false;
  }

  function elementLabel(el) {
    if (!el) return 'document';
    const tag = (el.tagName || 'element').toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string'
      ? `.${el.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.')}`
      : '';
    return `${tag}${id}${cls}`;
  }

  function areaScore(el) {
    const rect = el.getBoundingClientRect();
    const textLen = cleanText(el.innerText || el.textContent).length;
    const imageCount = el.querySelectorAll?.('img, video, canvas')?.length || 0;
    const centerX = rect.left + rect.width / 2;
    const rightBias = Math.max(0.3, Math.min(1.3, centerX / Math.max(1, window.innerWidth)));
    const sizeScore = Math.max(0, rect.width * rect.height);
    return sizeScore * rightBias + Math.min(textLen, 20000) * 12 + imageCount * 900 + Math.max(0, el.scrollHeight - el.clientHeight) * 2;
  }

  function findBestScroller() {
    const candidates = [document.scrollingElement, document.documentElement, document.body]
      .filter(Boolean);

    document.querySelectorAll('main, [role="main"], section, div, [class*="chat" i], [class*="message" i], [class*="scroll" i]').forEach((el) => {
      if (!candidates.includes(el)) candidates.push(el);
    });

    const viable = candidates.filter((el) => {
      if (!isElementVisible(el) && el !== document.scrollingElement && el !== document.body && el !== document.documentElement) return false;
      const rect = el.getBoundingClientRect();
      const canScroll = el.scrollHeight > el.clientHeight + 80;
      const isLarge = rect.height > Math.min(280, window.innerHeight * 0.35) && rect.width > Math.min(320, window.innerWidth * 0.35);
      return canScroll && isLarge;
    });

    if (!viable.length) return document.scrollingElement || document.documentElement || document.body;
    viable.sort((a, b) => areaScore(b) - areaScore(a));
    return viable[0];
  }

  function findChatRoot(scroller) {
    const rootSelectors = [
      'main',
      '[role="main"]',
      '[data-testid*="chat" i]',
      '[data-testid*="conversation" i]',
      '[class*="chat" i]',
      '[class*="conversation" i]',
      '[class*="messages" i]'
    ];

    const roots = [];
    rootSelectors.forEach((selector) => {
      try {
        document.querySelectorAll(selector).forEach((el) => roots.push(el));
      } catch (_) {}
    });

    roots.push(scroller, document.body);

    const viable = roots.filter((el, index) => {
      if (!el || roots.indexOf(el) !== index) return false;
      if (!isElementVisible(el) && el !== document.body) return false;
      const text = cleanText(el.innerText || el.textContent);
      const rect = el.getBoundingClientRect();
      return (text.length > 20 || el.querySelector('img, video, canvas')) && rect.width > 250 && rect.height > 250;
    });

    if (!viable.length) return scroller || document.body;
    viable.sort((a, b) => areaScore(b) - areaScore(a));
    return viable[0];
  }

  function rejectByText(text, mediaCount) {
    if (!text && !mediaCount) return true;
    if (text.length > 6000) return true;
    if (/MAX Chat Exporter|MAX Local Exporter|Автопрокрутка вверх|Экспорт ZIP/.test(text)) return true;
    if (/^(Отправить|Введите сообщение|Поиск|Настройки|Назад|Закрыть|Скачать|Поделиться)$/i.test(text)) return true;
    if (/^https?:\/\/web\.max\.ru\/?$/i.test(text)) return true;
    return false;
  }

  function parseCssBackgroundUrl(styleValue) {
    const match = String(styleValue || '').match(/url\((['"]?)(.*?)\1\)/i);
    return match?.[2] || '';
  }

  function absoluteUrl(url) {
    if (!url) return '';
    try { return new URL(url, location.href).href; }
    catch (_) { return String(url); }
  }



  function sameMaxHost(url) {
    try {
      const u = new URL(url, location.href);
      return /(^|\.)max\.ru$/i.test(u.hostname);
    } catch (_) {
      return false;
    }
  }

  function looksLikeMediaUrl(url) {
    return /\.(?:jpg|jpeg|png|webp|gif|bmp|svg|avif|heic|heif|mp4|mov|webm|pdf)(?:[?#].*)?$/i.test(String(url || ''));
  }

  function isLikelyMessagePermalink(url, label = '') {
    if (!url) return false;
    const absolute = absoluteUrl(url);
    if (!/^https?:\/\//i.test(absolute)) return false;
    if (!sameMaxHost(absolute)) return false;
    if (looksLikeMediaUrl(absolute)) return false;
    if (absolute === location.href) return false;
    const joined = `${absolute} ${label}`.toLowerCase();
    if (/\b(message|messages|msg|mid|messageid|message_id|msgid|msg_id|post|comment|reply)\b/i.test(joined)) return true;
    if (/[?&#](?:message|msg|mid|messageId|message_id|msgId|msg_id|post|reply|comment)[=_-]/i.test(absolute)) return true;
    try {
      const u = new URL(absolute);
      if (u.hash && u.hash.length > 2 && !/^#(?:top|bottom)$/i.test(u.hash)) return true;
    } catch (_) {}
    return false;
  }

  function extractDomIds(el) {
    const attrs = {};
    const names = ['id', 'data-message-id', 'data-msg-id', 'data-id', 'data-testid', 'aria-label'];
    names.forEach((name) => {
      const value = el.getAttribute?.(name);
      if (value) attrs[name] = String(value).slice(0, 200);
    });
    try {
      Object.entries(el.dataset || {}).forEach(([k, v]) => {
        if (/message|msg|id|item|entry|dialog|chat/i.test(k) && v) attrs[`data-${k}`] = String(v).slice(0, 200);
      });
    } catch (_) {}
    return attrs;
  }

  function extractMessageLink(el) {
    const candidates = [];
    const add = (url, source, label = '') => {
      const abs = absoluteUrl(url || '');
      if (!abs || /^javascript:/i.test(abs)) return;
      if (candidates.some((c) => c.url === abs)) return;
      candidates.push({ url: abs, source, label: cleanText(label).slice(0, 180), likely: isLikelyMessagePermalink(abs, label) });
    };

    const closestAnchor = el.closest?.('a[href]');
    if (closestAnchor) add(closestAnchor.getAttribute('href'), 'closest-a', closestAnchor.innerText || closestAnchor.getAttribute('aria-label') || closestAnchor.getAttribute('title') || '');

    try {
      el.querySelectorAll?.('a[href]').forEach((a) => {
        const label = a.innerText || a.getAttribute('aria-label') || a.getAttribute('title') || a.getAttribute('data-testid') || '';
        add(a.getAttribute('href'), 'descendant-a', label);
      });
    } catch (_) {}

    // Некоторые SPA кладут permalink не в <a>, а в data-* / aria-* / title.
    const domIds = extractDomIds(el);
    Object.entries(domIds).forEach(([name, value]) => {
      if (/^https?:\/\//i.test(value)) add(value, `attr:${name}`, name);
    });

    const direct = candidates.find((c) => c.likely) || null;
    return {
      url: direct?.url || '',
      source: direct?.source || '',
      candidates,
      domIds
    };
  }


  function isProbablyAvatarOrIcon(el, rect) {
    const naturalW = Number(el.naturalWidth || 0);
    const naturalH = Number(el.naturalHeight || 0);
    const classLabel = `${el.className || ''} ${el.closest?.('[class]')?.className || ''}`.toLowerCase();
    const altTitle = `${el.getAttribute?.('alt') || ''} ${el.getAttribute?.('title') || ''}`.toLowerCase();
    const smallOnScreen = rect.width <= 72 && rect.height <= 72;
    const smallSource = naturalW > 0 && naturalH > 0 && naturalW <= 96 && naturalH <= 96;

    if (smallOnScreen && /(avatar|userpic|user-photo|profile|emoji|icon|reaction|badge)/i.test(classLabel)) return true;
    if (smallOnScreen && /(аватар|эмодзи|реакц|иконк)/i.test(altTitle)) return true;
    if (smallOnScreen && smallSource) return true;
    if (rect.width < 34 || rect.height < 34) return true;
    return false;
  }

  function getCandidateImageUrls(img) {
    const urls = [];
    const closestLink = img.closest?.('a[href]');
    const linkHref = closestLink ? absoluteUrl(closestLink.getAttribute('href')) : '';
    const current = absoluteUrl(img.currentSrc || img.src || '');
    const src = absoluteUrl(img.getAttribute('src') || '');

    // Если изображение завернуто в ссылку на файл/просмотрщик, пробуем её первой.
    if (linkHref && !linkHref.startsWith('javascript:') && linkHref !== location.href) urls.push(linkHref);
    if (current) urls.push(current);
    if (src) urls.push(src);

    const srcset = img.getAttribute('srcset') || '';
    srcset.split(',').map((part) => part.trim().split(/\s+/)[0]).filter(Boolean).forEach((url) => urls.push(absoluteUrl(url)));

    return [...new Set(urls.filter(Boolean))];
  }

  function extractMediaFromElement(el) {
    const found = [];
    const seen = new Set();

    el.querySelectorAll('img').forEach((img) => {
      if (!isElementVisible(img)) return;
      const rect = img.getBoundingClientRect();
      if (isProbablyAvatarOrIcon(img, rect)) return;
      const urls = getCandidateImageUrls(img);
      if (!urls.length) return;
      const key = urls.join('|');
      if (seen.has(key)) return;
      seen.add(key);
      found.push({
        kind: 'image',
        urls,
        primaryUrl: urls[0],
        alt: cleanText(img.getAttribute('alt') || ''),
        title: cleanText(img.getAttribute('title') || ''),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        naturalWidth: Number(img.naturalWidth || 0),
        naturalHeight: Number(img.naturalHeight || 0)
      });
    });

    el.querySelectorAll('video').forEach((video) => {
      if (!isElementVisible(video)) return;
      const poster = absoluteUrl(video.getAttribute('poster') || '');
      if (!poster) return;
      const rect = video.getBoundingClientRect();
      const key = `video-poster:${poster}`;
      if (seen.has(key)) return;
      seen.add(key);
      found.push({
        kind: 'video_poster',
        urls: [poster],
        primaryUrl: poster,
        alt: 'video poster',
        title: '',
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        naturalWidth: 0,
        naturalHeight: 0
      });
    });

    el.querySelectorAll('canvas').forEach((canvas) => {
      if (!isElementVisible(canvas)) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 48 || rect.height < 48) return;
      try {
        const dataUrl = canvas.toDataURL('image/png');
        const key = `canvas:${fnv1a(dataUrl.slice(0, 4096))}`;
        if (seen.has(key)) return;
        seen.add(key);
        found.push({
          kind: 'canvas_image',
          urls: [],
          primaryUrl: '',
          inlineDataUrl: dataUrl,
          alt: 'canvas snapshot',
          title: '',
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          naturalWidth: canvas.width,
          naturalHeight: canvas.height
        });
      } catch (_) {
        // Canvas может быть защищен CORS; тогда просто не добавляем его как файл.
      }
    });

    el.querySelectorAll('[style*="background-image"]').forEach((node) => {
      if (!isElementVisible(node)) return;
      const rect = node.getBoundingClientRect();
      if (rect.width < 48 || rect.height < 48) return;
      const bg = window.getComputedStyle(node).backgroundImage;
      const url = absoluteUrl(parseCssBackgroundUrl(bg));
      if (!url || url === 'none') return;
      const key = `bg:${url}`;
      if (seen.has(key)) return;
      seen.add(key);
      found.push({
        kind: 'background_image',
        urls: [url],
        primaryUrl: url,
        alt: '',
        title: cleanText(node.getAttribute('title') || ''),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        naturalWidth: 0,
        naturalHeight: 0
      });
    });

    return found;
  }


  function selectorAllSafe(root, selector) {
    try { return Array.from(root.querySelectorAll(selector)); }
    catch (_) { return []; }
  }

  function nodeLabelText(el) {
    if (!el) return '';
    return cleanText([
      el.getAttribute?.('data-testid') || '',
      el.getAttribute?.('aria-label') || '',
      el.getAttribute?.('title') || '',
      typeof el.className === 'string' ? el.className : ''
    ].join(' '));
  }

  function findLikelyReplyNodes(el, fullText) {
    const selectors = [
      '[data-testid*="reply" i]',
      '[data-testid*="quote" i]',
      '[data-testid*="quoted" i]',
      '[data-testid*="replied" i]',
      '[class*="reply" i]',
      '[class*="quote" i]',
      '[class*="quoted" i]',
      '[class*="replied" i]',
      '[aria-label*="ответ" i]',
      '[aria-label*="цит" i]',
      '[title*="ответ" i]',
      '[title*="цит" i]'
    ];
    const found = [];
    const seen = new Set();
    selectors.forEach((selector) => {
      selectorAllSafe(el, selector).forEach((node) => {
        if (!node || node === el || seen.has(node)) return;
        seen.add(node);
        if (!isElementVisible(node)) return;
        if (isInteractiveChrome(node)) return;
        const text = cleanText(node.innerText || node.textContent);
        if (!text || text.length < 3 || text.length > Math.max(900, fullText.length * 0.8)) return;
        if (text === fullText) return;
        if (/^(Ответить|Reply|Переслать|Forward|Скопировать|Удалить)$/i.test(text)) return;
        const rect = node.getBoundingClientRect();
        const label = nodeLabelText(node);
        let score = 0;
        if (/reply|quote|quoted|replied|ответ|цит/i.test(label)) score += 80;
        if (rect.top <= el.getBoundingClientRect().top + el.getBoundingClientRect().height * 0.55) score += 18;
        if (text.length < fullText.length * 0.6) score += 12;
        if (node.querySelector?.('img, video, canvas')) score += 4;
        found.push({ node, text, label, score, rect });
      });
    });
    return found.sort((a, b) => b.score - a.score);
  }

  function stripReplyTextFromBody(fullText, replyText) {
    const full = cleanText(fullText);
    const reply = cleanText(replyText);
    if (!full || !reply) return full;
    if (full === reply) return '';

    const idx = full.indexOf(reply);
    if (idx >= 0) {
      return cleanText(full.slice(0, idx) + '\n' + full.slice(idx + reply.length));
    }

    const fullLines = full.split('\n').map((x) => x.trim()).filter(Boolean);
    const replyLines = new Set(reply.split('\n').map((x) => normalizeForMatch(x)).filter(Boolean));
    const remaining = fullLines.filter((line) => !replyLines.has(normalizeForMatch(line)));
    return cleanText(remaining.join('\n')) || full;
  }

  function extractReplyInfo(el, fullText) {
    const candidates = findLikelyReplyNodes(el, fullText);
    if (!candidates.length) {
      const lines = cleanText(fullText).split('\n').map((x) => x.trim()).filter(Boolean);
      const markerIndex = lines.findIndex((line) => /^(ответ\s+на|в\s+ответ\s+на|reply\s+to|цитата|quoted|переслано)/i.test(line));
      if (markerIndex >= 0 && lines[markerIndex + 1]) {
        return {
          detected: true,
          text: cleanText(lines.slice(markerIndex, Math.min(lines.length, markerIndex + 4)).join('\n')),
          bodyText: cleanText(lines.slice(Math.min(lines.length, markerIndex + 4)).join('\n')),
          source: 'text-marker',
          confidence: 0.45,
          targetMessageId: '',
          targetMessageNumber: null
        };
      }
      return { detected: false, text: '', bodyText: cleanText(fullText), source: '', confidence: 0, targetMessageId: '', targetMessageNumber: null };
    }

    const best = candidates[0];
    const bodyText = stripReplyTextFromBody(fullText, best.text);
    return {
      detected: true,
      text: best.text,
      bodyText,
      source: best.label || 'dom-reply-candidate',
      confidence: Math.min(0.98, Math.max(0.55, best.score / 110)),
      targetMessageId: '',
      targetMessageNumber: null
    };
  }

  function resolveReplyTargets(records) {
    for (let i = 0; i < records.length; i += 1) {
      const current = records[i];
      if (!current.reply?.detected || !current.reply.text) continue;
      let best = null;
      const replyText = current.reply.text;
      for (let j = i - 1; j >= 0; j -= 1) {
        const candidate = records[j];
        const candidateText = candidate.bodyText || candidate.text || '';
        if (!candidateText) continue;
        if (!textIncludesLoose(candidateText, replyText) && !textIncludesLoose(replyText, candidateText.slice(0, 260))) continue;
        const distance = i - j;
        const score = 1000 - distance + Math.min(200, normalizeForMatch(candidateText).length / 4);
        if (!best || score > best.score) best = { record: candidate, score };
      }
      if (best) {
        current.reply.targetMessageId = best.record.id;
        current.reply.targetMessageNumber = best.record.number;
        current.reply.targetTextSnippet = cleanText(best.record.bodyText || best.record.text).slice(0, 240);
        current.reply.resolution = 'matched_by_visible_quote_text';
      } else {
        current.reply.targetMessageId = '';
        current.reply.targetMessageNumber = null;
        current.reply.targetTextSnippet = '';
        current.reply.resolution = 'not_matched_in_export';
      }
    }
    return records;
  }

  function buildRawCandidates(root) {
    const set = new Set();
    const selectors = [
      '[data-testid*="message" i]',
      '[data-testid*="msg" i]',
      '[class*="message" i]',
      '[class*="msg" i]',
      '[class*="bubble" i]',
      '[class*="Message" i]',
      '[role="listitem"]',
      'article',
      'li'
    ];

    selectors.forEach((selector) => {
      try {
        root.querySelectorAll(selector).forEach((el) => set.add(el));
      } catch (_) {}
    });

    root.querySelectorAll('img, video, canvas').forEach((media) => {
      let cursor = media;
      for (let depth = 0; cursor && depth < 7; depth += 1, cursor = cursor.parentElement) {
        if (cursor === root || cursor === document.body || cursor.id === APP_ID) break;
        set.add(cursor);
        const label = `${cursor.getAttribute?.('data-testid') || ''} ${cursor.className || ''} ${cursor.getAttribute?.('role') || ''}`;
        if (/message|msg|bubble|listitem|item/i.test(label)) break;
      }
    });

    if (set.size < 8) {
      root.querySelectorAll('article, li, section, div, p').forEach((el) => set.add(el));
    }

    const candidates = [];
    set.forEach((el) => {
      if (!isElementVisible(el)) return;
      if (isInteractiveChrome(el)) return;

      const rect = el.getBoundingClientRect();
      if (rect.width < 24 || rect.height < 12) return;

      const inputLike = el.closest('form, [role="textbox"], [contenteditable="true"]');
      if (inputLike) return;

      const media = extractMediaFromElement(el);
      const text = cleanText(el.innerText || el.textContent);
      if (rejectByText(text, media.length)) return;

      candidates.push({ el, text, media, rect, area: rect.width * rect.height });
    });

    return candidates;
  }

  function filterMessageCandidates(raw) {
    const candidates = raw.slice().sort((a, b) => a.area - b.area);
    const dropped = new Set();

    for (let i = 0; i < candidates.length; i += 1) {
      const small = candidates[i];
      if (dropped.has(small)) continue;

      for (let j = i + 1; j < candidates.length; j += 1) {
        const large = candidates[j];
        if (dropped.has(large)) continue;
        if (!large.el.contains(small.el)) continue;

        const sameText = normalizeForKey(large.text) === normalizeForKey(small.text);
        const largeContainsText = small.text && normalizeForKey(large.text).includes(normalizeForKey(small.text));
        const largeHasAllSmallMedia = small.media.every((m) => large.media.some((lm) => mediaKey(lm) === mediaKey(m)));
        const largeAddsMedia = large.media.length > small.media.length;

        // Если маленький кандидат — только текст, а родитель содержит тот же текст + фото, оставляем родителя.
        if ((sameText || largeContainsText) && largeAddsMedia) {
          dropped.add(small);
          break;
        }

        // Если большой кандидат ничего не добавляет, кроме обертки, выбрасываем его.
        if ((sameText || largeContainsText) && largeHasAllSmallMedia && !largeAddsMedia && large.area > small.area * 1.25) {
          dropped.add(large);
        }
      }
    }

    return candidates
      .filter((c) => !dropped.has(c))
      .sort((a, b) => {
        const dy = a.rect.top - b.rect.top;
        if (Math.abs(dy) > 4) return dy;
        return a.rect.left - b.rect.left;
      });
  }

  function mediaKey(media) {
    if (media.inlineDataUrl) return `inline:${fnv1a(media.inlineDataUrl.slice(0, 4096))}`;
    return String(media.primaryUrl || media.urls?.[0] || '').split(/[?#]/)[0];
  }

  function inferMeta(el, rect, rootRect, text) {
    const maybeTime = text.match(/(?:^|\s)([01]?\d|2[0-3]):[0-5]\d(?:\s|$)/)?.[0]?.trim() || '';
    const maybeDate = text.match(/\b(?:\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?|\d{4}-\d{2}-\d{2}|сегодня|вчера|пн|вт|ср|чт|пт|сб|вс)\b/i)?.[0] || '';

    let author = '';
    let cursor = el;
    for (let depth = 0; cursor && depth < 5; depth += 1, cursor = cursor.parentElement) {
      const label = cursor.getAttribute?.('aria-label') || cursor.getAttribute?.('title') || cursor.getAttribute?.('data-author') || '';
      if (label && label.length <= 100 && !/message|сообщ|button|кнопк|image|photo/i.test(label)) {
        author = cleanText(label);
        break;
      }
    }

    const mid = rect.left + rect.width / 2;
    const rootMid = rootRect.left + rootRect.width / 2;
    const direction = mid > rootMid + rootRect.width * 0.08 ? 'possible_outgoing' : 'possible_incoming';
    return { maybeTime, maybeDate, author, direction };
  }

  function mergeAttachments(existing, incoming) {
    const merged = existing.slice();
    incoming.forEach((item) => {
      if (!merged.some((m) => mediaKey(m) === mediaKey(item))) merged.push(item);
    });
    return merged;
  }

  function captureMessages() {
    const scroller = findBestScroller();
    const root = findChatRoot(scroller);
    const rootRect = root.getBoundingClientRect();
    state.lastRootLabel = elementLabel(root);
    state.lastScrollerLabel = elementLabel(scroller);

    const candidates = filterMessageCandidates(buildRawCandidates(root));
    let added = 0;
    let mediaFound = 0;

    candidates.forEach((candidate, domIndex) => {
      const { el, text, rect, media } = candidate;
      mediaFound += media.length;
      const meta = inferMeta(el, rect, rootRect, text);
      const reply = extractReplyInfo(el, text);
      const linkInfo = extractMessageLink(el);
      const bodyText = reply.bodyText || stripReplyTextFromBody(text, reply.text || '');
      const signature = fnv1a([
        normalizeForKey(bodyText || text),
        normalizeForKey(reply.text || ''),
        media.map(mediaKey).join('|'),
        meta.maybeTime,
        meta.maybeDate,
        meta.author,
        meta.direction
      ].join('|'));

      const normalizedAttachments = media.map((m, attachmentIndex) => ({
        id: `${signature}-att-${attachmentIndex + 1}`,
        kind: m.kind,
        urls: m.urls || [],
        primaryUrl: m.primaryUrl || '',
        inlineDataUrl: m.inlineDataUrl || '',
        alt: m.alt || '',
        title: m.title || '',
        width: m.width || 0,
        height: m.height || 0,
        naturalWidth: m.naturalWidth || 0,
        naturalHeight: m.naturalHeight || 0,
        status: 'pending'
      }));

      if (!state.records.has(signature)) {
        state.records.set(signature, {
          id: signature,
          order: state.seq += 1,
          captureBatch: state.batch,
          domIndex,
          text,
          bodyText,
          reply,
          maybeTime: meta.maybeTime,
          maybeDate: meta.maybeDate,
          author: meta.author,
          direction: meta.direction,
          attachments: normalizedAttachments,
          messageUrl: linkInfo.url,
          messageUrlSource: linkInfo.source,
          messageLinkCandidates: linkInfo.candidates,
          messageDomIds: linkInfo.domIds,
          pageUrl: location.href,
          capturedAt: new Date().toISOString(),
          pageTitle: document.title,
          url: location.href
        });
        added += 1;
      } else {
        const existing = state.records.get(signature);
        if (text.length > existing.text.length) existing.text = text;
        if ((bodyText || '').length > (existing.bodyText || '').length) existing.bodyText = bodyText;
        if (reply?.detected && (!existing.reply?.detected || (reply.text || '').length > (existing.reply.text || '').length)) existing.reply = reply;
        existing.attachments = mergeAttachments(existing.attachments || [], normalizedAttachments);
        if (!existing.messageUrl && linkInfo.url) {
          existing.messageUrl = linkInfo.url;
          existing.messageUrlSource = linkInfo.source;
        }
        existing.messageLinkCandidates = [...(existing.messageLinkCandidates || []), ...(linkInfo.candidates || [])].filter((item, idx, arr) => item?.url && arr.findIndex((x) => x.url === item.url) === idx).slice(0, 12);
        existing.messageDomIds = { ...(existing.messageDomIds || {}), ...(linkInfo.domIds || {}) };
        existing.pageUrl = location.href;
      }
    });

    state.batch += 1;
    const totalAttachments = Array.from(state.records.values()).reduce((sum, r) => sum + (r.attachments?.length || 0), 0);
    setStatus(`Сканирование: +${added}\nСообщений/блоков: ${state.records.size}\nВложений найдено: ${totalAttachments}\nКонтейнер: ${state.lastScrollerLabel}`);
    return { added, total: state.records.size, mediaFound, scroller };
  }

  function setStatus(text) {
    state.lastStatus = text;
    const el = document.querySelector('#maxle-status');
    if (el) el.textContent = text;
  }

  function orderedRecords() {
    const oldestFirst = document.querySelector('#maxle-oldest-first')?.checked ?? true;
    return Array.from(state.records.values()).sort((a, b) => {
      if (oldestFirst) {
        if (b.captureBatch !== a.captureBatch) return b.captureBatch - a.captureBatch;
        return a.domIndex - b.domIndex;
      }
      if (a.captureBatch !== b.captureBatch) return a.captureBatch - b.captureBatch;
      return a.domIndex - b.domIndex;
    });
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[char]));
  }

  function csvCell(value) {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
  }

  function localArchiveStamp(date = new Date()) {
    const pad2 = (value) => String(value).padStart(2, '0');
    const dd = pad2(date.getDate());
    const mm = pad2(date.getMonth() + 1);
    const yy = pad2(date.getFullYear() % 100);
    const hh = pad2(date.getHours());
    const min = pad2(date.getMinutes());
    return `${dd}-${mm}-${yy}_${hh}-${min}`;
  }

  function fileStem(records = null) {
    const exportRecords = records || cloneRecordsForExport();
    const messageCount = exportRecords.length || state.records.size || 0;
    const attachmentCount = exportRecords.reduce((sum, r) => sum + (r.attachments?.length || 0), 0);
    return `MAX_CHAT_EXPORT_${messageCount}msg_${attachmentCount}att_${localArchiveStamp()}`;
  }

  function metaFor(records) {
    return {
      exporter: 'MAX Chat Local Exporter',
      exporterVersion: EXPORTER_VERSION,
      storageVersion: STORAGE_VERSION,
      exportedAt: new Date().toISOString(),
      sourceTitle: document.title,
      sourceUrl: location.href,
      messageCount: records.length,
      attachmentCount: records.reduce((sum, r) => sum + (r.attachments?.length || 0), 0),
      note: 'Экспорт основан на сообщениях и вложениях, которые web.max.ru подгрузил в DOM. Привязка картинки к сообщению строится по DOM-контейнеру сообщения.'
    };
  }

  function cloneRecordsForExport() {
    const records = orderedRecords().map((record, index) => ({
      ...record,
      number: index + 1,
      localExportAnchor: `#msg-${index + 1}`,
      maxChatUrl: record.pageUrl || location.href,
      text: cleanText(record.text || ''),
      bodyText: cleanText(record.bodyText || record.text || ''),
      reply: record.reply || { detected: false, text: '', bodyText: cleanText(record.text || ''), source: '', confidence: 0, targetMessageId: '', targetMessageNumber: null },
      attachments: (record.attachments || []).map((att, attachmentIndex) => ({
        ...att,
        number: attachmentIndex + 1,
        messageId: record.id,
        messageNumber: index + 1,
        messageTextSnippet: cleanText(record.bodyText || record.text).slice(0, 240)
      }))
    }));
    return resolveReplyTargets(records);
  }

  function buildPayload(format, records = cloneRecordsForExport()) {
    const meta = metaFor(records);

    if (format === 'json') {
      return {
        mime: 'application/json;charset=utf-8',
        ext: 'json',
        data: JSON.stringify({ meta, messages: records }, null, 2)
      };
    }

    if (format === 'txt') {
      const header = [
        'MAX Chat Local Exporter',
        `Exported: ${meta.exportedAt}`,
        `Source: ${meta.sourceTitle}`,
        `URL: ${meta.sourceUrl}`,
        `Messages: ${records.length}`,
        `Attachments: ${meta.attachmentCount}`,
        '',
        '-----'
      ].join('\n');
      const body = records.map((r) => {
        const attachments = (r.attachments || []).length
          ? ['Вложения:', ...(r.attachments || []).map((a) => `- ${a.path || '(не сохранено)'} — ${a.status || 'pending'}${a.error ? ` — ${a.error}` : ''}`)].join('\n')
          : 'Вложения: нет';
        const replyLines = r.reply?.detected
          ? [
              `Ответ на: ${r.reply.targetMessageNumber ? `#${r.reply.targetMessageNumber}` : '(цель не найдена в экспорте)'}`,
              r.reply.text ? `Цитата reply: ${r.reply.text}` : ''
            ].filter(Boolean).join('\n')
          : '';
        return [
          `#${r.number} ${r.maybeDate || ''} ${r.maybeTime || ''} ${r.author || r.direction || ''}`.trim(),
          r.messageUrl ? `Ссылка MAX: ${r.messageUrl}` : `Ссылка MAX: не найдена; чат: ${r.maxChatUrl || meta.sourceUrl}`,
          replyLines,
          r.bodyText || r.text || '[текст не найден — возможно, это сообщение только с картинкой]',
          attachments
        ].filter(Boolean).join('\n');
      }).join('\n\n-----\n\n');
      return { mime: 'text/plain;charset=utf-8', ext: 'txt', data: `${header}\n\n${body}\n` };
    }

    if (format === 'csv') {
      const rows = [
        ['index', 'id', 'maybe_date', 'maybe_time', 'author', 'direction', 'message_url', 'message_url_source', 'max_chat_url', 'local_export_anchor', 'reply_detected', 'reply_to_message_index', 'reply_to_message_id', 'reply_text', 'attachment_count', 'attachment_paths', 'captured_at', 'body_text', 'text_full'].map(csvCell).join(',')
      ];
      records.forEach((r) => {
        rows.push([
          r.number,
          r.id,
          r.maybeDate,
          r.maybeTime,
          r.author,
          r.direction,
          r.messageUrl || '',
          r.messageUrlSource || '',
          r.maxChatUrl || r.pageUrl || meta.sourceUrl,
          r.localExportAnchor || '',
          r.reply?.detected ? 'yes' : '',
          r.reply?.targetMessageNumber || '',
          r.reply?.targetMessageId || '',
          r.reply?.text || '',
          (r.attachments || []).length,
          (r.attachments || []).map((a) => a.path || '').filter(Boolean).join(' | '),
          r.capturedAt,
          r.bodyText || r.text,
          r.text
        ].map(csvCell).join(','));
      });
      return { mime: 'text/csv;charset=utf-8', ext: 'csv', data: rows.join('\n') };
    }

    if (format === 'attachments.csv') {
      const rows = [
        ['message_index', 'message_id', 'reply_to_message_index', 'attachment_index', 'attachment_id', 'status', 'path', 'kind', 'mime_type', 'byte_length', 'source_url', 'message_text_snippet'].map(csvCell).join(',')
      ];
      records.forEach((r) => {
        (r.attachments || []).forEach((a) => {
          rows.push([
            r.number,
            r.id,
            r.reply?.targetMessageNumber || '',
            a.number,
            a.id,
            a.status || '',
            a.path || '',
            a.kind || '',
            a.mimeType || '',
            a.byteLength || '',
            a.savedFromUrl || a.primaryUrl || '',
            a.messageTextSnippet || ''
          ].map(csvCell).join(','));
        });
      });
      return { mime: 'text/csv;charset=utf-8', ext: 'csv', data: rows.join('\n') };
    }

    if (format === 'html') {
      const rows = records.map((r) => {
        const attachments = (r.attachments || []).map((a) => {
          if (a.status === 'saved' && a.path) {
            return `<figure class="attachment"><img src="${escapeHtml(a.path)}" alt="${escapeHtml(a.alt || a.title || `attachment ${a.number}`)}"><figcaption>${escapeHtml(a.path)}<br><span>Сообщение #${r.number}: ${escapeHtml((r.text || '').slice(0, 160))}</span></figcaption></figure>`;
          }
          return `<div class="attachment failed"><b>Вложение не сохранено:</b> ${escapeHtml(a.error || 'неизвестная ошибка')}<br><span>${escapeHtml(a.primaryUrl || '')}</span></div>`;
        }).join('\n');

        const replyHtml = r.reply?.detected
          ? `<aside class="reply"><b>Reply:</b> ${r.reply.targetMessageNumber ? `<a href="#msg-${r.reply.targetMessageNumber}">ответ на #${r.reply.targetMessageNumber}</a>` : 'цель не найдена в экспорте'}<pre>${escapeHtml(r.reply.text || '')}</pre></aside>`
          : '';
        return `
        <article class="msg ${escapeHtml(r.direction)}" id="msg-${r.number}">
          <header>#${r.number} ${escapeHtml(r.maybeDate)} ${escapeHtml(r.maybeTime)} ${escapeHtml(r.author || r.direction)} ${r.messageUrl ? ` · <a href="${escapeHtml(r.messageUrl)}" target="_blank" rel="noopener">ссылка MAX</a>` : ` · <span title="${escapeHtml(r.maxChatUrl || meta.sourceUrl)}">ссылка MAX не найдена</span>`}</header>
          ${replyHtml}
          <pre>${escapeHtml(r.bodyText || r.text || '[текст не найден — возможно, это сообщение только с картинкой]')}</pre>
          ${attachments ? `<section class="attachments"><h3>Вложения к этому сообщению</h3>${attachments}</section>` : '<p class="noatt">Вложений нет</p>'}
        </article>`;
      }).join('\n');
      const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>${escapeHtml(meta.sourceTitle)} — MAX export</title>
<style>
body{font:14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:24px;max-width:1120px;color:#111;background:#fff}
h1{font-size:24px;margin-bottom:6px}.meta{color:#666}.msg{border:1px solid #ddd;border-radius:14px;padding:14px;margin:14px 0}.msg header{font-size:12px;color:#666;margin-bottom:8px}.msg pre{white-space:pre-wrap;margin:0 0 10px;font:inherit}.possible_outgoing{background:#f7faff}.possible_incoming{background:#fff}.attachments{border-top:1px dashed #ddd;margin-top:12px;padding-top:10px}.attachments h3{font-size:13px;margin:0 0 8px;color:#444}.attachment{margin:10px 0;padding:10px;border:1px solid #e6e6e6;border-radius:12px;background:#fff}.attachment img{display:block;max-width:100%;height:auto;border-radius:8px}.attachment figcaption{font-size:12px;color:#555;margin-top:6px}.attachment.failed{color:#8a1f11;background:#fff8f6}.noatt{color:#888;font-size:12px}.reply{border-left:4px solid #78a6ff;background:#eef4ff;padding:8px 10px;border-radius:8px;margin:8px 0}.reply pre{font-size:12px;color:#334;margin:6px 0 0}
</style>
</head>
<body>
<h1>${escapeHtml(meta.sourceTitle || 'MAX chat export')}</h1>
<p class="meta">Exported: ${escapeHtml(meta.exportedAt)}<br>URL: ${escapeHtml(meta.sourceUrl)}<br>Messages: ${records.length}<br>Attachments: ${meta.attachmentCount}</p>
${rows}
</body>
</html>`;
      return { mime: 'text/html;charset=utf-8', ext: 'html', data: html };
    }

    throw new Error(`Unsupported format: ${format}`);
  }

  function downloadText(format) {
    if (!state.records.size) captureMessages();
    if (!state.records.size) {
      setStatus('Не нашёл сообщений. Открой конкретный чат и попробуй ещё раз.');
      return;
    }
    const payload = buildPayload(format);
    const blob = new Blob([payload.data], { type: payload.mime });
    downloadBlob(blob, `${fileStem()}.${payload.ext}`);
    setStatus(`Экспортировано: ${state.records.size}\nФормат: ${payload.ext.toUpperCase()}\nДля связки текст+фото используй ZIP.`);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.documentElement.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
      crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function dosDateTime(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { dosDate, dosTime };
  }

  function u16(value) {
    return [value & 0xff, (value >>> 8) & 0xff];
  }

  function u32(value) {
    return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
  }

  function stringToBytes(value) {
    return new TextEncoder().encode(String(value));
  }

  function makeZip(files) {
    const encoder = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    const { dosDate, dosTime } = dosDateTime();

    files.forEach((file) => {
      const nameBytes = encoder.encode(file.name);
      const dataBytes = file.bytes instanceof Uint8Array ? file.bytes : stringToBytes(file.data || '');
      const crc = crc32(dataBytes);
      const flags = 0x0800; // UTF-8 filenames.
      const localHeader = new Uint8Array([
        ...u32(0x04034b50), ...u16(20), ...u16(flags), ...u16(0), ...u16(dosTime), ...u16(dosDate),
        ...u32(crc), ...u32(dataBytes.length), ...u32(dataBytes.length), ...u16(nameBytes.length), ...u16(0)
      ]);
      chunks.push(localHeader, nameBytes, dataBytes);

      const centralHeader = new Uint8Array([
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(flags), ...u16(0), ...u16(dosTime), ...u16(dosDate),
        ...u32(crc), ...u32(dataBytes.length), ...u32(dataBytes.length), ...u16(nameBytes.length), ...u16(0), ...u16(0),
        ...u16(0), ...u16(0), ...u32(0), ...u32(offset)
      ]);
      central.push(centralHeader, nameBytes);
      offset += localHeader.length + nameBytes.length + dataBytes.length;
    });

    const centralSize = central.reduce((sum, part) => sum + part.length, 0);
    const centralOffset = offset;
    const end = new Uint8Array([
      ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
      ...u32(centralSize), ...u32(centralOffset), ...u16(0)
    ]);

    return new Blob([...chunks, ...central, end], { type: 'application/zip' });
  }

  function dataUrlToBytes(dataUrl) {
    const match = String(dataUrl || '').match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    if (!match) throw new Error('Некорректный data URL');
    const mime = match[1] || 'application/octet-stream';
    const isBase64 = Boolean(match[2]);
    const payload = match[3] || '';
    const binary = isBase64 ? atob(payload) : decodeURIComponent(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return { bytes, mime };
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error('FileReader error'));
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(blob);
    });
  }

  function mimeToExt(mime, fallbackUrl = '') {
    const normalized = String(mime || '').split(';')[0].trim().toLowerCase();
    if (IMAGE_EXT_BY_MIME[normalized]) return IMAGE_EXT_BY_MIME[normalized];
    const fromUrl = String(fallbackUrl || '').split(/[?#]/)[0].match(/\.([a-z0-9]{2,5})$/i)?.[1];
    if (fromUrl) return fromUrl.toLowerCase();
    return 'bin';
  }

  function sendMessagePromise(payload) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(payload, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response || { ok: false, error: 'Пустой ответ background.js' });
        }
      });
    });
  }

  async function resolveAttachmentBytes(att) {
    if (att.inlineDataUrl) {
      const parsed = dataUrlToBytes(att.inlineDataUrl);
      return { ok: true, bytes: parsed.bytes, mime: parsed.mime, savedFromUrl: 'inline-data', byteLength: parsed.bytes.byteLength };
    }

    const urls = [...new Set([...(att.urls || []), att.primaryUrl].filter(Boolean))];
    const dataUrl = urls.find((url) => String(url).startsWith('data:'));
    if (dataUrl) {
      const parsed = dataUrlToBytes(dataUrl);
      return { ok: true, bytes: parsed.bytes, mime: parsed.mime, savedFromUrl: 'data-url', byteLength: parsed.bytes.byteLength };
    }

    const blobUrl = urls.find((url) => String(url).startsWith('blob:'));
    if (blobUrl) {
      try {
        const response = await fetch(blobUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const parsed = dataUrlToBytes(await blobToDataUrl(blob));
        return { ok: true, bytes: parsed.bytes, mime: parsed.mime || blob.type, savedFromUrl: blobUrl, byteLength: parsed.bytes.byteLength };
      } catch (error) {
        return { ok: false, error: `blob URL не прочитан: ${error?.message || String(error)}` };
      }
    }

    const httpUrls = urls.filter((url) => /^https?:\/\//i.test(url));
    if (!httpUrls.length) return { ok: false, error: 'Нет URL картинки для скачивания' };

    const response = await sendMessagePromise({ type: 'MAX_EXPORTER_FETCH_ATTACHMENT', urls: httpUrls });
    if (!response?.ok || !response.dataUrl) return { ok: false, error: response?.error || 'Не удалось скачать картинку' };
    const parsed = dataUrlToBytes(response.dataUrl);
    return {
      ok: true,
      bytes: parsed.bytes,
      mime: response.mime || parsed.mime,
      savedFromUrl: response.finalUrl || response.sourceUrl || httpUrls[0],
      byteLength: parsed.bytes.byteLength
    };
  }

  function readmeText(rootName, meta) {
    return `MAX Chat Local Exporter ${EXPORTER_VERSION}

Структура архива:

${rootName}/index.html
  Человеческий просмотр экспорта. Каждое сообщение показано отдельным блоком, а вложения идут прямо под текстом этого же сообщения.

${rootName}/messages.json
  Машинно-читаемый файл. В каждом объекте message есть bodyText, reply, messageUrl/messageUrlSource/maxChatUrl и массив attachments с path/status/sourceUrl. Если reply удалось связать с видимым сообщением, будет reply.targetMessageNumber.

${rootName}/messages.csv
  Таблица: одна строка = одно сообщение. Колонка attachment_paths показывает файлы вложений этого сообщения.

${rootName}/attachments_manifest.csv
  Таблица: одна строка = одно вложение. Есть message_index, reply_to_message_index и message_text_snippet, чтобы быстро сопоставить фото с текстом сообщения и цепочкой ответов.

${rootName}/attachments/msg_0001/att_01.jpg
  Файлы картинок. Папка msg_0001 означает, что вложение относится к сообщению #1 в index.html/messages.json/messages.csv.

Источник: ${meta.sourceTitle}
URL: ${meta.sourceUrl}
Экспортировано: ${meta.exportedAt}
Сообщений: ${meta.messageCount}
Вложений: ${meta.attachmentCount}

Важно: это не официальный экспорт MAX. Расширение сохраняет только то, что web.max.ru уже подгрузил на страницу. Если старые сообщения не были подгружены прокруткой, их не будет в архиве. Reply-связи определяются эвристически по DOM-блоку цитаты и тексту видимых сообщений.
`;
  }

  async function downloadStructuredZip() {
    if (!state.records.size) captureMessages();
    if (!state.records.size) {
      setStatus('Не нашёл сообщений. Открой конкретный чат и попробуй ещё раз.');
      return;
    }

    setButtonsRunning(true);
    try {
      const records = cloneRecordsForExport();
      const rootName = fileStem(records);
      const meta = metaFor(records);
      const files = [];
      let saved = 0;
      let failed = 0;
      let totalAttachments = records.reduce((sum, r) => sum + (r.attachments?.length || 0), 0);
      let currentAttachment = 0;

      for (const record of records) {
        for (const attachment of record.attachments || []) {
          currentAttachment += 1;
          setStatus(`Готовлю ZIP...\nСообщений: ${records.length}\nКартинка ${currentAttachment}/${totalAttachments}`);

          const result = await resolveAttachmentBytes(attachment);
          if (result.ok) {
            const ext = mimeToExt(result.mime, result.savedFromUrl || attachment.primaryUrl || '');
            const messageFolder = `msg_${String(record.number).padStart(4, '0')}`;
            const fileName = `att_${String(attachment.number).padStart(2, '0')}.${ext}`;
            const path = `attachments/${messageFolder}/${fileName}`;
            attachment.status = 'saved';
            attachment.path = path;
            attachment.fileName = fileName;
            attachment.mimeType = result.mime;
            attachment.byteLength = result.byteLength;
            attachment.savedFromUrl = result.savedFromUrl;
            attachment.inlineDataUrl = undefined;
            files.push({ name: `${rootName}/${path}`, bytes: result.bytes });
            saved += 1;
          } else {
            const messageFolder = `msg_${String(record.number).padStart(4, '0')}`;
            const fileName = `att_${String(attachment.number).padStart(2, '0')}_FAILED.txt`;
            const path = `attachments/${messageFolder}/${fileName}`;
            attachment.status = 'failed';
            attachment.path = path;
            attachment.error = result.error || 'Не удалось сохранить вложение';
            attachment.inlineDataUrl = undefined;
            files.push({
              name: `${rootName}/${path}`,
              bytes: stringToBytes(`Вложение не сохранено.\n\nОшибка: ${attachment.error}\nИсточник: ${attachment.primaryUrl || (attachment.urls || []).join('\n') || '(нет URL)'}\n\nТекст сообщения:\n${record.text || '[нет текста]'}`)
            });
            failed += 1;
          }
        }
      }

      const jsonPayload = buildPayload('json', records);
      const txtPayload = buildPayload('txt', records);
      const htmlPayload = buildPayload('html', records);
      const csvPayload = buildPayload('csv', records);
      const attCsvPayload = buildPayload('attachments.csv', records);
      const finalMeta = metaFor(records);

      files.unshift(
        { name: `${rootName}/README.txt`, bytes: stringToBytes(readmeText(rootName, finalMeta)) },
        { name: `${rootName}/index.html`, bytes: stringToBytes(htmlPayload.data) },
        { name: `${rootName}/messages.json`, bytes: stringToBytes(jsonPayload.data) },
        { name: `${rootName}/messages.csv`, bytes: stringToBytes(csvPayload.data) },
        { name: `${rootName}/messages.txt`, bytes: stringToBytes(txtPayload.data) },
        { name: `${rootName}/attachments_manifest.csv`, bytes: stringToBytes(attCsvPayload.data) }
      );

      const zip = makeZip(files);
      downloadBlob(zip, `${rootName}.zip`);
      setStatus(`ZIP создан.\nСообщений: ${records.length}\nКартинок сохранено: ${saved}\nОшибок по картинкам: ${failed}`);
    } catch (error) {
      setStatus(`Ошибка ZIP: ${error?.message || String(error)}`);
    } finally {
      setButtonsRunning(false);
    }
  }

  async function autoScrollUp() {
    if (state.running) return;
    state.running = true;
    setButtonsRunning(true);

    const scroller = findBestScroller();
    let stableSteps = 0;
    let lastTotal = state.records.size;
    let lastAttachmentTotal = 0;
    let previousTop = Math.round(scroller.scrollTop);
    const maxSteps = 1200;

    setStatus('Автопрокрутка началась. Не переключай чат до завершения.');

    for (let step = 0; step < maxSteps && state.running; step += 1) {
      const result = captureMessages();
      const currentScroller = result.scroller || scroller;
      const before = Math.round(currentScroller.scrollTop);
      const distance = Math.max(240, Math.round(currentScroller.clientHeight * 0.82));
      currentScroller.scrollTop = Math.max(0, before - distance);
      currentScroller.dispatchEvent(new Event('scroll', { bubbles: true }));
      await sleep(850);

      const after = Math.round(currentScroller.scrollTop);
      const attachmentTotal = Array.from(state.records.values()).reduce((sum, r) => sum + (r.attachments?.length || 0), 0);
      const totalChanged = state.records.size !== lastTotal || attachmentTotal !== lastAttachmentTotal;
      const topChanged = Math.abs(after - previousTop) > 8;
      const nearTop = after <= 2;

      if (!totalChanged && (!topChanged || nearTop)) stableSteps += 1;
      else stableSteps = 0;

      lastTotal = state.records.size;
      lastAttachmentTotal = attachmentTotal;
      previousTop = after;
      setStatus(`Автопрокрутка: шаг ${step + 1}\nСообщений/блоков: ${state.records.size}\nВложений: ${attachmentTotal}\nНовых блоков на шаге: ${result.added}`);

      if (stableSteps >= 8) break;
    }

    captureMessages();
    state.running = false;
    setButtonsRunning(false);
    const attachmentTotal = Array.from(state.records.values()).reduce((sum, r) => sum + (r.attachments?.length || 0), 0);
    setStatus(`Готово.\nСообщений/блоков: ${state.records.size}\nВложений найдено: ${attachmentTotal}\nТеперь нажми «ZIP: сообщения + картинки».`);
  }

  function stopAutoScroll() {
    state.running = false;
    setButtonsRunning(false);
    setStatus(`Остановлено. Собрано блоков: ${state.records.size}`);
  }

  function clearRecords() {
    state.records.clear();
    state.batch = 0;
    state.seq = 0;
    setStatus('Очищено. Можно начать новое сканирование.');
  }

  function setButtonsRunning(isRunning) {
    document.querySelectorAll('[data-maxle-export], #maxle-scan, #maxle-auto, #maxle-clear').forEach((button) => {
      button.disabled = isRunning;
    });
    const stop = document.querySelector('#maxle-stop');
    if (stop) stop.disabled = !isRunning;
  }

  function ensurePanel() {
    let panel = document.getElementById(APP_ID);
    if (panel) {
      panel.dataset.hidden = 'false';
      return panel;
    }

    panel = document.createElement('aside');
    panel.id = APP_ID;
    panel.innerHTML = `
      <div class="maxle-header">
        <div class="maxle-title">MAX Chat Exporter</div>
        <button class="maxle-close" id="maxle-close" title="Скрыть">×</button>
      </div>
      <div class="maxle-body">
        <div class="maxle-row">
          <button class="maxle-primary" id="maxle-scan">Сканировать экран</button>
          <button id="maxle-auto">Автопрокрутка вверх</button>
        </div>
        <div class="maxle-row">
          <button class="maxle-danger" id="maxle-stop" disabled>Стоп</button>
          <button id="maxle-clear">Очистить</button>
        </div>
        <div class="maxle-status" id="maxle-status">Открой нужный чат и нажми «Автопрокрутка вверх». Затем экспортируй ZIP.</div>
        <div class="maxle-options">
          <label><input type="checkbox" id="maxle-oldest-first" checked> Старые сообщения сверху при экспорте</label>
          <label><input type="checkbox" id="maxle-scan-before-export" checked> Сканировать текущий экран перед экспортом</label>
        </div>
        <div class="maxle-row">
          <button data-maxle-export="json">JSON</button>
          <button data-maxle-export="txt">TXT</button>
          <button data-maxle-export="html">HTML</button>
          <button data-maxle-export="csv">CSV</button>
        </div>
        <div class="maxle-row">
          <button class="maxle-primary" data-maxle-export="zip">ZIP: сообщения + картинки</button>
        </div>
        <div class="maxle-note">ZIP создаёт папку с index.html, messages.json/csv/txt и attachments/msg_0001/att_01.jpg. Картинки привязаны к сообщениям; reply-цитаты и найденные permalink-ссылки MAX сохраняются отдельными полями.</div>
      </div>
    `;

    document.documentElement.appendChild(panel);

    panel.querySelector('#maxle-close').addEventListener('click', () => { panel.dataset.hidden = 'true'; });
    panel.querySelector('#maxle-scan').addEventListener('click', () => captureMessages());
    panel.querySelector('#maxle-auto').addEventListener('click', () => autoScrollUp());
    panel.querySelector('#maxle-stop').addEventListener('click', () => stopAutoScroll());
    panel.querySelector('#maxle-clear').addEventListener('click', () => clearRecords());
    panel.querySelectorAll('[data-maxle-export]').forEach((button) => {
      button.addEventListener('click', () => {
        if (document.querySelector('#maxle-scan-before-export')?.checked) captureMessages();
        const format = button.getAttribute('data-maxle-export');
        if (format === 'zip') downloadStructuredZip();
        else downloadText(format);
      });
    });

    return panel;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'MAX_EXPORTER_SHOW') {
      ensurePanel();
      sendResponse({ ok: true });
      return true;
    }
    return false;
  });

  if (location.hostname === 'web.max.ru') {
    const panel = ensurePanel();
    panel.dataset.hidden = 'true';
  }
})();
