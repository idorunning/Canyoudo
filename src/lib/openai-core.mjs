// The OpenAI engine behind the /research tools — a thin, dependency-free
// client for the Responses API, shared by BOTH runtimes the research tools run
// in: the Node function (netlify/functions/research-assist.mts) and the Deno
// EDGE function (netlify/edge-functions/research-review.ts).
//
// Deliberately plain `fetch` + hand-parsed SSE, and deliberately NOT the
// `openai` npm package — the same reasoning the Anthropic SDK is avoided in the
// edge function (see the long note at the top of research-review.ts): npm
// support in Netlify Edge Functions is documented as experimental, and a plain
// REST call needs no package resolution at all. It also means no new
// dependency in package.json for the Node side, and one implementation to
// reason about instead of two.
//
// Nothing here touches process.env or Deno.env — the API key is always passed
// in by the caller — so this module loads unmodified under both runtimes, the
// same contract as personas.ts / cache-key.mjs / ai-budget-core.mjs.

/** Models the research tools may run on, id → display label (the x-model
 *  header, the report's provenance line and the PDF all show the label). */
export const OPENAI_MODELS = {
  'gpt-5.6-sol': 'GPT-5.6 Sol',
  'gpt-5.6-terra': 'GPT-5.6 Terra',
  'gpt-5.6-luna': 'GPT-5.6 Luna',
};

export const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

export const isOpenAiModel = (id) => typeof id === 'string' && id in OPENAI_MODELS;

/** Display label for a model id, falling back to the raw id so an unknown
 *  override still reports honestly rather than showing a blank. */
export const openAiLabel = (id) => OPENAI_MODELS[id] ?? String(id ?? '');

/**
 * One Responses API request body.
 *
 * `instructions` is the Responses API's system prompt slot, so the existing
 * system prompts move across unchanged. `reasoning.mode` and `reasoning.effort`
 * are independent controls: mode picks standard vs pro execution (pro does more
 * model work per answer), effort scales how much reasoning happens within that
 * mode. Both are omitted when not given, so the model's own defaults apply.
 *
 * `store: false` keeps the request out of OpenAI's response store — readers'
 * research questions are their own, and this site already caches finished
 * answers itself in Netlify Blobs.
 *
 * @param {{ model: string, user: string, system?: string, maxOutputTokens?: number,
 *           effort?: string, mode?: string }} opts
 * @returns {Record<string, unknown>}
 */
export function responsesBody({ model, system, user, maxOutputTokens, effort, mode }) {
  const body = {
    model,
    input: [{ role: 'user', content: user }],
    store: false,
  };
  if (system) body.instructions = system;
  if (Number.isFinite(maxOutputTokens)) body.max_output_tokens = maxOutputTokens;
  const reasoning = {};
  if (effort) reasoning.effort = effort;
  if (mode) reasoning.mode = mode;
  if (Object.keys(reasoning).length) body.reasoning = reasoning;
  return body;
}

/** The assistant text of a non-streaming response. The output array carries
 *  reasoning items alongside the message, so this walks it rather than
 *  assuming a shape; `output_text` is honoured if present (some responses
 *  include it as a convenience). Always returns a string. */
export function outputText(res) {
  const convenience = res?.output_text;
  if (typeof convenience === 'string' && convenience.trim()) return convenience;
  if (Array.isArray(convenience)) return convenience.filter((t) => typeof t === 'string').join('');
  const out = Array.isArray(res?.output) ? res.output : [];
  return out
    .filter((item) => item?.type === 'message')
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .filter((c) => c?.type === 'output_text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('');
}

/** Token counts for the budget guard. Reasoning tokens are billed as output
 *  and already counted inside output_tokens, so no separate entry is needed —
 *  the same arrangement as Anthropic's thinking tokens. */
export function usageOf(res) {
  const u = res?.usage ?? {};
  return { input: Number(u.input_tokens) || 0, output: Number(u.output_tokens) || 0 };
}

/** True when the model ran out of room before finishing — the Responses API's
 *  equivalent of Anthropic's `stop_reason: 'max_tokens'`. A truncated answer
 *  must never be cached. */
export function wasTruncated(res) {
  return res?.status === 'incomplete' || res?.incomplete_details?.reason === 'max_output_tokens';
}

/**
 * POST a body to the Responses API. Throws an Error carrying `.status` (and a
 * short `.detail`) on a non-2xx, so callers can tell an auth/access failure
 * (401/403/404) from a bad parameter (400) and react — e.g. retry the review
 * in standard mode if pro mode is rejected.
 */
export async function openaiRequest(apiKey, body, { stream = false, signal } = {}) {
  const res = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      ...(stream ? { accept: 'text/event-stream' } : {}),
    },
    body: JSON.stringify({ ...body, stream }),
    signal,
  });
  if (!res.ok || (stream && !res.body)) {
    const err = new Error(`OpenAI API ${res.status}`);
    err.status = res.status;
    try {
      err.detail = (await res.text()).slice(0, 300);
    } catch {
      // Body already consumed or unreadable — the status is the useful part.
    }
    throw err;
  }
  return res;
}

/** One non-streaming call, returning the parsed response object. */
export async function openaiCreate(apiKey, body, signal) {
  const res = await openaiRequest(apiKey, body, { signal });
  return res.json();
}

/** Raw SSE events from a streaming Responses call. Frames are blank-line
 *  separated; only the JSON on the `data:` line matters. A malformed frame is
 *  skipped rather than killing the stream. */
export async function* openaiSseEvents(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
      if (!dataLine) continue;
      const payload = dataLine.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        yield JSON.parse(payload);
      } catch {
        // Skip the frame, keep the stream.
      }
    }
  }
}

/**
 * The streaming shape the callers actually want, normalised:
 *   { type: 'text', text }                       one chunk of the answer
 *   { type: 'done', usage, truncated }           terminal accounting
 * Reasoning summary events are ignored — only the answer reaches the reader.
 * A `response.failed` or transport `error` event throws, so a failure mid-way
 * is handled the same as any other stream break.
 */
export async function* openaiTextStream(res) {
  for await (const ev of openaiSseEvents(res)) {
    if (ev.type === 'response.output_text.delta') {
      if (typeof ev.delta === 'string' && ev.delta) yield { type: 'text', text: ev.delta };
    } else if (ev.type === 'response.completed' || ev.type === 'response.incomplete') {
      yield { type: 'done', usage: usageOf(ev.response), truncated: wasTruncated(ev.response) };
    } else if (ev.type === 'response.failed' || ev.type === 'error') {
      const err = new Error(ev.response?.error?.message || ev.message || 'OpenAI stream failed');
      err.status = 502;
      throw err;
    }
  }
}
