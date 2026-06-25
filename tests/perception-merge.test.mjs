// Unit tests for the perception cross-source merge. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRaw, mergeFacet } from '../scripts/perception/merge.mjs';
import { unionForceRaws } from '../scripts/build-perception.mjs';
import { FACETS } from '../scripts/perception/config.mjs';
import { THEME_KEYS } from '../scripts/perception/lexicons.mjs';

const emptyFacet = () => ({
  corpusTokens: 0,
  topWords: [],
  sentiment: { mean: 0, positive: 0, neutral: 0, negative: 0, gdeltToneMean: null },
  lexicons: Object.fromEntries(THEME_KEYS.map((k) => [k, { items: 0, ratePer10k: 0 }])),
  entities: [],
});

const facet = (over = {}) => ({ ...emptyFacet(), ...over });

const raw = (over = {}) => ({
  schemaVersion: 1,
  year: 2020,
  provenance: { generatedAt: '2026-01-01T00:00:00Z', method: 'guardian', sourcesUsed: ['The Guardian'], itemCount: 0, sparse: false, sample: false, notes: '' },
  sources: [],
  facets: Object.fromEntries(FACETS.map((f) => [f, emptyFacet()])),
  ...over,
});

test('mergeRaw returns the lone object unchanged for a single source', () => {
  const a = raw();
  assert.equal(mergeRaw([a]), a);
});

test('mergeRaw drops empty/null entries and returns null for none', () => {
  assert.equal(mergeRaw([]), null);
  assert.equal(mergeRaw([null, undefined]), null);
  const a = raw();
  assert.equal(mergeRaw([null, a]), a);
});

test('mergeFacet sums corpus tokens, word counts and lexicon items', () => {
  const a = facet({
    corpusTokens: 1000,
    topWords: [{ term: 'arrest', count: 10 }, { term: 'court', count: 5 }],
    lexicons: { ...emptyFacet().lexicons, misconduct: { items: 4, ratePer10k: 0 } },
  });
  const b = facet({
    corpusTokens: 500,
    topWords: [{ term: 'arrest', count: 3 }, { term: 'protest', count: 7 }],
    lexicons: { ...emptyFacet().lexicons, misconduct: { items: 6, ratePer10k: 0 } },
  });
  const m = mergeFacet([a, b]);
  assert.equal(m.corpusTokens, 1500);
  const arrest = m.topWords.find((w) => w.term === 'arrest');
  assert.equal(arrest.count, 13); // 10 + 3
  assert.equal(m.topWords.find((w) => w.term === 'protest').count, 7);
  assert.equal(m.lexicons.misconduct.items, 10); // 4 + 6
  assert.equal(arrest.ratePer10k, 0); // rates are recomputed downstream by build
});

test('mergeFacet sums entity counts keyed by name and keeps type', () => {
  const a = facet({ entities: [{ name: 'Metropolitan Police', type: 'force', count: 8 }] });
  const b = facet({ entities: [{ name: 'Metropolitan Police', type: 'force', count: 5 }, { name: 'Cressida Dick', type: 'leader', count: 3 }] });
  const m = mergeFacet([a, b]);
  const met = m.entities.find((e) => e.name === 'Metropolitan Police');
  assert.equal(met.count, 13);
  assert.equal(met.type, 'force');
  assert.equal(m.entities.find((e) => e.name === 'Cressida Dick').count, 3);
});

test('mergeFacet item-weights the sentiment mean and ignores undefined facets', () => {
  const a = facet({ sentiment: { mean: -1, positive: 0, neutral: 0, negative: 100, gdeltToneMean: null } });
  const b = facet({ sentiment: { mean: 1, positive: 100, neutral: 0, negative: 0, gdeltToneMean: null } });
  // 100 items at -1 and 100 items at +1 → weighted mean 0.
  assert.equal(mergeFacet([a, b, undefined]).sentiment.mean, 0);
  // Lopsided weights pull the mean toward the heavier source.
  const c = facet({ sentiment: { mean: -1, positive: 0, neutral: 0, negative: 300, gdeltToneMean: null } });
  assert.equal(mergeFacet([c, b]).sentiment.mean, -0.5); // (-1*300 + 1*100)/400
});

