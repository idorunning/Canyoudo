// Netlify's own package — bare specifier, matching their documented
// edge-function convention (their bundler special-cases first-party
// packages). No `npm:` prefix: see the note on the Anthropic call below for
// why that distinction matters here.
import { getStore } from '@netlify/blobs';
import { modelParams, INTERPRET_MODELS, type ModelId } from '../../src/lib/personas.ts';
import {
  ASSIST_PROMPT_VERSION,
  REVIEW_SYSTEM,
  REVIEW_MODEL,
  REVIEW_MAX_TOKENS,
} from '../../src/lib/research-assist-prompts.ts';
import { stableKey } from '../../src/lib/cache-key.mjs';
import { costUsd, monthKey } from '../../src/lib/ai-budget-core.mjs';

// The deep end of the research assistant — an EDGE FUNCTION, not a regular
// Netlify Function. This is the actual fix for the "review couldn't be
// written" failure, and it took a few attempts to find:
//
// Netlify's regular Functions (Node/Lambda-based, netlify/functions/*.mts)
// have a hard ~10-SECOND execution ceiling on a streaming response,
// independent of plan tier — reaching it simply stops the stream. A Sonnet 5
// call at high-effort thinking, writing an 800-1400 word cited report from up
// to 15 studies, routinely takes well past that. Making the endpoint stream
// sent the first byte immediately, but the platform still killed the function
// before the report finished; the reader saw a generic failure with the
// curated studies as the only thing left standing.
//
// Netlify Edge Functions run on Deno, not Lambda, and their execution budget
// is CPU-time only — time spent waiting on a network response (i.e. almost
// this entire function's wall-clock life) doesn't count against it. This is
// Netlify's own documented pattern for streaming AI generations. Moving just
// this one route here removes the ceiling entirely, with no code change on
// the client (same path, same request/response shapes, same wire format).
//
// The Anthropic SDK is deliberately NOT used here. npm-package support in
// Netlify Edge Functions is explicitly documented as experimental, and the
// SDK is a large, Node-oriented package with plenty of internal surface that
// could fail to bundle under that compat layer in ways impossible to verify
// without a live deploy. Instead this calls the Messages API directly with
// `fetch` and hand-parses the SSE response — a plain REST/SSE call needs no
// package resolution at all, so it removes that entire risk category. The
// request/response shapes (thinking, output_config.effort, the event types)
// are the same wire format the SDK itself sends; see shared/live-sources.md
// in the claude-api skill for the Messages API reference.
//
// Because this runs under Deno, two more things differ from the sibling
// netlify/functions/*.mts files:
//   - Local imports need explicit file extensions (Deno's module resolution,
//     unlike Node's, doesn't infer them) — hence the `.ts`/`.mjs` suffixes
//     below. Only PURE, import-free modules are shared this way (personas.ts,
//     research-assist-prompts.ts, cache-key.mjs, ai-budget-core.mjs) — none of
//     them touch `process.env`, so they load safely under Deno unmodified.
//   - Environment variables read via `Deno.env.get(...)`, not `process.env` —
//     ai-budget.ts and ai-stream.ts (the Node-flavoured versions of the budget
//     guard and the stream writer) both do the latter, so rather than risk a
//     `process is not defined` at module load, the small amount of glue that
//     touches env vars or the response stream is self-contained below, reusing
//     only the pure arithmetic (costUsd/monthKey) and the shared prompt/model
//     constants from the modules above.
//
// Model resolution, citation discipline, caching and the CONFIDENCE-line wire
// protocol are otherwise identical to the previous implementation — see
// docs/research-assistant-v4.md for the full contract.

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const clipStr = (v: unknown, max: number) =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

// ---- the monthly AI-spend guard, Deno-native (mirrors src/lib/ai-budget.ts) ----
// Same Blobs store name and JSON shape as the Node functions, so the cap
// accumulates coherently across every AI route on the site regardless of
// which runtime served the call.
const BUDGET_LIMIT_USD = Number(Deno.env.get('AI_BUDGET_LIMIT_USD') ?? 110);
const BUDGET_MESSAGE =
  'The assistant has used its monthly budget — it will be back at the start of next month. Everything else still works.';

async function budgetExceeded(): Promise<boolean> {
  if (!(BUDGET_LIMIT_USD > 0)) return false;
  try {
    const raw = await getStore('ai-budget').get(monthKey());
    if (!raw) return false;
    return (JSON.parse(raw).estimatedUsd ?? 0) >= BUDGET_LIMIT_USD;
  } catch {
    return false;
  }
}

