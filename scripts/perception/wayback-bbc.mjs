// Pure, dependency-free helpers for the BBC-News-via-Wayback corpus builder.
//
// The Guardian is one broadsheet; this adds the BBC's voice — the most-read UK
// news source — and, crucially, the pre-2011 years that no live news API
// reaches. The BBC has no archival headline API, but the Internet Archive has
// densely captured the BBC's RSS feeds since ~2004, and archived RSS is a clean,
// machine-readable list of <title> headlines. We sample one capture per feed per
// month (CDX `collapse=timestamp:6`), parse the item titles, and reduce them to
// the same DERIVED aggregates every other source produces — the headline text is
// counted in memory and discarded.
//
// Everything here is network-free and pure so the parse/filter/route/dedup logic
// is unit-tested (tests/wayback-bbc.test.mjs); scripts/perception/harvest-wayback-bbc.mjs
// supplies the throttled CDX + playback fetches and feeds the captures through.
//
// Legal posture (unchanged from the rest of the pipeline): extraction is
// transient computational analysis (UK TDM exception, CDPA s.29A) and only
// derived counts + a small provenance sample of headlines are kept — never the
// headline corpus. Keep the site non-commercial and acknowledge the source.

import { FACET_QUERIES, FACETS, SCHEMA_VERSION, outletByName } from './config.mjs';
import { newAccumulator, accumulate, finalise, normalise, tokenize } from './analyse.mjs';

export const SOURCE_NAME = 'BBC News';
export const METHOD = 'wayback-bbc-rss';

const DEFAULT_NOTES =
  'BBC News headlines recovered from archived RSS feeds via the Internet Archive ' +
  '(one capture per feed per month). Titles counted in memory, then dropped; only ' +
  'derived aggregates kept. A monthly sample of a rolling feed, so volumes are lower ' +
  'than a full-archive query — thin years are flagged sparse downstream.';

// BBC RSS feeds worth sampling, by era. The feed URL scheme changed when the BBC
// moved off the legacy `news.bbc.co.uk` platform (RSS 0.91) to `feeds.bbci.co.uk`
// (RSS 2.0) around 2010, so each feed declares the years it applies to and the
// harvester only queries feeds live in the target year. There is no dedicated
// "police" feed — we take the UK / England / front-page feeds and filter to
// police headlines below.
export const BBC_FEEDS = [
  // Legacy platform (RSS 0.91), captured from ~2004 to ~2011.
  { id: 'legacy-front', url: 'news.bbc.co.uk/rss/newsonline_uk_edition/front_page/rss091.xml', from: 2004, to: 2011 },
  { id: 'legacy-uk', url: 'news.bbc.co.uk/rss/newsonline_uk_edition/uk/rss091.xml', from: 2004, to: 2011 },
  { id: 'legacy-england', url: 'news.bbc.co.uk/rss/newsonline_uk_edition/england/rss091.xml', from: 2004, to: 2011 },
  // Modern platform (RSS 2.0), captured from ~2010 onward.
  { id: 'news-uk', url: 'feeds.bbci.co.uk/news/uk/rss.xml', from: 2010, to: 9999 },
  { id: 'news-england', url: 'feeds.bbci.co.uk/news/england/rss.xml', from: 2010, to: 9999 },
  { id: 'news', url: 'feeds.bbci.co.uk/news/rss.xml', from: 2010, to: 9999 },
];

export const feedsForYear = (year, feeds = BBC_FEEDS) => feeds.filter((f) => year >= f.from && year <= f.to);

// CDX query that returns at most one capture per calendar month (collapse on the
// first 6 timestamp chars = YYYYMM), HTTP 200 only, slim columns, as JSON.
export function cdxUrl(feedUrl, year, { collapse = 6, host = 'https://web.archive.org' } = {}) {
  const qs = new URLSearchParams({
    url: feedUrl,
    from: `${year}0101000000`,
    to: `${year}1231235959`,
    filter: 'statuscode:200',
    collapse: `timestamp:${collapse}`,
    fl: 'timestamp,original',
    output: 'json',
  });
  return `${host}/cdx/search/cdx?${qs}`;
}

// Raw-bytes playback URL (the `id_` suffix returns the archived file without the
// Internet Archive's rewrite/banner, so the XML parses cleanly).
export const playbackUrl = (timestamp, original, host = 'https://web.archive.org') =>
  `${host}/web/${timestamp}id_/${original}`;

// CDX JSON is a header row then [timestamp, original] rows. Tolerates an empty
// body (a feed not archived that year) by returning [].
export function parseCdx(text) {
  let rows;
  try {
    rows = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(rows) || rows.length <= 1) return [];
  return rows.slice(1).map(([timestamp, original]) => ({ timestamp, original }));
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decodeEntities(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ENTITIES[e]);
}

function tagText(block, tag) {
  const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(block);
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : '';
}

// Parse an archived RSS/Atom feed into headline records. Works for BBC RSS 0.91
// (legacy) and RSS 2.0 (modern) — both use <item><title>; modern wraps titles in
// CDATA and adds <pubDate>/<guid>. Atom <entry> is handled too, just in case.
export function parseRssItems(xml) {
  const out = [];
  const blockRe = /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = blockRe.exec(xml))) {
    const block = m[2];
    const title = tagText(block, 'title');
    if (!title) continue;
    const link = tagText(block, 'link') || tagText(block, 'guid') || tagText(block, 'id');
    const date = tagText(block, 'pubDate') || tagText(block, 'dc:date') || tagText(block, 'updated') || '';
    out.push({ title, link, date });
  }
  return out;
}

