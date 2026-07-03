import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import Anthropic from '@anthropic-ai/sdk';
import { budgetExceeded, recordUsage, BUDGET_MESSAGE } from '../../src/lib/ai-budget';
import { streamMarkdown } from '../../src/lib/ai-stream';
import {
  getPersona, systemFor, systemForChat, systemGeneral,
  PROMPT_VERSION, resolveModel, modelParams,
  CACHED_MODEL_DEFAULT, LIVE_MODEL_DEFAULT,
} from '../../src/lib/personas';
import {
  ALL, crimeByMonth, outcomesByMonth, ssDim, populationByEthnicity, force,
} from '../../src/lib/police-db';
import { classifyOutcome } from '../../src/lib/outcomes.mjs';

// Evidence-based interpretation of the historical police DATABASE (distinct from
// interpret.mts, which reads the committed snapshot). Same contract: aggregate
// figures only reach the model, overviews cache in Blobs per data month, every
// live call is charged to the monthly AI budget.
//
//   GET  /api/db-interpret?scope=crime-history|disproportionality|force&force=&persona=
//   POST same + { question, history }  → grounded chat

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const titleCase = (s: string) => String(s).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const pct = (n: number | null) => (n == null ? null : Math.round(n * 1000) / 10);

// Last n of a monthly series, summed.
const tail = (arr: number[], n: number) => arr.slice(-n).reduce((s, v) => s + v, 0);

async function buildDigest(scope: string, forceId: string) {
  if (scope === 'crime-history') {
    const [crime, outcomes] = await Promise.all([crimeByMonth(forceId), outcomesByMonth(forceId)]);
    if (!crime.length) return null;
    const months = [...new Set(crime.map((r) => r.month))].sort();

    // The page is "over time", so the digest must carry the movement, not
    // just the latest window: each category's last 12 months vs the previous
    // 12, and the total + justice gap per aligned 12-month block back to the
    // start of the data. All still aggregate-only, a few hundred tokens.
    const window = months.slice(-12);
    const prevWindow = months.slice(-24, -12);
    const catIn = (win: string[]) => {
      const by = new Map<string, number>();
      for (const r of crime) if (win.includes(r.month)) by.set(r.category, (by.get(r.category) ?? 0) + r.count);
      return by;
    };
    const byCat = catIn(window);
    const byCatPrev = catIn(prevWindow);
    const topCats = [...byCat]
      .map(([category, count]) => {
        const prev = byCatPrev.get(category) ?? null;
        return {
          category: titleCase(category), count12mo: count,
          previous12mo: prevWindow.length === 12 ? prev ?? 0 : null,
          changePct: prevWindow.length === 12 && prev ? Math.round(((count - prev) / prev) * 1000) / 10 : null,
        };
      })
      .sort((a, b) => b.count12mo - a.count12mo)
      .slice(0, 8);

    // Justice gap per aligned 12-month block (latest block last) — same
    // classifier as the charts (src/lib/outcomes.mjs), so the reading matches
    // what's on screen.
    const gapIn = (win: string[]) => {
      let charged = 0, noSuspect = 0, total = 0;
      for (const o of outcomes) if (win.includes(o.month)) {
        total += o.count;
        const kind = classifyOutcome(o.outcome_category);
        if (kind === 'charged') charged += o.count;
        else if (kind === 'noSuspect') noSuspect += o.count;
      }
      return { total, chargedShare: pct(total ? charged / total : null), noSuspectShare: pct(total ? noSuspect / total : null) };
    };
    const blocks: any[] = [];
    for (let end = months.length; end > 0 && blocks.length < 3; end -= 12) {
      const win = months.slice(Math.max(0, end - 12), end);
      if (win.length < 12 && blocks.length > 0) break; // drop an incomplete oldest block (the latest one is kept even when the data is short)
      blocks.unshift({
        from: win[0], to: win[win.length - 1], monthsCovered: win.length,
        totalCrimes: win.reduce((s, m) => s + crime.filter((r) => r.month === m).reduce((a, r) => a + r.count, 0), 0),
        ...gapIn(win),
      });
    }

    const latest = gapIn(window);
    return {
      cacheId: `crime-history:${forceId}`, dataMonth: months[months.length - 1],
      digest: {
        scope: forceId === ALL ? 'England & Wales' : forceId, windowMonths: 12, latestMonth: months[months.length - 1],
        totalCrimes12mo: blocks.length ? blocks[blocks.length - 1].totalCrimes : 0,
        topCategories: topCats,
        outcomes12mo: latest,
        twelveMonthBlocks: blocks,
        firstMonth: months[0],
      },
    };
  }

  if (scope === 'disproportionality') {
    const [dims, pop, f] = await Promise.all([
      ssDim(forceId, 'officer_ethnicity'),
      forceId === ALL ? Promise.resolve([] as any[]) : populationByEthnicity(forceId),
      forceId === ALL ? Promise.resolve(null) : force(forceId),
    ]);
    if (!dims.length) return null;
    // Collapse all months → totals by ethnicity.
    const by = new Map<string, { count: number; find: number }>();
    let dataMonth = '';
    for (const d of dims) {
      dataMonth = d.month > dataMonth ? d.month : dataMonth;
      const e = by.get(d.value) ?? { count: 0, find: 0 };
      e.count += d.count; e.find += d.find_count; by.set(d.value, e);
    }
    const searchTotal = [...by.values()].reduce((s, e) => s + e.count, 0) || 1;
    const popTotal = pop.reduce((s: number, p: any) => s + p.population, 0);
    const popShare = new Map(pop.map((p: any) => [p.ethnicity, p.population / (popTotal || 1)]));
    const groups = [...by].map(([ethnicity, e]) => ({
      ethnicity, searchShare: pct(e.count / searchTotal),
      populationShare: popShare.has(ethnicity) ? pct(popShare.get(ethnicity)!) : null,
      disparityRatio: popShare.has(ethnicity) ? Math.round((e.count / searchTotal) / popShare.get(ethnicity)! * 100) / 100 : null,
      findRate: pct(e.count ? e.find / e.count : null),
    })).sort((a, b) => (b.searchShare ?? 0) - (a.searchShare ?? 0));
    return {
      cacheId: `disproportionality:${forceId}`, dataMonth,
      digest: { scope: f?.name ?? (forceId === ALL ? 'England & Wales' : forceId), latestMonth: dataMonth, hasPopulationDenominator: popTotal > 0, byOfficerEthnicity: groups },
    };
  }

  if (scope === 'force') {
    const f = await force(forceId);
    if (!f) return null;
    const crime = await crimeByMonth(forceId);
    const months = [...new Set(crime.map((r) => r.month))].sort();
    return {
      cacheId: `force:${forceId}`, dataMonth: months[months.length - 1] ?? '',
      digest: { force: f.name, description: f.description?.slice(0, 600) ?? null, latestMonth: months[months.length - 1] ?? null },
    };
  }

  return null;
}

