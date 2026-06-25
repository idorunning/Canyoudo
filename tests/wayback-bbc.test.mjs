// Unit tests for the BBC-via-Wayback corpus builder's pure logic (no network).
// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cdxUrl, playbackUrl, parseCdx, parseRssItems,
  isPolice, isEnglandAndWales, isEnglandWalesLink, facetsFor, stripBbcSuffix,
  buildRawFromHeadlines, SOURCE_NAME,
} from '../scripts/perception/wayback-bbc.mjs';
import { mergeRaw } from '../scripts/perception/merge.mjs';
import { normalise, tokenize } from '../scripts/perception/analyse.mjs';
import { FACETS, SCHEMA_VERSION } from '../scripts/perception/config.mjs';

const entityDefs = [
  { name: 'Metropolitan Police', type: 'force', match: 'metropolitan police' },
  { name: 'Ian Blair', type: 'leader', match: 'ian blair' },
];

// Two archived captures of a BBC feed (legacy RSS 0.91 style + one CDATA title
// as the modern feeds use). Includes a non-police story, a Scotland story (E&W
// guard), and a headline repeated across both months (dedup).
const captureJan = `<?xml version="1.0"?><rss version="0.91"><channel>
  <item><title>Police launch murder inquiry in Leeds</title><link>http://news.bbc.co.uk/1/hi/a.stm</link></item>
  <item><title>Met police commissioner Ian Blair resigns</title><link>http://news.bbc.co.uk/1/hi/b.stm</link></item>
  <item><title>Stock markets fall amid recession fears</title><link>http://news.bbc.co.uk/1/hi/c.stm</link></item>
  <item><title>Police Scotland announces new chief constable</title><link>http://news.bbc.co.uk/1/hi/d.stm</link></item>
  <item><title><![CDATA[Police &amp; community support officer numbers rise]]></title><link>http://news.bbc.co.uk/1/hi/e.stm</link></item>
</channel></rss>`;

const captureFeb = `<?xml version="1.0"?><rss version="0.91"><channel>
  <item><title>Police launch murder inquiry in Leeds</title><link>http://news.bbc.co.uk/1/hi/a.stm</link></item>
</channel></rss>`;

test('parseRssItems extracts titles, decodes entities/CDATA, follows links', () => {
  const items = parseRssItems(captureJan);
  assert.equal(items.length, 5);
  assert.equal(items[0].title, 'Police launch murder inquiry in Leeds');
  assert.equal(items[0].link, 'http://news.bbc.co.uk/1/hi/a.stm');
  // CDATA unwrapped and &amp; decoded.
  assert.equal(items[4].title, 'Police & community support officer numbers rise');
});

test('isPolice includes police headlines and excludes off-topic ones', () => {
  const police = normalise('Police launch murder inquiry in Leeds');
  const market = normalise('Stock markets fall amid recession fears');
  assert.equal(isPolice(police, tokenize(police)), true);
  assert.equal(isPolice(market, tokenize(market)), false);
});

test('isEnglandAndWales drops Scotland/NI forces but keeps E&W police', () => {
  assert.equal(isEnglandAndWales(normalise('Police Scotland announces new chief constable')), false);
  assert.equal(isEnglandAndWales(normalise('PSNI officer charged')), false);
  assert.equal(isEnglandAndWales(normalise('Police launch murder inquiry in Leeds')), true);
});

test('facetsFor routes a headline into every facet it matches', () => {
  const h = normalise('Met police commissioner Ian Blair resigns');
  const f = facetsFor(h, tokenize(h));
  assert.ok(f.includes('police-general')); // "police"
  assert.ok(f.includes('forces')); // "met police"
  assert.ok(f.includes('leaders-officers-staff')); // "police commissioner"
  const plain = normalise('Police launch murder inquiry in Leeds');
  assert.deepEqual(facetsFor(plain, tokenize(plain)), ['police-general']);
});

test('buildRawFromHeadlines dedups, filters to E&W police, and routes facets', () => {
  const records = [...parseRssItems(captureJan), ...parseRssItems(captureFeb)].map((r) => ({ ...r, date: '2008-01' }));
  const raw = buildRawFromHeadlines(2008, records, entityDefs);

  // 6 raw items in, 1 duplicate, 1 off-topic, 1 Scotland → 3 distinct E&W police.
  assert.equal(raw.provenance.captureItems, 6);
  assert.equal(raw.provenance.distinctHeadlines, 3);

  const docs = (f) => {
    const s = raw.facets[f].sentiment;
    return s.positive + s.neutral + s.negative;
  };
  assert.equal(docs('police-general'), 3); // all three kept headlines are police-general
  assert.equal(docs('forces'), 1); // only the Met headline names a force
  assert.equal(docs('leaders-officers-staff'), 2); // Met "commissioner" + "community support officer"

  // Named entity recovered from the routed headline.
  const leaderEnts = raw.facets['leaders-officers-staff'].entities.map((e) => e.name);
  assert.ok(leaderEnts.includes('Ian Blair'));

  // Word counts are real. "police" itself is a domain stopword (it's the subject,
  // so it's kept out of the cloud); the surrounding vocabulary survives.
  assert.ok(raw.facets['police-general'].corpusTokens > 0);
  const words = raw.facets['police-general'].topWords.map((w) => w.term);
  assert.ok(words.includes('murder') && words.includes('commissioner'));
});

