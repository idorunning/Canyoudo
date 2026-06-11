// Research search for the /research page. The browser calls
// /api/research?q=…&source=… and we query ONE upstream catalogue server-side,
// mapping its work objects down to the handful of fields the page renders.
// Upstream hosts are hard-pinned, so this cannot be turned into an open proxy.
//
//   source=openalex  OpenAlex (default; no key; OPENALEX_MAILTO joins the
//                    polite pool for faster responses)
//   source=policing  OpenAlex restricted to the policing journals
//   source=scholar   Semantic Scholar (needs SEMANTIC_SCHOLAR_API_KEY)
//   source=core      CORE (needs CORE_API_KEY)
//
// One upstream per query, never a fan-out: Semantic Scholar's free key allows
// ~1 req/s, so the edge cache plus opt-in selection is what keeps us inside
// the limits. Results are cached hard at Netlify's edge — the corpus changes
// slowly and the same practitioner queries ("hot spots policing") recur.

import {
  readParams,
  mapOpenAlexWork,
  mapScholarPaper,
  mapCoreWork,
  buildOpenAlexUrl,
  buildScholarUrl,
  buildCoreRequest,
  isPolicingRelevant,
  PER_PAGE,
  GUARDED_PER_PAGE,
} from '../../src/lib/research-sources.mjs';

const UA = 'thinkingaboutpolicing.org (+https://thinkingaboutpolicing.org)';
const SOURCES = ['openalex', 'policing', 'scholar', 'core'];

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

  // Build the upstream request for the chosen source.
  let request;
  if (source === 'scholar') {
    const key = process.env.SEMANTIC_SCHOLAR_API_KEY;
    if (!key) return json({ error: 'Semantic Scholar search is not configured.' }, 503);
    request = {
      url: buildScholarUrl(p),
      init: { headers: { 'x-api-key': key, 'User-Agent': UA, Accept: 'application/json' } },
      map: (data) => ({ count: data.total ?? 0, results: (data.data ?? []).map(mapScholarPaper) }),
    };
  } else if (source === 'core') {
    const key = process.env.CORE_API_KEY;
    if (!key) return json({ error: 'CORE search is not configured.' }, 503);
    const { url, body } = buildCoreRequest(p);
    request = {
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
  } else {
    request = {
      url: buildOpenAlexUrl(p, {
        policingOnly: source === 'policing',
        mailto: process.env.OPENALEX_MAILTO ?? '',
        // The "policing" facet is already ISSN-locked to policing journals, so
        // its page is trusted; the open "All research" facet is over-fetched so
        // the relevance guard can prune strays and still leave a full page.
        perPage: source === 'policing' ? PER_PAGE : GUARDED_PER_PAGE,
      }),
      init: { headers: { 'User-Agent': UA, Accept: 'application/json' } },
      map: (data) => ({ count: data.meta?.count ?? 0, results: (data.results ?? []).map(mapOpenAlexWork) }),
    };
  }

  let res;
  try {
    res = await fetch(request.url, { ...request.init, signal: AbortSignal.timeout(10_000) });
  } catch {
    return json({ error: 'The research catalogue is not responding. Try again in a moment.' }, 502);
  }
  if (res.status === 429) return busy();
  if (!res.ok) {
    return json({ error: 'The research catalogue returned an error. Try again in a moment.' }, 502);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return json({ error: 'The research catalogue sent an unreadable reply.' }, 502);
  }

  const { count, results } = request.map(data);
  // Keep results on-topic. The ISSN-locked "policing" facet is trusted as-is;
  // every other source searches the whole record, so prune anything that reads
  // as off-topic (medical, genetics, economics) before it reaches the page.
  const onTopic = source === 'policing' ? results : results.filter(isPolicingRelevant);
  return json(
    { count, page: p.page, perPage: PER_PAGE, source, results: onTopic },
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
