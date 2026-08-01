// The research tools' OpenAI engine (src/lib/openai-core.mjs) — the request
// body it builds and the response shapes it reads. Both runtimes the research
// tools live in (a Node function and a Deno edge function) go through this one
// module, and a deploy is the only other place it gets exercised, so the wire
// contract is pinned here. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPENAI_MODELS,
  isOpenAiModel,
  openAiLabel,
  responsesBody,
  outputText,
  usageOf,
  wasTruncated,
  openaiTextStream,
} from '../src/lib/openai-core.mjs';

test('the review model is a known id with a display label', () => {
  assert.ok(isOpenAiModel('gpt-5.6-sol'));
  assert.equal(openAiLabel('gpt-5.6-sol'), 'GPT-5.6 Sol');
  assert.ok(!isOpenAiModel('claude-sonnet-5'));
  // An unknown id still reports honestly rather than rendering blank.
  assert.equal(openAiLabel('gpt-9'), 'gpt-9');
  assert.ok(Object.keys(OPENAI_MODELS).length >= 2, 'a fallback model must exist');
});

test('the deep review body carries pro mode at max effort', () => {
  const body = responsesBody({
    model: 'gpt-5.6-sol',
    system: 'SYSTEM',
    user: 'Question: does X work?',
    maxOutputTokens: 40000,
    mode: 'pro',
    effort: 'max',
  });
  assert.equal(body.model, 'gpt-5.6-sol');
  assert.equal(body.instructions, 'SYSTEM');
  assert.deepEqual(body.reasoning, { effort: 'max', mode: 'pro' });
  assert.equal(body.max_output_tokens, 40000);
  assert.deepEqual(body.input, [{ role: 'user', content: 'Question: does X work?' }]);
  // Readers' research questions stay out of OpenAI's response store; this site
  // keeps its own cache of finished answers.
  assert.equal(body.store, false);
});

/** A fake streaming Response body: SSE frames from a list of event objects,
 *  split across chunk boundaries mid-frame to prove the parser reassembles. */
function sseResponse(events) {
  const text = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  const bytes = new TextEncoder().encode(text);
  let i = 0;
  return {
    body: {
      getReader: () => ({
        read: async () => {
          if (i >= bytes.length) return { done: true, value: undefined };
          // Deliberately awkward chunk size — frames land split.
          const value = bytes.slice(i, i + 7);
          i += 7;
          return { done: false, value };
        },
      }),
    },
  };
}

test('the review runs detached, and detaching does not turn on retention', () => {
  // background: true is what lets a multi-minute pro/max generation survive the
  // reader's connection dropping. It must not drag `store` along with it —
  // background requests run with store: false, and readers' research questions
  // stay unretained.
  const body = responsesBody({
    model: 'gpt-5.6-sol',
    user: 'q',
    background: true,
    mode: 'pro',
    effort: 'max',
  });
  assert.equal(body.background, true);
  assert.equal(body.store, false);
  // Everything else stays undetached — a short JSON round-trip has nothing to
  // gain from a job it would only have to wait on anyway.
  assert.equal('background' in responsesBody({ model: 'gpt-5.6-terra', user: 'q' }), false);
});

test('the stream surfaces the job id so it can be re-attached to', async () => {
  const res = sseResponse([
    { type: 'response.created', response: { id: 'resp_abc123', status: 'queued' } },
    { type: 'response.output_text.delta', delta: 'the report' },
    {
      type: 'response.completed',
      response: { status: 'completed', usage: { input_tokens: 1, output_tokens: 2 } },
    },
  ]);
  const seen = [];
  for await (const ev of openaiTextStream(res)) seen.push(ev);
  assert.deepEqual(seen[0], { type: 'created', id: 'resp_abc123' });
  assert.equal(seen[1].text, 'the report');
});

test('reasoning is omitted entirely when neither control is set', () => {
  // The access preflight sends the barest possible call — no reasoning block,
  // so nothing can be rejected as an unsupported parameter on a probe whose
  // only job is proving the key can reach the model.
  const probe = responsesBody({ model: 'gpt-5.6-sol', user: 'ping', maxOutputTokens: 16 });
  assert.equal('reasoning' in probe, false);
  assert.equal('instructions' in probe, false);
  assert.equal(probe.max_output_tokens, 16);
});

test('answer text is read past the reasoning items in the output array', () => {
  const res = {
    output: [
      { type: 'reasoning', summary: [] },
      { type: 'message', content: [{ type: 'output_text', text: '### In brief\n' }] },
      { type: 'message', content: [{ type: 'output_text', text: 'CONFIDENCE: mixed' }] },
    ],
  };
  assert.equal(outputText(res), '### In brief\nCONFIDENCE: mixed');
  assert.equal(outputText({}), '');
});

test('usage counts feed the budget ledger', () => {
  assert.deepEqual(usageOf({ usage: { input_tokens: 1200, output_tokens: 8400 } }), {
    input: 1200,
    output: 8400,
  });
  // A missing usage block must never poison the running total with NaN.
  assert.deepEqual(usageOf({}), { input: 0, output: 0 });
});

test('a report cut off at the token ceiling is recognised as truncated', () => {
  assert.ok(wasTruncated({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }));
  assert.ok(!wasTruncated({ status: 'completed' }));
});

test('the stream yields text deltas then one terminal accounting event', async () => {
  const res = sseResponse([
    { type: 'response.created', response: {} },
    { type: 'response.reasoning_summary_text.delta', delta: 'thinking…' },
    { type: 'response.output_text.delta', delta: '### In brief\n' },
    { type: 'response.output_text.delta', delta: 'Hot spots work [3].' },
    {
      type: 'response.completed',
      response: { status: 'completed', usage: { input_tokens: 900, output_tokens: 12000 } },
    },
  ]);
  const seen = [];
  for await (const ev of openaiTextStream(res)) seen.push(ev);
  assert.deepEqual(
    seen.filter((e) => e.type === 'text').map((e) => e.text),
    ['### In brief\n', 'Hot spots work [3].']
  );
  const done = seen.at(-1);
  assert.equal(done.type, 'done');
  assert.equal(done.truncated, false);
  assert.deepEqual(done.usage, { input: 900, output: 12000 });
});

test('a failed stream throws so the caller can fall back', async () => {
  const res = sseResponse([
    { type: 'response.output_text.delta', delta: 'half a rep' },
    { type: 'response.failed', response: { error: { message: 'model overloaded' } } },
  ]);
  await assert.rejects(async () => {
    for await (const _ of openaiTextStream(res)) {
      // drain
    }
  }, /model overloaded/);
});

test('an incomplete stream reports truncation so the report is not cached', async () => {
  const res = sseResponse([
    { type: 'response.output_text.delta', delta: 'partial' },
    {
      type: 'response.incomplete',
      response: {
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        usage: { input_tokens: 10, output_tokens: 40000 },
      },
    },
  ]);
  const seen = [];
  for await (const ev of openaiTextStream(res)) seen.push(ev);
  assert.equal(seen.at(-1).truncated, true);
});
