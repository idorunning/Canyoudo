// Unit tests for the photo-led share card's layout maths and overlay artwork.
// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planHeroLayout,
  renderHeroOverlaySvg,
  WIDTH,
  HEIGHT,
  INSET_BOX,
} from '../src/lib/og-hero-card.mjs';
import { articleHero } from '../src/lib/article-hero.mjs';

test('a landscape hero close to the card ratio fills the frame', () => {
  // Real heroes from the content collection: 16:9, 3:2 and a wide 2.1:1.
  for (const dims of [{ width: 1600, height: 900 }, { width: 1600, height: 1067 }, { width: 1408, height: 667 }]) {
    assert.equal(planHeroLayout(dims).layout, 'cover', `${dims.width}x${dims.height}`);
  }
});

test('squares, portraits, panoramas and thumbnails are letterboxed, never cropped', () => {
  for (const dims of [
    { width: 1280, height: 1280 }, // square logo art
    { width: 208, height: 277 }, // a small portrait
    { width: 1694, height: 746 }, // a 2.27:1 chart, whose axis a crop would cut
    { width: 300, height: 170 }, // right ratio, far too few pixels
  ]) {
    assert.equal(planHeroLayout(dims).layout, 'inset', `${dims.width}x${dims.height}`);
  }
});

test('a letterboxed hero stays whole, in proportion, and inside the box', () => {
  const { frame } = planHeroLayout({ width: 1694, height: 746 });
  assert.ok(Math.abs(frame.width / frame.height - 1694 / 746) < 0.01, 'aspect ratio preserved');
  assert.ok(frame.width <= INSET_BOX.width && frame.height <= INSET_BOX.height, 'fits the box');
  assert.ok(frame.left >= INSET_BOX.left && frame.top >= INSET_BOX.top, 'inside the box');
  // Centred: the margin either side matches, to the odd rounded pixel.
  const leftMargin = frame.left - INSET_BOX.left;
  const rightMargin = INSET_BOX.left + INSET_BOX.width - (frame.left + frame.width);
  assert.ok(Math.abs(leftMargin - rightMargin) <= 1, `${leftMargin} vs ${rightMargin}`);
});

test('a tiny hero is scaled up only so far, and clears the brand band', () => {
  const { frame } = planHeroLayout({ width: 180, height: 180 });
  assert.equal(frame.width, 288); // 1.6× and no further
  assert.equal(frame.height, 288);
  assert.ok(frame.top + frame.height <= INSET_BOX.top + INSET_BOX.height);
});

test('planHeroLayout rejects dimensions it cannot use', () => {
  for (const dims of [{ width: 0, height: 100 }, { width: undefined, height: 100 }, {}]) {
    assert.equal(planHeroLayout(dims), null);
  }
});

test('the overlay is a transparent 1200×630 layer carrying the brand line only', () => {
  const svg = renderHeroOverlaySvg({ section: 'Evidence & Practice' });
  assert.match(svg, new RegExp(`width="${WIDTH}" height="${HEIGHT}"`));
  assert.match(svg, /EVIDENCE &amp; PRACTICE/); // escaped, never a bare ampersand
  assert.match(svg, /Thinking About Policing/);
  assert.ok(!/<rect x="0" y="0" width="1200" height="630"/.test(svg), 'must not paint over the photo');
  // The headline is X's job, not the card's — nothing here repeats it.
  assert.ok(!/font-size="[5-9][0-9]"/.test(svg), 'no display-sized type on a photo card');
});

test('the overlay outlines a letterboxed hero and leaves a full-bleed one alone', () => {
  const frame = { left: 100, top: 40, width: 1000, height: 400 };
  assert.match(renderHeroOverlaySvg({ section: 'Data Stories', frame }), /stroke-opacity/);
  assert.ok(!/stroke-opacity/.test(renderHeroOverlaySvg({ section: 'Data Stories' })));
});

test('articleHero leads Influential People with the portrait, everything else with the hero', () => {
  assert.equal(
    articleHero({ section: 'influential-people', portrait: '/images/p.jpg', heroImage: '/images/h.jpg' }),
    '/images/p.jpg'
  );
  assert.equal(
    articleHero({ section: 'influential-people', heroImage: '/images/h.jpg' }),
    '/images/h.jpg'
  );
  assert.equal(
    articleHero({ section: 'police-policy', portrait: '/images/p.jpg', heroImage: '/images/h.jpg' }),
    '/images/h.jpg'
  );
  assert.equal(articleHero({ section: 'police-policy' }), undefined);
});
