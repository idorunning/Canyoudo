// Pure helpers for the research search — shared by the Netlify function
// (netlify/functions/research.mjs) and the unit tests (tests/). Everything in
// here is side-effect-free: mappers normalise each upstream's work objects to
// the one compact shape the page renders, and the builders turn the page's
// query params into upstream requests.
//
// Sources:
//   openalex   — OpenAlex (https://docs.openalex.org), no key, the default.
//   policing   — OpenAlex restricted to the policing journals below.
//   preprints  — OpenAlex restricted to preprints (CrimRxiv, SSRN, SocArXiv,
//                OSF and the other early-research servers OpenAlex indexes).
//   scholar    — Semantic Scholar Graph API (free key, has TL;DR summaries).
//   core       — CORE v3 (free key, full-text search of open-access repositories).
//   crossref   — Crossref REST API (no key; polite pool via CROSSREF_MAILTO).
//   europepmc  — Europe PMC (no key; full text, health-adjacent CJ topics).
//   govuk      — GOV.UK Search API (no key; UK official / grey literature).
//
// Crossref + Europe PMC are scholarly catalogues that join the merged "All
// sources" fan-out alongside OpenAlex/Scholar/CORE. GOV.UK is grey literature
// (Home Office, HMICFRS, College of Policing reports) — it stays a standalone
// source rather than diluting the peer-reviewed merge, since its records carry
// no DOI, citations or peer-review status to corroborate against. Preprints
// stay standalone for the same reason in reverse: they're current but not yet
// peer reviewed, so the reader opts into them knowingly rather than finding
// them silently mixed into the merged page.
//
// Unpaywall is not a search source: buildUnpaywallUrl/applyUnpaywall enrich a
// work that has a DOI but no free-copy link, gated on UNPAYWALL_EMAIL.

export const PER_PAGE = 10;

// A keyword can return anything the upstream catalogue holds — including medical
// or genetics papers with no policing bearing. When we don't trust the source to
// be on-topic (everything except the ISSN-locked "policing" journals facet), we
// over-fetch a wider block so the relevance guard below can prune the strays and
// still leave a useful page behind.
export const GUARDED_PER_PAGE = 25;

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
  // Policing / evidence-based-policing journals (SAGE, T&F, Emerald, Springer).
  // ISSNs verified against Crossref's journal registry, July 2026.
  ['Cambridge Journal of Evidence-Based Policing', '2520-1344'],
  ['Policing: An International Journal', '1363-951X'],
  ['International Journal of Police Science & Management', '1461-3557'],
  ['The Police Journal: Theory, Practice and Principles', '0032-258X'],
  ['Journal of Police and Criminal Psychology', '0882-0783'],
  // Broader criminal-justice journals that regularly carry policing evaluations.
  ['Justice Quarterly', '0741-8825'],
  ['Criminology & Criminal Justice', '1748-8958'],
  ['Crime & Delinquency', '0011-1287'],
  ['Journal of Research in Crime and Delinquency', '0022-4278'],
  ['Criminal Justice and Behavior', '0093-8548'],
  ['The British Journal of Criminology', '0007-0955'],
  ['Journal of Quantitative Criminology', '0748-4518'],
  ['Criminal Justice Studies', '1478-601X'],
  ['Journal of Crime and Justice', '0735-648X'],
];

// Which filter controls make sense per source — the page reads this (inlined
// at build time) to enable/disable controls, and the builders honour it.
export const SOURCE_CAPS = {
  // "all" fans out to every configured catalogue and merges (research-merge.mjs).
  // Sort can't be honoured across differently-ranked upstreams; oa/review/from
  // apply per-source where supported (CORE sits out reviews-only searches).
  all: { oa: true, review: true, from: true, sort: false },
  openalex: { oa: true, review: true, from: true, sort: true },
  policing: { oa: true, review: true, from: true, sort: true },
  // Preprints are one OpenAlex work type, so "reviews only" (a different type)
  // can't combine with it; nearly everything is free to read anyway.
  preprints: { oa: true, review: false, from: true, sort: true },
  scholar: { oa: true, review: true, from: true, sort: false },
  core: { oa: false, review: false, from: true, sort: false }, // CORE is all-OA
  // Crossref has no dependable open-access or review-article filter in search;
  // it does sort by citations/date and floor by publication date.
  crossref: { oa: false, review: false, from: true, sort: true },
  europepmc: { oa: true, review: true, from: true, sort: true },
  // GOV.UK is grey literature: no OA/review/citation concepts; date floor only.
  govuk: { oa: false, review: false, from: true, sort: false },
};

