// Unit tests for the pure research-source helpers. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  abstractFromIndex,
  clip,
  stripTags,
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
  assert.deepEqual(
    Object.keys(SOURCE_CAPS).sort(),
    ['all', 'core', 'crossref', 'europepmc', 'govuk', 'openalex', 'policing', 'scholar']
  );
  for (const caps of Object.values(SOURCE_CAPS)) {
    assert.deepEqual(Object.keys(caps).sort(), ['from', 'oa', 'review', 'sort']);
  }
});

// ---------------------------------------------------------------------------
// Crossref / Europe PMC / GOV.UK adapters + Unpaywall enrichment
// ---------------------------------------------------------------------------
test('stripTags flattens JATS/HTML to plain text', () => {
  assert.equal(stripTags('<jats:p>Hot <i>spots</i></jats:p>'), 'Hot spots');
  assert.equal(stripTags('  plain  text  '), 'plain text');
  assert.equal(stripTags('<p></p>'), null);
  assert.equal(stripTags(null), null);
});

test('mapCrossrefWork maps names, year, JATS abstract and cited count', () => {
  const w = mapCrossrefWork({
    title: ['Procedural justice and police legitimacy'],
    author: [
      { given: 'Jonathan', family: 'Jackson' },
      { given: 'Ben', family: 'Bradford' },
    ],
    issued: { 'date-parts': [[2021, 6]] },
    'container-title': ['Policing and Society'],
    publisher: 'Taylor & Francis',
    DOI: '10.1080/10439463.2021.123',
    'is-referenced-by-count': 57,
    abstract: '<jats:p>A study of legitimacy and crime.</jats:p>',
    link: [{ URL: 'https://example.org/full.pdf', 'content-type': 'application/pdf' }],
  });
  assert.deepEqual(Object.keys(w).sort(), [...WORK_KEYS].sort());
  assert.equal(w.title, 'Procedural justice and police legitimacy');
  assert.equal(w.authors[0], 'Jonathan Jackson');
  assert.equal(w.year, 2021);
  assert.equal(w.venue, 'Policing and Society');
  assert.equal(w.doi, 'https://doi.org/10.1080/10439463.2021.123');
  assert.equal(w.pdfUrl, 'https://example.org/full.pdf');
  assert.equal(w.isOa, true);
  assert.equal(w.citedBy, 57);
  assert.equal(w.abstract, 'A study of legitimacy and crime.');
  assert.equal(w.source, 'crossref');
});

test('mapCrossrefWork tolerates a sparse record with no full text', () => {
  const w = mapCrossrefWork({ DOI: '10.1/x' });
  assert.equal(w.title, 'Untitled');
  assert.equal(w.pdfUrl, null);
  assert.equal(w.isOa, false);
  assert.equal(w.citedBy, 0);
});

test('buildCrossrefUrl filters, paginates and sorts', () => {
  const u = buildCrossrefUrl(params({ q: 'hot spots', from: '2015', sort: 'cited', page: '2' }), {
    mailto: 'hi@example.org',
    perPage: GUARDED_PER_PAGE,
  });
  assert.equal(u.origin + u.pathname, 'https://api.crossref.org/works');
  assert.equal(u.searchParams.get('query'), 'hot spots');
  assert.equal(u.searchParams.get('rows'), String(GUARDED_PER_PAGE));
  assert.equal(u.searchParams.get('offset'), String(GUARDED_PER_PAGE));
  assert.equal(u.searchParams.get('filter'), 'type:journal-article,from-pub-date:2015-01-01');
  assert.equal(u.searchParams.get('sort'), 'is-referenced-by-count');
  assert.equal(u.searchParams.get('order'), 'desc');
  assert.equal(u.searchParams.get('mailto'), 'hi@example.org');
});

test('mapEuropePmcWork maps authors, OA pdf and citations', () => {
  const w = mapEuropePmcWork({
    title: 'Domestic abuse and repeat victimisation',
    authorList: { author: [{ fullName: 'Smith J' }, { fullName: 'Jones K' }] },
    pubYear: '2019',
    journalInfo: { journal: { title: 'Journal of Criminal Justice' } },
    doi: '10.1016/j.jcj.2019.1',
    isOpenAccess: 'Y',
    citedByCount: 33,
    abstractText: 'A cohort study.',
    fullTextUrlList: {
      fullTextUrl: [
        { documentStyle: 'html', availabilityCode: 'OA', url: 'https://example.org/html' },
        { documentStyle: 'pdf', availabilityCode: 'OA', url: 'https://example.org/p.pdf' },
      ],
    },
  });
  assert.deepEqual(Object.keys(w).sort(), [...WORK_KEYS].sort());
  assert.equal(w.authors.length, 2);
  assert.equal(w.year, 2019);
  assert.equal(w.venue, 'Journal of Criminal Justice');
  assert.equal(w.doi, 'https://doi.org/10.1016/j.jcj.2019.1');
  assert.equal(w.pdfUrl, 'https://example.org/p.pdf');
  assert.equal(w.isOa, true);
  assert.equal(w.citedBy, 33);
  assert.equal(w.source, 'europepmc');
});

