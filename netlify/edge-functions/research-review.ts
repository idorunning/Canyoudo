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
  REVIEW_POOL_MAX,
  REVIEW_TABLE_MAX,
  SELECT_SYSTEM,
  SELECT_MAX_TOKENS,
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

/** One non-streaming call — used for the model-access preflight and the
 *  selection pass. Throws an object with `.status` on a non-2xx response,
 *  mirroring the SDK's own error shape closely enough for pickModel's status
 *  check below. `signal` lets the caller abort (client disconnected). */
async function messagesCreate(
  apiKey: string,
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<any> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ ...body, stream: false }),
    signal,
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
  signal?: AbortSignal
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

// ---- the selection pass: which pool studies does the briefing get? --------

/** Pull the JSON array of study numbers out of a selection response. Adaptive
 *  thinking means content[] may lead with a thinking block, and models
 *  sometimes wrap JSON in fences or a stray sentence — so this concatenates
 *  the text blocks and grabs the first [...] it can parse. Returns [] on any
 *  failure; the caller falls back deterministically. */
function parseSelection(res: any, poolSize: number): number[] {
  try {
    const text = (Array.isArray(res?.content) ? res.content : [])
      .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
      .map((b: any) => b.text)
      .join('\n')
      .replace(/```[a-z]*\n?/gi, '');
    const match = text.match(/\[[\d\s,]*\]/);
    const parsed = JSON.parse(match ? match[0] : text.trim());
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<number>();
    const out: number[] = [];
    for (const n of parsed) {
      if (Number.isInteger(n) && n >= 1 && n <= poolSize && !seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
    return out.slice(0, REVIEW_TABLE_MAX);
  } catch {
    return [];
  }
}

/**
 * The screening pass: the same model that will write the briefing, at LOW
 * effort with a tight token ceiling, picks the pool studies that genuinely
 * bear on the question — so the high-effort writing call only ever weighs the
 * briefing-sized set the format was designed around, instead of thinking
 * silently for minutes over the whole pool (the v12 stall). Returns original
 * pool numbers. Any failure returns [] and the caller falls back to the first
 * REVIEW_TABLE_MAX curated studies, so this can never break the review.
 */
async function selectStudies(
  apiKey: string,
  model: ModelId,
  problem: string,
  numberedLines: string[],
  signal?: AbortSignal
): Promise<number[]> {
  try {
    const res = await messagesCreate(
      apiKey,
      {
        model,
        max_tokens: SELECT_MAX_TOKENS,
        ...modelParams(model, 'low'),
        system: SELECT_SYSTEM,
        messages: [
          {
            role: 'user',
            content: `Question: ${problem}\n\nStudies:\n${numberedLines.join('\n')}`,
          },
        ],
      },
      signal
    );
    await recordUsage(model, res?.usage?.input_tokens ?? 0, res?.usage?.output_tokens ?? 0);
    return parseSelection(res, numberedLines.length);
  } catch {
    return [];
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
 * Stream the model's markdown to the client. Same behaviour as before —
 * immediate preamble byte, tolerant enqueue after the client disconnects,
 * caching gated on a complete + shouldCache-passing result — plus the staged
 * pipeline's resilience pieces:
 *
 *  - `makeEvents` is a LAZY factory, awaited inside the stream body. The 200
 *    and the preamble byte are committed to the client first, so the
 *    selection pass (which runs inside the factory) is covered by the
 *    heartbeat rather than adding dead air before headers.
 *  - a HEARTBEAT for the WHOLE stream: whenever the model has been silent
 *    for ~12s, a zero-width no-break space (U+FEFF) goes to the client.
 *    Adaptive thinking sits silent not only before the report but BETWEEN
 *    its sections (interleaved thinking emits no text events), and
 *    intermediaries kill a quiet connection — Cloudflare's between-bytes
 *    timeout is ~100s, which is exactly how v14 reports died mid-document on
 *    real connections while short test runs survived. U+FEFF is invisible
 *    and the client strips it before any parsing, so it is safe to send
 *    mid-word, mid-table, anywhere; it is never appended to `full`, so the
 *    cached report stays clean.
 *  - client disconnect does NOT abort the model call (see cancel below): the
 *    report finishes and caches, so the reader's retry — the normal next
 *    step on a phone whose connection dropped — returns the completed report
 *    instantly instead of restarting the multi-minute job from scratch.
 */
const HEARTBEAT_CHAR = '\uFEFF';
const HEARTBEAT_IDLE_MS = 12_000;

function streamMarkdown(
  makeEvents: () => Promise<AsyncGenerator<any>>,
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
      let lastByteAt = Date.now();
      const send = (text: string) => {
        try {
          controller.enqueue(enc.encode(text));
          lastByteAt = Date.now();
        } catch {
          // Client gone — keep consuming the model stream anyway so the
          // report completes and caches (see cancel below).
        }
      };
      const heartbeat = setInterval(() => {
        if (Date.now() - lastByteAt >= HEARTBEAT_IDLE_MS) send(HEARTBEAT_CHAR);
      }, 4_000);
      try {
        if (preamble) send(preamble);
        const events = await makeEvents();
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
        clearInterval(heartbeat);
        await recordUsage(model, inputTokens, outputTokens);
        try {
          controller.close();
        } catch {}
      }
    },
    cancel() {
      // Deliberately DO NOT abort the upstream model call. The common
      // disconnect is a phone whose connection or tab died mid-report — that
      // reader is about to retry, and a finished report caches, turning the
      // retry into an instant cache hit instead of a second multi-minute
      // generation. send() already tolerates the closed controller, so the
      // loop above simply runs to completion in the background.
    },
  });

  return new Response(body, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'x-cache': 'MISS',
      'x-model': modelLabel,
      // Which prompt/pipeline version served this — lets anyone confirm from
      // the network tab that a deploy actually took effect.
      'x-assist-version': ASSIST_PROMPT_VERSION,
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
  // The client hands over a candidate POOL, not a pre-cut set: review.ts sizes
  // it by how much research the question surfaced (up to REVIEW_POOL_MAX, of
  // which at most PREPRINT_CAP are preprints). A fast selection pass below
  // screens it down to the studies that belong in the ~2-page briefing before
  // the high-effort writing call ever sees it. This slice is defence in depth
  // against a stray caller sending more than the pool max.
  const items = (Array.isArray(body?.items) ? body.items : [])
    .slice(0, REVIEW_POOL_MAX)
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

  // Numbered once, indexed by both the selection pass and the writing call —
  // the study at numberedLines[n-1] is "[n] {...}" for every consumer, which
  // is what guarantees the briefing's [n] markers land on the same records
  // the client numbered its reference list from.
  const numberedLines = items.map((it: any, i: number) => `[${i + 1}] ${JSON.stringify(it)}`);
  // The selection pass screens HEADLINES, not abstracts: title, authors,
  // year, venue, preprint flag and a one-line snippet. Same numbering, a
  // fraction of the input — the screening call stays fast (the depth belongs
  // to the writing call, which reads the chosen studies in full).
  const headlineLines = items.map((it: any, i: number) =>
    `[${i + 1}] ${JSON.stringify({
      title: it.title,
      authors: it.authors,
      year: it.year,
      venue: it.venue,
      snippet: clipStr(it.abstract, 220) || undefined,
      ...(it.preprint === true ? { preprint: true } : {}),
    })}`
  );

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
            'x-assist-version': ASSIST_PROMPT_VERSION,
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

  // The staged pipeline, run lazily inside the committed stream (see
  // streamMarkdown): screen the pool down to a briefing-sized set first, then
  // hand ONLY those studies — original numbers intact — to the high-effort
  // writing call. Pools already at briefing size skip the screening call.
  // No abort signal anywhere: a client disconnect must not kill the
  // generation (streamMarkdown's cancel explains why).
  const makeEvents = async () => {
    let selected: number[] = [];
    if (items.length > REVIEW_TABLE_MAX) {
      selected = await selectStudies(apiKey, model, problem, headlineLines);
    }
    // A degenerate selection (failed call, unparseable output, or too few
    // rows to write a citable briefing from) falls back to the head of the
    // curated pool — curation order, i.e. the pre-v12 behaviour.
    if (selected.length < 3) {
      selected = numberedLines.slice(0, REVIEW_TABLE_MAX).map((_: string, i: number) => i + 1);
    }
    const user = `Question: ${problem}\n\nStudies:\n${selected
      .map((n) => numberedLines[n - 1])
      .join('\n')}`;
    return streamMessages(
      apiKey,
      {
        model,
        max_tokens: REVIEW_MAX_TOKENS,
        // High effort on Sonnet 5 — the proven, reliable config. An earlier
        // experiment (Opus 4.8 at xhigh "extra" effort) thought for minutes
        // per report and dropped connections mid-generation in production;
        // Sonnet 5 at high writes the same briefing in ~60–90s and is solid.
        // The whole-stream heartbeat and disconnect-tolerant caching stay as
        // belt-and-braces, but this engine rarely needs them.
        ...modelParams(model, 'high'),
        system: REVIEW_SYSTEM,
        messages: [{ role: 'user', content: user }],
      }
    );
  };

  return streamMarkdown(makeEvents, {
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
