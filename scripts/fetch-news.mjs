#!/usr/bin/env node
// Aggregate policing / law / AI headlines from a curated set of public RSS and
// Atom feeds, and write them to src/content/news/latest.json as a committed
// snapshot. Run on a schedule by .github/workflows/news.yml, or on demand.
//
// Design notes:
//   • Dependency-free. RSS and Atom are both tolerantly parsed with a few
//     regexes — robust enough for these known feeds, and one malformed or
//     unreachable feed is skipped rather than failing the whole job.
//   • Only headline, link, source and date are kept (plus a short, plain-text
//     summary). No full article text — this stays within what RSS is for:
//     syndicating links back to the publisher.
//   • The broad feeds (BBC) are keyword-filtered to on-topic items; the
//     specialist and GOV.UK feeds are kept whole.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/content/news');
const UA = 'thinkingaboutpolicing.org news aggregator (+https://thinkingaboutpolicing.org)';

const MAX_ITEMS = 30; // total headlines kept
const MAX_PER_SOURCE = 4; // keep the mix diverse
const MAX_AGE_DAYS = 45; // drop anything staler than this

// Keyword filters, so only on-topic stories survive. Applied to the broad
// feeds (BBC) and to the GOV.UK department feeds, which otherwise carry plenty
// of off-topic departmental output.
const POLICING_RE = /\b(police|policing|officer|constab|crime|criminal|prison|sentenc|court|knife|stab|murder|burglar|theft|fraud|home office|met police|offender|custody|arrest|antisocial|county lines|grooming|terror)\b/i;
const LAW_RE = /\b(court|sentenc|prison|justice|judge|judicial|prosecut|offend|crimin|jail|convict|law|legal|barrister|solicitor|tribunal|probation|parole|magistrate|verdict|trial)\b/i;
const AI_RE = /\b(ai|a\.i\.|artificial intelligence|machine learning|chatbot|deepfake|algorithm|openai|anthropic|chatgpt|copilot|llm|facial recognition|generative|automation|robot)\b/i;

// GOV.UK Atom feeds publish documents as well as news. Drop the document types
// (transparency releases, statistics, guidance, …) so only news-like items pass.
const NOISE_PREFIX_RE = /^(transparency data|research|statistics|(accredited |ad hoc )?official statistics|national statistics|notice|correspondence|guidance|form|promotional material|independent report|policy paper|corporate report|consultation outcome|open consultation|closed consultation|decision|detailed guide|map|foi release|collection|impact assessment|regulation):/i;

const FEEDS = [
  // --- Policing -----------------------------------------------------------
  { url: 'https://www.gov.uk/search/news-and-communications.atom?keywords=police', source: 'GOV.UK', topic: 'policing', filter: POLICING_RE },
  { url: 'https://www.gov.uk/government/organisations/home-office.atom', source: 'Home Office', topic: 'policing', filter: POLICING_RE },
  { url: 'https://www.policeprofessional.com/feed/', source: 'Police Professional', topic: 'policing' },
  { url: 'https://feeds.bbci.co.uk/news/uk/rss.xml', source: 'BBC News', topic: 'policing', filter: POLICING_RE },
  // --- Law ----------------------------------------------------------------
  { url: 'https://www.gov.uk/government/organisations/ministry-of-justice.atom', source: 'Ministry of Justice', topic: 'law', filter: LAW_RE },
  { url: 'https://www.gov.uk/government/organisations/crown-prosecution-service.atom', source: 'CPS', topic: 'law', filter: LAW_RE },
  { url: 'https://www.judiciary.uk/feed/', source: 'Courts & Tribunals Judiciary', topic: 'law' },
  { url: 'https://legalcheek.com/feed/', source: 'Legal Cheek', topic: 'law' },
  // --- AI -----------------------------------------------------------------
  { url: 'https://www.gov.uk/government/organisations/department-for-science-innovation-and-technology.atom', source: 'DSIT', topic: 'ai', filter: AI_RE },
  { url: 'https://www.theregister.com/software/ai_ml/headlines.atom', source: 'The Register', topic: 'ai' },
  { url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', source: 'BBC Technology', topic: 'ai', filter: AI_RE },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) return await res.text();
      if (res.status === 429 || res.status >= 500) {
        await sleep(800 * (i + 1));
        continue;
      }
      throw new Error(`${res.status} ${res.statusText}`);
    } catch (err) {
      if (i === tries - 1) throw err;
      await sleep(800 * (i + 1));
    }
  }
}

