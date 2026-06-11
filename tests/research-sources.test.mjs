// Unit tests for the pure research-source helpers. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  abstractFromIndex,
  clip,
  readParams,
  mapOpenAlexWork,
  mapScholarPaper,
  mapCoreWork,
  buildOpenAlexUrl,
  buildScholarUrl,
  buildCoreRequest,
  isPolicingRelevant,
  POLICING_JOURNAL_ISSNS,
  SOURCE_CAPS,
  PER_PAGE,
  GUARDED_PER_PAGE,
} from '../src/lib/research-sources.mjs';

const WORK_KEYS = [
  'title', 'authors', 'moreAuthors', 'year', 'venue', 'publisher', 'doi',
  'pdfUrl', 'oaUrl', 'isOa', 'citedBy', 'abstract', 'source',
];

const params = (obj) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) p.set(k, String(v));
  return readParams(p);
};

// ---------------------------------------------------------------------------
test('abstractFromIndex reconstructs and clips', () => {
  assert.equal(abstractFromIndex(null), null);
  assert.equal(abstractFromIndex({}), null);
  assert.equal(
    abstractFromIndex({ policing: [1], spots: [3], Hot: [0], works: [2] }),
    'Hot policing works spots'
  );
  const long = abstractFromIndex(
    Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`word${i}`, [i]])),
    50
  );
  assert.ok(long.length <= 51 && long.endsWith('…'));
});

test('clip trims, passes short text, nulls empties', () => {
  assert.equal(clip('  hello  '), 'hello');
  assert.equal(clip(''), null);
  assert.equal(clip(null), null);
  assert.ok(clip('a '.repeat(300), 100).endsWith('…'));
});

test('readParams clamps and validates', () => {
  const p = params({ q: ' hot spots ', page: '99', oa: '1', review: '0', from: '2015', sort: 'cited' });
  assert.equal(p.q, 'hot spots');
  assert.equal(p.page, 50); // clamped
  assert.equal(p.oa, true);
  assert.equal(p.review, false);
  assert.equal(p.from, 2015);
  assert.equal(p.sort, 'cited');
  assert.equal(params({ q: 'x', from: '1900' }).from, null); // out of range
  assert.equal(params({ q: 'x', page: '-3' }).page, 1);
});

// ---------------------------------------------------------------------------
test('mapOpenAlexWork emits the exact Work shape', () => {
  const w = mapOpenAlexWork({
    display_name: 'Hot spots policing of small geographic areas',
    authorships: [
      { author: { display_name: 'A. Braga' } },
      { author: { display_name: 'B. Turchan' } },
      { author: { display_name: 'C. Papachristos' } },
      { author: { display_name: 'D. Hureau' } },
      { author: { display_name: 'E. Fifth' } },
    ],
    publication_year: 2019,
    primary_location: { source: { display_name: 'Campbell Systematic Reviews', host_organization_name: 'Wiley' } },
    doi: 'https://doi.org/10.1002/cl2.1046',
    best_oa_location: { pdf_url: 'https://example.org/p.pdf', landing_page_url: 'https://example.org/p' },
    open_access: { is_oa: true },
    cited_by_count: 412,
    abstract_inverted_index: { Effective: [0], review: [1] },
  });
  assert.deepEqual(Object.keys(w).sort(), [...WORK_KEYS].sort());
  assert.equal(w.authors.length, 4);
  assert.equal(w.moreAuthors, 1);
  assert.equal(w.source, 'openalex');
  assert.equal(w.pdfUrl, 'https://example.org/p.pdf');
  assert.equal(w.abstract, 'Effective review');
  assert.equal(w.publisher, 'Wiley');
});

test('mapScholarPaper maps DOI, OA pdf and tldr', () => {
  const w = mapScholarPaper({
    title: 'Body-worn cameras and policing',
    authors: [{ name: 'C. Lum' }],
    year: 2020,
    venue: 'Criminology & Public Policy',
    externalIds: { DOI: '10.1111/1745-9133.12412' },
    openAccessPdf: { url: 'https://example.org/bwc.pdf' },
    isOpenAccess: true,
    citationCount: 178,
    abstract: 'A research synthesis.',
    tldr: { text: 'BWCs have modest effects on most outcomes.' },
  });
  assert.deepEqual(Object.keys(w).sort(), [...WORK_KEYS, 'tldr'].sort());
  assert.equal(w.doi, 'https://doi.org/10.1111/1745-9133.12412');
  assert.equal(w.oaUrl, 'https://example.org/bwc.pdf');
  assert.equal(w.source, 'scholar');
  assert.equal(w.tldr, 'BWCs have modest effects on most outcomes.');
});

test('mapScholarPaper tolerates sparse records', () => {
  const w = mapScholarPaper({ title: 'Sparse', venue: '' });
  assert.equal(w.venue, null);
  assert.equal(w.doi, null);
  assert.equal(w.isOa, false);
  assert.equal(w.citedBy, 0);
  assert.equal('tldr' in w, false);
});

