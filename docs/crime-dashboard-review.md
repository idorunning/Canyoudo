# Crime Dashboard review — code, AI tiering, data and language

Status: **review → implemented** (July 2026). Phases 1–4 of §6 are built on
this branch — see the phase-by-phase commits, docs/police-database.md (the
force briefing, population seeds) and the deferred list at the end of §6.

A full review of the Crime Dashboard in the
spirit of `design-and-language-review.md`, with the research assistant
(`research-assistant-v4.md`) as the explicit benchmark: that tool now lets
**the job drive the machinery** — no model for search, a mid-tier model for
the overview, the deepest reasoning tier (streamed, on an edge function) for
the review. The brief for this pass: review the dashboard's code, apply the
same tiered-model thinking, and find what would make it a tool practitioners
and analysts actually reach for.

The short version: the foundations are genuinely good — the caveat
discipline, the budget guard, the caching, the voice. But the dashboard is
three half-merged products wearing one name, its AI runs on a two-tier ladder
the research assistant has already outgrown, its charts stop one step short
of what an analyst needs (no rates, no axes, no export, no comparison), and
a handful of real bugs make the numbers on screen and the numbers in the AI
reading quietly disagree.

---

## 1. What the dashboard is today

Three layers, built at different times, joined by redirects:

| Layer | Where | Data | AI |
|---|---|---|---|
| **Dashboard pane** | `/research` (tab) | committed snapshot (`policedata` collection + `recorded-crime.json`), latest month | `/api/interpret` — national reading, chat |
| **Crime Data Explorer** | `/data/explore` → `crime`, `disproportionality`, `neighbourhood`, `coverage` | Supabase rollups (36 months), request time | `/api/db-interpret` — per-force reading |
| **Legacy pages** | `/data/force/[id]`, `/data/lookup` | snapshot + live data.police.uk | `/api/interpret` — force/area reading, chat |

And two parallel AI stacks: `interpret.mts` (snapshot) and `db-interpret.mts`
(database), each with its own digest builder, its own charge-rate arithmetic,
and (in `interpret.mts`) its own private copy of the stream writer.

This structure is the root of most of what follows. It isn't wrong — the
snapshot keeps the site alive when Supabase is down, and the DB adds depth
the snapshot can't hold — but the seams show: to a visitor, "Crime
Dashboard" means the `/research` tab, the breadcrumb root `/data` (a page
that says "moved" and auto-redirects after 3 seconds), *and* the explorer
suite, depending on where they're standing.

---

## 2. Code review findings

Ordered by severity. File references are to the current tree.

### 2.1 The chart and the AI reading disagree on the justice gap (bug)

Two regexes define "charged/sanctioned", and they've drifted:

- `netlify/functions/police-db.mts:27` — `CHARGED = /charged|caution|community resolution|penalty notice|summons|out-of-court/i`
- `netlify/functions/db-interpret.mts:45` — `/charged|caution|community resolution|penalty notice|summons/i` (no `out-of-court`)

So the justice-gap line on `/data/crime` and the "chargedShare" the model is
handed are computed from different outcome sets. Out-of-court disposals are a
meaningful slice of outcomes; the model can be narrating a charge rate that
visibly doesn't match the chart above it. On a site whose whole promise is
"every figure read carefully", this is the worst kind of bug — silent,
plausible, and it undermines the AI reading precisely where it claims
authority.

**Fix:** one exported classifier (e.g. `classifyOutcome()` in
`src/lib/police-db.ts` next to the row types), imported by both functions,
with a unit test pinning the categories — the same single-source-of-truth
move `personas.ts` already makes for prompts.

### 2.2 "Where crime concentrates" ignores the chosen force (bug)

