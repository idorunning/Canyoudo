// Unit tests for the cross-source dedup/merge. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDoi,
  normalizeTitle,
  workMergeKey,
  mergeWorks,
} from '../src/lib/research-merge.mjs';

const work = (over = {}) => ({
  title: 'Hot spots policing and crime reduction',
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

test('normalizeDoi strips scheme/host and lowercases', () => {
  assert.equal(normalizeDoi('https://doi.org/10.1093/Police/PAX001'), '10.1093/police/pax001');
  assert.equal(normalizeDoi('http://dx.doi.org/10.1/X'), '10.1/x');
  assert.equal(normalizeDoi('10.1/x'), '10.1/x');
  assert.equal(normalizeDoi(null), null);
  assert.equal(normalizeDoi(''), null);
});

test('normalizeTitle flattens case, punctuation and diacritics', () => {
  assert.equal(
    normalizeTitle('Hot-Spots Policing: a Réview!'),
    normalizeTitle('hot spots policing a review')
  );
});

test('same DOI merges across sources; richer record wins, fields fill', () => {
  const a = work({ doi: 'https://doi.org/10.1/ABC', abstract: 'A long abstract here.', citedBy: 50 });
  const b = work({
    doi: '10.1/abc',
    source: 'scholar',
    tldr: 'Short take.',
    pdfUrl: 'https://x/pdf',
    citedBy: 80,
  });
  const merged = mergeWorks([[a], [b]]);
  assert.equal(merged.length, 1);
  const m = merged[0];
  assert.equal(m.abstract, 'A long abstract here.'); // richer base
  assert.equal(m.tldr, 'Short take.'); // filled from the other record
  assert.equal(m.pdfUrl, 'https://x/pdf');
  assert.equal(m.citedBy, 80); // max
  assert.deepEqual(m.sources, ['openalex', 'scholar']);
});

test('no DOI: title+year is the fallback identity', () => {
  const a = work({ title: 'Body-Worn Cameras & Complaints' });
  const b = work({ title: 'body worn cameras complaints', source: 'core' });
  const c = work({ title: 'body worn cameras complaints', year: 2015, source: 'core' });
  assert.equal(workMergeKey(a), workMergeKey(b));
  assert.notEqual(workMergeKey(a), workMergeKey(c)); // different year ≠ same work
  assert.equal(mergeWorks([[a], [b, c]]).length, 2);
});

test('corroborated works rank first; rank then citations break ties', () => {
  const solo = work({ title: 'Unique paper', citedBy: 999 });
  const dupA = work({ doi: '10.9/dup', title: 'Corroborated paper' });
  const dupB = work({ doi: '10.9/dup', title: 'Corroborated paper', source: 'scholar' });
  // solo is ranked first by its catalogue, the dup second — corroboration wins.
  const merged = mergeWorks([[solo, dupA], [dupB]]);
  assert.equal(merged[0].title, 'Corroborated paper');
  assert.equal(merged[1].title, 'Unique paper');
});

test('keyless works are kept, never merged together', () => {
  const a = work({ title: '' });
  const b = work({ title: '', source: 'core' });
  assert.equal(mergeWorks([[a], [b]]).length, 2);
});

test('single-source passthrough keeps order and adds provenance', () => {
  const list = [work({ title: 'First' }), work({ title: 'Second' })];
  const merged = mergeWorks([list]);
  assert.deepEqual(merged.map((w) => w.title), ['First', 'Second']);
  assert.deepEqual(merged[0].sources, ['openalex']);
});

test('a preprint merged with a published copy loses the flag', () => {
  // Even when the preprint is the RICHER record (longer abstract, so it wins
  // as the merge base), finding the published version anywhere means "not yet
  // peer reviewed" is no longer true.
  const pre = work({ doi: '10.1/pp', preprint: true, abstract: 'A much longer, richer abstract.' });
  const pub = work({ doi: '10.1/pp', source: 'crossref' });
  const merged = mergeWorks([[pre], [pub]]);
  assert.equal(merged.length, 1);
  assert.ok(!merged[0].preprint, 'flag cleared when either copy is published');
});

test('a preprint merged with another preprint copy keeps the flag', () => {
  const a = work({ doi: '10.1/pq', preprint: true });
  const b = work({ doi: '10.1/pq', source: 'scholar', preprint: true });
  const merged = mergeWorks([[a], [b]]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].preprint, true);
});

test('an unmerged preprint keeps its flag through the single-copy path', () => {
  const merged = mergeWorks([[work({ title: 'Solo preprint', preprint: true })]]);
  assert.equal(merged[0].preprint, true);
});

test('retraction ORs across copies (either flag makes the merged work retracted)', () => {
  // Only OpenAlex carries the Retraction Watch signal, and it can be the leaner
  // record — so a flag on EITHER copy must survive the merge, unlike preprint.
  const flagged = work({ doi: '10.1/rr', retracted: true, abstract: 'short' });
  const clean = work({ doi: '10.1/rr', source: 'crossref', abstract: 'A much longer, richer abstract wins as base.' });
  assert.equal(mergeWorks([[flagged], [clean]])[0].retracted, true);
  assert.equal(mergeWorks([[clean], [flagged]])[0].retracted, true);
});

test('a merge of two non-retracted copies carries no retracted key', () => {
  const a = work({ doi: '10.1/rs' });
  const b = work({ doi: '10.1/rs', source: 'scholar' });
  assert.equal('retracted' in mergeWorks([[a], [b]])[0], false);
});
