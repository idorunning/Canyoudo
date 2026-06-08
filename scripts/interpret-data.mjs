#!/usr/bin/env node
// Read the committed police-data snapshot and ask Claude to interpret it into a
// short, careful "findings" page in the More or Less spirit — naming the trap in
// each number rather than just restating it. Writes src/content/policedata/
// findings.json, which /data/findings renders with an AI-generated disclaimer.
//
// Runs after fetch-police-data.mjs in .github/workflows/police-data.yml. Needs
// ANTHROPIC_API_KEY; if it's absent the script exits 0 without writing, so the
// pipeline still succeeds before the key is configured.
//
// The model only ever sees aggregate counts — never personal records — and its
// output is published clearly labelled as an unreviewed draft.

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'src/content/policedata');
const MODEL = 'claude-opus-4-8';
const MODEL_LABEL = 'Claude Opus 4.8';

if (!process.env.ANTHROPIC_API_KEY) {
  console.log('No ANTHROPIC_API_KEY set — skipping findings generation.');
  process.exit(0);
}

let Anthropic;
try {
  ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
} catch {
  console.error('@anthropic-ai/sdk is not installed. Run: npm install --no-save @anthropic-ai/sdk');
  process.exit(1);
}

const readJSON = async (p) => JSON.parse(await readFile(join(DIR, p), 'utf8'));

const national = await readJSON('national.json');
const crime = await readJSON('crime.json').catch(() => null);
const forceFiles = (await readdir(join(DIR, 'forces'))).filter((f) => f.endsWith('.json'));
const forces = await Promise.all(forceFiles.map((f) => readJSON(`forces/${f}`)));

// Build a compact, aggregate-only digest for the model. Keep it bounded — top
// forces and a trimmed national breakdown are enough to reason from.
const top = (arr, n = 6) => arr.slice(0, n);
const forcesRanked = forces
  .filter((f) => f.stopSearch?.window)
  .map((f) => ({
    name: f.name,
    months12: f.stopSearch.window.total,
    latest: f.stopSearch.latest?.total ?? null,
    latestFindRate: f.stopSearch.latest?.findRate ?? null,
  }))
  .sort((a, b) => b.months12 - a.months12);

const digest = {
  datasetMonth: national.provenance.datasetMonth,
  windowMonths: national.provenance.windowMonths,
  national: {
    latest: national.stopSearch.latest,
    monthlySeries: national.stopSearch.series,
    window: {
      total: national.stopSearch.window.total,
      byOfficerEthnicity: national.stopSearch.window.byOfficerEthnicity,
      byObjectOfSearch: top(national.stopSearch.window.byObjectOfSearch),
      byOutcome: top(national.stopSearch.window.byOutcome),
    },
  },
  forcesReportingCount: national.forcesCount - national.forcesMissing.length,
  forcesMissingLatestMonth: national.forcesMissing,
  topForcesBy12moVolume: top(forcesRanked, 10),
  cities: (crime?.places ?? []).map((p) => ({
    name: p.name,
    latestMonth: p.latestMonth,
    latestTotal: p.latestTotal,
    topCategories: top(p.byCategory, 5),
    topOutcomes: top(p.byOutcome, 5),
    monthlySeries: p.series,
  })),
};

const SYSTEM = `You are writing a short data-reading column for "Thinking About Policing", a UK policing and public-policy site, in the explicit spirit of BBC Radio 4's "More or Less": numerate, sceptical, fair, and allergic to the misleading use of statistics.

Your job is to read this month's UK police data (from data.police.uk, England & Wales plus British Transport Police, under the Open Government Licence) and surface what it genuinely shows — while naming the trap in each number.

Hard rules:
- Use ONLY the figures provided. Do not invent numbers, rates, or comparisons not derivable from the data. Quote specific figures you reference.
- Never claim causation from these counts. "Rose"/"fell" describe the recorded figure, not the underlying reality.
- Stop & search shares by ethnicity are NOT disproportionality: there is no population denominator here, so do not call any group "over-" or "under-searched". You may note the raw shares and explain precisely why they cannot answer the disproportionality question.
- The latest month is routinely incomplete (some forces file late). Treat the rolling 12-month window as the steadier picture and say so.
- Locations for crime are anonymised/snapped; city points are busy central squares, not whole cities.
- British understatement over drama. No sensationalism. UK English.
- You are not a human editor's final word; write as a careful first draft.

Write a headline, a one-paragraph summary, 4 to 6 findings (each a specific, number-grounded observation that also teaches how to read it), and 3 to 5 plain caveats.`;

const PROMPT = `Here is this month's aggregate data (counts only):\n\n${JSON.stringify(digest, null, 2)}\n\nWrite the findings.`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    headline: { type: 'string' },
    summary: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { title: { type: 'string' }, body: { type: 'string' } },
        required: ['title', 'body'],
      },
    },
    caveats: { type: 'array', items: { type: 'string' } },
  },
  required: ['headline', 'summary', 'items', 'caveats'],
};

const client = new Anthropic();

console.log(`Generating findings for ${digest.datasetMonth} (${digest.windowMonths}mo window) with ${MODEL}…`);
const stream = client.messages.stream({
  model: MODEL,
  max_tokens: 16000,
  thinking: { type: 'adaptive' },
  output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
  system: SYSTEM,
  messages: [{ role: 'user', content: PROMPT }],
});
const message = await stream.finalMessage();

const text = message.content.find((b) => b.type === 'text')?.text;
if (!text) throw new Error('No text block in model response.');
const parsed = JSON.parse(text);

const findings = {
  kind: 'findings',
  provenance: national.provenance,
  generatedAt: new Date().toISOString(),
  model: MODEL_LABEL,
  headline: parsed.headline,
  summary: parsed.summary,
  items: parsed.items,
  caveats: parsed.caveats,
};
await writeFile(join(DIR, 'findings.json'), JSON.stringify(findings, null, 2) + '\n');
console.log(`Wrote findings.json: "${findings.headline}" (${findings.items.length} findings).`);
