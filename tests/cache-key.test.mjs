// The Blobs cache key shared by research-assist and research-review — it must
// be stable across key order, but sensitive to every nested value (the old
// inline version dropped nested keys entirely, so different result sets could
// collide on one cache entry).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stableKey } from '../src/lib/cache-key.mjs';

test('identical inputs hash identically regardless of key order', () => {
  const a = stableKey('overview', { q: 'x', items: [{ title: 't', year: 2020 }] }, 'm', 'v7');
  const b = stableKey('overview', { items: [{ year: 2020, title: 't' }], q: 'x' }, 'm', 'v7');
  assert.equal(a, b);
});

test('nested content participates in the hash', () => {
  const a = stableKey('overview', { q: 'x', items: [{ title: 'study one' }] }, 'm', 'v7');
  const b = stableKey('overview', { q: 'x', items: [{ title: 'study two' }] }, 'm', 'v7');
  assert.notEqual(a, b);
});

test('prefix, model and version are all part of the key identity', () => {
  const base = stableKey('review', { p: 'x' }, 'claude-sonnet-5', 'v7');
  assert.notEqual(base, stableKey('overview', { p: 'x' }, 'claude-sonnet-5', 'v7'));
  assert.notEqual(base, stableKey('review', { p: 'x' }, 'other-model', 'v7'));
  assert.notEqual(base, stableKey('review', { p: 'x' }, 'claude-sonnet-5', 'v8'));
  assert.match(base, /^review:[0-9a-z]+:claude-sonnet-5:v7$/);
});
