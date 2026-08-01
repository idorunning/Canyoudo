import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import Anthropic from '@anthropic-ai/sdk';
import { modelParams, type ModelId } from '../../src/lib/personas';
import {
  ASSIST_PROMPT_VERSION,
  TRANSLATE_SYSTEM,
  OVERVIEW_SYSTEM,
  OVERVIEW_MODEL,
  BRIEF_SYSTEM,
  PLAN_SYSTEM,
  ASSIST_OPENAI_MODEL,
  ASSIST_REASONING,
} from '../../src/lib/research-assist-prompts';
import {
  responsesBody,
  openaiCreate,
  outputText,
  usageOf,
} from '../../src/lib/openai-core.mjs';
import { sanitizeCitations } from '../../src/lib/citations.mjs';
import { stableKey } from '../../src/lib/cache-key.mjs';
import { budgetExceeded, recordUsage, BUDGET_MESSAGE } from '../../src/lib/ai-budget';

// The short, JSON-shaped AI helpers behind /research. Each call here is one
// quick model round-trip that fits comfortably inside a synchronous function's
// time budget:
//   POST /api/research-assist
//     { mode: 'translate', question }                   → { query, filters, note }
//     { mode: 'overview', query, items[≤10] }           → { overview, readFirst, refinements, caveat }
//     { mode: 'plan', problem }                         → { framing, angles[3] }
//     { mode: 'brief', topic, items[≤15] }              → { brief, used, caveat }
//
// The tool's three modes map onto the AI like this: plain SEARCH uses no model
// at all; OVERVIEW uses translate (question → search terms) + overview (a
// mid-tier read of what came back, with a suggested reading order); the
// RESEARCH REVIEW uses plan here to decompose the problem, then hands the
// long synthesis to /api/research-review — a STREAMING function, because a
// full report cannot finish inside this endpoint's synchronous window (that
// truncated window is exactly what used to break the old "full review").
// brief serves the saved-papers folders.
//
// overview's readFirst indices and brief's [n] markers only ever point into
// the one numbered list each was given — references are built client-side
// from the real retrieved works, so a fabricated reference is structurally
// impossible. All responses are JSON-only, validated here, and cached in
// Netlify Blobs — repeat questions cost nothing. Uncached calls run through
// the monthly budget guard (lib/ai-budget.mts): over budget → friendly 503,
// search unaffected.

// v22: these four modes run on OpenAI (ASSIST_OPENAI_MODEL, standard mode at
// low effort) whenever OPENAI_API_KEY2 is set. Low effort is a deliberate
// choice, not a saving: every call here happens inside a SYNCHRONOUS function
// with a hard ~10s ceiling, and each is a short JSON round-trip — a search
// translation, three search angles, a paragraph on ten abstracts. The deep
// thinking (pro mode, max effort) belongs to the one call that can afford it,
// the streamed review in netlify/edge-functions/research-review.ts.
//
// The Claude ids below are the fallback engine, used when no OpenAI key is set.
const TRANSLATE_MODEL: ModelId = 'claude-sonnet-4-6';
const PLAN_MODEL: ModelId = 'claude-sonnet-4-6';
const BRIEF_MODEL: ModelId = 'claude-sonnet-4-6';
// OVERVIEW_MODEL comes from research-assist-prompts.ts (shared with the client).

// The research tools' own key, separate from the OPENAI_API_KEY the build uses
// for audio narration so either can be rotated on its own; the narration key
// stands in if the dedicated one is missing.
const openAiKey = () => process.env.OPENAI_API_KEY2 || process.env.OPENAI_API_KEY || '';

const json = (status: number, body: unknown, cache: 'HIT' | 'MISS' | 'NONE' = 'NONE') =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...(cache !== 'NONE' ? { 'x-cache': cache } : {}) },
  });

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

/** One JSON round-trip on the OpenAI engine. Same contract as callClaude:
 *  returns the parsed object, records the spend, throws on anything else. */