`lsoaHotspots()` (`src/lib/police-db.ts:62`) takes no force parameter, and
`/data/crime` fetches `view=hotspots` without one (`crime.astro:110`). Pick
Cumbria in the force selector and the hotspots chart still shows the
national top LSOAs — which for any small force means a list of London
neighbourhoods under a heading implying local concentration. `crime_lsoa_month`
doesn't carry `force_id`, so this needs an ingest/schema change (add
`force_id` to the rollup grain) or, until then, the chart should only render
for the England & Wales view with an honest label.

### 2.3 Interleaved readings when the force picker changes quickly (bug)

`streamInterpret` (`src/scripts/data/explorer.ts:83`) has no stale-response
guard: change the force twice and two streams race, both writing into the
same `[data-interpretation]` element — the reader watches two overviews
interleave. `PersonaInterpreter.astro:107` already solved this
(`reqPostcode === postcode` check before each write). Port the same
request-token guard into `streamInterpret`, and abort the superseded fetch
(`AbortController`) so the losing stream also stops billing tokens.

### 2.4 The accessibility the code promises isn't there

`explorer.ts:50–52` says the line chart ships "a readable value table folded
underneath for accessibility". It doesn't — the function renders a legend and
an SVG path, nothing else. There is also **no y-axis at all**: the justice-gap
chart plots fractions with no way to tell whether "no suspect identified"
sits at 40% or 80%. For the stated audience — analysts — an unlabelled axis
makes the chart decorative. Add min/max (or a few gridline) labels and the
promised `<details>` value table; both are small, dependency-free changes in
the existing style.

### 2.5 Every failure reads as "the database is still filling"

