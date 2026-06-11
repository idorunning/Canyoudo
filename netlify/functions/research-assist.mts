import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import Anthropic from '@anthropic-ai/sdk';
import { modelParams, type ModelId } from '../../src/lib/personas';
import {
  ASSIST_PROMPT_VERSION,
  TRANSLATE_SYSTEM,
  OVERVIEW_SYSTEM,
} from '../../src/lib/research-assist-prompts';

// AI assistance for the /research search.
//   POST /api/research-assist
//     { mode: 'translate', question }                  → { query, filters, note }
//     { mode: 'overview', query, filters, items[≤8] }  → { overview, caveat, refinements }
//
// translate uses Sonnet (better inference from a vague question to the
// literature's vocabulary); overview uses Haiku (fast, cheap synthesis of the
// abstracts already on screen). Both responses are JSON-only, validated here,
// and cached in Netlify Blobs — repeat questions cost nothing.

const TRANSLATE_MODEL: ModelId = 'claude-sonnet-4-6';
const OVERVIEW_MODEL: ModelId = 'claude-haiku-4-5';

const json = (status: number, body: unknown, cache: 'HIT' | 'MISS' | 'NONE' = 'NONE') =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...(cache !== 'NONE' ? { 'x-cache': cache } : {}) },
  });

// Stable, compact cache key: lowercase the text, sort the filter entries.
function cacheKey(mode: string, input: Record<string, unknown>, model: string) {
  const norm = JSON.stringify(input, Object.keys(input).sort());
  // Keys must stay modest; hash long inputs.
  let h = 0;
  for (let i = 0; i < norm.length; i++) h = (Math.imul(h, 31) + norm.charCodeAt(i)) | 0;
  return `${mode}:${(h >>> 0).toString(36)}:${model}:${ASSIST_PROMPT_VERSION}`;
}

async function callClaude(model: ModelId, system: string, user: string, maxTokens: number) {
  const client = new Anthropic();
  const res = await client.messages.create({
    model,
    max_tokens: maxTokens,
    ...modelParams(model),
    system,
    messages: [{ role: 'user', content: user }],
  });
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return JSON.parse(text.trim());
}

const clipStr = (v: unknown, max: number) =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return json(503, { error: 'AI assistance is not configured yet.' });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Bad request.' });
  }

  const mode = body?.mode;
  let model: ModelId, system: string, user: string, maxTokens: number, input: Record<string, unknown>;

  if (mode === 'translate') {
    const question = clipStr(body.question, 400);
    if (!question) return json(400, { error: 'Ask a question first.' });
    model = TRANSLATE_MODEL;
    system = TRANSLATE_SYSTEM;
    user = `Question: ${question}`;
    maxTokens = 400;
    input = { q: question.toLowerCase() };
  } else if (mode === 'overview') {
    const query = clipStr(body.query, 300);
    const items = Array.isArray(body.items)
      ? body.items.slice(0, 8).map((it: any) => ({
          title: clipStr(it?.title, 300),
          year: Number.isInteger(it?.year) ? it.year : null,
          abstract: clipStr(it?.abstract, 600),
        })).filter((it: any) => it.title)
      : [];
    if (!query || items.length === 0) return json(400, { error: 'Nothing to summarise.' });
    model = OVERVIEW_MODEL;
    system = OVERVIEW_SYSTEM;
    user = `Search query: ${query}\n\nResults:\n${JSON.stringify(items, null, 1)}`;
    maxTokens = 700;
    input = { q: query.toLowerCase(), items };
  } else {
    return json(400, { error: 'Unknown mode.' });
  }

  // Cache: same question/results → same answer, free.
  const key = cacheKey(mode, input, model);
  let store: ReturnType<typeof getStore> | null = null;
  try {
    store = getStore('research-assist');
    const cached = await store.get(key);
    if (cached) return json(200, JSON.parse(cached), 'HIT');
  } catch {
    store = null;
  }

  let out: any;
  try {
    out = await callClaude(model, system, user, maxTokens);
  } catch {
    return json(502, { error: 'The assistant is unavailable right now. Search still works.' });
  }

  // Validate the model's JSON to the contract the page expects; reject shapes
  // we don't recognise rather than passing anything through.
  let result: Record<string, unknown>;
  if (mode === 'translate') {
    const query = clipStr(out?.query, 200);
    if (!query) return json(502, { error: 'The assistant gave an unusable reply. Try rephrasing.' });
    const f = out?.filters ?? {};
    result = {
      query,
      filters: {
        review: f.review === true,
        from: Number.isInteger(f.from) && f.from >= 1950 && f.from <= 2100 ? f.from : null,
        sort: f.sort === 'cited' || f.sort === 'recent' ? f.sort : null,
      },
      note: clipStr(out?.note, 160) || null,
    };
  } else {
    const overview = clipStr(out?.overview, 1200);
    if (!overview) return json(502, { error: 'The assistant gave an unusable reply.' });
    result = {
      overview,
      caveat: clipStr(out?.caveat, 300) || 'A sketch of a few abstracts, not a systematic review — read the studies.',
      refinements: Array.isArray(out?.refinements)
        ? out.refinements.map((r: unknown) => clipStr(r, 60)).filter(Boolean).slice(0, 4)
        : [],
    };
  }

  try {
    if (store) await store.set(key, JSON.stringify(result));
  } catch {}
  return json(200, result, 'MISS');
};

export const config: Config = { path: '/api/research-assist' };
