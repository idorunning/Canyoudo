// Unit tests for the OG title-card helpers. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapTitle, escapeXml, renderCardSvg } from '../src/lib/og-card.mjs';

test('escapeXml escapes the five XML entities', () => {
  assert.equal(escapeXml(`Tom & Jerry's <"tag">`), 'Tom &amp; Jerry&apos;s &lt;&quot;tag&quot;&gt;');
  assert.equal(escapeXml(undefined), '');
});

test('wrapTitle keeps a short title on one line', () => {
  assert.deepEqual(wrapTitle('A short title', { fontSize: 80 }), ['A short title']);
});

test('wrapTitle breaks long titles on word boundaries', () => {
  const lines = wrapTitle(
    'Sir Robert Peel and the invention of policing by consent in Britain',
    { fontSize: 80 }
  );
  assert.ok(lines.length > 1, 'should wrap onto multiple lines');
  // No word is split across lines.
  assert.equal(lines.join(' ').replace(/\s+/g, ' ').trim(),
    'Sir Robert Peel and the invention of policing by consent in Britain');
});

test('wrapTitle clamps to maxLines and adds an ellipsis', () => {
  const huge = Array.from({ length: 60 }, () => 'word').join(' ');
  const lines = wrapTitle(huge, { fontSize: 80, maxLines: 4 });
  assert.equal(lines.length, 4);
  assert.ok(lines[3].endsWith('…'), 'last line should be truncated with an ellipsis');
});

test('renderCardSvg produces a 1200×630 SVG with escaped, wrapped title', () => {
  const svg = renderCardSvg({
    title: 'Policing & the "small stuff": why it matters',
    section: 'Police Policy',
    author: 'Nathan Tracey',
  });
  assert.ok(svg.startsWith('<svg'));
  assert.match(svg, /width="1200" height="630"/);
  assert.match(svg, /POLICE POLICY/);
  assert.match(svg, /Nathan Tracey · thinkingaboutpolicing\.org/);
  // Raw ampersand/quote from the title must be escaped, never emitted bare.
  assert.ok(!/Policing & the/.test(svg));
  assert.match(svg, /Policing &amp; the/);
});