test('mergeFacet averages only the non-null gdelt tone values', () => {
  const a = facet({ sentiment: { mean: 0, positive: 1, neutral: 0, negative: 0, gdeltToneMean: -2 } });
  const b = facet({ sentiment: { mean: 0, positive: 1, neutral: 0, negative: 0, gdeltToneMean: -4 } });
  const noTone = facet({ sentiment: { mean: 0, positive: 1, neutral: 0, negative: 0, gdeltToneMean: null } });
  assert.equal(mergeFacet([a, b, noTone]).sentiment.gdeltToneMean, -3); // (-2 + -4)/2
  assert.equal(mergeFacet([noTone]).sentiment.gdeltToneMean, null);
});

test('mergeRaw unions provenance, marks method hybrid and concats sources', () => {
  const a = raw({ provenance: { ...raw().provenance, method: 'guardian', sourcesUsed: ['The Guardian'], itemCount: 100, sample: false }, sources: [{ source: 'The Guardian' }] });
  const b = raw({ provenance: { ...raw().provenance, method: 'gdelt', sourcesUsed: ['GDELT DOC 2.0'], itemCount: 50, sample: false }, sources: [{ source: 'BBC News' }, { source: 'Sky News' }] });
  const m = mergeRaw([a, b]);
  assert.equal(m.provenance.method, 'hybrid');
  assert.deepEqual(m.provenance.sourcesUsed, ['The Guardian', 'GDELT DOC 2.0']);
  assert.equal(m.provenance.itemCount, 150);
  // Round-robin interleave keeps a spread of outlets at the front of the sample.
  assert.deepEqual(m.sources.map((s) => s.source), ['The Guardian', 'BBC News', 'Sky News']);
});

test('mergeRaw is sample only when every contributor is sample', () => {
  const seed = raw({ provenance: { ...raw().provenance, method: 'seed', sample: true } });
  const seed2 = raw({ provenance: { ...raw().provenance, method: 'seed', sample: true } });
  const real = raw({ provenance: { ...raw().provenance, method: 'guardian', sample: false } });
  assert.equal(mergeRaw([seed, seed2]).provenance.sample, true);
  assert.equal(mergeRaw([seed, real]).provenance.sample, false);
});

const forceRaw = (year, forceBreakdown) => ({ year, forceBreakdown });
const force = (volume) => ({ name: 'F', volume, tone: null, sentiment: { mean: 0, positive: 0, neutral: 0, negative: 0 }, topWords: [] });

test('unionForceRaws combines disjoint batches into one year', () => {
  // The parallel force batches each carry a different slice of the 17 forces.
  const b1 = forceRaw(2025, { metropolitan: force(1200), 'police-scotland': force(400) });
  const b2 = forceRaw(2025, { kent: force(300), essex: force(150) });
  const { year, forceBreakdown } = unionForceRaws([b1, b2]);
  assert.equal(year, 2025);
  assert.deepEqual(Object.keys(forceBreakdown).sort(), ['essex', 'kent', 'metropolitan', 'police-scotland']);
  assert.equal(forceBreakdown.metropolitan.volume, 1200);
  assert.equal(forceBreakdown.kent.volume, 300);
});

test('unionForceRaws lets a force with data win over an empty one regardless of order', () => {
  const good = forceRaw(2025, { metropolitan: force(1200) });
  const empty = forceRaw(2025, { metropolitan: force(0) });
  // Empty-then-good and good-then-empty both keep the good (volume > 0) entry.
  assert.equal(unionForceRaws([empty, good]).forceBreakdown.metropolitan.volume, 1200);
  assert.equal(unionForceRaws([good, empty]).forceBreakdown.metropolitan.volume, 1200);
});

test('unionForceRaws tolerates null entries and missing breakdowns', () => {
  const { year, forceBreakdown } = unionForceRaws([null, forceRaw(2024, undefined), forceRaw(2024, { kent: force(10) })]);
  assert.equal(year, 2024);
  assert.deepEqual(Object.keys(forceBreakdown), ['kent']);
});