async function recordUsage(model: string, inputTokens: number, outputTokens: number) {
  try {
    const store = getStore('ai-budget');
    const key = monthKey();
    const raw = await store.get(key);
    const current = raw ? Number(JSON.parse(raw).estimatedUsd) || 0 : 0;
    await store.set(key, JSON.stringify({ estimatedUsd: current + costUsd(model, inputTokens, outputTokens) }));
  } catch {
    // Accounting must never break the feature it accounts for.
  }
}

// ---- raw Messages API calls (fetch + hand-parsed SSE — no SDK) ----

/** One non-streaming call — used for the model-access preflight. Throws an
 *  object with `.status` on a non-2xx response, mirroring the SDK's own
 *  error shape closely enough for pickModel's status check below. */
async function messagesCreate(apiKey: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ ...body, stream: false }),
  });
  if (!res.ok) {
    const err: any = new Error(`Anthropic API ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * A streaming call, yielding the same event shapes the Anthropic SDK's
 * `.messages.stream()` produces (`message_start`, `content_block_delta` with
 * a `text_delta`, `message_delta` carrying `stop_reason`/`usage`) — so the
 * consuming loop below is unchanged from an SDK-based version. SSE frames are
 * separated by a blank line; each frame's `data:` line is one JSON event.
 * `signal` lets the caller abort the underlying fetch (client disconnected).
 */
async function* streamMessages(
  apiKey: string,
  body: Record<string, unknown>,
  signal: AbortSignal
): AsyncGenerator<any> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
      accept: 'text/event-stream',
    },
    body: JSON.stringify({ ...body, stream: true }),
    signal,
  });
  if (!res.ok || !res.body) {
    const err: any = new Error(`Anthropic API ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // SSE frames are blank-line-separated; each may carry multiple lines
    // (event:/data:) — only the JSON payload on the data: line matters here.
    let idx: number;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
      if (!dataLine) continue;
      try {
        yield JSON.parse(dataLine.slice(5).trim());
      } catch {
        // A malformed frame shouldn't kill the whole stream — skip it.
      }
    }
  }
}

// The intended model first, then a fallback chain of top-tier reasoning models
// so a single account-access gap doesn't break the whole feature. Deduped and
// validated against the model registry; env override leads when set.
function reviewCandidates(): ModelId[] {
  const envModel = Deno.env.get('RESEARCH_REVIEW_MODEL');
  const wanted = [envModel, REVIEW_MODEL, 'claude-opus-4-8', 'claude-sonnet-4-6'];
  const seen = new Set<string>();
  const out: ModelId[] = [];
  for (const m of wanted) {
    if (m && m in INTERPRET_MODELS && !seen.has(m)) {
      seen.add(m);
      out.push(m as ModelId);
    }
  }
  return out;
}

/**
 * The first candidate model this account can actually reach. A tiny
 * thinking-disabled call surfaces an access/auth error fast (before the
 * streaming 200 is committed) without generating a report. Returns the model
 * and its label, or a terminal error when none work.
 */
async function pickModel(
  apiKey: string,
  candidates: ModelId[]
): Promise<{ model: ModelId; label: string } | { error: string }> {
  let lastStatus = 0;
  for (const model of candidates) {
    try {
      const probe = await messagesCreate(apiKey, {
        model,
        max_tokens: 16,
        thinking: { type: 'disabled' },
        messages: [{ role: 'user', content: 'ping' }],
      });
      await recordUsage(model, probe?.usage?.input_tokens ?? 0, probe?.usage?.output_tokens ?? 0);
      return { model, label: INTERPRET_MODELS[model] };
    } catch (e: any) {
      lastStatus = e?.status ?? lastStatus;
      // Try the next model in the chain (e.g. this account lacks access to it).
    }
  }
  return {
    error:
      lastStatus === 401 || lastStatus === 403
        ? 'The research review couldn’t reach its AI model — the deployment’s model access may need checking. The curated studies are below.'
        : 'The research review couldn’t reach its AI model just now. Try again in a moment — the curated studies are below.',
  };
}

/**
 * Stream the model's markdown to the client. Same behaviour as before:
 * immediate preamble byte, tolerant enqueue after the client disconnects,
 * caching gated on a complete + shouldCache-passing result, and the fetch is
 * aborted on cancel so a superseded/closed request doesn't keep spending
 * tokens.
 */
