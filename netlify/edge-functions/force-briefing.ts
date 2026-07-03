// The Force Briefing — the crime dashboard's deep tier, an EDGE FUNCTION for
// exactly the reasons research-review.ts is one (see the long note there): a
// Sonnet 5 generation at high thinking effort routinely outlives a Lambda
// function's ~10-second streaming ceiling, and edge execution time is
// CPU-bound, so waiting on the model is free. Same Deno constraints too: no
// Anthropic SDK (fetch + hand-parsed SSE), only pure import-free modules
// shared, Deno.env for environment variables, and a self-contained copy of the
// budget guard writing to the same Blobs store so the monthly cap accumulates
// coherently across every AI route.
//
//   POST /api/force-briefing  { force }  → streamed markdown briefing
//
// The digest is fetched SERVER-SIDE from the site's own
// /api/police-db?view=briefing-digest — never accepted from the client — so a
// briefing is always generated from the real data and the cache (keyed force ×
// data month × model × prompt version) cannot be poisoned. Cost is bounded by
// construction: ~45 forces × one generation per data month, then cache hits.

import { getStore } from '@netlify/blobs';
import { modelParams, INTERPRET_MODELS, type ModelId } from '../../src/lib/personas.ts';
import {
  BRIEFING_PROMPT_VERSION,
  BRIEFING_SYSTEM,
  BRIEFING_MODEL,
  BRIEFING_MAX_TOKENS,
  BRIEFING_CONFIDENCE_PREFIX,
} from '../../src/lib/dashboard-prompts.ts';
import { stableKey } from '../../src/lib/cache-key.mjs';
import { costUsd, monthKey } from '../../src/lib/ai-budget-core.mjs';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// ---- the monthly AI-spend guard, Deno-native (mirrors src/lib/ai-budget.ts) ----
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

// Intended model first, then the same top-tier fallback chain as the research
// review, env override leading.
function briefingCandidates(): ModelId[] {
  const envModel = Deno.env.get('FORCE_BRIEFING_MODEL');
  const wanted = [envModel, BRIEFING_MODEL, 'claude-opus-4-8', 'claude-sonnet-4-6'];
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
    }
  }
  return {
    error:
      lastStatus === 401 || lastStatus === 403
        ? 'The briefing couldn’t reach its AI model — the deployment’s model access may need checking. The charts below still work.'
        : 'The briefing couldn’t reach its AI model just now. Try again in a moment — the charts below still work.',
  };
}

function streamMarkdown(
  events: AsyncGenerator<any>,
  abort: () => void,
  opts: {
    store: ReturnType<typeof getStore> | null;
    key: string;
    model: string;
    modelLabel: string;
    dataMonth: string;
    preamble?: string;
    shouldCache: (full: string) => boolean;
  }
): Response {
  const enc = new TextEncoder();
  let full = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason: string | null = null;
  const { store, key, model, modelLabel, dataMonth, preamble, shouldCache } = opts;

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
      'x-data-month': dataMonth,
    },
  });
}

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json(503, { error: 'The force briefing is not configured yet.' });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Bad request.' });
  }
  const force = typeof body?.force === 'string' && /^[a-z0-9_-]{1,60}$/.test(body.force) ? body.force : '';
  if (!force) return json(400, { error: 'A force id is required.' });

  // The digest comes from our own police-db function — real data, server-side,
  // so the per-force cache can't be poisoned by a crafted request body.
  let digestRes: Response;
  try {
    digestRes = await fetch(new URL(`/api/police-db?view=briefing-digest&force=${force}`, req.url));
  } catch {
    return json(502, { error: 'Couldn’t reach the police database.' });
  }
  if (!digestRes.ok) {
    const b = await digestRes.json().catch(() => null);
    return json(digestRes.status === 404 ? 404 : 502, { error: (b && b.error) || 'No data for that force yet.' });
  }
  const { dataMonth, digest } = await digestRes.json();
  if (!digest?.latestMonth) return json(404, { error: 'No data for that force yet.' });

  const candidates = briefingCandidates();
  const keyFor = (m: ModelId) =>
    stableKey('force-briefing', { force, dataMonth }, m, BRIEFING_PROMPT_VERSION);

  // A finished briefing replays free — check every candidate model's key.
  let store: ReturnType<typeof getStore> | null = null;
  try {
    store = getStore('force-briefings');
    for (const m of candidates) {
      const cached = await store.get(keyFor(m));
      if (cached) {
        return new Response(cached, {
          headers: {
            'content-type': 'text/markdown; charset=utf-8',
            'x-cache': 'HIT',
            'x-model': INTERPRET_MODELS[m],
            'x-data-month': dataMonth,
          },
        });
      }
    }
  } catch {
    store = null;
  }

  if (await budgetExceeded()) return json(503, { error: BUDGET_MESSAGE });

  // Resolve the model BEFORE streaming: once the 200 stream starts it can't
  // become an error response.
  const picked = await pickModel(apiKey, candidates);
  if ('error' in picked) return json(502, { error: picked.error });
  const { model, label: modelLabel } = picked;

  const controller = new AbortController();
  const events = streamMessages(
    apiKey,
    {
      model,
      max_tokens: BRIEFING_MAX_TOKENS,
      // High effort: the briefing is the dashboard's one deep-reasoning call,
      // and it's cached per force × data month, so the thinking amortises.
      ...modelParams(model, 'high'),
      system: BRIEFING_SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Write the data briefing for ${digest.scope}. The digest (the only data you may use):\n\n${JSON.stringify(digest, null, 2)}`,
        },
      ],
    },
    controller.signal
  );

  return streamMarkdown(events, () => controller.abort(), {
    store,
    key: keyFor(model),
    model,
    modelLabel,
    dataMonth,
    preamble: '\n',
    // Never cache a briefing the client would reject: it must carry the
    // closing confidence line (a missing line means the stream was cut short)
    // and at least one section heading.
    shouldCache: (full) =>
      full.includes(BRIEFING_CONFIDENCE_PREFIX) && /###\s/.test(full),
  });
};

export const config = { path: '/api/force-briefing' };
