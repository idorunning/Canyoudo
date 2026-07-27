#!/usr/bin/env node
// Generate the perception word clouds and the client data bundle from the
// committed `perception` collection.
//
//   • public/images/perception/<year>-<facet>.svg   — one inline-SVG cloud per
//     year × facet (deterministic, diff-able, scalable, zero runtime JS). Words
//     are sized by ratePer10k scaled against the shared index maxima so years
//     are visually comparable, and tinted by sentiment (green→grey→red).
//   • public/perception-data.json                   — the whole dataset in one
//     file for the interactive explorer (so the client loads one request, not
//     26), plus the maxima and the social-media context overlay.
//
// Run after `npm run build-perception`.

import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FACETS, FACET_LABELS, FORCES } from './perception/config.mjs';
import { POSITIVE, NEGATIVE, THEMES, POLICING_TERMS } from './perception/lexicons.mjs';
import { allEntities } from './perception/entities.mjs';
import { lemma } from './perception/analyse.mjs';
import { HIDE_WORDS, WORD_DISPLAY, STOPWORDS, DOMAIN_STOP } from './perception/stopwords.mjs';

// Lemmatised sentiment sets, so the client (whose topWords are already folded —
// "shooting"→"shoot", "failings"→"fail") can colour words by connotation using
// the same forms the counts use.
const POS_LEMMA = [...new Set([...POSITIVE].map(lemma))];
const NEG_LEMMA = [...new Set([...NEGATIVE].map(lemma))];

// ALLOWLIST — a word is shown in the cloud/race/list only if it carries policing
// meaning: it's a sentiment word, a theme word, curated policing vocabulary, or a
// known entity/event/place/institution. This replaces the never-ending blocklist:
// generic nouns, procedural verbs and random personal names (Smith, Damien, case,
// limit…) simply aren't on the list, so they drop out automatically. Each source
// word is stored both verbatim and lemma-folded so it matches the lemmatised counts.
const SHOW = new Set();
const addShow = (w) => {
  if (!w) return;
  const l = String(w).toLowerCase();
  if (l.length < 3 || STOPWORDS.has(l) || DOMAIN_STOP.has(l)) return;
  SHOW.add(l);
  SHOW.add(lemma(l));
};
// Split a phrase ("public confidence", "stop and search", "metropolitan police")
// into its meaningful word tokens.
const addPhrase = (s) => String(s).toLowerCase().split(/[^a-z]+/).forEach(addShow);
[...POSITIVE, ...NEGATIVE].forEach(addShow);
Object.values(THEMES).flat().forEach(addPhrase);
POLICING_TERMS.forEach(addShow);
Object.keys(WORD_DISPLAY).forEach((k) => SHOW.add(k)); // curated people/events/places/acronyms (folded forms)
allEntities().forEach((e) => addPhrase(e.match)); // force place-words + leader/role terms

// Show this word? In the allowlist and not explicitly force-hidden.
const isShown = (term) => SHOW.has(term) && !HIDE_WORDS.has(term);

// Significant policing events by year — shown as a caption while the timeline
// plays, so a viewer sees why a word surges (e.g. "everard" in 2021). Curated
// from the article's narrative spine; kept short so it reads at a glance.
const EVENTS = [
  { year: 2005, label: 'Killing of Jean Charles de Menezes at Stockwell underground station' },
  { year: 2008, label: 'Metropolitan Police Commissioner Ian Blair resigns following political pressure' },
  { year: 2009, label: 'Death of Ian Tomlinson at G20 protests; PC Simon Harwood under investigation' },
  { year: 2011, label: 'England riots and shooting of Mark Duggan; phone-hacking scandal rocks the Met' },
  { year: 2012, label: 'Hillsborough panel confirms cover-up; elected Police and Crime Commissioners; “Plebgate”' },
  { year: 2014, label: 'Stop-and-search powers reformed following review' },
  { year: 2015, label: 'Public confidence in the police reaches its peak (ONS Crime Survey)' },
  { year: 2017, label: 'Terror attacks including Manchester Arena and London Bridge; Grenfell Tower fire' },
  { year: 2020, label: 'Murder of George Floyd sparks UK protests and renewed scrutiny of policing' },
  { year: 2021, label: 'Murder of Sarah Everard by serving Metropolitan Police officer Wayne Couzens' },
  { year: 2022, label: 'Charing Cross sexism and racism scandal; Child Q strip-search inquiry; David Carrick serial rape convictions' },
  { year: 2023, label: 'Casey Review finds the Metropolitan Police institutionally racist, misogynistic and homophobic' },
  { year: 2024, label: 'Vetting and misconduct reforms; record 695 officer dismissals' },
];

// Word as it should READ in the cloud: apply display casing, else capitalise the
// first letter so every word reads as a proper, capitalised token.
const displayLabel = (term) => WORD_DISPLAY[term] || (term.charAt(0).toUpperCase() + term.slice(1));

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src/content/perception');
const IMG = join(ROOT, 'public/images/perception');
const PUB = join(ROOT, 'public');

const W = 820;
const H = 460;
const MIN_FONT = 12;
const MAX_FONT = 66;
const MAX_WORDS = 40;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Single neutral ink for every word — the sentiment red/green colouring was
// removed (it added noise and a colourblind hazard; the Sentiment view carries
// the positive/negative story instead).
function tint() {
  return '#44423d';
}

