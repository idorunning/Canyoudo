import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import Anthropic from '@anthropic-ai/sdk';
import { modelParams, type ModelId } from '../../src/lib/personas';
import {
  ASSIST_PROMPT_VERSION,
  TRANSLATE_SYSTEM,
  OVERVIEW_SYSTEM,
  ANSWER_SYSTEM,
  BRIEF_SYSTEM,
  PLAN_SYSTEM,
  BRIEFING_SYSTEMS,
  BRIEFING_MAX_TOKENS,
  BRIEFING_DEPTHS,
  type BriefingDepth,
} from '../../src/lib/research-assist-prompts';
import { sanitizeCitations } from '../../src/lib/citations.mjs';
import { budgetExceeded, recordUsage, BUDGET_MESSAGE } from '../../src/lib/ai-budget';

// AI assistance for the /research search.
//   POST /api/research-assist
//     { mode: 'translate', question }                  → { query, filters, note }
//     { mode: 'overview', query, filters, items[≤8] }  → { overview, caveat, refinements }
//     { mode: 'answer', question, items[≤10] }         → { answer, used, caveat, confidence }
//     { mode: 'brief', topic, items[≤15] }             → { brief, used, caveat }
//     { mode: 'plan', problem }                         → { framing, angles[3] }
//     { mode: 'briefing', problem, items[≤15], depth }  → { briefing, used, confidence, caveat }
//
// plan + briefing are the two halves of the problem-first briefing flow: plan
// (Sonnet) decomposes a problem into ~3 distinct search angles; the client
// searches each, merges and curates the studies, then briefing (Sonnet)
// synthesises the evidence briefing. `depth` ('low'|'mid'|'high') selects the
// synthesis prompt and token budget — a quick scan, a balanced overview, or a
// full review with approaches to try. briefing carries the same
// citation discipline as answer/brief — only [n] indices into the one numbered
// list it was given, references built client-side, out-of-range stripped here.
//
// translate uses Sonnet (better inference from a vague question to the
// literature's vocabulary); overview uses Haiku (fast, cheap synthesis of the
// abstracts already on screen); answer uses Sonnet to synthesise a CITED
// answer — it may only emit [n] indices into the studies it was shown, and
// the client builds the reference list from the real retrieved works, so a
// fabricated reference is structurally impossible. All responses are
// JSON-only, validated here, and cached in Netlify Blobs — repeat questions
// cost nothing. Uncached calls run through the monthly budget guard
// (lib/ai-budget.mts): over budget → friendly 503, search unaffected.

const TRANSLATE_MODEL: ModelId = 'claude-sonnet-4-6';
const OVERVIEW_MODEL: ModelId = 'claude-haiku-4-5';
const ANSWER_MODEL: ModelId = 'claude-sonnet-4-6';
const BRIEF_MODEL: ModelId = 'claude-sonnet-4-6';
const PLAN_MODEL: ModelId = 'claude-sonnet-4-6';
const BRIEFING_MODEL: ModelId = 'claude-sonnet-4-6';

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