export default async (req: Request) => {
  const url = new URL(req.url);
  let scope = url.searchParams.get('scope') ?? 'crime-history';
  let forceId = url.searchParams.get('force') || ALL;
  let personaId: string | null = url.searchParams.get('persona');
  let question = (url.searchParams.get('question') ?? '').trim();
  let history: { role: 'user' | 'assistant'; content: string }[] = [];

  if (req.method === 'POST') {
    try {
      const b = await req.json();
      scope = b.scope ?? scope; forceId = b.force ?? forceId; personaId = b.persona ?? personaId;
      question = (b.question ?? question).trim();
      if (Array.isArray(b.history)) {
        history = b.history.filter((h: any) => (h?.role === 'user' || h?.role === 'assistant') && typeof h.content === 'string').slice(-8);
      }
    } catch {}
  }

  if (!process.env.ANTHROPIC_API_KEY) return json(503, { error: 'Interpretation is not configured yet (no API key).' });

  const persona = personaId ? getPersona(personaId) : null;
  const personaKey = persona?.id ?? 'general';
  const isChat = question.length > 0;

  let built;
  try { built = await buildDigest(scope, forceId); }
  catch (err) { return json(502, { error: 'Could not gather the data to interpret.', detail: String(err) }); }
  if (!built) return json(404, { error: 'Nothing to interpret yet — the database may still be filling.' });

  const { cacheId, dataMonth, digest } = built;
  const live = isChat;
  const envOverride = live ? process.env.INTERPRET_MODEL_LIVE : process.env.INTERPRET_MODEL_CACHED;
  const { id: model, label: modelLabel } = resolveModel(envOverride ?? process.env.INTERPRET_MODEL, live ? LIVE_MODEL_DEFAULT : CACHED_MODEL_DEFAULT);
  const client = new Anthropic();

  if (isChat) {
    if (await budgetExceeded()) return json(503, { error: BUDGET_MESSAGE });
    const aiStream = client.messages.stream({
      model, max_tokens: 1500, ...modelParams(model),
      system: `${systemForChat(persona ?? undefined)}\n\nThe only data you may use (aggregate figures):\n${JSON.stringify(digest)}`,
      messages: [...history, { role: 'user', content: question }],
    });
    return streamMarkdown(aiStream, { model, modelLabel, dataMonth });
  }

  const key = `db:${cacheId}:${personaKey}:${dataMonth || 'na'}:${model}:${PROMPT_VERSION}`;
  let store: ReturnType<typeof getStore> | null = null;
  try {
    store = getStore('interpretations');
    const cached = await store.get(key);
    if (cached) return new Response(cached, { headers: { 'content-type': 'text/markdown; charset=utf-8', 'x-cache': 'HIT', 'x-data-month': dataMonth, 'x-model': modelLabel } });
  } catch { store = null; }

  if (await budgetExceeded()) return json(503, { error: BUDGET_MESSAGE });

  // The reading sits directly above named charts — let it end by pointing the
  // reader at the most informative one, the way the research assistant's
  // overview suggests what to read first.
  const chartsOnPage: Record<string, string[]> = {
    'crime-history': ['Recorded crime, monthly total', 'By crime type', 'The justice gap', 'Where crime concentrates'],
    disproportionality: ['Searches by officer-defined ethnicity', 'Find rate by ethnicity', 'What officers were looking for', 'Searches over time'],
  };
  const pointer = chartsOnPage[scope]
    ? `\n\nThe reader sees these charts directly below this reading: ${chartsOnPage[scope].map((c) => `"${c}"`).join(', ')}. You may end with one short sentence pointing them at the single most informative chart for this data, naming it by its title.`
    : '';

  const aiStream = client.messages.stream({
    // Cached per data month, so a little extra thinking amortises across every
    // reader for a month — medium effort here, low stays for the live chat.
    model, max_tokens: 3000, ...modelParams(model, 'medium'),
    system: persona ? systemFor(persona) : systemGeneral(),
    messages: [{ role: 'user', content: `Interpret this police data${persona ? ' for the reader described' : ''}. Aggregate figures only:\n\n${JSON.stringify(digest, null, 2)}${pointer}` }],
  });
  return streamMarkdown(aiStream, { store, key, model, modelLabel, dataMonth });
};

export const config: Config = { path: '/api/db-interpret' };
