// Unit tests for the affiliate-link helper. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withAffiliateTag } from '../src/lib/affiliate.mjs';

test('appends the tag to Amazon links', () => {
  assert.equal(
    withAffiliateTag('https://www.amazon.co.uk/dp/B0ABC123', 'tap-21'),
    'https://www.amazon.co.uk/dp/B0ABC123?tag=tap-21'
  );
  assert.equal(
    withAffiliateTag('https://amazon.com/dp/B0ABC123?ref=x', 'tap-20'),
    'https://amazon.com/dp/B0ABC123?ref=x&tag=tap-20'
  );
  assert.equal(
    withAffiliateTag('https://amzn.to/3xYz', 'tap-21'),
    'https://amzn.to/3xYz?tag=tap-21'
  );
});

test('replaces an existing tag rather than doubling it', () => {
  const out = withAffiliateTag('https://www.amazon.co.uk/dp/B0ABC123?tag=old-21', 'new-21');
  assert.equal(out, 'https://www.amazon.co.uk/dp/B0ABC123?tag=new-21');
});

test('leaves non-Amazon links untouched', () => {
  const urls = [
    'https://bookshop.org/p/books/some-book',
    'https://www.waterstones.com/book/x',
    'https://notamazon.co.uk/dp/B0ABC123',
    'https://amazonfake.com/dp/B0ABC123',
  ];
  for (const u of urls) assert.equal(withAffiliateTag(u, 'tap-21'), u);
});

test('passes through when no tag configured or URL malformed', () => {
  assert.equal(withAffiliateTag('https://www.amazon.co.uk/dp/X', ''), 'https://www.amazon.co.uk/dp/X');
  assert.equal(withAffiliateTag('https://www.amazon.co.uk/dp/X', undefined), 'https://www.amazon.co.uk/dp/X');
  assert.equal(withAffiliateTag('not a url', 'tap-21'), 'not a url');
  assert.equal(withAffiliateTag('', 'tap-21'), '');
  assert.equal(withAffiliateTag(null, 'tap-21'), '');
});
