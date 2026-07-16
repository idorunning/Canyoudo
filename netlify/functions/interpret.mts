import type { Config } from '@netlify/functions';
import { getStore } from '@netlify/blobs';
import Anthropic from '@anthropic-ai/sdk';
import { budgetExceeded, recordUsage, BUDGET_MESSAGE } from '../../src/lib/ai-budget';
import bundle from '../../src/lib/policedata-bundle.json';
import { viewportAreaKm2 } from '../../src/lib/crime-map-core.mjs';
import {
  getPersona,
  systemFor,
  systemForChat,
  systemGeneral,
  PROMPT_VERSION,
  resolveModel,
  modelParams,
  CACHED_MODEL_DEFAULT,
  LIVE_MODEL_DEFAULT,
} from '../../src/lib/personas';

// Runtime, persona-aware interpretation of police data, streamed as Markdown.
//   GET  /api/interpret?scope=national|force|area&id=&postcode=&persona=
//   POST /api/interpret  { scope, id, postcode, persona, question, history }  → chat
//
// Overviews: national/force read the committed snapshot and are cached per data
// month (so they're "pre-generated" after first view) — generated with the more
// careful CACHED model. Postcode is interpreted live, and the chat answers live —
// both with the fast LIVE model. Models are overridable via env.

const POLICE = 'https://data.police.uk/api';
const UA = 'thinkingaboutpolicing.org (+https://thinkingaboutpolicing.org)';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const titleCase = (s: string) =>
  String(s).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

async function api(path: string) {
  const res = await fetch(`${POLICE}${path}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) return null;
  return res.json();
}

function tally(rows: any[], pick: (r: any) => string) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const raw = pick(r);
    const label = raw == null || raw === '' ? 'Not stated' : titleCase(raw);
    m.set(label, (m.get(label) ?? 0) + 1);
  }
  return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 10);
}

// The Crime Map's street tier sends its viewport as the data.police.uk poly
// format ("lat,lng:lat,lng:…", 4 corners). Every viewport is different, so
// map-view readings are never cached and always live-model — the poly is
// validated hard before any upstream call.
function parsePoly(poly: string) {
  const pairs = poly.split(':').map((p) => p.split(',').map(Number));
  if (pairs.length !== 4 || pairs.some((p) => p.length !== 2 || p.some((n) => !Number.isFinite(n)))) return null;
  const lats = pairs.map((p) => p[0]), lngs = pairs.map((p) => p[1]);
  const box = { north: Math.max(...lats), south: Math.min(...lats), east: Math.max(...lngs), west: Math.min(...lngs) };
  if (box.south < 49 || box.north > 61.5 || box.west < -9 || box.east > 2.5) return null; // UK bounds
  if (viewportAreaKm2(box) > 400) return null; // the street API's practical ceiling
  return box;
}

// Assemble the aggregate-only digest the model reasons from, plus the cache id.
async function buildDigest(scope: string, id: string, postcode: string, opts: { poly?: string; month?: string } = {}) {
  if (scope === 'national') {
    return {
      cacheId: 'national',
      dataMonth: bundle.datasetMonth,
      digest: {
        coverage: 'England & Wales + British Transport Police',
        datasetMonth: bundle.datasetMonth,
        windowMonths: bundle.windowMonths,
        forcesReporting: bundle.national.forcesCount - bundle.national.forcesMissing.length,
        forcesMissingLatestMonth: bundle.national.forcesMissing,
        stopSearch: bundle.national.stopSearch,
        recordedCrime: bundle.national.recordedCrime,
      },
    };
  }
  if (scope === 'force') {
    const f = (bundle.forces as Record<string, any>)[id];
    if (!f) return null;
    return {
      cacheId: `force:${id}`,
      dataMonth: bundle.datasetMonth,
      digest: { force: f.name, datasetMonth: bundle.datasetMonth, windowMonths: bundle.windowMonths, stopSearch: f.stopSearch, recordedCrime: f.recordedCrime },
    };
  }
  if (scope === 'area') {
    const pc = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.trim())}`, {
      signal: AbortSignal.timeout(8000),
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!pc?.result) return { error: `Couldn't find the postcode "${postcode}".` };
    const { latitude: lat, longitude: lng, admin_district: area, postcode: clean } = pc.result;

    const [crimes, hood] = await Promise.all([
      api(`/crimes-street/all-crime?lat=${lat}&lng=${lng}`),
      api(`/locate-neighbourhood?q=${lat},${lng}`),
    ]);
    const list: any[] = Array.isArray(crimes) ? crimes : [];
    const month = list[0]?.month ?? '';
    return {
      cacheId: `area:${clean.replace(/\s+/g, '')}`,
      dataMonth: month,
      digest: {
        place: clean,
        district: area,
        radiusMiles: 1,
        crimeMonth: month,
        totalCrimes: list.length,
        byCategory: tally(list, (c) => c.category),
        byOutcome: tally(list, (c) => (c.outcome_status ? c.outcome_status.category : 'Awaiting / under investigation')),
        neighbourhood: hood?.force ? `${hood.force}/${hood.neighbourhood}` : null,
      },
    };
  }
  if (scope === 'map-view') {
    const box = opts.poly ? parsePoly(opts.poly) : null;
    if (!box) return { error: 'A valid map viewport (poly) is required — zoom in a little further.' };
    const crimes = await api(`/crimes-street/all-crime?poly=${opts.poly}${opts.month ? `&date=${opts.month}` : ''}`);
    const list: any[] = Array.isArray(crimes) ? crimes : [];
    const month = list[0]?.month ?? opts.month ?? '';
    const centre = { lat: (box.north + box.south) / 2, lng: (box.east + box.west) / 2 };
    return {
      cacheId: null, // unbounded distinct inputs — live, never cached
      dataMonth: month,
      digest: {
        view: `a map viewport roughly ${Math.round(Math.sqrt(viewportAreaKm2(box)))} km across, centred near ${centre.lat.toFixed(2)}, ${centre.lng.toFixed(2)}`,
        crimeMonth: month,
        totalCrimes: list.length,
        byCategory: tally(list, (c) => c.category),
        topStreets: tally(list, (c) => c.location?.street?.name ?? 'Unknown').slice(0, 5),
        byOutcome: tally(list, (c) => (c.outcome_status ? c.outcome_status.category : 'Awaiting / under investigation')).slice(0, 5),
        note: 'Locations are anonymised map points, deliberately approximate; the reader sees these crimes as coloured dots on an interactive street map. Summarise what stands out and what it does and does not mean — counts reflect footfall as much as risk.',
      },
    };
  }
  return null;
}

