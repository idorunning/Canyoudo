// Research search for the /research page. The browser calls
// /api/research?q=…&source=… and we query ONE upstream catalogue server-side,
// mapping its work objects down to the handful of fields the page renders.
// Upstream hosts are hard-pinned, so this cannot be turned into an open proxy.
//
//   source=openalex   OpenAlex (default; no key; OPENALEX_MAILTO joins the
//                     polite pool for faster responses)
//   source=policing   OpenAlex restricted to the policing journals
//   source=preprints  OpenAlex restricted to preprints (CrimRxiv, SSRN,
//                     SocArXiv, OSF…) — current work, not yet peer reviewed
//   source=scholar    Semantic Scholar (needs SEMANTIC_SCHOLAR_API_KEY)
//   source=core       CORE (needs CORE_API_KEY)
//   source=crossref   Crossref (no key; CROSSREF_MAILTO joins the polite pool)
//   source=europepmc  Europe PMC (no key; health-adjacent CJ topics)
//   source=govuk      GOV.UK Search (no key; UK official / grey literature)
//
// Results carrying a DOI but no free-copy link are topped up via Unpaywall when
// UNPAYWALL_EMAIL is set (see enrichOa below).
//
// One upstream per query for a single source; "all" fans out across the
// scholarly catalogues. Semantic Scholar's free key allows
// ~1 req/s, so the edge cache plus opt-in selection is what keeps us inside
// the limits. Results are cached hard at Netlify's edge — the corpus changes
// slowly and the same practitioner queries ("hot spots policing") recur.

import {
  readParams,
  mapOpenAlexWork,
  mapScholarPaper,
  mapCoreWork,
  mapCrossrefWork,
  mapEuropePmcWork,
  mapGovukWork,
  buildOpenAlexUrl,
  buildScholarUrl,
  buildCoreRequest,
  buildCrossrefUrl,
  buildEuropePmcUrl,
  buildGovukUrl,
  buildUnpaywallUrl,
  applyUnpaywall,
  isPolicingRelevant,
  PER_PAGE,
  GUARDED_PER_PAGE,
} from '../../src/lib/research-sources.mjs';
import { mergeWorks } from '../../src/lib/research-merge.mjs';

const UA = 'thinkingaboutpolicing.org (+https://thinkingaboutpolicing.org)';
const SOURCES = ['all', 'openalex', 'policing', 'preprints', 'scholar', 'core', 'crossref', 'europepmc', 'govuk'];

const json = (body, status = 200, cache = 'no-store', extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': cache, ...extra },
  });

const busy = () =>
  json(
    { error: 'That catalogue is busy right now. Try again in a moment, or switch source.' },
    503,
    'no-store',
    { 'Retry-After': '2' }
  );

