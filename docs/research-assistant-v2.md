# Research Assistant v2 — design

Status: **phase 1 built** (June 2026) — cited evidence answers, the monthly
budget guard (`AI_BUDGET_LIMIT_USD`, default $110) and the durable edge cache
are live; one manual step remains: set the ~$120 workspace spend limit in the
Anthropic Console. Phases 2–3 are still proposals. The design covers the next
generation of /research, shaped by four priorities: real answers to plain-English
questions, smarter search, better saved papers, and a hard cost ceiling.
The governing principle throughout: **sources and evidence are king** — the
assistant never gets to say anything it cannot pin to a retrieved paper.

## What v1 does today (recap)

- Search across OpenAlex (free, default), policing journals (OpenAlex subset),
  Semantic Scholar and CORE (each behind a free key), one source at a time.
- A regex lexicon (`isPolicingRelevant`) prunes off-topic results.
- AI assist: a question is translated to a scholarly query (Sonnet), and the
  top-8 results get a 2–3 sentence overview (Haiku). Both cached in Netlify
  Blobs; repeat questions cost nothing.
- Saved papers via Supabase: star, one folder per paper, notes, RIS export.
- Everything degrades gracefully: no key → feature absent; AI down → search
  still works.

## Guiding constraints (unchanged in v2)

- OpenAlex search stays free and keyless — no account ever required to search.
- AI failure or budget exhaustion degrades to plain search, never blocks it.
- All fetched data rendered via `createElement`/`textContent`, never `innerHTML`.
- Blobs caching keyed on input hash + prompt version; bumping the version
  invalidates cleanly.

---

## Phase 1 — Cited answers + the £100 cap (~3 days)

### 1.1 Ask-a-question, get an evidence answer with references

The headline feature. Ask "does extra patrol cut burglary?" and instead of just
a result list plus a two-line overview, you get a short synthesized answer in
which **every claim carries a numbered citation** `[1]`…`[n]`, followed by a
reference list of the actual retrieved papers.

**The anti-hallucination design move:** the model never writes references.
It only ever emits bracketed indices pointing at the numbered abstracts we gave
it. The reference list is built deterministically, client-side, from the real
Work objects (reusing `formatReferenceList` in `src/lib/reference-format.mjs`).
A fabricated reference is therefore structurally impossible — the worst
remaining failure is *mis-attribution* (citing paper 3 for something paper 5
said), which an optional LLM verification pass could catch later (explicitly
deferred, noted at the end).

Mechanics:
- New `mode: 'answer'` in `netlify/functions/research-assist.mts` (reusing its
  existing cache/validation plumbing):
  `{ mode:'answer', question, items:[{title,authors,year,venue,abstract}] }` (top **10** results)
  → `{ answer: "markdown with [n] markers", used:[1,2,5], caveat, confidence:'strong'|'mixed'|'thin' }`
- Model: **Sonnet 4.6** (same as translate), `max_tokens: 1200`. New
  `ANSWER_SYSTEM` prompt in `src/lib/research-assist-prompts.ts` (bump
  `ASSIST_PROMPT_VERSION`): answer ONLY from the numbered studies; every claim
  cites `[n]`; every paragraph must contain at least one citation; if the
  studies can't answer the question, say so plainly; UK English; 150–300 words.
- Server validation: extract all `[n]` markers; any index outside `1..items.length`
  is stripped (fail the response only if zero valid citations remain). Default
  caveat: "Synthesised from the abstracts of the studies listed below — not a
  systematic review. Read the studies."
- UI: when the search came from a question, the answer panel replaces the Haiku
  overview (which stays for keyword searches). `[n]` renders as superscript
  links that scroll to the numbered reference and its result card.
- Cost: ~$0.03–0.05 per uncached answer; identical question over identical
  results is a free cache hit.

### 1.2 The hard £100/month cap — two belts

1. **Anthropic Console workspace spend limit** (the true hard stop, zero code):
   put this site's API key in its own workspace and set the monthly spend limit
   to ~$120 (≈ £95 plus headroom so the in-code cap below trips first). When it
   trips, API calls fail and the existing graceful-degradation catch already
   handles it.