function streamMarkdown(
  events: AsyncGenerator<any>,
  abort: () => void,
  opts: {
    store: ReturnType<typeof getStore> | null;
    key: string;
    model: string;
    modelLabel: string;
    preamble?: string;
    shouldCache: (full: string) => boolean;
  }
): Response {
  const enc = new TextEncoder();
  let full = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason: string | null = null;
  const { store, key, model, modelLabel, preamble, shouldCache } = opts;

  const body = new ReadableStream({
    async start(controller) {
      const send = (text: string) => {
        try {
          controller.enqueue(enc.encode(text));
        } catch {}
      };
      try {
        if (preamble) send(preamble);
        for await (const event of events) {
          if (event.type === 'message_start') {
            inputTokens = event.message?.usage?.input_tokens ?? 0;
          } else if (event.type === 'message_delta') {
            if (event.usage) outputTokens = event.usage.output_tokens ?? outputTokens;
            stopReason = event.delta?.stop_reason ?? stopReason;
          } else if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            full += event.delta.text;
            send(event.delta.text);
          }
        }
        const complete = stopReason !== 'max_tokens';
        if (store && full.trim() && complete && shouldCache(full)) {
          await store.set(key, full);
        }
      } catch {
        send('\n\n_Interrupted — please try again._');
      } finally {
        await recordUsage(model, inputTokens, outputTokens);
        try {
          controller.close();
        } catch {}
      }
    },
    cancel() {
      abort();
    },
  });

  return new Response(body, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'x-cache': 'MISS',
      'x-model': modelLabel,
    },
  });
}

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json(503, { error: 'The research review is not configured yet.' });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Bad request.' });
  }

  const problem = clipStr(body?.problem, 600);
  // The briefing format gives every curated study a row in the evidence
  // table (up to REVIEW_HEADINGS' table), which is what keeps the whole
  // thing to ~2 pages — the client already curates to 10 (review.ts's
  // TARGET_STUDIES, of which at most PREPRINT_CAP are preprints); this is
  // defence in depth against a stray caller.
  const items = (Array.isArray(body?.items) ? body.items : [])
    .slice(0, 10)
    .map((it: any) => ({
      title: clipStr(it?.title, 300),
      authors: Array.isArray(it?.authors)
        ? it.authors.slice(0, 4).map((a: unknown) => clipStr(a, 100)).filter(Boolean)
        : [],
      year: Number.isInteger(it?.year) ? it.year : null,
      venue: clipStr(it?.venue, 150) || null,
      abstract: clipStr(it?.abstract, 700),
      // Not yet peer reviewed — the prompt pins these to the ladder's early
      // rung. Only present when true, so ordinary items stay byte-identical
      // (and so do their cache keys).
      ...(it?.preprint === true ? { preprint: true } : {}),
    }))
    .filter((it: any) => it.title);
  if (!problem || items.length === 0) return json(400, { error: 'Nothing to review from.' });

  const user = `Question: ${problem}\n\nStudies:\n${items
    .map((it: any, i: number) => `[${i + 1}] ${JSON.stringify(it)}`)
    .join('\n')}`;

  const candidates = reviewCandidates();
  const cacheInput = { p: problem.toLowerCase(), items };
  const keyFor = (m: ModelId) => stableKey('review', cacheInput, m, ASSIST_PROMPT_VERSION);

  // Cache: a finished report replays free. Check every candidate's key (the
  // report is keyed on the model that wrote it), so a repeat hits regardless of
  // which model in the chain the account can reach — no preflight, no spend.
  let store: ReturnType<typeof getStore> | null = null;
  try {
    store = getStore('research-review');
    for (const m of candidates) {
      const cached = await store.get(keyFor(m));
      if (cached) {
        return new Response(cached, {
          headers: {
            'content-type': 'text/markdown; charset=utf-8',
            'x-cache': 'HIT',
            'x-model': INTERPRET_MODELS[m],
          },
        });
      }
    }
  } catch {
    store = null;
  }

  if (await budgetExceeded()) return json(503, { error: BUDGET_MESSAGE });

  // Resolve the model BEFORE streaming: once we return a 200 stream we can't
  // turn it into an error, so an access failure must be caught here.
  const picked = await pickModel(apiKey, candidates);
  if ('error' in picked) return json(502, { error: picked.error });
  const { model, label: modelLabel } = picked;

  const controller = new AbortController();
  const events = streamMessages(
    apiKey,
    {
      model,
      max_tokens: REVIEW_MAX_TOKENS,
      // High effort: this is the one call on the site where deep thinking is
      // the whole point — the report is handed to the strongest reasoning tier.
      // Safe to let this run long here: edge execution time is CPU-bound, and
      // waiting on the model doesn't count against it.
      ...modelParams(model, 'high'),
      system: REVIEW_SYSTEM,
      messages: [{ role: 'user', content: user }],
    },
    controller.signal
  );

  return streamMarkdown(events, () => controller.abort(), {
    store,
    key: keyFor(model),
    model,
    modelLabel,
    preamble: '\n',
    // Never cache a report the client would reject: it must cite at least one
    // study and carry the closing confidence line (a missing line means the
    // stream was cut short).
    shouldCache: (full) => /\[\d{1,3}\]/.test(full) && /CONFIDENCE\b/i.test(full),
  });
};

export const config = { path: '/api/research-review' };