export default async (req) => {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const params = new URL(req.url).searchParams;
  const p = readParams(params);
  if (!p.q) return json({ error: 'Type something to search for.' }, 400);

  const source = params.get('source') ?? 'openalex';
  if (!SOURCES.includes(source)) return json({ error: 'Unknown source.' }, 400);

  // Build the upstream request descriptor for one catalogue, or null when its
  // key isn't configured.
  function buildRequest(src) {
    if (src === 'scholar') {
      const key = process.env.SEMANTIC_SCHOLAR_API_KEY;
      if (!key) return null;
      return {
        url: buildScholarUrl(p),
        init: { headers: { 'x-api-key': key, 'User-Agent': UA, Accept: 'application/json' } },
        map: (data) => ({ count: data.total ?? 0, results: (data.data ?? []).map(mapScholarPaper) }),
      };
    }
    if (src === 'core') {
      const key = process.env.CORE_API_KEY;
      if (!key) return null;
      const { url, body } = buildCoreRequest(p);
      return {
        url,
        init: {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            'User-Agent': UA,
            Accept: 'application/json',
          },
          body: JSON.stringify(body),
        },
        map: (data) => ({ count: data.totalHits ?? 0, results: (data.results ?? []).map(mapCoreWork) }),
      };
    }
    // Keyless catalogues — over-fetched (GUARDED_PER_PAGE) so the relevance
    // guard can prune strays and still leave a full page behind.
    if (src === 'crossref') {
      return {
        url: buildCrossrefUrl(p, { mailto: process.env.CROSSREF_MAILTO ?? '', perPage: GUARDED_PER_PAGE }),
        init: { headers: { 'User-Agent': UA, Accept: 'application/json' } },
        map: (data) => ({
          count: data.message?.['total-results'] ?? 0,
          results: (data.message?.items ?? []).map(mapCrossrefWork),
        }),
      };
    }
    if (src === 'europepmc') {
      return {
        url: buildEuropePmcUrl(p, { perPage: GUARDED_PER_PAGE }),
        init: { headers: { 'User-Agent': UA, Accept: 'application/json' } },
        map: (data) => ({
          count: data.hitCount ?? 0,
          results: (data.resultList?.result ?? []).map(mapEuropePmcWork),
        }),
      };
    }
    if (src === 'govuk') {
      return {
        url: buildGovukUrl(p, { perPage: GUARDED_PER_PAGE }),
        init: { headers: { 'User-Agent': UA, Accept: 'application/json' } },
        map: (data) => ({ count: data.total ?? 0, results: (data.results ?? []).map(mapGovukWork) }),
      };
    }
    return {
      url: buildOpenAlexUrl(p, {
        policingOnly: src === 'policing',
        preprintsOnly: src === 'preprints',
        mailto: process.env.OPENALEX_MAILTO ?? '',
        // The "policing" facet is already ISSN-locked to policing journals, so
        // its page is trusted; the open "All research" and "preprints" facets
        // are over-fetched so the relevance guard can prune strays and still
        // leave a full page.
        perPage: src === 'policing' ? PER_PAGE : GUARDED_PER_PAGE,
      }),
      init: { headers: { 'User-Agent': UA, Accept: 'application/json' } },
      map: (data) => ({ count: data.meta?.count ?? 0, results: (data.results ?? []).map(mapOpenAlexWork) }),
    };
  }

  // Fetch + map one catalogue. Throws on any failure (the caller decides
  // whether that is fatal — it is for a single source, not for the fan-out).
  async function fetchSource(request) {
    const res = await fetch(request.url, { ...request.init, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      const err = new Error(`upstream ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return request.map(await res.json());
  }

  // Fill missing free-copy links via Unpaywall (gated on UNPAYWALL_EMAIL).
  // Bounded to the works we're about to return that have a DOI but no OA link;
  // failures are silent and the edge cache pays the cost once per query.
  async function enrichOa(works, max = PER_PAGE) {
    const email = process.env.UNPAYWALL_EMAIL;
    if (!email) return works;
    const targets = [];
    for (let i = 0; i < works.length && targets.length < max; i++) {
      const w = works[i];
      if (w.doi && !w.pdfUrl && !w.oaUrl) targets.push(i);
    }
    if (targets.length === 0) return works;
    await Promise.allSettled(
      targets.map(async (i) => {
        try {
          const res = await fetch(buildUnpaywallUrl(works[i].doi, email), {
            headers: { 'User-Agent': UA, Accept: 'application/json' },
            signal: AbortSignal.timeout(6_000),
          });
          if (!res.ok) return;
          works[i] = applyUnpaywall(works[i], await res.json());
        } catch {
          /* enrichment is best-effort */
        }
      })
    );
    return works;
  }

  // ---- "All sources": fan out, dedupe, corroborate --------------------------
  if (source === 'all') {
    // CORE and Crossref can't honour the reviews-only filter, so they sit that
    // one out rather than polluting a filtered page. Missing keys are skipped —
    // a keyless deploy still merges OpenAlex, Crossref and Europe PMC. GOV.UK
    // stays out of the scholarly merge (grey literature, nothing to dedupe on),
    // and so do preprints (not yet peer reviewed — opt-in via their own facet).
    const subSources = ['openalex', 'scholar', 'europepmc', ...(p.review ? [] : ['core', 'crossref'])];
    const requests = subSources
      .map((src) => ({ src, request: buildRequest(src) }))
      .filter((r) => r.request);

    const settled = await Promise.allSettled(requests.map((r) => fetchSource(r.request)));
    const lists = [];
    const sourcesUsed = [];
    let maxCount = 0;
    settled.forEach((outcome, i) => {
      if (outcome.status !== 'fulfilled') return; // a failed catalogue is simply absent
      sourcesUsed.push(requests[i].src);
      maxCount = Math.max(maxCount, outcome.value.count ?? 0);
      lists.push(outcome.value.results.filter(isPolicingRelevant));
    });
    if (sourcesUsed.length === 0) {
      return json({ error: 'None of the research catalogues are responding. Try again in a moment.' }, 502);
    }

    return json(
      {
        count: maxCount,
        approximate: true,
        page: p.page,
        perPage: PER_PAGE,
        source,
        sourcesUsed,
        results: await enrichOa(mergeWorks(lists)),
      },
      200,
      'public, max-age=300',
      {
        'Netlify-CDN-Cache-Control':
          'public, durable, s-maxage=86400, stale-while-revalidate=604800',
      }
    );
  }

  // ---- single source ---------------------------------------------------------
  const request = buildRequest(source);
  if (!request) return json({ error: 'That search source is not configured.' }, 503);

  let mapped;
  try {
    mapped = await fetchSource(request);
  } catch (err) {
    if (err?.status === 429) return busy();
    if (err?.status) {
      return json({ error: 'The research catalogue returned an error. Try again in a moment.' }, 502);
    }
    return json({ error: 'The research catalogue is not responding. Try again in a moment.' }, 502);
  }

  const { count, results } = mapped;
  // Keep results on-topic. The ISSN-locked "policing" facet is trusted as-is;
  // every other source searches the whole record, so prune anything that reads
  // as off-topic (medical, genetics, economics) before it reaches the page.
  const onTopic = source === 'policing' ? results : results.filter(isPolicingRelevant);
  return json(
    { count, page: p.page, perPage: PER_PAGE, source, results: await enrichOa(onTopic) },
    200,
    // Slow-moving corpus → cache briefly in the browser, hard at the edge.
    // This is also the main shield on Semantic Scholar's 1 req/s key.
    'public, max-age=300',
    {
      // Netlify's durable cache: repeat queries are served edge-side for a
      // day, and stale copies keep serving for a week while revalidating.
      'Netlify-CDN-Cache-Control':
        'public, durable, s-maxage=86400, stale-while-revalidate=604800',
    }
  );
};

export const config = { path: '/api/research' };