// --- Tiny tolerant XML helpers ---------------------------------------------
function decode(s) {
  if (!s) return '';
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&(?:#39|apos);/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&') // last, so we don't double-decode
    .trim();
}
function safeCodePoint(n) {
  try {
    return String.fromCodePoint(n);
  } catch {
    return '';
  }
}
// Unwrap CDATA *before* stripping tags — otherwise a whole <![CDATA[…]]> block
// reads as a single tag and the text inside it is deleted.
const stripTags = (s) =>
  decode(
    String(s)
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();

function firstTag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : '';
}

// RSS uses <link>URL</link>; Atom uses <link href="URL" rel="alternate"/>.
function extractLink(block) {
  const alt = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i);
  if (alt) return alt[1];
  const href = block.match(/<link[^>]*href=["']([^"']+)["']/i);
  if (href) return href[1];
  const text = firstTag(block, 'link').trim();
  return text;
}

function parseFeed(xml) {
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  const out = [];
  for (const block of blocks) {
    const title = stripTags(firstTag(block, 'title'));
    const link = decode(extractLink(block)).trim();
    if (!title || !link) continue;
    const rawDate = firstTag(block, 'pubDate') || firstTag(block, 'published') || firstTag(block, 'updated') || firstTag(block, 'dc:date') || firstTag(block, 'date');
    const d = new Date(decode(rawDate).trim());
    const isoDate = isNaN(d.getTime()) ? null : d.toISOString();
    const summaryRaw = firstTag(block, 'description') || firstTag(block, 'summary') || firstTag(block, 'content');
    let summary = stripTags(summaryRaw);
    if (summary.length > 180) summary = summary.slice(0, 177).replace(/\s+\S*$/, '') + '…';
    out.push({ title, link, isoDate, summary });
  }
  return out;
}

async function main() {
  const now = new Date();
  const cutoff = now.getTime() - MAX_AGE_DAYS * 86400000;
  const all = [];
  const liveSources = new Set();

  for (const feed of FEEDS) {
    try {
      const xml = await fetchText(feed.url);
      let items = parseFeed(xml);
      // Drop GOV.UK document publications (kept only news-like items).
      items = items.filter((it) => !NOISE_PREFIX_RE.test(it.title));
      if (feed.filter) items = items.filter((it) => feed.filter.test(`${it.title} ${it.summary}`));
      let kept = 0;
      for (const it of items) {
        if (it.isoDate && new Date(it.isoDate).getTime() < cutoff) continue;
        all.push({ ...it, source: feed.source, topic: feed.topic });
        kept++;
      }
      if (kept > 0) liveSources.add(feed.source);
      console.log(`  ✓ ${feed.source}: ${kept} item(s)`);
    } catch (err) {
      console.warn(`  ! skipped ${feed.source} (${feed.url}): ${err.message}`);
    }
  }

  // De-duplicate by link, then by normalised title.
  const seen = new Set();
  const deduped = [];
  for (const it of all) {
    const keyLink = it.link.split(/[?#]/)[0].replace(/\/$/, '').toLowerCase();
    const keyTitle = it.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (seen.has(keyLink) || seen.has(keyTitle)) continue;
    seen.add(keyLink);
    seen.add(keyTitle);
    deduped.push(it);
  }

  // Newest first; undated items sink to the bottom.
  deduped.sort((a, b) => (b.isoDate ? new Date(b.isoDate).getTime() : 0) - (a.isoDate ? new Date(a.isoDate).getTime() : 0));

  // Cap per source for a varied mix, then cap the total.
  const perSource = new Map();
  const items = [];
  for (const it of deduped) {
    const n = perSource.get(it.source) ?? 0;
    if (n >= MAX_PER_SOURCE) continue;
    perSource.set(it.source, n + 1);
    items.push({ title: it.title, link: it.link, source: it.source, topic: it.topic, isoDate: it.isoDate ?? now.toISOString(), summary: it.summary });
    if (items.length >= MAX_ITEMS) break;
  }

  const payload = {
    provenance: { fetchedAt: now.toISOString(), feedCount: liveSources.size, sources: [...liveSources] },
    items,
  };

  await mkdir(OUT, { recursive: true });
  await writeFile(join(OUT, 'latest.json'), JSON.stringify(payload, null, 2) + '\n');
  console.log(`\nDone. ${items.length} headlines from ${liveSources.size}/${FEEDS.length} feeds → src/content/news/latest.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
