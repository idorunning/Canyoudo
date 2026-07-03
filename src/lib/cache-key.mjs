// Stable, compact Blobs cache keys for the AI assist functions — pure and
// unit-testable, shared by research-assist.mts and research-review.mts so the
// two can never hash differently.
//
// Note: the previous inline implementation passed sorted top-level keys as a
// JSON.stringify replacer ARRAY, which silently drops every nested key that
// isn't in the list — so an overview's cache key ignored the item contents
// entirely. canonical() sorts keys recursively instead, so the whole input
// participates in the hash.

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = canonical(value[k]);
    return out;
  }
  return value;
}

/**
 * A short, deterministic key: the input is canonicalised (keys sorted at every
 * depth), serialised and hashed, so identical requests hit the same cache
 * entry and the key stays well under Blobs' name limits regardless of input
 * size. Two independently-seeded 32-bit passes give a 64-bit key — a shared
 * cache entry serves everyone, so a collision would hand one reader another's
 * answer; 64 bits puts that firmly out of reach at any plausible entry count.
 */
export function stableKey(prefix, input, model, version) {
  const norm = JSON.stringify(canonical(input));
  let h1 = 0x811c9dc5;
  let h2 = 0x1505;
  for (let i = 0; i < norm.length; i++) {
    const c = norm.charCodeAt(i);
    h1 = (Math.imul(h1, 31) + c) | 0;
    h2 = (Math.imul(h2, 37) + c) | 0;
  }
  return `${prefix}:${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}:${model}:${version}`;
}