// ---------------------------------------------------------------------------
// Policing-relevance guard. The site searches the whole open scholarly record,
// so an ambiguous keyword ("stress", "genes", "networks") can surface medical,
// biology or economics papers that have nothing to do with policing. This guard
// keeps results on-topic: a work counts as relevant if its title, venue or
// abstract mentions an established policing / criminal-justice term.
//
// Tuned to admit criminology broadly while excluding look-alikes — a
// behavioural-genetics paper that actually discusses offending stays (it says
// "crime"/"offending"); a pure medical-genetics paper drops. Terms prone to
// false positives in other fields ("surveillance" → disease surveillance,
// "trafficking" → protein trafficking, "deterrence" → nuclear deterrence) are
// deliberately scoped (e.g. "drug trafficking", "human trafficking") or omitted.
const RELEVANCE_TERMS = [
  'polic(?:e|ing|ed)\\b', // police / policing / policed — not "policy"
  'constab(?:le|ulary)',
  'law enforcement',
  'criminolog',
  '\\bcrimes?\\b',
  'criminal',
  'offend(?:er|ers|ing)?\\b',
  'reoffend',
  'recidivis',
  'desistance',
  'delinquen',
  'incarcerat',
  'imprison',
  '\\bprison',
  '\\bparole\\b',
  '\\bprobation\\b',
  'sentenc(?:e|ed|ing)',
  'prosecut',
  'magistrat',
  '\\bjudiciary\\b',
  'criminal justice',
  'juvenile justice',
  'restorative justice',
  'procedural justice',
  'victimi[sz]ation',
  '\\bvictims?\\b',
  'burglary',
  'robbery',
  'homicide',
  '\\bmurder',
  'shoplifting',
  '\\btheft\\b',
  '\\bgangs?\\b',
  'knife crime',
  'gun (?:crime|violence)',
  'firearm',
  'domestic (?:abuse|violence)',
  'sexual (?:assault|offen)',
  '\\brape\\b',
  'stop[\\s-]and[\\s-](?:search|frisk)',
  'use of force',
  'body[\\s-]worn',
  '\\btaser\\b',
  '\\bcctv\\b',
  'forensic',
  'terroris',
  'extremis',
  'radicali[sz]',
  'counter[\\s-]terror',
  'cybercrime',
  '\\bfraud\\b',
  'organi[sz]ed crime',
  'human trafficking',
  'drug traffick',
  'antisocial behaviour',
  'anti-social behaviour',
  'police legitimacy',
  'hot spots policing',
  'crime prevention',
  'crime reduction',
  '\\bsafeguarding\\b',
];
const RELEVANCE_RE = new RegExp(RELEVANCE_TERMS.join('|'), 'i');

// True if a mapped work reads as policing / criminal-justice relevant.
export function isPolicingRelevant(work) {
  if (!work) return false;
  const hay = `${work.title ?? ''} ${work.venue ?? ''} ${work.abstract ?? ''}`;
  return RELEVANCE_RE.test(hay);
}

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

// Crossref abstracts arrive as JATS/XML ("<jats:p>…</jats:p>"); strip the tags
// back to plain text before clipping for a card.
export function stripTags(text) {
  if (text == null) return null;
  const t = String(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return t || null;
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
    // OpenAlex ingests the Retraction Watch database, so `is_retracted` is the
    // broadest free retraction signal there is — and OpenAlex is both the
    // default source and part of every merged fan-out, so this flag reaches
    // most records. Set only when true, so ordinary works stay byte-identical
    // (their cache keys included). The review pipeline drops flagged works from
    // the briefing pool; the search cards badge them.
    ...(w.is_retracted === true ? { retracted: true } : {}),
  };
}

