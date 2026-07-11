// Validate every article's Practical Summary against its own body.
//
// The summary's hard rules are "only evidence in the article — nothing new"
// and "a briefing for senior leaders, not an essay". So beyond shape checks
// the validator enforces provenance — every source URL in a summary must
// already appear in that article's body text — and brevity, as hard length
// caps. Run with `npm run validate:summaries`; exits non-zero listing every
// offence.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';

const ARTICLES_DIR = new URL('../src/content/articles/', import.meta.url).pathname;

// Brevity caps (characters). Deliberately tight: the card must read in a
// minute, and the caps are what keep future edits from creeping back to
// essay length.
const MAX_PROBLEM = 300;
const MAX_POINT = 250;
const MAX_ACTION = 160;
const MAX_BENEFIT = 220;

// Normalise a URL enough to compare "the same link" across small formatting
// differences: scheme casing, trailing slash, and #fragments.
function normaliseUrl(raw) {
  try {
    const u = new URL(raw.trim());
    u.hash = '';
    let s = u.toString();
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s.toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

// Pull every http(s) URL out of the article body — inline links, footnote
// definitions and "Sources and further reading" bullets all serialise to
// plain URLs in the raw markdown.
function bodyUrls(body) {
  const found = new Set();
  for (const m of body.matchAll(/https?:\/\/[^\s)\]>"'`]+/g)) {
    // Markdown link syntax can leave trailing punctuation on a bare match.
    found.add(normaliseUrl(m[0].replace(/[.,;:]+$/, '')));
  }
  return found;
}

const files = (await readdir(ARTICLES_DIR)).filter((f) => /\.(md|mdx)$/.test(f));
const errors = [];
const warnings = [];
let withSummary = 0;

for (const file of files.sort()) {
  const raw = await readFile(path.join(ARTICLES_DIR, file), 'utf8');
  let parsed;
  try {
    parsed = matter(raw);
  } catch (e) {
    errors.push(`${file}: frontmatter failed to parse — ${e.message}`);
    continue;
  }

  if (parsed.data.evidenceBriefing) {
    errors.push(`${file}: carries a stale evidenceBriefing block — replace it with practicalSummary`);
  }

  const summary = parsed.data.practicalSummary;
  if (!summary || !summary.problem) continue; // optional; blank counts as absent
  withSummary++;

  const where = (msg) => errors.push(`${file}: ${msg}`);
  const capped = (label, value, cap) => {
    if (typeof value === 'string' && value.trim().length > cap) {
      where(`${label} is ${value.trim().length} chars (cap ${cap}) — trim it`);
    }
  };

  if (typeof summary.problem !== 'string' || !summary.problem.trim()) {
    where('problem must be a non-empty string');
  }
  capped('problem', summary.problem, MAX_PROBLEM);

  const evidence = Array.isArray(summary.evidence) ? summary.evidence : [];
  const outcomes = Array.isArray(summary.outcomes) ? summary.outcomes : [];
  if (evidence.length < 1 || evidence.length > 3) {
    where(`evidence must have 1-3 points — only the strongest (has ${evidence.length})`);
  }
  if (outcomes.length < 1 || outcomes.length > 3) {
    where(`outcomes must have 1-3 if/then entries (has ${outcomes.length})`);
  }

  const urls = bodyUrls(parsed.content);
  let linked = 0;
  evidence.forEach((item, i) => {
    if (!item || typeof item.point !== 'string' || !item.point.trim()) {
      where(`evidence[${i}].point must be a non-empty string`);
      return;
    }
    capped(`evidence[${i}].point`, item.point, MAX_POINT);
    if (item.url) {
      linked++;
      const norm = normaliseUrl(item.url);
      // The set covers small formatting drift (trailing slash, #fragment);
      // the raw substring check covers what the extractor's regex can't —
      // site-relative links and URLs containing parentheses.
      if (!urls.has(norm) && !parsed.content.includes(item.url.trim())) {
        where(`evidence[${i}].url is not cited in the article body: ${item.url}`);
      }
    }
  });
  // A summary should link its evidence, but some articles honestly can't —
  // e.g. their only body URLs are photo credits, and misattributing one as a
  // source would break the harder provenance rule. Advise, don't fail.
  if (evidence.length > 0 && linked === 0 && urls.size > 0) {
    warnings.push(`${file}: no evidence point carries a source URL (labels-only)`);
  }

  outcomes.forEach((o, i) => {
    if (!o || typeof o.action !== 'string' || !o.action.trim()) {
      where(`outcomes[${i}].action must be a non-empty string`);
      return;
    }
    if (typeof o.benefit !== 'string' || !o.benefit.trim()) {
      where(`outcomes[${i}].benefit must be a non-empty string`);
      return;
    }
    capped(`outcomes[${i}].action`, o.action, MAX_ACTION);
    capped(`outcomes[${i}].benefit`, o.benefit, MAX_BENEFIT);
    // Rendered as "If we {action}, {benefit}" — the action must read on from
    // "If we" (lowercase start, no leading "If we" of its own).
    if (/^if\s+we\b/i.test(o.action.trim())) {
      where(`outcomes[${i}].action must not start with "If we" — the card adds it`);
    }
    if (/^[A-Z]/.test(o.action.trim())) {
      where(`outcomes[${i}].action should start lowercase — it completes "If we …"`);
    }
  });
}

console.log(`validate-summaries: ${withSummary}/${files.length} articles carry a practical summary`);
for (const w of warnings) console.warn(`  warn: ${w}`);
if (errors.length) {
  console.error(`validate-summaries: ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('validate-summaries: all summaries valid');
