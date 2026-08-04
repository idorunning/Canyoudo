import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const registry = JSON.parse(await readFile(new URL('../../src/data/media-perception.json', import.meta.url), 'utf8'));
const outputUrl = new URL('../../public/perception-live.json', import.meta.url);
const now = new Date();

const RELEVANT = /\b(police|policing|officer|officers|constabulary|constable|detective|scotland yard|metropolitan police|met police|crime|criminal|murder|homicide|robbery|burglary|theft|shoplifting|fraud|court|courts|judge|judges|prosecution|cps|prison|jail|arrest|charged|sentenced|convicted|public order|riot|disorder|knife|firearm|terror)\b/i;
const POLICE_TARGET = /\b(police|policing|officer|officers|constabulary|constable|detective|scotland yard|metropolitan police|met police|chief constable|commissioner)\b/i;
const UK_SIGNAL = /\b(uk|britain|british|england|english|wales|welsh|scotland|scottish|northern ireland|london|manchester|birmingham|liverpool|leeds|bristol|glasgow|edinburgh|cardiff|belfast|met police|scotland yard|constabulary|home office|cps|crown court)\b/i;
const FOREIGN_SIGNAL = /\b(united states|u\.s\.|usa|american|new york|los angeles|florida|texas|washington dc|australia|australian|canada|canadian|india|indian|pakistan|pakistani|france|french|germany|german|russia|russian|ukraine|ukrainian|israel|israeli|gaza)\b/i;

const stanceLexicon = {
  favourable: ['praised', 'commended', 'rescued', 'saved', 'protected', 'recovered', 'seized', 'disrupted', 'prevented', 'solved', 'successful', 'breakthrough', 'convicted after', 'arrested after', 'crackdown', 'reassurance'],
  critical: ['failed', 'failure', 'criticised', 'criticism', 'misconduct', 'corrupt', 'corruption', 'racist', 'unlawful', 'wrongful', 'cover-up', 'apologised', 'apology', 'sacked', 'suspended', 'disciplinary', 'charged officer', 'convicted officer', 'inquest criticism', 'watchdog investigation', 'abuse of power']
};

const topicLexicon = {
  accountability: ['misconduct', 'watchdog', 'inquest', 'disciplinary', 'corrupt', 'apology', 'review'],
  'crime response': ['arrest', 'charged', 'convicted', 'investigation', 'seized', 'crackdown', 'appeal'],
  'public order': ['riot', 'disorder', 'protest', 'demonstration', 'crowd'],
  violence: ['murder', 'homicide', 'knife', 'firearm', 'assault', 'violence'],
  'trust and confidence': ['trust', 'confidence', 'legitimacy', 'fairness', 'reassurance'],
  'leadership and reform': ['chief constable', 'commissioner', 'reform', 'leadership', 'restructure'],
  courts: ['court', 'judge', 'sentence', 'trial', 'convicted', 'prosecution'],
  technology: ['data', 'cyber', 'facial recognition', 'ai ', 'algorithm', 'digital']
};

const stopWords = new Set('a an and are as at be been being by for from had has have he her hers him his how i in into is it its more most new not of on or our she than that the their them they this to up was were what when where which who will with you your after before over police policing officer officers crime court says said'.split(' '));

function decode(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ').trim();
}

function firstTag(block, names) {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
    if (match) return decode(match[1]);
  }
  return '';
}

function itemLink(block) {
  const rss = firstTag(block, ['link']);
  if (/^https?:\/\//i.test(rss)) return rss;
  const atom = block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i);
  return atom ? decode(atom[1]) : '';
}

function parseFeed(xml) {
  const rssItems = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  const atomItems = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ?? [];
  return [...rssItems, ...atomItems].slice(0, 40).map((block) => ({
    title: firstTag(block, ['title']),
    url: itemLink(block),
    publishedAt: firstTag(block, ['pubDate', 'published', 'updated', 'dc:date']),
    excerpt: firstTag(block, ['description', 'summary', 'content:encoded', 'content'])
  })).filter((item) => item.title && item.url);
}

function matches(text, phrases) {
  const lower = text.toLowerCase();
  return phrases.filter((phrase) => lower.includes(phrase));
}

function classify(title, excerpt) {
  const input = `${title}. ${excerpt}`.slice(0, 1600);
  const role = POLICE_TARGET.test(title) ? 'police-centred' : (POLICE_TARGET.test(input) ? 'police-related' : 'context-only');
  if (role === 'context-only') {
    return { stance: 'context', confidence: 0.9, evidence: [], rationale: 'The feed text is about crime, courts or law but does not identify policing as the substantive evaluative target.' };
  }
  const positive = matches(input, stanceLexicon.favourable);
  const negative = matches(input, stanceLexicon.critical);
  let stance = 'neutral';
  if (positive.length && negative.length) stance = 'balanced';
  else if (positive.length) stance = 'favourable';
  else if (negative.length) stance = 'critical';
  const evidence = [...positive, ...negative].slice(0, 8);
  const confidence = stance === 'neutral' ? 0.48 : Math.min(0.92, 0.62 + evidence.length * 0.08);
  const rationale = stance === 'neutral'
    ? 'No evaluative phrase in the headline or supplied feed summary met the published stance rules; this is a neutral preliminary label, not a finding about the full article.'
    : `The preliminary ${stance} label is triggered by target-aware feed wording: ${evidence.join(', ')}.`;
  return { stance, confidence, evidence, rationale };
}

