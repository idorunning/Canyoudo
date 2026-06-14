// Unit tests for the briefing evidence curation. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { curate, CURATE_LIMIT } from '../src/lib/briefing-curate.mjs';
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