test('buildRawFromHeadlines emits a valid, body-text-free contract', () => {
  const raw = buildRawFromHeadlines(2008, parseRssItems(captureJan), entityDefs);
  assert.equal(raw.schemaVersion, SCHEMA_VERSION);
  assert.equal(raw.provenance.method, 'wayback-bbc-rss');
  assert.deepEqual(raw.provenance.sourcesUsed, [SOURCE_NAME]);
  assert.equal(raw.provenance.sample, false);
  for (const f of FACETS) assert.ok(raw.facets[f], `facet ${f} present`);
  // No raw-text fields may leak into a facet (the build's hard rule, checked here too).
  for (const f of FACETS) {
    for (const k of Object.keys(raw.facets[f])) {
      assert.ok(!['body', 'bodyText', 'text', 'content'].includes(k), `no ${k} field`);
    }
  }
  // Provenance sample is capped and correctly attributed.
  assert.ok(raw.sources.length <= 8);
  for (const s of raw.sources) {
    assert.equal(s.source, SOURCE_NAME);
    assert.equal(s.outletType, 'broadcaster');
  }
});

test('a BBC raw merges with a Guardian raw to lift source diversity', () => {
  const bbc = buildRawFromHeadlines(2008, parseRssItems(captureJan), entityDefs);
  const guardian = {
    schemaVersion: SCHEMA_VERSION,
    year: 2008,
    provenance: { generatedAt: '2026-01-01T00:00:00Z', method: 'guardian', sourcesUsed: ['The Guardian'], itemCount: 100, sparse: false, sample: false, notes: '' },
    sources: [{ title: 'x', source: 'The Guardian', url: '', date: '2008-06-01', outletType: 'broadsheet' }],
    facets: Object.fromEntries(FACETS.map((f) => [f, { corpusTokens: 10, topWords: [], sentiment: { mean: 0, positive: 1, neutral: 0, negative: 0, gdeltToneMean: null }, lexicons: {}, entities: [] }])),
  };
  const merged = mergeRaw([guardian, bbc]);
  assert.deepEqual(merged.provenance.sourcesUsed.sort(), ['BBC News', 'The Guardian']);
  assert.equal(merged.provenance.method, 'hybrid');
  // Both outlets appear in the merged provenance sample → diversity index > 0.
  const outlets = new Set(merged.sources.map((s) => s.source));
  assert.ok(outlets.has('BBC News') && outlets.has('The Guardian'));
  assert.ok(outlets.size >= 2);
});

test('stripBbcSuffix removes the BBC site suffix but keeps clean headlines', () => {
  assert.equal(stripBbcSuffix('Met officer sacked over misconduct - BBC News'), 'Met officer sacked over misconduct');
  assert.equal(stripBbcSuffix('Saido Berahino signs - BBC Sport'), 'Saido Berahino signs');
  assert.equal(stripBbcSuffix('Police appeal | BBC News'), 'Police appeal');
  assert.equal(stripBbcSuffix('Stop-and-search figures rise'), 'Stop-and-search figures rise'); // internal dash untouched
});

test('isEnglandWalesLink gates BBC URLs to England & Wales desks', () => {
  assert.equal(isEnglandWalesLink('https://www.bbc.co.uk/news/uk-england-leeds-123'), true);
  assert.equal(isEnglandWalesLink('https://www.bbc.co.uk/news/uk-wales-456'), true); // Wales is E&W
  assert.equal(isEnglandWalesLink('https://www.bbc.co.uk/news/uk-12345'), true);
  assert.equal(isEnglandWalesLink('https://www.bbc.co.uk/news/world-us-canada-789'), false);
  assert.equal(isEnglandWalesLink('https://www.bbc.co.uk/news/uk-scotland-tayside-1'), false);
  assert.equal(isEnglandWalesLink('http://www.bbc.co.uk/news/uk-northern-ireland-50975245'), false); // "uk-" prefixed NI desk
  assert.equal(isEnglandWalesLink('https://www.bbc.co.uk/news/live/uk-scotland-52324722'), false);
  assert.equal(isEnglandWalesLink('https://www.bbc.co.uk/sport/football/3'), false);
  assert.equal(isEnglandWalesLink(''), true); // unknown → stay inclusive
});

test('buildRawFromHeadlines lets the dataset source override method and notes', () => {
  const raw = buildRawFromHeadlines(2020, parseRssItems(captureJan), entityDefs, { method: 'bbc-dataset', notes: 'X' });
  assert.equal(raw.provenance.method, 'bbc-dataset');
  assert.equal(raw.provenance.notes, 'X');
  assert.deepEqual(raw.provenance.sourcesUsed, [SOURCE_NAME]); // same outlet either way
});

test('cdxUrl samples one capture per month; playbackUrl requests raw bytes', () => {
  const u = cdxUrl('news.bbc.co.uk/rss/newsonline_uk_edition/uk/rss091.xml', 2008);
  assert.match(u, /\/cdx\/search\/cdx\?/);
  assert.match(u, /collapse=timestamp%3A6/);
  assert.match(u, /from=20080101000000/);
  assert.match(u, /filter=statuscode%3A200/);
  assert.match(playbackUrl('20080115120000', 'http://news.bbc.co.uk/x.xml'), /\/web\/20080115120000id_\/http/);
});

test('parseCdx skips the header row and tolerates empty bodies', () => {
  const body = JSON.stringify([['timestamp', 'original'], ['20080115120000', 'http://a'], ['20080216120000', 'http://b']]);
  assert.deepEqual(parseCdx(body), [
    { timestamp: '20080115120000', original: 'http://a' },
    { timestamp: '20080216120000', original: 'http://b' },
  ]);
  assert.deepEqual(parseCdx(''), []);
  assert.deepEqual(parseCdx('[]'), []);
});
