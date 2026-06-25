// Dependency-free text-analysis helpers for the perception pipeline. Given the
// plain text of a matched article (headline + body), these produce the DERIVED
// aggregates we keep — the text itself is discarded by the caller immediately
// after. Shared by scripts/perception/fetch-guardian.mjs (real corpus) and any
// agent tooling, so every source is measured identically.
//
// Tokenisation mirrors the whole-word, case-insensitive idiom of
// src/lib/topic-matcher.mjs (boundaries are non-alphanumerics), with a light
// plural/verb fold so "officers"→"officer", "failings"→"failing".

import { isCloudStop, DOMAIN_STOP } from './stopwords.mjs';
import { THEMES, THEME_KEYS, POSITIVE, NEGATIVE } from './lexicons.mjs';

export function normalise(s) {
  return String(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

// Light, rule-based lemmatiser — good enough for frequency folding, no deps.
export function lemma(w) {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && w.endsWith('sses')) return w.slice(0, -2);
  if (w.length > 4 && (w.endsWith('ings'))) return w.slice(0, -1);
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  // Strip a plural "s" — but NOT after u/i ("virus", "boris", "analysis", "crisis"),
  // which are stems, not plurals; that mis-fold mangled names in the cloud.
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) return w.slice(0, -1);
  return w;
}

export function tokenize(text) {
  return normalise(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// Count a single document's contribution into running accumulators.
// `acc` is created by newAccumulator(); call accumulate() per document, then
// finalise() once.
export function newAccumulator() {
  return {
    corpusTokens: 0,
    wordCounts: new Map(),
    sentiment: { positive: 0, neutral: 0, negative: 0, scoreSum: 0 },
    lexicons: Object.fromEntries(THEME_KEYS.map((k) => [k, 0])),
    entities: new Map(), // name -> { name, type, count }
  };
}

// Build a phrase index once so multi-word theme/entity terms can be matched.
function countPhrase(haystack, phrase) {
  if (!phrase.includes(' ')) return 0;
  let n = 0;
  let i = 0;
  while ((i = haystack.indexOf(phrase, i)) !== -1) {
    n++;
    i += phrase.length;
  }
  return n;
}

export function accumulate(acc, text, entityDefs) {
  const norm = normalise(text);
  const tokens = tokenize(norm);
  acc.corpusTokens += tokens.length;

  // Word frequencies (folded, cloud-stopped).
  let posHits = 0;
  let negHits = 0;
  for (const raw of tokens) {
    if (POSITIVE.has(raw)) posHits++;
    if (NEGATIVE.has(raw)) negHits++;
    if (isCloudStop(raw)) continue;
    const t = lemma(raw);
    if (t.length < 3) continue;
    acc.wordCounts.set(t, (acc.wordCounts.get(t) ?? 0) + 1);
  }

  // Document-level sentiment toward the police.
  if (posHits === 0 && negHits === 0) acc.sentiment.neutral++;
  else if (posHits >= negHits) acc.sentiment.positive++;
  else acc.sentiment.negative++;
  const denom = posHits + negHits;
  if (denom > 0) acc.sentiment.scoreSum += (posHits - negHits) / denom;

  // Themed lexicons — count documents mentioning each theme at least once.
  for (const key of THEME_KEYS) {
    const hit = THEMES[key].some((term) =>
      term.includes(' ') ? norm.includes(term) : acc._tokenSet?.has(term) ?? tokens.includes(term)
    );
    if (hit) acc.lexicons[key]++;
  }

  // Named entities (forces, leaders, officers, roles) — phrase or token match.
  for (const def of entityDefs) {
    const hit = def.match.includes(' ') ? norm.includes(def.match) : tokens.includes(def.match);
    if (hit) {
      const e = acc.entities.get(def.name) ?? { name: def.name, type: def.type, count: 0 };
      e.count += 1 + countPhrase(norm, def.match); // rough mention count
      acc.entities.set(def.name, e);
    }
  }
}

const per10k = (count, tokens) => (tokens > 0 ? Math.round((count / tokens) * 10000 * 10) / 10 : 0);

export function finalise(acc, { topN = 250, entityTopN = 15 } = {}) {
  const corpusTokens = acc.corpusTokens;
  const topWords = [...acc.wordCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([term, count]) => ({ term, count, ratePer10k: per10k(count, corpusTokens) }));

  const docs = acc.sentiment.positive + acc.sentiment.neutral + acc.sentiment.negative;
  const mean = docs > 0 ? Math.round((acc.sentiment.scoreSum / docs) * 1000) / 1000 : 0;

  const lexicons = Object.fromEntries(
    THEME_KEYS.map((k) => [k, { items: acc.lexicons[k], ratePer10k: per10k(acc.lexicons[k], corpusTokens) }])
  );

  const entities = [...acc.entities.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, entityTopN)
    .map((e) => ({ ...e, ratePer10k: per10k(e.count, corpusTokens) }));

  return {
    corpusTokens,
    topWords,
    sentiment: { mean, positive: acc.sentiment.positive, neutral: acc.sentiment.neutral, negative: acc.sentiment.negative, gdeltToneMean: null },
    lexicons,
    entities,
  };
}

export { per10k };
