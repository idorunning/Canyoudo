// Research search for the /research page, backed by OpenAlex
// (https://docs.openalex.org) — an open catalogue of scholarly works.
//
// The browser calls /api/research?q=… and we query OpenAlex server-side,
// mapping its large work objects down to the handful of fields the page
// renders. The upstream host is hard-pinned, so this cannot be turned into an
// open proxy. OpenAlex is free with no key; setting OPENALEX_MAILTO joins
// their "polite pool" for faster, more consistent responses.
//
// Results are cached at Netlify's edge — the corpus changes slowly and the
// same practitioner queries ("hot spots policing") recur.

const UPSTREAM = 'https://api.openalex.org/works';
const UA = 'thinkingaboutpolicing.org (+https://thinkingaboutpolicing.org)';
const PER_PAGE = 10;

// OpenAlex stores abstracts as an inverted index ({ word: [positions] });
// flatten it back into readable text and clip to a card-sized snippet.
export function abstractFromIndex(index, maxChars = 320) {
  if (!index || typeof index !== 'object') return null;
  const words = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const pos of positions) words[pos] = word;
  }
  const text = words.filter(Boolean).join(' ').trim();
  if (!text) return null;
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

// Map an OpenAlex work to the compact shape the page renders.
export function mapWork(w) {
  const authors = (w.authorships ?? [])
    .map((a) => a?.author?.display_name)
    .filter(Boolean);
  const oa = w.best_oa_location ?? {};
  return {
    title: w.display_name ?? 'Untitled',
    authors: authors.slice(0, 4),
    moreAuthors: Math.max(0, authors.length - 4),
    year: w.publication_year ?? null,
    venue: w.primary_location?.source?.display_name ?? null,
    doi: w.doi ?? null, // already a full https://doi.org/… URL
    pdfUrl: oa.pdf_url ?? null,
    oaUrl: oa.pdf_url ?? oa.landing_page_url ?? null,
    isOa: w.open_access?.is_oa ?? false,
    citedBy: w.cited_by_count ?? 0,
    abstract: abstractFromIndex(w.abstract_inverted_index),
  };
}

export function buildUpstreamUrl(params) {
  const q = (params.get('q') ?? '').trim().slice(0, 300);
  const page = Math.min(50, Math.max(1, Number(params.get('page')) || 1));

  const filters = [];
  if (params.get('oa') === '1') filters.push('is_oa:true');
  if (params.get('review') === '1') filters.push('type:review');
  const from = Number(params.get('from'));
  if (Number.isInteger(from) && from >= 1950 && from <= 2100) {
    filters.push(`from_publication_date:${from}-01-01`);
  }

  const sorts = { cited: 'cited_by_count:desc', recent: 'publication_date:desc' };
  const sort = sorts[params.get('sort')]; // anything else → relevance (OpenAlex default for search)

  const u = new URL(UPSTREAM);
  u.searchParams.set('search', q);
  if (filters.length) u.searchParams.set('filter', filters.join(','));
  if (sort) u.searchParams.set('sort', sort);
  u.searchParams.set('page', String(page));
  u.searchParams.set('per-page', String(PER_PAGE));
  if (process.env.OPENALEX_MAILTO) u.searchParams.set('mailto', process.env.OPENALEX_MAILTO);
  return { url: u, q, page };
}

const json = (body, status = 200, cache = 'no-store') =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': cache },
  });

export default async (req) => {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const { url, q, page } = buildUpstreamUrl(new URL(req.url).searchParams);
  if (!q) return json({ error: 'Type something to search for.' }, 400);

  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return json({ error: 'The research catalogue is not responding. Try again in a moment.' }, 502);
  }
  if (!res.ok) {
    return json({ error: 'The research catalogue returned an error. Try again in a moment.' }, 502);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return json({ error: 'The research catalogue sent an unreadable reply.' }, 502);
  }

  return json(
    {
      count: data.meta?.count ?? 0,
      page,
      perPage: PER_PAGE,
      results: (data.results ?? []).map(mapWork),
    },
    200,
    // Slow-moving corpus → cache hard at the edge, briefly in the browser.
    'public, max-age=300, s-maxage=86400'
  );
};

export const config = { path: '/api/research' };