// Greedy Archimedean-spiral placement with rectangle overlap tests.
function layout(words, maxRate) {
  const placed = [];
  const cx = W / 2;
  const cy = H / 2;
  for (const w of words) {
    const label = displayLabel(w.term);
    const size = Math.round(MIN_FONT + (MAX_FONT - MIN_FONT) * Math.sqrt(Math.min(1, w.ratePer10k / (maxRate || 1))));
    const wd = label.length * size * 0.56;
    const ht = size * 1.02;
    let placedOk = false;
    for (let t = 0; t < 2400; t += 1) {
      const angle = 0.35 * t;
      const radius = 4 + 3.2 * angle;
      const x = cx + radius * Math.cos(angle) - wd / 2;
      const y = cy + radius * Math.sin(angle) - ht / 2;
      if (x < 4 || y < 4 || x + wd > W - 4 || y + ht > H - 4) continue;
      const box = { x, y, w: wd, h: ht };
      if (placed.some((p) => !(box.x + box.w < p.x || p.x + p.w < box.x || box.y + box.h < p.y || p.y + p.h < box.y))) continue;
      placed.push({ ...box, label, size, fill: tint() }); // single neutral ink; render the display label
      placedOk = true;
      break;
    }
    if (!placedOk) continue;
  }
  return placed;
}

function svgFor(year, facet, facetData, maxRate, sample) {
  const words = (facetData.topWords || []).filter((w) => isShown(w.term)).slice(0, MAX_WORDS);
  const placed = layout(words, maxRate);
  const tags = placed
    .map(
      (p) =>
        `<text x="${(p.x + p.w / 2).toFixed(1)}" y="${(p.y + p.h * 0.78).toFixed(1)}" font-size="${p.size}" fill="${p.fill}" text-anchor="middle" font-family="Georgia, serif">${esc(p.label)}</text>`
    )
    .join('\n  ');
  const watermark = sample
    ? `<text x="${W - 8}" y="${H - 8}" text-anchor="end" font-size="11" fill="#b08968" font-family="system-ui, sans-serif">illustrative sample</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Word cloud of ${esc(FACET_LABELS[facet])} coverage in ${year}">
  <rect width="${W}" height="${H}" fill="#faf8f3"/>
  ${tags}
  ${watermark}
</svg>
`;
}

async function main() {
  let index;
  try {
    index = JSON.parse(await readFile(join(SRC, 'index.json'), 'utf8'));
  } catch {
    console.error('No src/content/perception/index.json — run `npm run build-perception` first.');
    process.exit(1);
  }
  const maxRate = index.maxima?.wordRate || 1;

  await mkdir(IMG, { recursive: true });
  const yearFiles = (await readdir(SRC)).filter((f) => /^\d{4}\.json$/.test(f)).sort();

  const bundleYears = [];
  for (const file of yearFiles) {
    const data = JSON.parse(await readFile(join(SRC, file), 'utf8'));
    const { year, facets, provenance, forceBreakdown } = data;
    for (const facet of FACETS) {
      const svg = svgFor(year, facet, facets[facet], maxRate, provenance.sample);
      await writeFile(join(IMG, `${year}-${facet}.svg`), svg);
    }
    // Pre-filter the bundle's words to the allowlist so the client's race/list
    // show only policing-meaningful words (the SVGs above already do). Entities and
    // sentiment/lexicon aggregates are untouched.
    const shownFacets = {};
    for (const f of FACETS) {
      shownFacets[f] = { ...facets[f], topWords: (facets[f].topWords || []).filter((w) => isShown(w.term)) };
    }
    // Per-force data is client-rendered (no SVGs) — carried in the bundle only.
    bundleYears.push({ year, provenance, facets: shownFacets, forceBreakdown: forceBreakdown ?? null });
  }

  // Social-media overlay (hand-curated context.json), if present.
  let context = null;
  try {
    context = JSON.parse(await readFile(join(SRC, 'context.json'), 'utf8'));
  } catch {}

  // The "London: narrative vs reality" data is held back from the public bundle
  // until its narrative series is real scraped/metadata research rather than the
  // illustrative index. Keep this in sync with `showLondon` in
  // src/components/perception/PerceptionExplorer.astro — both gate on the same
  // env var so the tab and its data are published together, or not at all. The
  // curated data stays in context.json (source of truth) either way.
  const SHOW_LONDON = process.env.PUBLIC_PERCEPTION_LONDON === 'true';
  if (context && context.london && !SHOW_LONDON) {
    delete context.london;
    console.log('  london: held back from bundle (set PUBLIC_PERCEPTION_LONDON=true to include)');
  }

  const bundle = {
    methodologyVersion: index.methodologyVersion,
    maxima: index.maxima,
    sample: index.sample,
    facetLabels: FACET_LABELS,
    forces: FORCES.map((f) => ({ id: f.id, name: f.name })), // registry for the force selector
    sentimentLemmas: { positive: POS_LEMMA, negative: NEG_LEMMA },
    wordDisplay: WORD_DISPLAY,
    wordHide: [...HIDE_WORDS],
    events: EVENTS,
    years: bundleYears,
    context,
  };
  await writeFile(join(PUB, 'perception-data.json'), JSON.stringify(bundle) + '\n');

  console.log(`Wrote ${yearFiles.length * FACETS.length} SVG clouds → public/images/perception/ and public/perception-data.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