function topics(text) {
  return Object.entries(topicLexicon).filter(([, words]) => matches(text, words).length).map(([topic]) => topic).slice(0, 4);
}

function keywords(text) {
  const counts = new Map();
  for (const word of text.toLowerCase().replace(/[^a-z0-9’'-]+/g, ' ').split(/\s+/)) {
    if (word.length < 4 || stopWords.has(word) || /^\d+$/.test(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([word]) => word);
}

function jurisdiction(text) {
  if (/\b(northern ireland|belfast|psni)\b/i.test(text)) return 'Northern Ireland';
  if (/\b(scotland|scottish|glasgow|edinburgh|police scotland)\b/i.test(text)) return 'Scotland';
  if (/\b(wales|welsh|cardiff|swansea)\b/i.test(text)) return 'Wales';
  if (/\b(london|met police|metropolitan police|scotland yard)\b/i.test(text)) return 'London';
  return 'UK / not resolved';
}

function relevant(item, source) {
  const text = `${item.title} ${item.excerpt}`;
  if (!RELEVANT.test(text)) return false;
  if (source.id === 'guardian-police' || source.id === 'standard-police') return true;
  if (FOREIGN_SIGNAL.test(text) && !UK_SIGNAL.test(text)) return false;
  return true;
}

function normaliseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? now.toISOString() : date.toISOString();
}

function articleId(url) {
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

async function fetchSource(source) {
  const started = Date.now();
  try {
    const response = await fetch(source.feedUrl, {
      headers: { 'user-agent': 'ThinkingAboutPolicing-MediaMonitor/1.0 (+https://thinkingaboutpolicing.org/perception)' },
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const xml = await response.text();
    const items = parseFeed(xml).filter((item) => relevant(item, source));
    const articles = items.map((item) => {
      const analysis = classify(item.title, item.excerpt);
      const combined = `${item.title}. ${item.excerpt}`;
      return {
        id: articleId(item.url), sourceId: source.id, sourceName: source.name, sourceClass: source.class,
        feedUrl: source.feedUrl, url: item.url, title: item.title, excerpt: item.excerpt.slice(0, 320),
        publishedAt: normaliseDate(item.publishedAt), fetchedAt: now.toISOString(), jurisdiction: jurisdiction(combined),
        role: POLICE_TARGET.test(item.title) ? 'Police-centred' : (POLICE_TARGET.test(combined) ? 'Police-related' : 'Context only'),
        stance: analysis.stance, confidence: analysis.confidence, evidence: analysis.evidence,
        rationale: analysis.rationale, topics: topics(combined), keywords: keywords(combined),
        reviewStatus: 'automatic-preliminary', inputUsed: item.excerpt ? 'RSS headline and summary' : 'RSS headline only'
      };
    });
    return { articles, health: { sourceId: source.id, sourceName: source.name, state: 'healthy', fetchedAt: now.toISOString(), itemCount: articles.length, responseMs: Date.now() - started } };
  } catch (error) {
    return { articles: [], health: { sourceId: source.id, sourceName: source.name, state: 'failed', fetchedAt: now.toISOString(), itemCount: 0, responseMs: Date.now() - started, error: String(error?.message ?? error).slice(0, 180) } };
  }
}

let previous = { articles: [], collectionStartedAt: now.toISOString() };
try { previous = JSON.parse(await readFile(outputUrl, 'utf8')); } catch {}

const activeSources = registry.sources.filter((source) => source.state !== 'quarantine');
const fetched = await Promise.all(activeSources.map(fetchSource));
const merged = new Map((previous.articles ?? []).map((article) => [article.url, article]));
for (const result of fetched) for (const article of result.articles) merged.set(article.url, article);

const cutoff = Date.now() - 1000 * 60 * 60 * 24 * 730;
const articles = [...merged.values()]
  .filter((article) => new Date(article.publishedAt).getTime() >= cutoff)
  .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
  .slice(0, 5000);

const rollupMap = new Map();
for (const article of articles) {
  if (article.sourceClass !== 'media' || article.stance === 'context') continue;
  const month = article.publishedAt.slice(0, 7);
  const key = `${month}|${article.sourceId}`;
  const row = rollupMap.get(key) ?? { month, sourceId: article.sourceId, sourceName: article.sourceName, favourable: 0, critical: 0, balanced: 0, neutral: 0, total: 0 };
  if (Object.hasOwn(row, article.stance)) row[article.stance] += 1;
  row.total += 1;
  rollupMap.set(key, row);
}

const output = {
  schemaVersion: 1,
  generatedAt: now.toISOString(),
  collectionStartedAt: previous.collectionStartedAt ?? now.toISOString(),
  classificationMethod: 'target-aware-headline-and-feed-summary-v1',
  articles,
  rollups: [...rollupMap.values()].sort((a, b) => a.month.localeCompare(b.month) || a.sourceName.localeCompare(b.sourceName)),
  feedHealth: fetched.map((result) => result.health),
  notice: 'Labels are automatic preliminary assessments of the RSS headline and supplied summary. Open the evidence record and source article before drawing conclusions.'
};

await writeFile(outputUrl, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Media monitor refreshed: ${articles.length} retained articles from ${activeSources.length} feeds; ${output.feedHealth.filter((feed) => feed.state === 'healthy').length} feeds healthy.`);