`crime.astro:133` and `disproportionality.astro:137` catch *any* error —
network failure, a 502 from a real query bug, a Supabase outage — and show
the empty-state copy ("The database is still filling — check back once the
first ingest has run."). That message is only true for one failure mode, and
it tells the site owner nothing. Distinguish the 503-not-configured /
genuinely-empty case from an actual error (the `fetchJson` helper already
surfaces the server's message) — the research assistant is scrupulous about
honest failure copy ("access vs transient", the save-failure rework); the
dashboard should match it.

### 2.6 Built but unwired: database-grounded chat

`db-interpret.mts` fully implements a POST chat path (question + history,
grounded in the same digest, streamed) — and **no page calls it**. `DataChat`
only posts to `/api/interpret`, and only the snapshot pages mount it. The
explorer pages — the ones with 36 months of data worth interrogating — have
no chat at all. Mounting `DataChat` on `/data/crime` and
`/data/disproportionality` with the endpoint (and scope/force) parameterised
is nearly free: the server side already exists.

### 2.7 The "over time" page's model can't see over time

The page is titled "Crime & outcomes over time" and charts 36 months, but
`buildDigest('crime-history')` (`db-interpret.mts:33–57`) hands the model
only a **latest-12-months** window: total, top categories, one charge/no-
suspect rate, plus `firstMonth`. The model literally cannot discuss the trend
it sits above — no year-on-year change, no direction per category, no
justice-gap movement. This is the cheapest, highest-value digest upgrade:

- per-category 12-month totals **vs the previous 12** (count + % change),
- yearly justice-gap rates (charged / no-suspect per 12-month block),
- total crime per 12-month block back to `firstMonth`.

Still aggregate-only, still a few hundred tokens — but the reading can then
say what moved, which is the whole point of the page.

### 2.8 Smaller things

- **Dead imports:** `monthLabel`, `pct` in `crime.astro:93`; `pct` in
  `disproportionality.astro:90`.
- **Duplicated stream writer:** `interpret.mts` carries its own
  `streamResponse` (`interpret.mts:112–147`) while `db-interpret.mts` uses the
  shared `src/lib/ai-stream.ts`. The edge function's private copy is justified
  (Deno, documented); this one isn't — converge on `ai-stream.ts`.
- **Find-rate percent hack:** `disproportionality.astro:127` rounds the rate
  into a fake count with `note: '%'` to reuse `barTable`. A first-class
  `format` option on `barTable` would read better and stop the note landing in
  the wrong typographic slot.
- **`scope=force` in db-interpret** builds a digest of just name +
  description + latest month — nothing interprets-worthy — and nothing calls
  it. Either feed it the force-profile numbers (`forcePeople`, `ssByMonth`)
  and use it on `/data/coverage`, or delete it.
- **Generic `aria-label="Trend chart"`** on every line chart
  (`explorer.ts:75`) — pass the real title through.

### 2.9 What's genuinely good (keep it)

Worth saying plainly, because the next sections propose change: the
**budget-guard + Blobs-cache + prompt-version** discipline is exactly right
and consistently applied; aggregate-only digests mean the model can't leak or
invent street-level detail; `MemberGate` holding the first billable call
until unlock is careful engineering; the shared `personas.ts` contract (one
source of truth for prompts, models, versioning) is the pattern the rest of
this review keeps asking to be reused; and the pure/testable split
(`police-csv.mjs`, `cache-key.mjs`) is why the ingest can be trusted.

---

## 3. AI model tiering — learning from the research assistant

### 3.1 Where the two tools stand

The research assistant's v4 principle: *the job drives the machinery.*

| | Research assistant | Crime dashboard today |
|---|---|---|
| No AI | Search (deterministic, works when budget is spent) | Charts and tables ✓ |
| Mid tier | Overview — Sonnet 4.6, one JSON call, `readFirst`, caveat | Standing reading — Opus 4.8 (`CACHED_MODEL_DEFAULT`), effort **low**, cached per month |
| Live tier | — | Chat + postcode — Haiku 4.5 |
| Deep tier | **Review — Sonnet 5, effort high, streamed on an edge function, fixed headings, evidence table, confidence line, PDF** | *(nothing)* |

Two observations fall out:

1. **The dashboard's tiers are inverted on effort.** The cached standing
   reading runs the *most careful model* (Opus 4.8) at the *lowest effort*
   (`modelParams` defaults to `'low'`; neither interpret function passes
   anything else). Cached-per-month is exactly where extra thinking is
   nearly free — it amortises across every reader for a month. The research
   assistant already made this exact move for the review. The standing
   readings (national, per-force, crime-history, disproportionality) should
   run at `effort: 'medium'` at least; chat and live postcode stay fast on
   Haiku.

2. **The dashboard has no deep end at all.** The research assistant's most
   valuable output — the thing practitioners download and circulate — is the
   two-page briefing. The dashboard's equivalent reader (an analyst preparing
   for a tasking meeting, a neighbourhood inspector writing a problem
   profile, a journalist checking a force) gets a 400-word conversational
   overview and nothing deeper. That's the gap the user-facing tool most
   needs filled.

### 3.2 Proposal: three explicit dashboard modes, mirroring v4

**Explore** (no AI) → **The reading** (mid, cached) → **Force briefing**
(deep, streamed). The first two exist and need only the fixes above; the
third is new.

#### The Force Briefing (new deep tier)

A streamed, structured, printable **data briefing per force** (and one for
England & Wales), generated on demand and cached per force × data month —
the direct analogue of the research review, reusing its proven machinery
almost piece for piece:

- **Endpoint:** a new edge function (`netlify/edge-functions/force-briefing.ts`)
  — same reasoning as `research-review.ts`: Sonnet 5 at high effort routinely
  outlives Lambda's ~10s streaming ceiling, and the fetch+SSE pattern, model
  fallback chain (`Sonnet 5 → Opus 4.8 → Sonnet 4.6`), preflight, Blobs
  cache and budget accounting are already written and battle-tested there.
- **Model:** `REVIEW`-style — Sonnet 5, adaptive thinking, `effort: 'high'`.
  Cost is bounded by construction: ~45 forces × 1 generation per data month
  (then cache hits), well inside the existing monthly budget guard.
- **Input:** a rich but still aggregate-only digest — the §2.7 trend digest,
  plus stop & search (12-month trend, find rate, object mix, ethnicity shares
  with the denominator caveat flags), recorded-crime annual breakdown, data
  coverage/completeness for that force. Everything the model may cite, in one
  numbered-figures JSON.
- **Format — fixed headings, exported and tested** like `REVIEW_HEADINGS`:

  > *The picture · What's moving · The justice gap · Stop & search ·
  > How complete is this data · Questions worth asking · CONFIDENCE: line*

  Table-led where the review is table-led: a "What's moving" markdown table
  (`Category | 12-mo count | vs previous 12 | Reading`) with the **Reading**
  column drawn from a fixed four-label vocabulary — the dashboard's analogue
  of `EFFECTIVENESS_LABELS`: `Rising · Falling · Steady · Too early to say`.
  Same rationale: one scannable word, no false precision, no traffic-light
  colouring. "Questions worth asking" is the practitioner hook — the
  briefing never gives verdicts, it hands the analyst the questions the data
  raises (the dashboard's version of "guidance with sources only").
- **Figure discipline, the citation contract's sibling:** the review made
  fabricated references *structurally impossible* (client-built reference
  list, marker sanitisation). The briefing's equivalent risk is fabricated
  numbers. Two layers: the prompt allows only figures present in the digest,
  and a client-side check (a numeric `sanitizeCitations` analogue) flags any
  number in the output that doesn't appear in the digest the server echoes
  back. That check is what would let the provenance line honestly say
  *"every figure in this briefing is from the dataset shown"*.
- **Confidence line:** reuse `CONFIDENCE:` verbatim — here it grades data
  completeness (e.g. `strong` = full months, denominator seeded; `thin` =
  force filed late / no population data), rendered as the same pill.
- **PDF export:** `pdf-report.ts` already lays out an A4 briefing with a
  drawn table and label chips; a `buildForceBriefingPdf` variant is mostly
  configuration. This is the artefact practitioners circulate — it's what
  made the research review feel like a tool rather than a demo.
- **Provenance:** `x-model` header → "Written by …" exactly as the review
  does, so a fallback model is never silent.

#### Chat stays fast, but learns to escalate (optional, later)

Haiku is right for "are most searches finding anything?". It's wrong for
"compare the burglary trend with the charge rate and tell me if the gap is
closing" — multi-step numeric reasoning is where the cheap tier visibly
strains against the site's accuracy promise. The research assistant's
`translate` pattern suggests the shape: a one-line classifier (or even a
token-count/keyword heuristic — no model needed) routes hard questions to
Sonnet 4.6 with `effort: 'low'`, easy ones to Haiku. Worth doing only after
usage shows real demand; the tiering hooks (`INTERPRET_MODEL_LIVE`,
`modelParams(id, effort)`) already exist.

#### One registry, as personas.ts already teaches

Whatever ships, pin the dashboard's model/effort choices next to
`CACHED_MODEL_DEFAULT`/`LIVE_MODEL_DEFAULT` in `personas.ts` (or a sibling
`dashboard-prompts.ts` mirroring `research-assist-prompts.ts`, with its own
`PROMPT_VERSION` bump discipline and heading/label exports asserted in
tests). The research assistant's reliability comes as much from these pinned,
tested contracts as from the models themselves.

---

## 4. Presentation and language

### 4.1 Naming: one product, one home

- "Crime Dashboard" currently names: the `/research` tab, the `/data`
  redirect stub, and (in breadcrumbs) the parent of the explorer pages. The
  explorer pages' breadcrumbs route readers through `/data` — a "this has
  moved" page that whisks them to `/research` after 3 seconds.
- `research-tools.astro:61` — the **Crime Dashboard card links to
  `/research`**, which lands on the *Research Assistant* tab; the reader has
  to find the second tab themselves. Link to the tab directly
  (`/research#dashboard` or a `?tool=dashboard` param the switcher reads).
- Recommendation: pick one name ("Crime Dashboard") and make `/data/explore`
  its real hub — or fold the explorer links into the dashboard pane and
  retire the interstitial. Either way, breadcrumbs should never route
  through a redirect stub.

### 4.2 What an analyst is missing on the charts

The dashboard's stated ambition is practitioners and analysts. The current
charts are honest but read-only — a reader can *look*, but can't *work*:

- **Counts, never rates.** Everything is raw counts, so no force can be
  compared with any other, or with England & Wales. One small ONS table
  (mid-year population per police force area — a static JSON seed, like
  `force_population_ethnicity`) unlocks *per-1,000-residents* everywhere and
  a "vs England & Wales" baseline series on every force chart. This is the
  single highest-value analytical upgrade on the whole dashboard.
- **No per-category trends.** `view=crime-trend` already returns
  `categories[].byMonth`, but the page only charts the 12-month totals —
  the trend data is fetched and dropped (`crime.astro:118`). Let the reader
  tap a category to see its line.
- **No export.** Analysts will re-make these charts in Excel for their own
  reports; a "Download CSV" on each chart (the series is already client-side)
  and the Force Briefing PDF cover both audiences cheaply.
- **No shareable state.** The force picker doesn't touch the URL, so a
  colleague can't be sent a link to "Kent, crime & outcomes". Mirror the
  picker into `?force=` (the neighbourhood page already does this for
  `?postcode=`).
- **No axes** (§2.4), and month labels at only first/middle/last.

None of these need a charting library; they're all extensions of the
existing dependency-free style.

### 4.3 Language

The voice work is strong, and the best of it should spread:

- **Keep:** the caveat banner's triplet ("It's not everywhere / not now /
  not exact") is the best plain-English framing of data limitations on the
  site; "the justice gap" is a genuinely good coinage; the disproportionality
  page's insistence that a raw share is not proof of bias — stated in page
  copy, prompt, *and* chart footnote — is the site's values done properly.
- **Fix the false empty state** (§2.5) and the residual "Interpreted by
  Claude" placeholder (it renders before headers arrive and stays if they
  never do — say "Claude" only once a model header confirms it, otherwise
  "the site's AI").
- **Give trend language a fixed vocabulary.** The readings currently
  freestyle their trend claims. The four-label reading vocabulary proposed
  for the briefing table (§3.2) belongs in the standing readings' prompts
  too: "rose/fell" only for actual recorded-count movement, `Too early to
  say` where months are incomplete — the same falsifiable-plain-English move
  as `EFFECTIVENESS_LABELS`.
- **Let the reading point at the page.** The overview floats above the
  charts without referring to them. The `readFirst` pattern translates
  directly: end the reading with one or two "look at…" pointers ("the
  justice-gap chart below is where the movement is"), validated against the
  chart ids actually on the page, exactly as `readFirst` indices are
  validated against the result list.
- **Practitioner register exists only in the prompts' memory.** The persona
  system (including the good `police` lens) is written but switched off
  ("the toggle is removed"). Rather than resurrecting six personas, consider
  one binary the audience actually splits on: *resident* vs *practitioner* —
  the Force Briefing is the practitioner surface; the standing reading stays
  general.

---

## 5. Data sources — what to add, in value order

Current: data.police.uk (snapshot + bulk archive rollups), Home Office
recorded crime by PFA (`fetch-recorded-crime.mjs`), postcodes.io, and an
*optional, currently unseeded* ONS ethnicity denominator.

1. **ONS mid-year population by police force area** — one small static
   table; unlocks rates per 1,000 and cross-force comparison everywhere
   (§4.2). Trivial ingest, transformative payoff.
2. **Seed the census ethnicity denominator** that the schema already
   supports (`force_population_ethnicity`). The disproportionality tool's
   headline feature — the disparity ratio — is dormant until this one-off
   seed lands. The page currently apologises for its absence on every load.
3. **Home Office outcomes open data (offence-level)** — the justice gap is
   currently one blended rate; the published outcomes tables give
   charge/summons rates *by offence group*, which is how analysts actually
   ask the question ("what's the charge rate for burglary here?"). Same
   gov.uk content-API fetch pattern as `fetch-recorded-crime.mjs`.
4. **Police workforce statistics (officers per force, annual)** — enables
   searches-per-officer and crimes-per-officer context, and honest "smaller
   force, noisier numbers" caveats in the readings.
5. **IMD (deprivation) deciles for LSOAs** — one static lookup; turns the
   hotspots list from a bare league table into context ("8 of the top 12 are
   in the most deprived decile") — with the usual correlation-not-cause
   framing the prompts already enforce.
6. **CSEW headline series** — recorded crime vs experienced crime is the
   single most misread comparison in UK crime reporting; even one national
   chart with a careful reading would be a public service and very on-brand.
7. **HMICFRS PEEL ratings per force** — a small JSON per force; gives the
   Force Briefing an official quality-of-service anchor to sit beside the
   raw numbers.

### The cross-tool move the site is uniquely placed to make

The dashboard tells a practitioner *what's happening*; the research
assistant tells them *what works*. Nothing connects them. One link does it:
every category row/briefing "question worth asking" gets a **"What does the
evidence say?" →** that opens `/research` with the review pre-filled
("reducing residential burglary — force context: risen 18% year-on-year").
The research assistant's `plan` mode takes a free-text problem already;
this is a URL parameter, not a new system — and it's the moment the two
tools become one product: *see the problem, read the evidence, download the
briefing*.

---

## 6. Suggested order of work

**Phase 1 — correctness and honesty (small, ship first)**
Shared outcome classifier + test (§2.1) · hotspots force-scoped or honestly
labelled (§2.2) · stale-stream guard (§2.3) · y-axis labels + value table
(§2.4) · honest error states (§2.5) · dead imports, aria-labels (§2.8) ·
fix the Research Tools card link (§4.1).

**Phase 2 — make the existing AI worth its model**
Trend-aware crime-history digest (§2.7) · effort `medium` on cached readings
(§3.1) · fixed trend vocabulary + "look at" pointers in prompts (§4.3) ·
mount DataChat on the explorer pages against `db-interpret` (§2.6) ·
`?force=` in URLs (§4.2).

**Phase 3 — the deep tier**
Force Briefing edge function + prompt contract + PDF (§3.2) · population
seed + rates per 1,000 (§5.1) · ethnicity denominator seed (§5.2).

**Phase 4 — the analyst's toolkit**
Offence-level outcomes (§5.3) · per-category trend charts + CSV export
(§4.2) · dashboard → research-assistant handoff (§5) · chat escalation if
usage warrants (§3.2).

Phases 1–2 are days, not weeks, and mostly reuse code that already exists in
the repo. Phase 3 is the one genuinely new build, and nearly all of its hard
parts (edge streaming, model fallback, caching, budget, PDF, label
vocabularies, sanitisation) are lifted from the research assistant — which
is exactly how it should be: the research assistant already paid for those
lessons.

### Deferred from this implementation pass

- **Offence-level outcomes fetch (§5.3)** — the Home Office outcomes
  workbooks can't be blind-parsed from the offline dev sandbox; write it the
  way `fetch-recorded-crime.mjs` was (verbose CI runs teaching the real
  shape) in a follow-up.
- **Force-scoped hotspots (§2.2)** — needs `force_id` added to the
  `crime_lsoa_month` rollup grain (migration + ingest change + a re-ingest);
  the chart is honestly labelled national-only until then.
- **Chat escalation (§3.2)** — deliberately usage-gated; the hooks
  (`INTERPRET_MODEL_LIVE`, `modelParams(id, effort)`) are in place.
- **Population/census seed data** — the tables, seed script
  (`scripts/seed-population.mjs`) and rate features ship here, but the actual
  ONS numbers must be loaded from downloaded ONS tables (real figures only,
  never invented) — a ten-minute owner task documented in
  docs/police-database.md.
