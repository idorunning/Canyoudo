# Research Assistant v3 — the briefing redesign

Status: **built** (June 2026). One manual step: run the `briefings` table
migration in the Supabase SQL editor (Part 4⅞ of docs/google-login-setup.md) —
until then briefings generate and display but can't be saved or shared.

The governing principle is unchanged: **sources and evidence are king** — the
assistant never says anything it cannot pin to a retrieved paper.

## Added since v3 — more catalogues (June 2026)

The source layer (`src/lib/research-sources.mjs`) gained three keyless
catalogues and an open-access enrichment step, all behind the same adapter
pattern (`buildXUrl` + `mapXWork`):

- **Crossref** (`crossref`) and **Europe PMC** (`europepmc`) — scholarly,
  keyless, so they're always available and join the merged "All sources"
  fan-out alongside OpenAlex/Scholar/CORE. Europe PMC is strong on
  health-adjacent CJ topics (violence, drugs, mental-health crisis).
- **GOV.UK Search** (`govuk`) — UK official / grey literature (Home Office,
  HMICFRS, College of Policing, statistics) the journal sources miss. It stays
  a *standalone* source rather than joining the scholarly merge: its records
  carry no DOI, citations or peer-review status to corroborate against.
- **Unpaywall enrichment** — not a source. When a result has a DOI but no
  free-copy link, `enrichOa` in `netlify/functions/research.mjs` asks Unpaywall
  for the best open-access copy (bounded to the page, best-effort, gated on
  `UNPAYWALL_EMAIL`). Without the env var it's simply skipped.

Because the new scholarly sources need no key, the merged search now leads even
on a keyless deploy. New optional env: `CROSSREF_MAILTO`, `UNPAYWALL_EMAIL`.

## What changed from v2

v2 was *search-first*: type a query, get results plus an optional cited answer.
v3 makes the tool *problem-first* and gates it behind sign-in:

- **State a problem, get a briefing.** You describe a problem to solve; the
  assistant decomposes it into ~3 distinct search angles, searches the open
  record from each, curates the strongest 12–15 studies, and writes a
  four-section evidence briefing — *The problem / What the evidence says /
  Strength and gaps / Next steps and ideas to try* — every claim cited `[n]`.
- **Briefing is the primary flow.** The original keyword/question search stays
  as a secondary "Just search" mode behind a toggle.
- **The whole tool is behind sign-in**, but logged-out visitors get a marketing
  landing (how it works + a worked example + sign-in) to encourage sign-up.
- **Briefings save to your account and get a read-only share link.**

## Architecture

Client-side orchestration, like the existing translate→search→answer flow in
`main.ts` — each step calls an existing short endpoint, so it stays inside the
10s function limit and reuses the Blobs cache and monthly budget guard with no
new infrastructure.

```
plan      POST /api/research-assist {mode:'plan'}      Sonnet  problem → framing + 3 angles
search    GET  /api/research?source=all&q=…            (free)  one merged search per angle
curate    src/lib/briefing-curate.mjs                  (free)  cross-angle dedup → 12–15 studies
briefing  POST /api/research-assist {mode:'briefing'}  Sonnet  studies → cited four-section briefing
```

Curation is **deterministic** (no model re-rank): `mergeWorks` already ranks by
corroboration → upstream position → citations; `curate()` round-robins across
the angles for topical coverage, dedups via `workMergeKey`, and slices to 15.
The seam is there for a cheap model re-rank later if real misses appear.

### Adaptive search depth (the self-adapting scale)

The search step scales itself to the difficulty of the problem. It begins with
one free-to-read page per angle; if that curates to fewer than `TARGET_STUDIES`
(12) it escalates down a fixed ladder — further result pages first, then beyond
free-to-read — re-curating after each step until the evidence base is healthy or
the ladder is spent (`ESCALATION_STEPS` in `briefing.ts`). Easy problems stop
after the first pass; hard ones automatically search deeper and pull in more
sources. Because catalogue searches are free and edge-cached, this costs only a
little latency and **no extra AI spend** — `plan` and `briefing` still run once
each. There is no user-facing knob: the scale is automatic.

### Citation safety (unchanged contract)

The briefing model is shown ONE numbered list of the curated studies and may
only emit `[n]` indices into it. The reference list *is* the numbered study
cards, built client-side from the real `Work` objects — an invented reference
is impossible by construction, and out-of-range markers are stripped server-side
(`sanitizeCitations`). The shared read-only view re-validates `used` against the
stored studies on display, so a tampered public row can't link past them.

### Gating (static site, client-side auth)

The page ships three regions toggled by the `hidden` attribute: a default-visible
**landing**, a **tool** (hidden until the Supabase session resolves), and a
read-only **shared** view (`/research?b=<token>`, checked ahead of the gate). A
tiny inline `<head>` script pre-hides the landing and shows a skeleton when an
auth token is in `localStorage`, so a returning signed-in reader sees
skeleton→tool rather than a marketing flash.

### Saving + sharing

New `briefings` table (owner-only RLS, plus an anon "read unlisted only" policy).
A row stores the markdown, the valid citation indices and the curated `Work[]`
(`references_`), so the shared view renders identically with no AI/catalogue
call. Sharing is capability + flag: an unguessable 128-bit `share_token` is the
link; `visibility` (default `private`) is the kill switch — "Copy share link"
flips it to `unlisted`, "Make private again" revokes.

## Cost

~$0.05–0.07 per uncached briefing (plan + synthesis; searches and curation are
free). A repeated identical problem is effectively free — plan cache hit,
edge-cached searches, deterministic curation → identical synthesis input →
synthesis cache hit. The budget guard runs before each uncached AI call and
degrades gracefully (over budget → the curated studies still show).

## Files

- `src/lib/research-assist-prompts.ts` — `PLAN_SYSTEM`; the depth scale
  (`BRIEFING_LOW/MID/HIGH_SYSTEM`, `BRIEFING_SYSTEMS`, `BRIEFING_MAX_TOKENS`);
  `ASSIST_PROMPT_VERSION` bumped to `v6`.
- `netlify/functions/research-assist.mts` — `plan` + `briefing` modes.
- `src/lib/briefing-curate.mjs` — pure curation (tests/briefing-curate.test.mjs).
- `src/scripts/research/briefing.ts` — pipeline orchestrator + renderer.
- `src/scripts/research/briefings-store.ts` — Supabase save/list/share/load.
- `src/scripts/research/citation-render.ts` — shared `[n]`/reference rendering.
- `src/scripts/research/main.ts` — gating, shared route, mode toggle, wiring.
- `src/pages/research.astro` — landing / tool / shared regions.
- `docs/google-login-setup.md` — Part 4⅞ `briefings` migration.

## Deferred

Same as v2 (LLM verification pass, embedding relevance, alerts), plus: a "My
briefings" list view (the store's `listBriefings` is ready for it), and an
optional Haiku curation re-rank if deterministic curation proves too blunt.