test('mapCoreWork maps repository records', () => {
  const w = mapCoreWork({
    title: 'Neighbourhood policing in austerity',
    authors: [{ name: 'J. Smith' }, { name: 'K. Jones' }],
    yearPublished: 2018,
    journals: [{ title: 'Policing and Society' }],
    publisher: 'Taylor & Francis',
    doi: '10.1080/10439463.2018.1', // bare DOI from CORE
    downloadUrl: 'https://core.ac.uk/download/123.pdf',
    citationCount: 12,
    abstract: 'Grey literature counts too.',
  });
  assert.deepEqual(Object.keys(w).sort(), [...WORK_KEYS].sort());
  assert.equal(w.doi, 'https://doi.org/10.1080/10439463.2018.1');
  assert.equal(w.isOa, true);
  assert.equal(w.source, 'core');
  assert.equal(w.venue, 'Policing and Society');
  assert.equal(w.publisher, 'Taylor & Francis');
});

// ---------------------------------------------------------------------------
test('buildOpenAlexUrl honours filters and sorts', () => {
  const u = buildOpenAlexUrl(params({ q: 'hot spots', oa: '1', review: '1', from: '2015', sort: 'cited', page: '2' }));
  assert.equal(u.origin + u.pathname, 'https://api.openalex.org/works');
  assert.equal(u.searchParams.get('search'), 'hot spots');
  assert.equal(u.searchParams.get('filter'), 'is_oa:true,type:review,from_publication_date:2015-01-01');
  assert.equal(u.searchParams.get('sort'), 'cited_by_count:desc');
  assert.equal(u.searchParams.get('page'), '2');
  assert.equal(u.searchParams.get('per-page'), String(PER_PAGE));
});

test('policing facet pipe-joins every ISSN', () => {
  const u = buildOpenAlexUrl(params({ q: 'legitimacy' }), { policingOnly: true });
  const filter = u.searchParams.get('filter');
  const expected = POLICING_JOURNAL_ISSNS.map(([, i]) => i).join('|');
  assert.equal(filter, `primary_location.source.issn:${expected}`);
  assert.ok(POLICING_JOURNAL_ISSNS.every(([, i]) => /^\d{4}-\d{3}[\dX]$/.test(i)));
});

test('buildScholarUrl paginates by offset and respects caps', () => {
  const u = buildScholarUrl(params({ q: 'procedural justice', page: '3', oa: '1', review: '1', from: '2010' }));
  assert.equal(u.searchParams.get('offset'), String(2 * PER_PAGE));
  assert.equal(u.searchParams.get('limit'), String(PER_PAGE));
  assert.ok(u.searchParams.has('openAccessPdf'));
  assert.equal(u.searchParams.get('publicationTypes'), 'Review');
  assert.equal(u.searchParams.get('year'), '2010-');
  assert.ok(u.searchParams.get('fields').includes('tldr'));
});

test('buildCoreRequest folds the year floor into q', () => {
  const r = buildCoreRequest(params({ q: 'stop and search', page: '2', from: '2015' }));
  assert.equal(r.url, 'https://api.core.ac.uk/v3/search/works');
  assert.deepEqual(r.body, { q: 'stop and search AND yearPublished>=2015', limit: PER_PAGE, offset: PER_PAGE });
  assert.deepEqual(buildCoreRequest(params({ q: 'x' })).body, { q: 'x', limit: PER_PAGE, offset: 0 });
});

// ---------------------------------------------------------------------------
test('buildOpenAlexUrl honours a custom per-page (the guarded over-fetch)', () => {
  const u = buildOpenAlexUrl(params({ q: 'hot spots' }), { perPage: GUARDED_PER_PAGE });
  assert.equal(u.searchParams.get('per-page'), String(GUARDED_PER_PAGE));
  // Default is unchanged when no perPage is passed.
  const d = buildOpenAlexUrl(params({ q: 'hot spots' }));
  assert.equal(d.searchParams.get('per-page'), String(PER_PAGE));
  assert.ok(GUARDED_PER_PAGE > PER_PAGE);
});

test('isPolicingRelevant keeps on-topic work', () => {
  const keep = [
    { title: 'Hot spots policing of small geographic areas' },
    { title: 'Does extra patrol cut burglary?', abstract: 'A randomised trial.' },
    { title: 'Genetic influences on antisocial behaviour and crime' }, // criminology
    { title: 'Procedural justice and police legitimacy' },
    { venue: 'Policing and Society', title: 'Neighbourhood teams in austerity' },
    { title: 'Stop and search in London' },
    { title: 'Body-worn cameras and use of force' },
    { title: 'Recidivism among released prisoners' },
    { title: 'Knife crime among young people' },
  ];
  for (const w of keep) assert.equal(isPolicingRelevant(w), true, w.title ?? w.venue);
});

test('isPolicingRelevant drops off-topic work', () => {
  const drop = [
    { title: 'Gene expression in human cardiac tissue' },
    { title: 'A randomised trial of a new diabetes drug' },
    { title: 'Protein trafficking across the cell membrane' },
    { title: 'Monetary policy and inflation expectations' }, // "policy" must not match
    { title: 'Disease surveillance during an influenza outbreak' }, // "surveillance" alone must not match
    { title: 'Photosynthesis in marine phytoplankton' },
  ];
  for (const w of drop) assert.equal(isPolicingRelevant(w), false, w.title);
  assert.equal(isPolicingRelevant(null), false);
  assert.equal(isPolicingRelevant({}), false);
});

test('SOURCE_CAPS covers every source', () => {
  assert.deepEqual(Object.keys(SOURCE_CAPS).sort(), ['all', 'core', 'openalex', 'policing', 'scholar']);
  for (const caps of Object.values(SOURCE_CAPS)) {
    assert.deepEqual(Object.keys(caps).sort(), ['from', 'oa', 'review', 'sort']);
  }
});
