// Unit tests for the related-topics co-occurrence ranking. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relatedTopics } from '../src/lib/related-topics.mjs';

// Three articles; their matching topic slugs.
const corpus = [
  ['drugs', 'policing', 'harm-reduction'],
  ['drugs', 'policing'],
  ['ai', 'policing'],
];

test('ranks co-occurring topics by shared articles, descending', () => {
  const out = relatedTopics('drugs', corpus);
  // Both 'drugs' articles also carry 'policing' (2); one also 'harm-reduction' (1).
  assert.deepEqual(out, [
    { slug: 'policing', count: 2 },
    { slug: 'harm-reduction', count: 1 },
  ]);
});

test('never includes the current topic itself', () => {
  const out = relatedTopics('policing', corpus);
  assert.ok(!out.some((r) => r.slug === 'policing'));
});

test('returns nothing for a topic that matches no article', () => {
  assert.deepEqual(relatedTopics('nonexistent', corpus), []);
});

test('respects the limit and breaks ties by slug', () => {
  const ties = [
    ['t', 'b', 'a', 'c'],
  ];
  const out = relatedTopics('t', ties, 2);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((r) => r.slug), ['a', 'b']); // count 1 each → alphabetical
});
