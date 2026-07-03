import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRIEFING_SYSTEM,
  BRIEFING_HEADINGS,
  TREND_LABELS,
  BRIEFING_CONFIDENCE_PREFIX,
  BRIEFING_MODEL,
  BRIEFING_PROMPT_VERSION,
} from '../src/lib/dashboard-prompts.ts';

// The briefing contract: the prompt, the renderers and the tests key off the
// same exported headings and labels — assert they actually appear in the
// prompt so an edit can't silently break the parsers.

test('every briefing heading appears in the prompt, in order', () => {
  let last = -1;
  for (const h of BRIEFING_HEADINGS) {
    const idx = BRIEFING_SYSTEM.indexOf(`### ${h}`);
    assert.ok(idx !== -1, `missing heading: ${h}`);
    assert.ok(idx > last, `heading out of order: ${h}`);
    last = idx;
  }
});

test('the trend label vocabulary is spelled out in the prompt', () => {
  for (const label of TREND_LABELS) {
    assert.ok(BRIEFING_SYSTEM.includes(`"${label}"`), `missing label: ${label}`);
  }
});

test('the confidence wire protocol is in the prompt', () => {
  assert.ok(BRIEFING_SYSTEM.includes(`${BRIEFING_CONFIDENCE_PREFIX} strong`));
});

test('the table header contract is exact', () => {
  assert.ok(BRIEFING_SYSTEM.includes('| Category | Last 12 months | vs previous 12 | Reading |'));
});

test('model and version are pinned', () => {
  assert.equal(typeof BRIEFING_MODEL, 'string');
  assert.match(BRIEFING_PROMPT_VERSION, /^v\d+$/);
});
