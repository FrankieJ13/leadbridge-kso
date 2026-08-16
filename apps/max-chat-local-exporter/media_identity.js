(function initMaxExporterMediaIdentity(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MaxExporterMediaIdentity = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMaxExporterMediaIdentity() {
  'use strict';

  function fnv1a(value) {
    const text = String(value || '');
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }

  function normalizeMediaUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.startsWith('data:')) return `data:${fnv1a(raw)}`;
    if (raw.startsWith('blob:')) return raw;

    try {
      const url = new URL(raw, 'https://web.max.ru/');
      url.hash = '';
      ['expires', 'expire', 'expiration'].forEach((name) => url.searchParams.delete(name));
      url.searchParams.sort();
      return url.href;
    } catch (_) {
      return raw;
    }
  }

  function mediaKey(media) {
    if (media?.inlineDataUrl) return `inline:${fnv1a(media.inlineDataUrl)}`;
    return normalizeMediaUrl(media?.primaryUrl || media?.urls?.[0] || '');
  }

  function selectViewportMedia(candidates, existingKeys = new Set()) {
    const mediaByCandidate = candidates.map(() => []);
    const buckets = new Map();

    candidates.forEach((candidate, candidateIndex) => {
      (candidate.media || []).forEach((media, mediaIndex) => {
        const key = mediaKey(media);
        if (!key) return;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push({
          candidateIndex,
          mediaIndex,
          media,
          distance: Number.isFinite(media.ownerDistance) ? media.ownerDistance : Number.MAX_SAFE_INTEGER,
          area: Number.isFinite(candidate.area) ? candidate.area : Number.MAX_SAFE_INTEGER
        });
      });
    });

    const claimedKeys = new Set();
    let skipped = 0;

    buckets.forEach((occurrences, key) => {
      if (existingKeys.has(key)) {
        skipped += occurrences.length;
        return;
      }

      occurrences.sort((left, right) => (
        left.distance - right.distance
        || left.area - right.area
        || left.candidateIndex - right.candidateIndex
        || left.mediaIndex - right.mediaIndex
      ));

      const owner = occurrences[0];
      mediaByCandidate[owner.candidateIndex].push(owner.media);
      claimedKeys.add(key);
      skipped += Math.max(0, occurrences.length - 1);
    });

    return { mediaByCandidate, claimedKeys, skipped };
  }

  return {
    mediaKey,
    normalizeMediaUrl,
    selectViewportMedia
  };
});
