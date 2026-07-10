// The narration lib feeds the audio cache key, and generate-audio.mjs (build)
// and narrate.mjs (author tool) both import it. If extraction or hashing drifts
// the two disagree about what's cached — re-narrating unchanged articles or
// missing changed ones. These tests pin the behaviour that matters: the same
// text hashes the same, and the strips the pipeline promises actually strip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toNarration, narrationHash, chunkText, MIN_NARRATION_CHARS } from '../scripts/lib/narration.mjs';

test('narration hash is deterministic and voice-sensitive', () => {
  const text = toNarration('Title', 'A standfirst.', 'Some body prose here.');
  assert.equal(narrationHash('fable', text), narrationHash('fable', text));
  assert.notEqual(narrationHash('fable', text), narrationHash('onyx', text));
  assert.match(narrationHash('fable', text), /^[0-9a-f]{16}$/);
});

test('hash tracks the text: an edit changes it, a no-op does not', () => {
  const a = narrationHash('fable', toNarration('T', '', 'The quick brown fox.'));
  const same = narrationHash('fable', toNarration('T', '', 'The quick brown fox.'));
  const edited = narrationHash('fable', toNarration('T', '', 'The quick red fox.'));
  assert.equal(a, same);
  assert.notEqual(a, edited);
});

test('title and standfirst lead the narration', () => {
  const out = toNarration('Headline Here', 'The standfirst.', 'Body.');
  assert.ok(out.startsWith('Headline Here. The standfirst. '), out.slice(0, 60));
});

test('references section, footnotes, captions and pull quotes are stripped', () => {
  const body = [
    'Real body prose the reader should hear.',
    '',
    '<figcaption>Photo credit nobody needs read aloud.</figcaption>',
    '<PullQuote>Restated line already in the prose.</PullQuote>',
    'A claim with a footnote.[^1]',
    '',
    '## Sources and further reading',
    '- Some reference, 2024.',
    '',
    '[^1]: Footnote text.',
  ].join('\n');
  const out = toNarration('T', '', body);
  assert.ok(out.includes('Real body prose'));
  assert.ok(out.includes('A claim with a footnote.'));
  assert.ok(!out.includes('Photo credit'), 'figcaption not stripped');
  assert.ok(!out.includes('Restated line'), 'pull quote not stripped');
  assert.ok(!out.includes('Some reference'), 'references section not stripped');
  assert.ok(!out.includes('Footnote text'), 'footnote definition not stripped');
  assert.ok(!out.includes('[^1]'), 'footnote ref marker not stripped');
});

test('markdown links keep their text, drop their target', () => {
  const out = toNarration('T', '', 'See the [College of Policing](https://example.com) guidance.');
  assert.ok(out.includes('See the College of Policing guidance.'));
  assert.ok(!out.includes('example.com'));
});

test('chunkText splits on sentence boundaries under the limit', () => {
  const text = 'One sentence. Two sentence. Three sentence. Four sentence.';
  const chunks = chunkText(text, 25);
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(c.length <= 30, `chunk too long: ${c}`);
  // No text is lost or duplicated across the split.
  assert.equal(chunks.join(' ').replace(/\s+/g, ' ').trim(), text);
});

test('MIN_NARRATION_CHARS is the shared skip threshold', () => {
  assert.equal(typeof MIN_NARRATION_CHARS, 'number');
  assert.ok(MIN_NARRATION_CHARS > 0);
});