// Parse the model's reply as the JSON object the contract asks for. The prompts
// all demand bare JSON with no fences, but a model can still wrap it in a
// ```json block or add a stray line; rather than let that throw (and surface as
// a generic failure), tolerate those shapes by extracting the object span.
function parseJsonObject(text: string): any {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {}
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {}
  }
  // Last resort: the outermost { … } span. Handles leading/trailing prose.
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }
  throw new SyntaxError('Model response was not JSON.');
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
  // Count the actual spend against the monthly budget (never throws).
  await recordUsage(model, res.usage?.input_tokens ?? 0, res.usage?.output_tokens ?? 0);
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return parseJsonObject(text);
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
  // How many studies a citing mode (answer/brief) was actually given — the
  // upper bound for its citation indices.
  let citedItemCount = 0;

  if (mode === 'plan') {
    const problem = clipStr(body.problem, 600);
    if (!problem) return json(400, { error: 'Describe the problem first.' });
    model = PLAN_MODEL;
    system = PLAN_SYSTEM;
    user = `Problem: ${problem}`;
    maxTokens = 500;
    input = { p: problem.toLowerCase() };
  } else if (mode === 'briefing') {
    const problem = clipStr(body.problem, 600);
    const items = Array.isArray(body.items)
      ? body.items.slice(0, 15).map((it: any) => ({
          title: clipStr(it?.title, 300),
          authors: Array.isArray(it?.authors)
            ? it.authors.slice(0, 4).map((a: unknown) => clipStr(a, 100)).filter(Boolean)
            : [],
          year: Number.isInteger(it?.year) ? it.year : null,
          venue: clipStr(it?.venue, 150) || null,
          abstract: clipStr(it?.abstract, 700),
        })).filter((it: any) => it.title)
      : [];
    if (!problem || items.length === 0) return json(400, { error: 'Nothing to brief from.' });
    // Depth picks the synthesis prompt and its budget (quick scan → full
    // review). Headroom matters at the deep end: too low and a long markdown
    // briefing truncates mid-object, fails the parse, and shows as no briefing.
    const depth: BriefingDepth = BRIEFING_DEPTHS.includes(body.depth) ? body.depth : 'mid';
    citedItemCount = items.length;
    model = BRIEFING_MODEL;
    system = BRIEFING_SYSTEMS[depth];
    user = `Problem: ${problem}\n\nStudies:\n${items
      .map((it: any, i: number) => `[${i + 1}] ${JSON.stringify(it)}`)
      .join('\n')}`;
    maxTokens = BRIEFING_MAX_TOKENS[depth];
    // depth is part of the cache identity — each level is a distinct briefing.
    input = { p: problem.toLowerCase(), items, depth };
  } else if (mode === 'brief') {
    const topic = clipStr(body.topic, 100) || 'Saved papers';
    const items = Array.isArray(body.items)
      ? body.items.slice(0, 15).map((it: any) => ({
          title: clipStr(it?.title, 300),
          authors: Array.isArray(it?.authors)
            ? it.authors.slice(0, 4).map((a: unknown) => clipStr(a, 100)).filter(Boolean)
            : [],
          year: Number.isInteger(it?.year) ? it.year : null,
          venue: clipStr(it?.venue, 150) || null,
          abstract: clipStr(it?.abstract, 600),
          ...(clipStr(it?.note, 300) ? { note: clipStr(it?.note, 300) } : {}),
        })).filter((it: any) => it.title)
      : [];
    if (items.length === 0) return json(400, { error: 'Nothing to brief from.' });
    citedItemCount = items.length;
    model = BRIEF_MODEL;
    system = BRIEF_SYSTEM;
    user = `Topic: ${topic}\n\nStudies:\n${items
      .map((it: any, i: number) => `[${i + 1}] ${JSON.stringify(it)}`)
      .join('\n')}`;
    maxTokens = 2000;
    input = { t: topic.toLowerCase(), items };
  } else if (mode === 'answer') {
    const question = clipStr(body.question, 400);
    const items = Array.isArray(body.items)
      ? body.items.slice(0, 10).map((it: any) => ({
          title: clipStr(it?.title, 300),
          authors: Array.isArray(it?.authors)
            ? it.authors.slice(0, 4).map((a: unknown) => clipStr(a, 100)).filter(Boolean)
            : [],
          year: Number.isInteger(it?.year) ? it.year : null,
          venue: clipStr(it?.venue, 150) || null,
          abstract: clipStr(it?.abstract, 800),
        })).filter((it: any) => it.title)
      : [];
    if (!question || items.length === 0) return json(400, { error: 'Nothing to answer from.' });
    citedItemCount = items.length;
    model = ANSWER_MODEL;
    system = ANSWER_SYSTEM;
    user = `Question: ${question}\n\nStudies:\n${items
      .map((it: any, i: number) => `[${i + 1}] ${JSON.stringify(it)}`)
      .join('\n')}`;
    maxTokens = 1200;
    input = { q: question.toLowerCase(), items };
  } else if (mode === 'translate') {
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

  // Cache hits above are free; only an actual model call counts against the
  // monthly budget — and over budget, AI assist pauses while search runs on.
  if (await budgetExceeded()) return json(503, { error: BUDGET_MESSAGE });

  let out: any;
  try {
    out = await callClaude(model, system, user, maxTokens);
  } catch {
    return json(502, { error: 'The assistant is unavailable right now. Search still works.' });
  }

  // Validate the model's JSON to the contract the page expects; reject shapes
  // we don't recognise rather than passing anything through.
  let result: Record<string, unknown>;
  if (mode === 'plan') {
    const framing = clipStr(out?.framing, 500);
    const angles = (Array.isArray(out?.angles) ? out.angles : [])
      .map((a: any) => ({
        label: clipStr(a?.label, 60),
        query: clipStr(a?.query, 200),
        review: a?.review === true,
        from:
          Number.isInteger(a?.from) && a.from >= 1950 && a.from <= 2100 ? a.from : null,
      }))
      .filter((a: any) => a.query)
      .slice(0, 3);
    // Need a framing and at least one usable angle, or the pipeline has nothing
    // to search — fail rather than pass a shape the client can't run.
    if (!framing || angles.length === 0) {
      return json(502, { error: 'The assistant gave an unusable plan. Try rephrasing the problem.' });
    }
    result = { framing, angles };
  } else if (mode === 'briefing') {
    // Same citation discipline as answer/brief: strip out-of-range markers,
    // reject a briefing left with nothing cited.
    const { text: briefing, used } = sanitizeCitations(clipStr(out?.briefing, 8000), citedItemCount);
    if (!briefing || used.length === 0) {
      return json(502, { error: 'The assistant gave an unusable reply. Try again.' });
    }
    result = {
      briefing,
      used,
      confidence: ['strong', 'mixed', 'thin'].includes(out?.confidence) ? out.confidence : 'mixed',
      caveat:
        clipStr(out?.caveat, 300) ||
        'Synthesised from the abstracts of a curated set, not the full texts or a systematic review — read the studies before relying on this.',
    };
  } else if (mode === 'brief') {
    // Same citation discipline as answer: strip out-of-range markers, reject
    // a brief left with nothing cited.
    const { text: brief, used } = sanitizeCitations(clipStr(out?.brief, 6000), citedItemCount);
    if (!brief || used.length === 0) {
      return json(502, { error: 'The assistant gave an unusable reply. Try again.' });
    }
    result = {
      brief,
      used,
      caveat:
        clipStr(out?.caveat, 300) ||
        'Synthesised from the abstracts of the saved papers, not the full texts — read the studies before relying on this.',
    };
  } else if (mode === 'answer') {
    // Strip citation markers pointing outside the studies we sent; an answer
    // with no valid citations left is unusable by definition.
    const { text: answer, used } = sanitizeCitations(clipStr(out?.answer, 2500), citedItemCount);
    if (!answer || used.length === 0) {
      return json(502, { error: 'The assistant gave an unusable reply. Try rephrasing.' });
    }
    result = {
      answer,
      used,
      caveat:
        clipStr(out?.caveat, 300) ||
        'Synthesised from the abstracts of the studies listed below — not a systematic review. Read the studies.',
      confidence: ['strong', 'mixed', 'thin'].includes(out?.confidence) ? out.confidence : 'mixed',
    };
  } else if (mode === 'translate') {
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
