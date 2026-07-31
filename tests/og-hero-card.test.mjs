// Unit tests for the share-card system: which type a hero gets, and the layout
// each type draws. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planCard,
  paleGroundShare,
  renderTypeA,
  renderTypeB,
  WIDTH,
  HEIGHT,
  MARK_SIZE,
  B_PLATE_WIDTH,
} from '../src/lib/og-hero-card.mjs';
import { escapeXml } from '../src/lib/og-card.mjs';
import { articleHero } from '../src/lib/article-hero.mjs';

const LONG_TITLE = 'Procedural Justice: A Guide for Police Leaders — and How to Explain What It Actually Is';
const LONGEST_TITLE = "How Worthing Became 'The Shoplifting Capital of the UK' — And Why That Was Never the Real Story";

test('a big landscape photograph takes Type A', () => {
  // Real heroes from the content collection: 16:9, 3:2, a wide 2.1:1 and a 4:3.
  for (const dims of [
    { width: 1600, height: 900 },
    { width: 1600, height: 1067 },
    { width: 1408, height: 667 },
    { width: 1600, height: 1200 },
  ]) {
    assert.equal(planCard(dims), 'A', `${dims.width}x${dims.height}`);
  }
});

test('a face or a square takes Type B', () => {
  for (const dims of [
    { width: 499, height: 628 }, // the Peel portrait
    { width: 512, height: 512 },
    { width: 2893, height: 3317 }, // a tall photograph
  ]) {
    assert.equal(planCard(dims), 'B', `${dims.width}x${dims.height}`);
  }
});

test('drawn artwork takes Type C however big it is', () => {
  // A 2.27:1 chart and a square logo plate — both would lose their content to a
  // crop, so the pale ground sends them to the typographic card.
  assert.equal(planCard({ width: 1694, height: 746, paleGround: 0.74 }), 'C');
  assert.equal(planCard({ width: 1280, height: 1280, paleGround: 0.84 }), 'C');
  // The same shapes on a photographic ground do not go to C.
  assert.equal(planCard({ width: 1694, height: 746, paleGround: 0.05 }), 'A');
});

test('a hero too small for either photo card takes Type C', () => {
  assert.equal(planCard({ width: 512, height: 279 }), 'C'); // right shape, too few pixels
  assert.equal(planCard({ width: 180, height: 180 }), 'C'); // square, too small for a plate
  assert.equal(planCard({ width: 208, height: 277 }), 'C');
});

test('planCard falls back to Type C on dimensions it cannot use', () => {
  for (const dims of [{ width: 0, height: 100 }, { width: undefined, height: 100 }, {}, undefined]) {
    assert.equal(planCard(dims), 'C');
  }
});

test('paleGroundShare counts near-white pixels across channel layouts', () => {
  assert.equal(paleGroundShare(Uint8Array.from([255, 255, 255, 0, 0, 0]), 3), 0.5);
  assert.equal(paleGroundShare(Uint8Array.from([250, 10]), 1), 0.5); // greyscale
  assert.equal(paleGroundShare(Uint8Array.from([255, 255, 255, 255]), 4), 1);
  assert.equal(paleGroundShare(Uint8Array.from([]), 3), 0);
});

test('Type A puts the headline in a scrim over the photograph', () => {
  const { svg, mark } = renderTypeA({
    title: 'Policing & the "small stuff": why it matters',
    section: 'Evidence & Practice',
    author: 'Nathan Tracey',
  });
  assert.match(svg, new RegExp(`width="${WIDTH}" height="${HEIGHT}"`));
  assert.match(svg, /EVIDENCE &amp; PRACTICE/); // escaped, never a bare ampersand
  assert.match(svg, /Policing &amp; the &quot;small stuff&quot;/);
  assert.match(svg, /Nathan Tracey · thinkingaboutpolicing\.org/);
  // The scrim is a gradient over the picture, not a panel that hides it.
  assert.match(svg, /url\(#scrim\)/);
  assert.ok(!/<rect width="1200" height="630"/.test(svg), 'must not paint over the photo');
  assert.equal(mark.size, MARK_SIZE);
  assert.ok(mark.top + mark.size <= HEIGHT, 'mark stays on the card');
});

test('Type A steps a long headline down rather than truncating it', () => {
  const headlineOf = (svg) => [...svg.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map(m => m[1]);
  const sizeOf = (svg) => Number(svg.match(/font-size="(\d+)" font-weight="700"/)[1]);

  // An ordinary long headline holds the full 56px over three lines.
  const ordinary = renderTypeA({ title: LONG_TITLE, section: 'Evidence & Practice' }).svg;
  assert.equal(sizeOf(ordinary), 56);
  assert.equal(headlineOf(ordinary).length, 3);

  // A longer one steps down instead of dropping words.
  const longest = renderTypeA({ title: LONGEST_TITLE, section: 'Data Stories' }).svg;
  assert.ok(sizeOf(longest) < 56, `stepped down to ${sizeOf(longest)}`);
  for (const svg of [ordinary, longest]) {
    assert.ok(!svg.includes('…'), 'no ellipsis');
    assert.ok(headlineOf(svg).length <= 3, 'three lines at most');
  }
  // The tspans carry the XML-escaped text, so compare against the escaped title.
  assert.equal(headlineOf(longest).join(' '), escapeXml(LONGEST_TITLE), 'every word survives the wrap');
});

test('Type B reserves the plate and centres the type beside it', () => {
  const { svg, mark, plate } = renderTypeB({
    title: 'Sir Robert Peel and the Invention of Policing by Consent',
    section: 'Influential People',
    author: 'Nathan Tracey',
  });
  assert.equal(plate.width, B_PLATE_WIDTH);
  assert.equal(plate.height, HEIGHT);
  assert.equal(plate.left + plate.width, WIDTH, 'plate sits flush to the right edge');
  assert.match(svg, /INFLUENTIAL PEOPLE/);
  assert.match(svg, /Sir Robert Peel/);
  // Nothing may stray under the plate.
  const seam = WIDTH - B_PLATE_WIDTH;
  for (const x of svg.match(/<text x="(\d+)"/g).map(m => Number(m.match(/\d+/)[0]))) {
    assert.ok(x < seam, `text at x=${x} would sit under the plate`);
  }
  assert.ok(mark.left + mark.size < seam, 'mark clears the plate');
  assert.ok(mark.top + mark.size <= HEIGHT, 'mark stays on the card');
});

test('Type B keeps a four-line headline on the card', () => {
  const { svg } = renderTypeB({ title: LONG_TITLE, section: 'Influential People' });
  const baselines = [...svg.matchAll(/<tspan x="\d+" y="(\d+)"/g)].map(m => Number(m[1]));
  assert.ok(baselines.length <= 4, `${baselines.length} lines`);
  assert.ok(Math.min(...baselines) > 0 && Math.max(...baselines) < HEIGHT);
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
