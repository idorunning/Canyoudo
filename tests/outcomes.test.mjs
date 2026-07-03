import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyOutcome, CHARGED_RE, NO_SUSPECT_RE } from '../src/lib/outcomes.mjs';

// Real outcome_category labels from the data.police.uk archive. The point of
// this file is to pin the classification so the charts and the AI readings can
// never disagree about what counts as a charge/sanction again.

test('charge and sanction outcomes classify as charged', () => {
  for (const label of [
    'Suspect charged',
    'Suspect charged as part of another case',
    'Offender given a caution',
    'Offender given community resolution',
    'Offender given penalty notice',
    'Court summons issued',
    // The category that drifted between the two old regexes:
    'Formal action is not in the public interest — out-of-court disposal',
  ]) {
    assert.equal(classifyOutcome(label), 'charged', label);
  }
});

test('no-suspect outcomes classify as noSuspect', () => {
  assert.equal(classifyOutcome('Investigation complete; no suspect identified'), 'noSuspect');
  assert.equal(classifyOutcome('No suspect identified'), 'noSuspect');
});

test('everything else is other', () => {
  for (const label of [
    'Under investigation',
    'Unable to prosecute suspect',
    'Formal action is not in the public interest',
    'Further investigation is not in the public interest',
    'Local resolution',
    'Status update unavailable',
    '',
  ]) {
    assert.equal(classifyOutcome(label), 'other', label);
  }
  assert.equal(classifyOutcome(null), 'other');
});

test('charged takes precedence when both patterns could bite', () => {
  // Not a real label, but the precedence is part of the contract.
  assert.equal(classifyOutcome('Charged; no suspect identified for linked case'), 'charged');
});

test('the exported regexes stay in step with the classifier', () => {
  assert.ok(CHARGED_RE.test('out-of-court'));
  assert.ok(NO_SUSPECT_RE.test('no suspect identified'));
});