test('buildEuropePmcUrl ANDs filters into the query and sorts', () => {
  const u = buildEuropePmcUrl(params({ q: 'knife crime', oa: '1', review: '1', from: '2018', sort: 'recent', page: '3' }));
  assert.equal(u.origin + u.pathname, 'https://www.ebi.ac.uk/europepmc/webservices/rest/search');
  assert.equal(u.searchParams.get('query'), 'knife crime AND OPEN_ACCESS:y AND PUB_TYPE:"Review" AND PUB_YEAR:[2018 TO 3000]');
  assert.equal(u.searchParams.get('format'), 'json');
  assert.equal(u.searchParams.get('resultType'), 'core');
  assert.equal(u.searchParams.get('page'), '3');
  assert.equal(u.searchParams.get('sort'), 'P_PDATE_D desc');
});

test('mapGovukWork builds an absolute link and dates the record', () => {
  const w = mapGovukWork({
    title: 'Police use of force statistics',
    link: '/government/statistics/police-use-of-force',
    description: 'Annual data on use of force by police forces in England and Wales.',
    public_timestamp: '2023-12-07T09:30:00.000+00:00',
    organisations: [{ title: 'Home Office' }],
  });
  assert.deepEqual(Object.keys(w).sort(), [...WORK_KEYS].sort());
  assert.equal(w.oaUrl, 'https://www.gov.uk/government/statistics/police-use-of-force');
  assert.equal(w.venue, 'Home Office');
  assert.equal(w.publisher, 'GOV.UK');
  assert.equal(w.year, 2023);
  assert.equal(w.isOa, true);
  assert.equal(w.doi, null);
  assert.equal(w.source, 'govuk');
});

test('buildGovukUrl paginates and floors by date', () => {
  const u = buildGovukUrl(params({ q: 'stop and search', from: '2015', page: '2' }), { perPage: GUARDED_PER_PAGE });
  assert.equal(u.origin + u.pathname, 'https://www.gov.uk/api/search.json');
  assert.equal(u.searchParams.get('q'), 'stop and search');
  assert.equal(u.searchParams.get('count'), String(GUARDED_PER_PAGE));
  assert.equal(u.searchParams.get('start'), String(GUARDED_PER_PAGE));
  assert.deepEqual(u.searchParams.getAll('fields'), ['title', 'link', 'description', 'public_timestamp', 'organisations']);
  assert.equal(u.searchParams.get('filter_public_timestamp'), 'from:2015-01-01');
});

test('buildUnpaywallUrl strips a doi.org prefix and adds the email', () => {
  const u = buildUnpaywallUrl('https://doi.org/10.1/AbC', 'me@example.org');
  assert.equal(u.origin + u.pathname, 'https://api.unpaywall.org/v2/10.1%2FAbC');
  assert.equal(u.searchParams.get('email'), 'me@example.org');
  const bare = buildUnpaywallUrl('10.1/x', 'me@example.org');
  assert.ok(bare.pathname.endsWith('10.1%2Fx'));
});

test('applyUnpaywall fills missing links but never overwrites', () => {
  const base = { pdfUrl: null, oaUrl: null, isOa: false };
  const filled = applyUnpaywall(base, {
    best_oa_location: { url_for_pdf: 'https://oa.org/x.pdf', url: 'https://oa.org/x' },
  });
  assert.equal(filled.pdfUrl, 'https://oa.org/x.pdf');
  assert.equal(filled.oaUrl, 'https://oa.org/x.pdf');
  assert.equal(filled.isOa, true);

  // No OA location → unchanged; existing links are preserved.
  assert.deepEqual(applyUnpaywall(base, { best_oa_location: null }), base);
  const kept = applyUnpaywall(
    { pdfUrl: 'https://keep.me/p.pdf', oaUrl: 'https://keep.me/p.pdf', isOa: true },
    { best_oa_location: { url_for_pdf: 'https://other.org/y.pdf' } }
  );
  assert.equal(kept.pdfUrl, 'https://keep.me/p.pdf');
});