export function buildOpenAlexUrl(p, { policingOnly = false, preprintsOnly = false, mailto = '', perPage = PER_PAGE } = {}) {
  const filters = [];
  if (p.oa) filters.push('is_oa:true');
  // "type" is single-valued: a work is a review OR a preprint, so the
  // reviews-only toggle is meaningless on the preprints facet (caps say so too).
  if (p.review && !preprintsOnly) filters.push('type:review');
  if (p.from) filters.push(`from_publication_date:${p.from}-01-01`);
  if (policingOnly) {
    const issns = POLICING_JOURNAL_ISSNS.map(([, issn]) => issn).join('|');
    filters.push(`primary_location.source.issn:${issns}`);
  }
  if (preprintsOnly) filters.push('type:preprint');

  const sorts = { cited: 'cited_by_count:desc', recent: 'publication_date:desc' };
  const sort = sorts[p.sort]; // anything else → relevance (OpenAlex default for search)

  const u = new URL('https://api.openalex.org/works');
  u.searchParams.set('search', p.q);
  if (filters.length) u.searchParams.set('filter', filters.join(','));
  if (sort) u.searchParams.set('sort', sort);
  u.searchParams.set('page', String(p.page));
  u.searchParams.set('per-page', String(perPage));
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

// ---------------------------------------------------------------------------
// Crossref REST API. No key; a contact email (CROSSREF_MAILTO) joins the polite
// pool for faster, more reliable responses. https://api.crossref.org
// ---------------------------------------------------------------------------

const CROSSREF_SELECT =
  'title,author,issued,container-title,publisher,DOI,is-referenced-by-count,abstract,link';

export function buildCrossrefUrl(p, { mailto = '', perPage = PER_PAGE } = {}) {
  const u = new URL('https://api.crossref.org/works');
  u.searchParams.set('query', p.q);
  u.searchParams.set('rows', String(perPage));
  u.searchParams.set('offset', String((p.page - 1) * perPage));
  u.searchParams.set('select', CROSSREF_SELECT);

  const filters = ['type:journal-article'];
  if (p.from) filters.push(`from-pub-date:${p.from}-01-01`);
  u.searchParams.set('filter', filters.join(','));

  // relevance is Crossref's default for a query; only override when asked.
  const sorts = { cited: 'is-referenced-by-count', recent: 'published' };
  const sort = sorts[p.sort];
  if (sort) {
    u.searchParams.set('sort', sort);
    u.searchParams.set('order', 'desc');
  }
  if (mailto) u.searchParams.set('mailto', mailto);
  return u;
}

export function mapCrossrefWork(w) {
  const authors = (w.author ?? [])
    .map((a) => [a?.given, a?.family].filter(Boolean).join(' ').trim() || a?.name)
    .filter(Boolean);
  const doi = w.DOI ? `https://doi.org/${w.DOI}` : null;
  // Crossref only surfaces a free copy when a publisher registered a full-text
  // link; Unpaywall enrichment fills the gaps for the rest.
  const pdf = (w.link ?? []).find((l) => l?.['content-type'] === 'application/pdf')?.URL ?? null;
  return {
    title: Array.isArray(w.title) ? w.title[0] ?? 'Untitled' : w.title ?? 'Untitled',
    authors: authors.slice(0, 4),
    moreAuthors: Math.max(0, authors.length - 4),
    year: w.issued?.['date-parts']?.[0]?.[0] ?? null,
    venue: w['container-title']?.[0] ?? null,
    publisher: w.publisher ?? null,
    doi,
    pdfUrl: pdf,
    oaUrl: pdf,
    isOa: Boolean(pdf),
    citedBy: w['is-referenced-by-count'] ?? 0,
    abstract: clip(stripTags(w.abstract)),
    source: 'crossref',
  };
}

// ---------------------------------------------------------------------------
// Europe PMC. No key; full-text-aware, strong on health-adjacent CJ topics
// (violence, drugs, mental-health crisis). resultType=core returns rich records.
// https://europepmc.org/RestfulWebService
// ---------------------------------------------------------------------------

export function buildEuropePmcUrl(p, { perPage = PER_PAGE } = {}) {
  const clauses = [p.q];
  if (p.oa) clauses.push('OPEN_ACCESS:y');
  if (p.review) clauses.push('PUB_TYPE:"Review"');
  if (p.from) clauses.push(`PUB_YEAR:[${p.from} TO 3000]`);

  const u = new URL('https://www.ebi.ac.uk/europepmc/webservices/rest/search');
  u.searchParams.set('query', clauses.join(' AND '));
  u.searchParams.set('format', 'json');
  u.searchParams.set('resultType', 'core');
  u.searchParams.set('pageSize', String(perPage));
  u.searchParams.set('page', String(p.page));

  const sorts = { cited: 'CITED desc', recent: 'P_PDATE_D desc' };
  const sort = sorts[p.sort]; // anything else → Europe PMC's relevance default
  if (sort) u.searchParams.set('sort', sort);
  return u;
}

export function mapEuropePmcWork(w) {
  const authors = (w.authorList?.author ?? [])
    .map((a) => a?.fullName)
    .filter(Boolean);
  const doi = w.doi ? `https://doi.org/${w.doi}` : null;
  const urls = w.fullTextUrlList?.fullTextUrl ?? [];
  const pdf = urls.find((u) => u?.documentStyle === 'pdf' && u?.availabilityCode === 'OA')?.url ?? null;
  const oaHtml = urls.find((u) => u?.availabilityCode === 'OA')?.url ?? null;
  return {
    title: w.title ?? 'Untitled',
    authors: authors.slice(0, 4),
    moreAuthors: Math.max(0, authors.length - 4),
    year: Number(w.pubYear) || null,
    venue: w.journalInfo?.journal?.title ?? w.journalTitle ?? null,
    publisher: null,
    doi,
    pdfUrl: pdf,
    oaUrl: pdf ?? oaHtml,
    isOa: w.isOpenAccess === 'Y',
    citedBy: w.citedByCount ?? 0,
    // Europe PMC abstracts can carry JATS/HTML markup (e.g. "<h4>Background</h4>
    // …") — strip the tags to plain text before clipping, the same way Crossref
    // abstracts are handled, so no raw tags reach the card.
    abstract: clip(stripTags(w.abstractText)),
    source: 'europepmc',
  };
}

// ---------------------------------------------------------------------------
// GOV.UK Search API. No key; surfaces UK official material the journal sources
// miss — Home Office reports, HMICFRS inspections, College of Policing
// publications, statistics. Grey literature, so no DOI/citation/peer-review.
// https://www.gov.uk/api/search.json
// ---------------------------------------------------------------------------

const GOVUK_FIELDS = ['title', 'link', 'description', 'public_timestamp', 'organisations'];

export function buildGovukUrl(p, { perPage = PER_PAGE } = {}) {
  const u = new URL('https://www.gov.uk/api/search.json');
  u.searchParams.set('q', p.q);
  u.searchParams.set('count', String(perPage));
  u.searchParams.set('start', String((p.page - 1) * perPage));
  for (const f of GOVUK_FIELDS) u.searchParams.append('fields', f);
  if (p.from) u.searchParams.set('filter_public_timestamp', `from:${p.from}-01-01`);
  return u;
}

export function mapGovukWork(w) {
  // GOV.UK returns a site-relative path; make it an absolute URL.
  const path = w.link ?? '';
  const url = path.startsWith('http') ? path : `https://www.gov.uk${path}`;
  const org = w.organisations?.[0]?.title ?? null;
  const year = w.public_timestamp ? new Date(w.public_timestamp).getFullYear() : null;
  return {
    title: w.title ?? 'Untitled',
    authors: [],
    moreAuthors: 0,
    year: Number.isFinite(year) ? year : null,
    venue: org ?? 'GOV.UK',
    publisher: 'GOV.UK',
    doi: null,
    pdfUrl: null,
    oaUrl: url || null,
    isOa: true, // official pages are free to read
    citedBy: 0,
    abstract: clip(w.description),
    source: 'govuk',
  };
}

// ---------------------------------------------------------------------------
// Unpaywall enrichment. Not a search source: given a work's DOI, look up the
// best open-access copy and fill a missing free-copy link. Requires an email
// (UNPAYWALL_EMAIL); when unset the caller skips enrichment entirely.
// https://unpaywall.org/products/api
// ---------------------------------------------------------------------------

export function buildUnpaywallUrl(doi, email) {
  // Accept a full https://doi.org/… URL or a bare DOI; Unpaywall wants the bare.
  const bare = String(doi ?? '')
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  const u = new URL(`https://api.unpaywall.org/v2/${encodeURIComponent(bare)}`);
  u.searchParams.set('email', email);
  return u;
}

// Fold an Unpaywall response into a work, but never overwrite a link the work
// already has — enrichment only fills gaps.
export function applyUnpaywall(work, data) {
  const loc = data?.best_oa_location;
  if (!loc) return work;
  const pdf = loc.url_for_pdf ?? null;
  const landing = loc.url ?? loc.url_for_landing_page ?? null;
  const oa = pdf ?? landing;
  if (!oa) return work;
  return {
    ...work,
    pdfUrl: work.pdfUrl ?? pdf,
    oaUrl: work.oaUrl ?? oa,
    isOa: work.isOa || Boolean(oa),
  };
}
