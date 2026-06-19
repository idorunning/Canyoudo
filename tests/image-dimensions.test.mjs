// Unit tests for the raw-HTML <img> rewriter used by rehype-image-dimensions.
// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDimsToRawImgs } from '../src/plugins/rehype-image-dimensions.mjs';

// Stub the size lookup so the tests don't touch the filesystem.
const sizeOf = (src) => (src === '/images/peel.jpg' ? { width: 800, height: 1000 } : null);

test('adds width/height to a local, unsized <img>', () => {
  const out = addDimsToRawImgs('<img src="/images/peel.jpg" alt="Peel" loading="lazy" />', sizeOf);
  assert.match(out, /width="800"/);
  assert.match(out, /height="1000"/);
  // Existing attributes are preserved.
  assert.match(out, /loading="lazy"/);
  assert.match(out, /alt="Peel"/);
});

test('leaves an already-sized <img> untouched', () => {
  const input = '<img src="/images/peel.jpg" width="100" height="100" />';
  assert.equal(addDimsToRawImgs(input, sizeOf), input);
});

test('skips remote and unknown images', () => {
  const remote = '<img src="//cdn.example.com/x.jpg" />';
  assert.equal(addDimsToRawImgs(remote, sizeOf), remote);
  const missing = '<img src="/images/missing.jpg" />';
  assert.equal(addDimsToRawImgs(missing, sizeOf), missing);
});

test('handles multiple imgs in one raw block (e.g. inside a figure)', () => {
  const block = '<figure><img src="/images/peel.jpg" /><img src="/images/missing.jpg" /></figure>';
  const out = addDimsToRawImgs(block, sizeOf);
  assert.equal((out.match(/width="800"/g) || []).length, 1);
  assert.match(out, /<img src="\/images\/missing\.jpg" \/>/); // untouched
});

test('returns non-img html unchanged', () => {
  const html = '<p>no images here</p>';
  assert.equal(addDimsToRawImgs(html, sizeOf), html);
});
