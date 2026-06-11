// Pure helpers for the research search — shared by the Netlify function
// (netlify/functions/research.mjs) and the unit tests (tests/). Everything in
// here is side-effect-free: mappers normalise each upstream's work objects to
// the one compact shape the page renders, and the builders turn the page's
// query params into upstream requests.
//
// Sources:
//   openalex — OpenAlex (https://docs.openalex.org), no key, the default.
//   policing — OpenAlex restricted to the policing journals below.
//   scholar  — Semantic Scholar Graph API (free key, has TL;DR summaries).
//   core     — CORE v3 (free key, full-text search of open-access repositories).

export const PER_PAGE = 10;

// ---------------------------------------------------------------------------
// The policing-journals facet. [name, ISSN] — edit this list to change which
// journals the "Policing journals" source searches. OpenAlex filter syntax:
//   primary_location.source.issn:A|B|C
// ---------------------------------------------------------------------------
export const POLICING_JOURNAL_ISSNS = [
  ['Police Quarterly', '1098-6111'],
  ['Policing and Society', '1043-9463'],
  ['Journal of Experimental Criminology', '1573-3750'],
  ['Criminology & Public Policy', '1745-9133'],
  ['Policing: A Journal of Policy and Practice', '1752-4520'],
  ['Police Practice and Research', '1561-4263'],
  ['Journal of Criminal Justice', '0047-2352'],
  ['Crime Science', '2193-7680'],
];

// Which filter controls make sense per source — the page reads this (inlined
// at build time) to enable/disable controls, and the builders honour it.
export const SOURCE_CAPS = {
  openalex: { oa: true, review: true, from: true, sort: true },
  policing: { oa: true, review: true, from: true, sort: true },
  scholar: { oa: true, review: true, from: true, sort: false },
  core: { oa: false, review: false, from: true, sort: false }, // CORE is all-OA
};

// ---------------------------------------------------------------------------
// Shared parsing of the page's query params (q, page, oa, review, from, sort).
// ---------------------------------------------------------------------------
export function readParams(params) {
  const from = Number(params.get('from'));
  return {
    q: (params.get('q') ?? '').trim().slice(0, 300),
    page: Math.min(50, Math.max(1, Number(params.get('page')) || 1)),
    oa: params.get('oa') === '1',
    review: params.get('review') === '1',
    from: Number.isInteger(from) && from >= 1950 && from <= 2100 ? from : null,
    sort: params.get('sort'),
  };
}

// ---------------------------------------------------------------------------
// OpenAlex
// ---------------------------------------------------------------------------

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
  return clip(text, maxChars);
}

export function clip(text, maxChars = 320) {
  if (!text) return null;
  const t = String(text).trim();
  if (!t) return null;
  if (t.length <= maxChars) return t;
  const cut = t.slice(0, maxChars);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

export function mapOpenAlexWork(w) {
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
    publisher: w.primary_location?.source?.host_organization_name ?? null,
    doi: w.doi ?? null, // already a full https://doi.org/… URL
    pdfUrl: oa.pdf_url ?? null,
    oaUrl: oa.pdf_url ?? oa.landing_page_url ?? null,
    isOa: w.open_access?.is_oa ?? false,
    citedBy: w.cited_by_count ?? 0,
    abstract: abstractFromIndex(w.abstract_inverted_index),
    source: 'openalex',
  };
}

export function buildOpenAlexUrl(p, { policingOnly = false, mailto = '' } = {}) {
  const filters = [];
  if (p.oa) filters.push('is_oa:true');
  if (p.review) filters.push('type:review');
  if (p.from) filters.push(`from_publication_date:${p.from}-01-01`);
  if (policingOnly) {
    const issns = POLICING_JOURNAL_ISSNS.map(([, issn]) => issn).join('|');
    filters.push(`primary_location.source.issn:${issns}`);
  }

  const sorts = { cited: 'cited_by_count:desc', recent: 'publication_date:desc' };
  const sort = sorts[p.sort]; // anything else → relevance (OpenAlex default for search)

  const u = new URL('https://api.openalex.org/works');
  u.searchParams.set('search', p.q);
  if (filters.length) u.searchParams.set('filter', filters.join(','));
  if (sort) u.searchParams.set('sort', sort);
  u.searchParams.set('page', String(p.page));
  u.searchParams.set('per-page', String(PER_PAGE));
  if (mailto) u.searchParams.set('mailto', mailto);
  return u;
}

// ---------------------------------------------------------------------------
// Semantic Scholar (Graph API). Relevance-ranked search; no sort options.
// https://api.semanticscholar.org/api-docs/graph
// ---------------------------------------------------------------------------

const SCHOLAR_FIELDS =
  'title,authors,year,venue,externalIds,openAccessPdf,isOpenAccess,citationCount,abstract,tldr';

export function buildScholarUrl(p) {
  const u = new URL('https://api.semanticscholar.org/graph/v1/paper/search');
  u.searchParams.set('query', p.q);
  u.searchParams.set('offset', String((p.page - 1) * PER_PAGE));
  u.searchParams.set('limit', String(PER_PAGE));
  u.searchParams.set('fields', SCHOLAR_FIELDS);
  if (p.oa) u.searchParams.set('openAccessPdf', '');
  if (p.review) u.searchParams.set('publicationTypes', 'Review');
  if (p.from) u.searchParams.set('year', `${p.from}-`);
  return u;
}

export function mapScholarPaper(w) {
  const authors = (w.authors ?? []).map((a) => a?.name).filter(Boolean);
  const doi = w.externalIds?.DOI ? `https://doi.org/${w.externalIds.DOI}` : null;
  const pdfUrl = w.openAccessPdf?.url ?? null;
  return {
    title: w.title ?? 'Untitled',
    authors: authors.slice(0, 4),
    moreAuthors: Math.max(0, authors.length - 4),
    year: w.year ?? null,
    venue: w.venue || null,
    publisher: null, // the Graph API search response carries no publisher

    doi,
    pdfUrl,
    oaUrl: pdfUrl,
    isOa: w.isOpenAccess ?? Boolean(pdfUrl),
    citedBy: w.citationCount ?? 0,
    abstract: clip(w.abstract),
    source: 'scholar',
    ...(w.tldr?.text ? { tldr: clip(w.tldr.text, 320) } : {}),
  };
}

// ---------------------------------------------------------------------------
// CORE v3. Full-text search of open-access repository content (all-OA, so the
// oa/review toggles don't apply). https://api.core.ac.uk/docs/v3
// ---------------------------------------------------------------------------

export function buildCoreRequest(p) {
  // The year floor rides inside the query string — CORE's q syntax supports it.
  const q = p.from ? `${p.q} AND yearPublished>=${p.from}` : p.q;
  return {
    url: 'https://api.core.ac.uk/v3/search/works',
    body: { q, limit: PER_PAGE, offset: (p.page - 1) * PER_PAGE },
  };
}

export function mapCoreWork(w) {
  const authors = (w.authors ?? []).map((a) => a?.name).filter(Boolean);
  const doi = w.doi ? `https://doi.org/${w.doi}` : null;
  const venue = w.journals?.[0]?.title || w.publisher || null;
  const link = w.downloadUrl || null;
  return {
    title: w.title ?? 'Untitled',
    authors: authors.slice(0, 4),
    moreAuthors: Math.max(0, authors.length - 4),
    year: w.yearPublished ?? null,
    venue,
    publisher: w.publisher || null,
    doi,
    pdfUrl: link,
    oaUrl: link,
    isOa: true,
    citedBy: w.citationCount ?? 0,
    abstract: clip(w.abstract),
    source: 'core',
  };
}