2. **In-code soft cap** — new shared module `netlify/functions/lib/ai-budget.mts`
   used by `research-assist.mts` AND `interpret.mts` (the crime dashboard):
   - Blobs store `ai-budget`, key `YYYY-MM`, value `{ estimatedUsd }`.
   - After each successful call, add the actual cost computed from the SDK's
     `response.usage` token counts × a small per-model price table.
   - Before each call, if the month's total ≥ **$110** (≈ £88), return a
     friendly 503: *"The assistant has used its monthly budget — back next
     month. Search still works."* Cache hits never touch the budget.

### 1.3 Longer edge cache for /api/research

Add `Netlify-CDN-Cache-Control: public, durable, s-maxage=86400,
stale-while-revalidate=604800` (browser stays at 5 min). Repeat queries are
served from the durable edge cache for up to a week while revalidating —
fewer upstream hits, which matters once phase 2 fans out to all sources.

---

## Phase 2 — Search all sources at once, deduplicated (~2–3 days)

- **New source option "All sources", made the default.** Fans out to OpenAlex +
  Semantic Scholar + CORE concurrently (`Promise.allSettled`, existing 10s
  timeouts; sources without keys are skipped, so keyless deploys quietly remain
  OpenAlex-only). A failed source is simply absent, never fatal. The
  policing-journals facet stays a separate explicit choice.
- **Dedup/merge** in a new pure, unit-testable module `src/lib/research-merge.mjs`:
  - Key: normalized DOI; fallback normalized title + year.
  - Keep the richest record (longest abstract, then TL;DR presence, then
    citation count); fill gaps field-by-field (TL;DR from Scholar, best OA/PDF
    link, max citedBy). Track provenance: `sources: ['openalex','scholar']`.
  - Papers found by 2+ sources rank first (independent corroboration), then
    upstream relevance order, citations as tiebreak.
- **Provenance badges** on result cards ("OpenAlex · S2 · CORE").
- **Pagination**: page p fetches page p from each source; the client drops
  already-shown papers (it tracks shown keys). "More results" may return fewer
  than 10 net-new items — accepted; totals display as "about N results".
- **Relevance filter**: the regex lexicon stays (free, instant, already tuned).
  Design seam: route it through a single `relevanceFilter(works)` function so a
  cheap Haiku batch-classification "rescue pass" for borderline cases can slot
  in later if real misses show up. Not built until there's evidence it's needed.

No model calls in this phase — zero cost impact.

---

## Phase 3 — Saved papers v2 (~2–4 days)

- **Multi-folder**: new Supabase junction table `paper_folders (paper_id,
  folder_id, user_id)` with owner-only RLS, backfilled from the current
  `folder_id` column (kept temporarily for rollback). The folder dropdown on a
  saved card becomes a checkbox popover ("Folders ▾"), so one paper can sit in
  several research aims.
- **Search within saved papers**: pure client-side filter input (title /
  authors / venue / year / note) — the saved set is already in memory.
- **Evidence brief export**: on any folder, one click → `mode:'brief'` (same
  citation-index contract, validation, cache and budget guard as phase 1;
  Sonnet, `max_tokens: 2000`, ≤15 papers): *what the evidence says / strength
  and gaps / practical implications*, every claim cited `[n]`, your own notes
  passed in and attributed. Client assembles brief + locally-generated
  `## References` and downloads it as Markdown (same pattern as the existing
  .ris export). ~$0.05–0.08 per uncached brief.

Migration SQL gets appended to `docs/google-login-setup.md` as an appendix,
matching the existing four-policy RLS pattern.

---

## Rollout summary

| Phase | Ships | Effort | Cost impact |
|---|---|---|---|
| 1 | Cited answers, £100 cap (Console + code), durable edge cache | ~3 days | answers ~$0.03–0.05 each, capped $110/$120 |
| 2 | All-sources search, dedup, provenance badges | ~2–3 days | none |
| 3 | Multi-folder, saved search, evidence briefs | ~2–4 days | briefs ~$0.05–0.08 each, same cap |

Each phase ships independently and degrades independently: budget exhausted →
answers/briefs pause, search unaffected; one source down → merged search
shrinks; Supabase down → search and answers unaffected.

## Deferred (noted, not in v2)

- **LLM verification pass** on answers/briefs (a second cheap model call that
  checks each cited claim against the cited abstract and flags mismatches).
  The index-citation design already prevents invented references; this would
  additionally catch mis-attribution. Revisit once answers are in use and the
  budget headroom is known.
- Embedding-based relevance ranking; webhook-fed alerts ("new papers matching
  your saved searches"); shared/public folders.
