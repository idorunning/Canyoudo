// Unit tests for the share cards' line breaking. The width function is injected
// here, so these tests are exact and say nothing about which fonts a build host
// happens to ship. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateWidth, wrapToWidth, fitLines } from '../src/lib/og-wrap.mjs';

// A stand-in face: every glyph exactly half the font size wide, spaces included.
const evenWidth = (text, fontSize) => text.length * fontSize * 0.5;
// A face half again as wide — what a different build host's serif does to the
// same headline.
const wideWidth = (text, fontSize) => text.length * fontSize * 0.75;

test('wrapToWidth breaks on words and keeps every line inside the measure', () => {
  const title = 'Sir Robert Peel and the invention of policing by consent in Britain';
  const lines = wrapToWidth(title, { widthOf: evenWidth, fontSize: 60, maxWidth: 600, maxLines: 6 });
  assert.ok(lines.length > 1, 'should wrap');
  for (const line of lines) {
    assert.ok(evenWidth(line, 60) <= 600, `"${line}" overflows`);
  }
  assert.equal(lines.join(' '), title, 'no words lost');
});

test('a wider face breaks the same headline into more lines', () => {
  const title = 'Sir Robert Peel and the invention of policing by consent in Britain';
  const opts = { fontSize: 60, maxWidth: 600, maxLines: 8 };
  const narrow = wrapToWidth(title, { ...opts, widthOf: evenWidth });
  const wide = wrapToWidth(title, { ...opts, widthOf: wideWidth });
  assert.ok(wide.length > narrow.length, `${wide.length} vs ${narrow.length}`);
  for (const line of wide) assert.ok(wideWidth(line, 60) <= 600, `"${line}" overflows`);
});

test('a single word longer than the measure gets its own line rather than none', () => {
  const lines = wrapToWidth('short Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch end', {
    widthOf: evenWidth, fontSize: 60, maxWidth: 300, maxLines: 6,
  });
  assert.equal(lines.length, 3);
  assert.match(lines[1], /^Llanfair/);
});

test('wrapToWidth clamps to maxLines with an ellipsis as a last resort', () => {
  const huge = Array.from({ length: 60 }, () => 'word').join(' ');
  const lines = wrapToWidth(huge, { widthOf: evenWidth, fontSize: 60, maxWidth: 600, maxLines: 4 });
  assert.equal(lines.length, 4);
  assert.ok(lines[3].endsWith('…'));
});

test('wrapToWidth survives an absent or empty title', () => {
  for (const title of [undefined, null, '', '   ']) {
    assert.deepEqual(wrapToWidth(title, { widthOf: evenWidth, fontSize: 60, maxWidth: 600 }), []);
  }
});

test('fitLines takes the largest size that fits, and steps down when it must', () => {
  const short = fitLines('A short headline', {
    widthOf: evenWidth, sizes: [80, 64, 48], maxWidth: 700, maxLines: 2,
  });
  assert.equal(short.fontSize, 80, 'a short headline holds the biggest size');
  assert.equal(short.lines.length, 1);

  const long = fitLines('A considerably longer headline that will not fit at the top size at all', {
    widthOf: evenWidth, sizes: [80, 64, 48], maxWidth: 700, maxLines: 2,
  });
  assert.ok(long.fontSize < 80, `stepped down to ${long.fontSize}`);
  assert.ok(long.lines.length <= 2);
  for (const line of long.lines) {
    assert.ok(evenWidth(line, long.fontSize) <= 700, `"${line}" overflows`);
  }
});

test('fitLines reports a line height derived from the size it chose', () => {
  const { fontSize, lineHeight } = fitLines('Headline', {
    widthOf: evenWidth, sizes: [80], maxWidth: 700, maxLines: 2, lineHeightRatio: 1.12,
  });
  assert.equal(lineHeight, Math.round(fontSize * 1.12));
});

test('estimateWidth is generous enough to be a safe fallback', () => {
  // It must not undercut a wide serif's own measurement of the same string, or a
  // card rendered without a measurer would run past its margin.
  const line = 'Procedural Justice: A Guide for Police Leaders';
  assert.ok(estimateWidth(line, 56) >= line.length * 56 * 0.5);
  assert.equal(estimateWidth('', 56), 0);
  assert.equal(estimateWidth(undefined, 56), 0);
});