async function callOpenAi(apiKey: string, model: string, system: string, user: string, maxTokens: number) {
  const res = await openaiCreate(
    apiKey,
    responsesBody({
      model,
      system,
      user,
      // Reasoning tokens share this ceiling, so give the short JSON replies
      // room to think before writing — a truncated reply is an unusable one.
      maxOutputTokens: maxTokens + 2000,
      ...ASSIST_REASONING,
    })
  );
  const { input, output } = usageOf(res);
  await recordUsage(model, input, output);
  return parseJsonObject(outputText(res));
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

/** Clip an incoming study list to the shape the prompts expect. */
function clipItems(raw: unknown, max: number, abstractMax: number, withNote = false) {
  return (Array.isArray(raw) ? raw : [])
    .slice(0, max)
    .map((it: any) => ({
      title: clipStr(it?.title, 300),
      authors: Array.isArray(it?.authors)
        ? it.authors.slice(0, 4).map((a: unknown) => clipStr(a, 100)).filter(Boolean)
        : [],
      year: Number.isInteger(it?.year) ? it.year : null,
      venue: clipStr(it?.venue, 150) || null,
      abstract: clipStr(it?.abstract, abstractMax),
      ...(withNote && clipStr(it?.note, 300) ? { note: clipStr(it?.note, 300) } : {}),
    }))
    .filter((it: any) => it.title);
}

const numberedList = (items: object[]) =>
  items.map((it, i) => `[${i + 1}] ${JSON.stringify(it)}`).join('\n');

export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  // OpenAI leads; Claude runs these modes only when no OpenAI key is set.
  const openai = openAiKey();
  if (!openai && !process.env.ANTHROPIC_API_KEY) {
    return json(503, { error: 'AI assistance is not configured yet.' });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Bad request.' });
  }

  const mode = body?.mode;
  let model: string, system: string, user: string, maxTokens: number, input: Record<string, unknown>;
  // One mid-tier model does all four modes on the OpenAI engine; on the Claude
  // fallback each mode keeps its own pinned id. Either way `model` is what the
  // cache key and the budget ledger record, so a switch never serves an answer
  // the other engine wrote.
  const modelFor = (claude: ModelId) => (openai ? ASSIST_OPENAI_MODEL : claude);
  // How many studies a citing mode (brief) or index-suggesting mode (overview)
  // was actually given — the upper bound for its indices.
  let citedItemCount = 0;

  if (mode === 'plan') {
    const problem = clipStr(body.problem, 600);
    if (!problem) return json(400, { error: 'Describe the problem first.' });
    model = modelFor(PLAN_MODEL);
    system = PLAN_SYSTEM;
    user = `Problem: ${problem}`;
    maxTokens = 500;
    input = { p: problem.toLowerCase() };
  } else if (mode === 'brief') {
    const topic = clipStr(body.topic, 100) || 'Saved papers';
    const items = clipItems(body.items, 15, 600, true);
    if (items.length === 0) return json(400, { error: 'Nothing to brief from.' });
    citedItemCount = items.length;
    model = modelFor(BRIEF_MODEL);
    system = BRIEF_SYSTEM;
    user = `Topic: ${topic}\n\nStudies:\n${numberedList(items)}`;
    maxTokens = 2000;
    input = { t: topic.toLowerCase(), items };
  } else if (mode === 'translate') {
    const question = clipStr(body.question, 400);
    if (!question) return json(400, { error: 'Ask a question first.' });
    model = modelFor(TRANSLATE_MODEL);
    system = TRANSLATE_SYSTEM;
    user = `Question: ${question}`;
    maxTokens = 400;
    input = { q: question.toLowerCase() };
  } else if (mode === 'overview') {
    const query = clipStr(body.query, 400);
    const items = clipItems(body.items, 10, 600);
    if (!query || items.length === 0) return json(400, { error: 'Nothing to summarise.' });
    citedItemCount = items.length;
    model = modelFor(OVERVIEW_MODEL as ModelId);
    system = OVERVIEW_SYSTEM;
    user = `Search query: ${query}\n\nResults:\n${numberedList(items)}`;
    maxTokens = 900;
    input = { q: query.toLowerCase(), items };
  } else {
    return json(400, { error: 'Unknown mode.' });
  }

  // Cache: same question/results → same answer, free.
  const key = stableKey(mode, input, model, ASSIST_PROMPT_VERSION);
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
    out = openai
      ? await callOpenAi(openai, model, system, user, maxTokens)
      : await callClaude(model as ModelId, system, user, maxTokens);
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
        // The label feeds the progress checklist — fall back to the query so
        // a labelless angle never renders as a blank row.
        label: clipStr(a?.label, 60) || clipStr(a?.query, 60),
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
  } else if (mode === 'brief') {
    // Citation discipline: strip out-of-range markers, reject a brief left
    // with nothing cited.
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
    // overview — the reading-order indices are validated against the numbered
    // list the model was actually shown, so a suggestion can never point at a
    // study that isn't on screen.
    const overview = clipStr(out?.overview, 1500);
    if (!overview) return json(502, { error: 'The assistant gave an unusable reply.' });
    const seen = new Set<number>();
    const readFirst = (Array.isArray(out?.readFirst) ? out.readFirst : [])
      .map((r: any) => ({
        n: Number.isInteger(r?.n) ? r.n : 0,
        why: clipStr(r?.why, 160),
      }))
      .filter((r: any) => {
        if (r.n < 1 || r.n > citedItemCount || !r.why || seen.has(r.n)) return false;
        seen.add(r.n);
        return true;
      })
      .slice(0, 4);
    result = {
      overview,
      readFirst,
      refinements: Array.isArray(out?.refinements)
        ? out.refinements.map((r: unknown) => clipStr(r, 60)).filter(Boolean).slice(0, 4)
        : [],
      caveat:
        clipStr(out?.caveat, 300) ||
        'A sketch of a few abstracts, not a systematic review — read the studies.',
    };
  }

  try {
    if (store) await store.set(key, JSON.stringify(result));
  } catch {}
  return json(200, result, 'MISS');
};

export const config: Config = { path: '/api/research-assist' };
