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

// Regression pin: "officer-defined ethnicity" is the ethnicity of the PERSON
// SEARCHED as recorded by the officer — an AI briefing once described it as
// the searching officer's own ethnicity. Every prompt that sees stop & search
// data must carry the definition so no model can misread the field name again.
test('every AI prompt defines officer-defined ethnicity correctly', async () => {
  const { BRIEFING_SYSTEM } = await import('../src/lib/dashboard-prompts.ts');
  const { systemGeneral, PROMPT_VERSION } = await import('../src/lib/personas.ts');
  for (const prompt of [BRIEFING_SYSTEM, systemGeneral()]) {
    assert.match(prompt, /ethnicity of the PERSON SEARCHED/i, 'definition present');
    assert.match(prompt, /never the officer.s own ethnicity/i, 'misreading explicitly ruled out');
  }
  // The definition shipped in v8/v2 — regenerating stale cached readings.
  assert.ok(Number(PROMPT_VERSION.slice(1)) >= 8, 'PROMPT_VERSION must not be rolled back below v8');
});