// England-&-Wales guard: drop headlines that are explicitly about the Scottish or
// Northern Irish forces. Deliberately narrow — it only excludes named non-E&W
// forces, not every mention of those nations.
const EW_EXCLUDE = ['police scotland', 'psni', 'police service of northern ireland'];
export const isEnglandAndWales = (norm) => !EW_EXCLUDE.some((t) => norm.includes(t));

// BBC article URLs encode the desk: news.bbc.co.uk/.../<section>/... and
// bbc.co.uk/news/<section>-... So a link is a far more reliable England-&-Wales
// gate than headline words — it drops the global BBC desks (world, US, Scotland,
// NI, sport) that would otherwise pollute an E&W corpus with US-police vocabulary
// (e.g. "George Floyd/Trump"). Keeps Wales (part of E&W) and generic UK news.
// Used by the dataset source (whose rows span every desk); the RSS source is
// already scoped to UK/England feeds. Empty link → keep (can't tell, stay inclusive).
// Boundaries are `/` or `-` because the BBC prefixes nation desks with "uk-"
// (uk-scotland, uk-northern-ireland) and chains sub-desks with dashes
// (world-us-canada). England and Wales are NOT excluded (uk-england-*, uk-wales-*).
const NON_EW_SECTION =
  /[\/-](?:sport|world|us-canada|latin-america|africa|asia|australia|middle-east|europe|scotland|northern-ireland)(?:[\/-]|$)/i;
export const isEnglandWalesLink = (link) => !link || !NON_EW_SECTION.test(link);

const matchesAnyTerm = (norm, tokens, terms) =>
  terms.some((t) => (t.includes(' ') ? norm.includes(t) : tokens.includes(t)));

// A headline is "about the police" if it matches the police-general terms; the
// same terms decide the police-general facet. forces / leaders-officers-staff are
// additional sub-views a headline joins when it also matches their terms — so one
// headline can count toward several facets, exactly as the Guardian fetcher's
// per-facet queries can each match it.
export const isPolice = (norm, tokens) => matchesAnyTerm(norm, tokens, FACET_QUERIES['police-general']);
export const facetsFor = (norm, tokens) =>
  FACETS.filter((f) => matchesAnyTerm(norm, tokens, FACET_QUERIES[f]));

// BBC titles from feeds and the dataset carry a site suffix (" - BBC News",
// " - BBC Sport", em-dash variants). Strip it so the headline words are clean
// and the suffix doesn't pollute the cloud.
export const stripBbcSuffix = (title) =>
  String(title).replace(/\s*[-–—|]\s*BBC(?:\s+[\w& ]+?)?\s*$/i, '').trim();

// Reduce a flat list of headline records (gathered from every sampled capture,
// with cross-capture repeats) into one agent-contract object for the year.
// Dedups by normalised title so a story present in several monthly captures is
// counted once; filters to E&W police headlines; routes each into its facets.
// `method`/`notes` let the same builder serve both BBC sources (archived RSS and
// the HuggingFace dataset); the outlet ('BBC News') and shape are identical.
export function buildRawFromHeadlines(year, records, entityDefs, { provenanceSample = 8, method = METHOD, notes = DEFAULT_NOTES } = {}) {
  const accs = Object.fromEntries(FACETS.map((f) => [f, newAccumulator()]));
  const seen = new Set();
  const sources = [];
  let kept = 0;
  let captureItems = 0;
  let monthsWithItems = new Set();

  for (const rec of records) {
    captureItems++;
    const title = stripBbcSuffix(rec.title);
    const norm = normalise(title);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    const tokens = tokenize(norm);
    if (!isPolice(norm, tokens) || !isEnglandAndWales(norm)) continue;
    kept++;
    if (rec.date) monthsWithItems.add(String(rec.date).slice(0, 7));
    const inFacets = facetsFor(norm, tokens);
    for (const f of inFacets) accumulate(accs[f], title, entityDefs);
    if (sources.length < provenanceSample) {
      sources.push({
        title,
        source: SOURCE_NAME,
        url: rec.link || '',
        date: String(rec.date || '').slice(0, 10),
        outletType: outletByName(SOURCE_NAME).type,
      });
    }
  }

  const facets = Object.fromEntries(FACETS.map((f) => [f, finalise(accs[f])]));
  // Match the Guardian fetcher's convention: itemCount sums document counts across
  // facets (a headline in N facets contributes N). build-perception recomputes the
  // committed figure the same way, so this stays the comparable number in logs.
  const itemCount = FACETS.reduce((n, f) => {
    const s = facets[f].sentiment;
    return n + s.positive + s.neutral + s.negative;
  }, 0);

  return {
    schemaVersion: SCHEMA_VERSION,
    year,
    provenance: {
      generatedAt: new Date().toISOString(),
      method,
      sourcesUsed: [SOURCE_NAME],
      itemCount,
      distinctHeadlines: kept,
      captureItems,
      monthsCovered: monthsWithItems.size,
      sparse: false, // build-perception sets this from the merged itemCount
      sample: false,
      notes,
    },
    sources,
    facets,
  };
}
