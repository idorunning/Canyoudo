// Unit tests for the saved-papers export formatters. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatReference, formatReferenceList, toRis } from '../src/lib/reference-format.mjs';

const full = {
  title: 'Hot spots policing of small geographic areas',
  authors: ['A. Braga', 'B. Turchan', 'C. Papachristos', 'D. Hureau'],
  moreAuthors: 1,
  year: 2019,
  venue: 'Campbell Systematic Reviews',
  doi: 'https://doi.org/10.1002/cl2.1046',
  pdfUrl: 'https://example.org/p.pdf',
  oaUrl: 'https://example.org/p.pdf',
};

const sparse = { title: 'Sparse paper', authors: [], moreAuthors: 0, year: null, venue: null, doi: null, pdfUrl: null, oaUrl: null };

test('formatReference renders the full Harvard-ish line', () => {
  assert.equal(
    formatReference(full),
    'A. Braga, B. Turchan, C. Papachristos, D. Hureau and 1 others (2019) ' +
      '‘Hot spots policing of small geographic areas’, Campbell Systematic Reviews. ' +
      'Available at: https://doi.org/10.1002/cl2.1046'
  );
});

test('formatReference joins two authors with "and"', () => {
  const r = formatReference({ ...full, authors: ['A. Braga', 'B. Turchan'], moreAuthors: 0 });
  assert.ok(r.startsWith('A. Braga and B. Turchan (2019)'));
});

test('formatReference skips missing fields cleanly', () => {
  assert.equal(formatReference(sparse), '‘Sparse paper’.');
  assert.ok(!formatReference(sparse).includes('undefined'));
});

test('formatReference falls back to the open-access URL without a DOI', () => {
  const r = formatReference({ ...sparse, oaUrl: 'https://example.org/x' });
  assert.ok(r.endsWith('Available at: https://example.org/x'));
});

test('formatReferenceList sorts alphabetically by first author', () => {
  const list = formatReferenceList([
    { ...sparse, title: 'Zeta', authors: ['Z. Zed'] },
    { ...sparse, title: 'Alpha', authors: ['A. Aardvark'] },
  ]);
  const [first, second] = list.split('\n\n');
  assert.ok(first.startsWith('A. Aardvark'));
  assert.ok(second.startsWith('Z. Zed'));
});

test('toRis emits one well-formed record per work', () => {
  const ris = toRis([full, sparse]);
  const records = ris.split('ER  - ').filter((r) => r.trim());
  assert.equal(records.length, 2);
  assert.ok(ris.startsWith('TY  - JOUR'));
  assert.ok(ris.includes('AU  - A. Braga'));
  assert.ok(ris.includes('TI  - Hot spots policing of small geographic areas'));
  assert.ok(ris.includes('PY  - 2019'));
  assert.ok(ris.includes('DO  - 10.1002/cl2.1046')); // bare DOI, not the URL
  assert.ok(ris.includes('UR  - https://example.org/p.pdf'));
  assert.ok(ris.endsWith('ER  - \r\n'));
});