// Stream a Claude message stream to the client as Markdown, optionally caching
// the final text when (store, key) are given. Actual token usage is read off
// the stream events and counted against the monthly AI budget.
function streamResponse(aiStream: any, store: any, key: string | null, dataMonth: string, modelLabel: string, model: string) {
  const enc = new TextEncoder();
  let full = '';
  let inputTokens = 0;
  let outputTokens = 0;
  const body = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of aiStream) {
          if (event.type === 'message_start') {
            inputTokens = event.message?.usage?.input_tokens ?? 0;
          } else if (event.type === 'message_delta' && event.usage) {
            outputTokens = event.usage.output_tokens ?? outputTokens;
          } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            full += event.delta.text;
            controller.enqueue(enc.encode(event.delta.text));
          }
        }
        if (store && key && full.trim()) await store.set(key, full);
      } catch {
        controller.enqueue(enc.encode('\n\n_Interrupted — please try again._'));
      } finally {
        await recordUsage(model, inputTokens, outputTokens);
        controller.close();
      }
    },
  });
  return new Response(body, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'x-cache': key ? 'MISS' : 'LIVE',
      'x-data-month': dataMonth,
      'x-model': modelLabel,
    },
  });
}

export default async (req: Request) => {
  const url = new URL(req.url);
  let scope = url.searchParams.get('scope') ?? 'national';
  let id = url.searchParams.get('id') ?? '';
  let postcode = url.searchParams.get('postcode') ?? '';
  let personaId: string | null = url.searchParams.get('persona');
  let question = (url.searchParams.get('question') ?? '').trim();
  let history: { role: 'user' | 'assistant'; content: string }[] = [];

  if (req.method === 'POST') {
    try {
      const b = await req.json();
      scope = b.scope ?? scope;
      id = b.id ?? id;
      postcode = b.postcode ?? postcode;
      personaId = b.persona ?? personaId;
      question = (b.question ?? question).trim();
      if (Array.isArray(b.history)) {
        history = b.history
          .filter((h: any) => (h?.role === 'user' || h?.role === 'assistant') && typeof h.content === 'string')
          .slice(-8);
      }
    } catch {}
  }

  // Persona is optional now (the toggle is removed) — fall back to a neutral
  // overview when none is supplied.
  const persona = personaId ? getPersona(personaId) : null;
  const personaKey = persona?.id ?? 'general';
  const isChat = question.length > 0;

  if (!process.env.ANTHROPIC_API_KEY) {
    return json(503, { error: 'Interpretation is not configured yet (no API key).' });
  }

  let built;
  try {
    built = await buildDigest(scope, id, postcode, {
      poly: url.searchParams.get('poly') ?? undefined,
      month: url.searchParams.get('month') ?? undefined,
    });
  } catch (err) {
    console.error('interpret:', err);
    return json(502, { error: 'Could not gather the data to interpret.' });
  }
  if (!built) return json(404, { error: 'Nothing to interpret for that request.' });
  if ('error' in built && built.error) return json(400, { error: built.error });

  const { cacheId, dataMonth, digest } = built as { cacheId: string | null; dataMonth: string; digest: unknown };

  // Pick the model: live (fast) for the chat, postcode and map viewports;
  // cached (careful) for the national/force overviews. Env overrides per tier.
  const live = isChat || scope === 'area' || scope === 'map-view';
  const envOverride = live ? process.env.INTERPRET_MODEL_LIVE : process.env.INTERPRET_MODEL_CACHED;
  const { id: model, label: modelLabel } = resolveModel(
    envOverride ?? process.env.INTERPRET_MODEL,
    live ? LIVE_MODEL_DEFAULT : CACHED_MODEL_DEFAULT
  );

  const client = new Anthropic();

  // Chat: answer the reader's question, grounded in the digest. Not cached,
  // so it always counts against the monthly budget.
  if (isChat) {
    if (await budgetExceeded()) return json(503, { error: BUDGET_MESSAGE });
    const aiStream = client.messages.stream({
      model,
      max_tokens: 1500,
      ...modelParams(model),
      system: `${systemForChat(persona ?? undefined)}\n\nThe only data you may use (aggregate figures):\n${JSON.stringify(digest)}`,
      messages: [...history, { role: 'user', content: question }],
    });
    return streamResponse(aiStream, null, null, dataMonth, modelLabel, model);
  }

  // Overview: cache per scope+id+persona+month+model+prompt-version. A null
  // cacheId (map viewports — unbounded distinct inputs) skips caching entirely.
  const key = cacheId ? `${cacheId}:${personaKey}:${dataMonth || 'na'}:${model}:${PROMPT_VERSION}` : null;
  let store: ReturnType<typeof getStore> | null = null;
  if (key) {
    try {
      store = getStore('interpretations');
      const cached = await store.get(key);
      if (cached) {
        return new Response(cached, {
          headers: { 'content-type': 'text/markdown; charset=utf-8', 'x-cache': 'HIT', 'x-data-month': dataMonth, 'x-model': modelLabel },
        });
      }
    } catch {
      store = null;
    }
  }

  // Cache miss → a real model call; the budget guard sits between them so
  // cached overviews keep serving even when the month's budget is spent.
  if (await budgetExceeded()) return json(503, { error: BUDGET_MESSAGE });

  const aiStream = client.messages.stream({
    model,
    max_tokens: 3000,
    // Cached per data month — extra thinking amortises across a month of
    // readers, so the standing overviews get medium effort (chat stays low).
    ...modelParams(model, 'medium'),
    system: persona ? systemFor(persona) : systemGeneral(),
    messages: [
      { role: 'user', content: `Interpret this police data${persona ? ' for the reader described' : ''}. Aggregate figures only:\n\n${JSON.stringify(digest, null, 2)}` },
    ],
  });
  return streamResponse(aiStream, store, key, dataMonth, modelLabel, model);
};

export const config: Config = { path: '/api/interpret' };
