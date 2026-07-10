// Unit tests for the briefing evidence curation. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { curate, CURATE_LIMIT, PREPRINT_CAP } from '../src/lib/briefing-curate.mjs';
import { workMergeKey } from '../src/lib/research-merge.mjs';

const work = (over = {}) => ({
  title: 'A study',
  authors: ['A. Braga'],
  moreAuthors: 0,
  year: 2019,
  venue: null,
  publisher: null,
  doi: null,
  pdfUrl: null,
  oaUrl: null,
  isOa: false,
  citedBy: 0,
  abstract: null,
  source: 'openalex',
  ...over,
});

const titled = (n, over = {}) => work({ title: `Study ${n}`, ...over });

test('dedups a study found across two angles into one entry', () => {
  const shared = { doi: '10.1/shared', title: 'Shared study' };
  const out = curate([
    [titled('a'), work(shared)],
    [work(shared), titled('b')],
  ]);
  const sharedKey = workMergeKey(work(shared));
  const matches = out.filter((w) => workMergeKey(w) === sharedKey);
  assert.equal(matches.length, 1, 'shared study appears exactly once');
});

test('a study corroborated by two angles records both sources', () => {
  const shared = { doi: '10.1/x', title: 'Corroborated', source: 'openalex' };
  const out = curate([
    [work({ ...shared, source: 'openalex' })],
    [work({ ...shared, source: 'scholar' })],
  ]);
  const hit = out.find((w) => w.doi === '10.1/x');
  assert.ok(hit, 'the corroborated study is present');
  assert.deepEqual([...hit.sources].sort(), ['openalex', 'scholar']);
});

test('interleaves angles so each contributes (coverage over dominance)', () => {
  // Angle A is large; angle B has one study. Round-robin must still surface B's
  // study early rather than letting A fill the whole quota first.
  const a = Array.from({ length: 10 }, (_, i) => titled(`a${i}`, { doi: `10.1/a${i}` }));
  const b = [titled('b0', { doi: '10.1/b0' })];
  const out = curate([a, b], 6);
  assert.ok(
    out.some((w) => w.doi === '10.1/b0'),
    'the lone angle-B study is included'
  );
  // It should appear in the first round (after the first A pick), not last.
  const idx = out.findIndex((w) => w.doi === '10.1/b0');
  assert.ok(idx <= 1, `angle-B study surfaces early (index ${idx})`);
});

test('slices to the limit', () => {
  const many = Array.from({ length: 30 }, (_, i) => titled(i, { doi: `10.1/n${i}` }));
  const out = curate([many], 12);
  assert.equal(out.length, 12);
});

test('default limit is CURATE_LIMIT and is honoured', () => {
  const many = Array.from({ length: 40 }, (_, i) => titled(i, { doi: `10.1/m${i}` }));
  assert.equal(curate([many]).length, CURATE_LIMIT);
});

test('thin pools pass through unchanged (no padding, no loss)', () => {
  const out = curate([[titled('x', { doi: '10.1/x' })], [titled('y', { doi: '10.1/y' })]]);
  assert.equal(out.length, 2);
});

test('drops keyless works (no title, no DOI) rather than numbering them', () => {
  const out = curate([[work({ title: '', doi: null }), titled('real', { doi: '10.1/real' })]]);
  assert.equal(out.length, 1);
  assert.equal(out[0].doi, '10.1/real');
});

test('handles empty and missing angle lists', () => {
  assert.deepEqual(curate([]), []);
  assert.deepEqual(curate([[], null, undefined]), []);
  assert.deepEqual(curate(undefined), []);
});

// ---- the preprint cap (the review pipeline's early-research pseudo-angle) ---

const preprint = (n) => titled(`p${n}`, { doi: `10.1/p${n}`, preprint: true });

test('caps preprints at preprintCap while peer-reviewed picks keep flowing', () => {
  const reviewed = Array.from({ length: 8 }, (_, i) => titled(`r${i}`, { doi: `10.1/r${i}` }));
  const preprints = Array.from({ length: 5 }, (_, i) => preprint(i));
  const out = curate([reviewed, preprints], 10, { preprintCap: PREPRINT_CAP });
  assert.equal(out.filter((w) => w.preprint).length, PREPRINT_CAP);
  assert.equal(out.length, 10, 'skipped preprints do not shrink the set');
  assert.equal(out.filter((w) => !w.preprint).length, 10 - PREPRINT_CAP);
});

test('no cap by default — existing callers see byte-identical behaviour', () => {
  const preprints = Array.from({ length: 5 }, (_, i) => preprint(i));
  const out = curate([preprints], 10);
  assert.equal(out.filter((w) => w.preprint).length, 5);
});

test('a preprint deduped against a peer-reviewed copy loses the flag and spares the cap', () => {
  // The same DOI arrives via a normal angle (published) and the preprint
  // pseudo-angle: mergeWorks clears the flag, so it must not consume the cap —
  // leaving room for genuinely unpublished preprints.
  const shared = { doi: '10.1/both', title: 'Published and preprinted' };
  const reviewed = [work(shared), titled('r1', { doi: '10.1/r1' })];
  const preprints = [work({ ...shared, preprint: true }), preprint(1), preprint(2), preprint(3)];
  const out = curate([reviewed, preprints], 10, { preprintCap: 2 });
  const merged = out.find((w) => w.doi === '10.1/both');
  assert.ok(merged, 'the deduped study is present');
  assert.ok(!merged.preprint, 'merge with a published copy cleared the flag');
  assert.equal(out.filter((w) => w.preprint).length, 2, 'the cap still admits two real preprints');
});

test('the cap is deterministic — same inputs, same picks, same order', () => {
  const reviewed = Array.from({ length: 6 }, (_, i) => titled(`r${i}`, { doi: `10.1/r${i}` }));
  const preprints = Array.from({ length: 4 }, (_, i) => preprint(i));
  const a = curate([reviewed, preprints], 8, { preprintCap: 2 });
  const b = curate([reviewed, preprints], 8, { preprintCap: 2 });
  assert.deepEqual(a.map((w) => w.doi), b.map((w) => w.doi));
});
