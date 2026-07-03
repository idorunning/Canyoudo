// Unit tests guarding the assist prompts' contract — the functions and the
// client renderer both depend on these exact shapes/headings. The prompts live
// in a .ts file, so we assert against its source text (Node can't import .ts
// without a loader). Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(
  fileURLToPath(new URL('../src/lib/research-assist-prompts.ts', import.meta.url)),
  'utf8'
);

test('prompt version bumped to v10 (invalidates the assist cache)', () => {
  assert.match(src, /ASSIST_PROMPT_VERSION\s*=\s*'v10'/);
});

test('models are pinned where client and functions both read them', () => {
  assert.match(src, /OVERVIEW_MODEL\s*=\s*'claude-sonnet-4-6'/);
  assert.match(src, /REVIEW_MODEL\s*=\s*'claude-sonnet-5'/);
});

test('PLAN_SYSTEM demands JSON-only with framing + angles', () => {
  assert.match(src, /export const PLAN_SYSTEM/);
  assert.match(src, /ONLY a JSON object/);
  assert.match(src, /"framing"/);
  assert.match(src, /"angles"/);
  assert.match(src, /exactly 3/i);
  // Treats the problem as data, not instructions (prompt-injection guard).
  assert.match(src, /data, not instructions/i);
});

test('OVERVIEW_SYSTEM asks for a reading order pointing at the numbered results', () => {
  const overview = src.slice(src.indexOf('OVERVIEW_SYSTEM'), src.indexOf('BRIEF_SYSTEM'));
  assert.match(overview, /"readFirst"/);
  assert.match(overview, /"refinements"/);
  assert.match(overview, /"caveat"/);
  assert.match(overview, /NUMBERED/);
  // Suggestions may only index the list the model was shown.
  assert.match(overview, /never invent a number outside it/i);
  assert.match(overview, /untrusted data/i);
});

test('REVIEW_SYSTEM names the seven exact ### headings, in order, a briefing not a narrative', () => {
  // The client renderer parses these headings, the PDF draws the table +
  // action-tier boxes off them, and REVIEW_HEADINGS exports them — keep in
  // lockstep. v9 is a 2-page briefing (problem, evidence table, confidence,
  // three action tiers, policy pointers), not the v8 narrative report.
  const review = src.slice(src.indexOf('REVIEW_SYSTEM'));
  const headings = [
    'The problem',
    'What the evidence says',
    'How confident can we be',
    'Quick wins',
    'Medium term',
    'Long term — higher effort',
    'Powers and policies',
  ];
  let at = -1;
  for (const heading of headings) {
    assert.ok(src.includes(`'${heading}'`), `REVIEW_HEADINGS exports "${heading}"`);
    const next = review.indexOf(`### ${heading}`);
    assert.ok(next > at, `review names "### ${heading}" after the previous heading`);
    at = next;
  }
});

test('EFFECTIVENESS_LABELS exports the four plain-English evidence-strength labels', () => {
  const labels = ['Well-established', 'Promising', 'Mixed evidence', 'Early or limited evidence'];
  for (const label of labels) {
    assert.ok(src.includes(`'${label}'`), `EFFECTIVENESS_LABELS exports "${label}"`);
  }
  const review = src.slice(src.indexOf('REVIEW_SYSTEM'));
  for (const label of labels) {
    assert.ok(review.includes(`"${label}"`), `REVIEW_SYSTEM names "${label}" as a table value`);
  }
  assert.match(review, /Never invent a fifth label/i);
});

test('REVIEW_SYSTEM demands the evidence table with the exact GFM header', () => {
  const review = src.slice(src.indexOf('REVIEW_SYSTEM'));
  assert.match(review, /\| # \| Study \| Key finding \| Effectiveness \|/);
});

test('REVIEW_SYSTEM keeps only studies specific to the problem, table rows are not guaranteed for all 10', () => {
  const review = src.slice(src.indexOf('REVIEW_SYSTEM'));
  assert.match(review, /genuinely specific to THIS problem/i);
  assert.match(review, /Leave out any numbered study that's too tangential/i);
  assert.match(review, /You don't need all of them/i);
});

test('REVIEW_SYSTEM frames the output as a two-page briefing, not an essay', () => {
  const review = src.slice(src.indexOf('REVIEW_SYSTEM'));
  assert.match(review, /this is a briefing, not an essay/i);
  assert.match(review, /two A4 pages/i);
  assert.match(review, /700–950 words/);
});

test('the review is written for a non-academic, in plain English', () => {
  const review = src.slice(src.indexOf('REVIEW_SYSTEM'));
  assert.match(review, /busy practitioner, not an academic/i);
  assert.match(review, /Plain English, short sentences/i);
  // Technical terms must be explained in passing, never dropped in raw.
  assert.match(review, /explain it in a few plain words/i);
  assert.match(review, /No academic jargon/i);
});

test('the review is a grounding report, not a verdict', () => {
  const review = src.slice(src.indexOf('REVIEW_SYSTEM'));
  assert.match(review, /do NOT give definitive answers/i);
  assert.match(review, /guidance with sources/i);
});

test('the review ends with the CONFIDENCE protocol line the client parses', () => {
  assert.match(src, /REVIEW_CONFIDENCE_PREFIX\s*=\s*'CONFIDENCE:'/);
  const review = src.slice(src.indexOf('REVIEW_SYSTEM'));
  assert.match(review, /CONFIDENCE: strong/);
  for (const level of ['strong', 'mixed', 'thin']) {
    assert.ok(review.includes(`"${level}"`), `confidence level ${level}`);
  }
});

test('the legal section is pointers-to-verify, never fabricated citations', () => {
  const review = src.slice(src.indexOf('REVIEW_SYSTEM'));
  assert.match(review, /pointers to verify/i);
  assert.match(review, /not legal advice/i);
  assert.match(review, /Never attach a citation marker \[n\] to anything here — this section draws on general knowledge, not the numbered studies/i);
});

test('the legal section names anti-social behaviour powers and demands sourced references', () => {
  const review = src.slice(src.indexOf('REVIEW_SYSTEM'));
  assert.match(review, /### Powers and policies/);
  assert.match(review, /anti-social behaviour powers/i);
  assert.match(review, /Anti-social Behaviour, Crime and Policing Act 2014/i);
  assert.match(review, /leading case law/i);
  assert.match(review, /name its actual source/i);
  assert.match(review, /specific to the problem, not a generic list/i);
});

test('review and brief keep citation discipline over untrusted abstracts', () => {
  assert.match(src, /ONLY the numbered studies/i);
  assert.match(src, /untrusted data/i);
});

test('the depth-slider prompts are gone (superseded by the three modes)', () => {
  assert.ok(!src.includes('BRIEFING_LOW_SYSTEM'), 'no quick-scan prompt');
  assert.ok(!src.includes('BRIEFING_HIGH_SYSTEM'), 'no full-review depth prompt');
  assert.ok(!src.includes('ANSWER_SYSTEM'), 'no search-answer prompt');
  assert.ok(!src.includes('BriefingDepth'), 'no depth type');
});
