# Research Assistant v4 — three modes, function-first

Status: **built** (July 2026). Supersedes the v3 "briefing depth slider".
The review report's format was reworked again in v9 of the prompt (see
**The review report**, below) into a proper two-page research briefing; v10
renamed "Rules and policy to check" to "Powers and policies", pointed it at
sourced ASB powers/legislation/case law specifically, and made the evidence
table keep only studies genuinely specific to the problem (see **The evidence
table** and **The legal-context exception**, below).

The governing principle is unchanged: **sources and evidence are king** — the
assistant never says anything it cannot pin to a retrieved paper (with one
carefully fenced exception, below).

## Why v4

v3 exposed one flow (problem → briefing) with a three-stop *depth slider*
(quick scan / overview / full review) that changed how hard the client searched
and which synthesis prompt ran. Two problems:

1. **Full review structurally could not finish.** All three depths ran through
   the same synchronous JSON endpoint (`/api/research-assist`, mode
   `briefing`). At the deep end that meant one Sonnet call generating up to
   4,000 tokens — far past a synchronous Netlify function's execution window.
   The platform killed the function mid-call, the client saw a dead response,
   and the reader was told "the briefing couldn't be written".
   Making the endpoint stream (the first v4 fix) turned out to be necessary
   but not sufficient: Netlify's regular Functions (Lambda-based) have a hard
   **~10-second execution ceiling on a streaming response, independent of plan
   tier** — reaching it just stops the stream, mid-report, with no error the
   client can distinguish from any other failure. A Sonnet 5 report at
   high-effort thinking routinely takes well past that. The real fix — see
   **Why an edge function**, below — was moving the route off Lambda entirely.
2. **The slider hid the function.** Quick scan, overview and full review are
   not three sizes of one thing — they are three different jobs. v4 lets the
   job drive the machinery.

## The three modes

| Mode | Job | AI | Endpoint |
|---|---|---|---|
| **Search** | Find papers by keyword, filter, save | **None** — deterministic catalogue search | `GET /api/research` |
| **Overview** | "What does the field say, and what do I read first?" | Mid tier — Sonnet 4.6, one quick JSON call | `POST /api/research-assist` (`translate` + `overview`) |
| **Research review** | A research assistant's report on a posed question | Deep — **Sonnet 5, adaptive thinking at high effort, streamed** | `POST /api/research-review` (streaming) + `plan` |

- **Search** is intentionally AI-free: keyword search doesn't benefit enough
  from a model to spend budget or latency on one, and keeping it coded means
  it keeps working when the AI budget is spent or the key is missing.
- **Overview** runs `translate` (plain-English question → the literature's
  vocabulary) then one merged catalogue search, then `overview`: 3–5 sentences
  on what the results add up to, a **reading order** (`readFirst` — indices
  into the numbered results with a one-line "why"), refinement chips, and a
  caveat. Indices are validated server-side against the list the model was
  shown, and re-checked client-side against the cards on screen.
- **Research review** is the old briefing pipeline grown up:
  `plan` decomposes the problem into ~3 angles → each angle is searched across
  the merged catalogues (with the v3 escalation ladder: more pages, then
  beyond free-to-read) → deterministic curation to ≤10 studies (tightened from
  v8's 15 so the v9 evidence table fits the page — see **The review report**)
  → **`/api/research-review` streams the report** as markdown while the reader
  watches it being written. The stream's final line is `CONFIDENCE: <level>`,
  which the client strips and renders as the evidence pill.

### The review report

**v9 rewrote the report's shape from a narrative into a briefing.** v8 was six
`###` sections read top to bottom like a short essay (*Summary · The problem ·
What the research tells us · How strong is the evidence · Rules, powers and
policy to check · Ideas to take forward*) — clear, but still a wall of
paragraphs a busy reader had to read start to finish to extract anything
actionable. v9 restructures the same underlying content around **how a reader
actually uses it**: skim the problem, scan a table for the evidence at a
glance, check confidence, then jump straight to whichever action tier matches
their appetite for effort.

**v21 reordered the sections simplest-first.** Eight fixed `###` sections
(exported as `REVIEW_HEADINGS`, asserted in tests), now in **overview→detail**
order: *In brief · What you could do · Quick wins · Medium term · Long term —
higher effort · What the evidence says · How confident can we be · Powers and
policies.* The top is a plain-English summary (`In brief` — no jargon at all,
the part a reader with no research background fully understands) and the
practical to-do options; the briefing then grows more detailed and
evidence-heavy as it descends — the evidence ladder + table, the confidence
caveats, then the legal/policy hooks. The client appends the study cards
(**"Sources & further reading"**, formerly "Read the studies") at the very
bottom, so the whole document reads ELI5→practitioner top to bottom. The two
summary/to-do headings carry a small emoji icon on the **web** render (`🔑 In
brief`, `✅ What you could do`, and `⚡ / 📅 / 🎯` on the three action-tier
boxes); the lower sections stay plain, and the **PDF keeps every heading plain**
(jsPDF's core fonts don't carry emoji). It is still explicitly a **grounding
report, not a verdict** — the prompt forbids definitive answers; guidance with
sources only.

**Format: a briefing, not an essay.** The prompt states this outright and
bounds prose to 800–1,100 words (excluding the table) — built to print to about
two A4 pages, the length convention this design leans on across university
and think-tank writing guidance for policy/research briefs (UNC's and the
University of York's writing-centre guidance, FiscalNote's and IHPI
Michigan's brief templates): short, scannable, headings + bullets + a table,
never a wall of text. Every sentence has to earn its place.

**The evidence table.** "What the evidence says" opens with one short
grounding paragraph, then a markdown table, columns `# | Study | Key finding |
Effectiveness`, so the reader can scan the evidence in one glance instead of
piecing it together from citation markers scattered through prose. Up to 10
curated studies are shown to the model, but the table is no longer a
mechanical one-row-per-study dump: the prompt instructs the model to drop any
study that isn't genuinely specific to the problem in hand — general "about
policing" or adjacent-topic studies don't earn a row just because they were
in the curated set. A short table of studies that truly fit the question
beats a full one padded with loose fits, so the table can legitimately have
fewer than 10 rows; the web renderer and PDF derive "studies reviewed" and the
"Read the studies" list from the rows the model actually kept
(`tableStudyNumbers` in `review.ts`), not from the full curated set, so a
dropped study doesn't linger on the page as an orphaned abstract. The
"Effectiveness" column uses one of four plain-English labels
(`EFFECTIVENESS_LABELS`: *Well-established · Promising · Mixed evidence ·
Early or limited evidence*) — a deliberately simplified reading of the same
tradition as the College of Policing's own EMMIE framework (crime-reduction
evidence rated on Effect, Mechanism, Moderators, Implementation, Economics)
and the Maryland Scientific Methods Scale / Nesta Standards of Evidence
ladders. Those systems are multi-dimensional and built for researchers; a
practitioner briefing needs one scannable word, not a five-axis profile or a
falsely-precise numeric score, so v9 collapses the same underlying judgement
(how much weight does this evidence carry) to a single label per study. The
table is deliberately **not** colour-coded red/amber/green — the site avoids
traffic-light framing sitewide as falsely precise and mildly alarmist; instead
the web renderer and PDF use visual *weight* (filled vs outlined vs dashed) to
distinguish the labels.

**The three action tiers.** "Quick wins", "Medium term" and "Long term —
higher effort" replace v8's single "Ideas to take forward" list, split by the
standard effort/impact prioritisation convention used across service-design
and policy-implementation guidance (the "quick wins vs longer-term" split of
an effort–impact/action-priority matrix): 2–4 short bullets each, citing `[n]`
where a suggestion rests on a specific study, rendered as three side-by-side
boxed tiers on the web page and in the PDF rather than a flowing list, so the
reader's own appetite for effort decides where they look first.

**Written for a non-academic.** The prompt's voice rules demand plain English,
short sentences, and no academic jargon: any genuinely-needed technical term is
explained in a few plain words the first time ("a randomised trial — areas
assigned by chance, so like is compared with like"), findings are stated
concretely ("burglary fell by about a quarter"), and the test for every
sentence is "could the reader do something with this?" The report should read
like something a practitioner can share with colleagues and act on.

**The legal-context exception.** Practitioners need the statutory hooks —
relevant powers, other legislation, codes of practice, leading case law — and
those rarely appear in scholarly abstracts. "Powers and policies" asks
specifically for what's relevant to *this* problem: where anti-social
behaviour is genuinely in play, that means the ASB powers under the
Anti-social Behaviour, Crime and Policing Act 2014; more generally, the model
names the actual source (the Act and section, or the case name) rather than
describing a power only in the abstract, so a practitioner can look it up.
The model may draw on general knowledge here — but only what it is confident
exists, closed with an instruction to verify against current official
sources, and **never** carrying a fabricated `[n]` marker. Everywhere else the
citation contract holds — and in v9 it does double duty as the table's row
numbering: the model is shown ONE numbered list of **at most 10** curated
studies (down from v8's 15, tightened specifically so the table fits
comfortably on the page), and every row it keeps uses the study's original
number as both its `#` cell and its citation marker, so citation marker `[n]`
and table row `[n]` are the same thing throughout the document — just not
every one of the 10 is guaranteed a row (see **The evidence table**, above).
The table is still the **complete, only** reference list — v9 drops the
separate references section v8 had, since repeating the same studies twice
added length without adding information. References are still built
client-side from the real `Work` objects (an invented reference stays
impossible by construction), and out-of-range markers are stripped
client-side (`citations.mjs`) before render/save.

### Why an edge function

`netlify/edge-functions/research-review.ts` — not `netlify/functions/` — is
what actually makes a multi-minute streamed generation survive. Netlify Edge
Functions run on Deno, not Lambda, and their execution budget is CPU-time
only: time spent waiting on a network response (i.e. nearly this whole
function's wall-clock life) doesn't count against it. This is Netlify's own
documented pattern for streaming AI generations, and it removes the ceiling
entirely — with **no client-side change**: same path (`/api/research-review`),
same request/response shapes, same wire format.

Running under Deno instead of Node changes several things inside the file:
- **No Anthropic SDK.** npm-package support in Netlify Edge Functions is
  documented as *experimental*, and the SDK is a large, Node-oriented package
  with plenty of internal surface that could fail to bundle under that compat
  layer in ways impossible to verify without a live deploy (this was tried
  first — see the git history — and the deploy failed). The Messages API is
  called directly with `fetch`, streamed responses are hand-parsed as SSE
  (`streamMessages`, a small async generator yielding the same event shapes
  the SDK's own `.stream()` produces, so the consuming loop is unchanged). A
  plain REST/SSE call needs no package resolution at all, which removes that
  whole risk category.
- **`@netlify/blobs` stays a bare import**, not `npm:`-prefixed — matching
  Netlify's own documented edge-function convention (their bundler
  special-cases their own first-party package); it's the one dependency this
  file still has, and the one most likely to actually be blessed for this
  runtime.
- Local imports need explicit file extensions (Deno's resolver doesn't infer
  them the way Node's does) — so the shared modules are imported as
  `personas.ts`, `research-assist-prompts.ts`, `cache-key.mjs`,
  `ai-budget-core.mjs`. Only **pure, import-free** modules are shared this
  way; none of them touch `process.env`, so they load unmodified under Deno.
- Environment variables read via `Deno.env.get(...)`, not `process.env`. The
  Node-flavoured budget guard (`ai-budget.ts`) and stream writer
  (`ai-stream.ts`) both use `process.env`/import each other that way, so
  rather than risk a `process is not defined` at module load, the small
  amount of glue that touches env vars or the response stream (the budget
  guard's read/write, `streamMarkdown`) is self-contained in the edge
  function file — reusing only the pure arithmetic and prompt/model constants
  from the shared modules above. It writes to the *same* Blobs store
  (`ai-budget`) in the *same* shape, so the monthly spend cap still
  accumulates coherently across every AI route on the site, Lambda or edge.

Everything else about the streaming contract is unchanged from the original
design:
- **The review is two model calls, not one** (since v13). A fast SELECTION
  pass — the same picked model at low effort, non-streaming, JSON-only
  (`SELECT_SYSTEM`) — screens the client's candidate pool (up to
  `REVIEW_POOL_MAX` studies) down to the at-most-`REVIEW_TABLE_MAX` that
  genuinely bear on the question; only those reach the high-effort writing
  call. Selected studies keep their ORIGINAL pool numbers (sparse,
  non-sequential), so the client's `[n]` → reference mapping is untouched.
  Any selection failure falls back to the head of the curated pool. One call
  doing both jobs was the v12 stall: minutes of silent thinking over 30
  studies that could exhaust the token ceiling before the report finished.
- One byte (a `preamble`) is enqueued immediately, so time-to-first-byte stays
  near zero — and for the WHOLE stream, whenever the model has been silent
  ~12s, the edge function **heartbeats an invisible zero-width no-break space
  (U+FEFF)**. Adaptive thinking sits silent not only before the report but
  between its sections (interleaved thinking), and intermediaries kill a
  quiet connection — Cloudflare's ~100s between-bytes timeout is how v14
  reports died mid-document. The client strips U+FEFF from every chunk
  before any parsing, and heartbeats are never cached. A client disconnect
  no longer aborts the generation: the report finishes and caches, so a
  retry returns it instantly. Client-side, a 120s no-bytes watchdog aborts a
  genuinely dead stream into the normal single-retry path.
- Finished reports are cached in Blobs (`research-review` store) keyed on
  problem + curated set + model + prompt version via the shared
  `stableKey` (src/lib/cache-key.mjs — which also fixes a latent v3 bug where
  nested item fields were dropped from the hash). A cache hit returns the full
  text at once; the client handles both shapes identically.
- **Model resolution is resilient.** The intended model is Sonnet 5, but the
  function preflights it with a tiny thinking-disabled call *before* committing
  the streaming 200, and falls back down a chain (`RESEARCH_REVIEW_MODEL` env
  override → Sonnet 5 → Opus 4.8 → Sonnet 4.6) to the first the account can
  actually reach. The `x-model` response header reports which model wrote the
  report; the client stores it and the page/PDF show "Written by …" so a
  fallback is never silent. If no model is reachable, the reader gets a
  specific error (access vs transient) above the curated studies — not the old
  generic "couldn't be written". This is what fixes a deployment whose account
  hasn't enabled Sonnet 5: the review still works (on the fallback), truthfully
  labelled, and the owner can pin a model via the env var with no code change.
- Token usage is read off the stream events and charged to the monthly budget
  guard, same as interpret.mts. Over budget → friendly 503 before the call.
- A dropped stream leaves ai-stream's interruption marker; the client keeps a
  substantially-complete report (with an honest caveat) and discards a stub.

### PDF export

Every finished review (live, saved, and the shared read-only view) has
**Download PDF** — a real `.pdf` file, not a print of the website, titled
"RESEARCH BRIEFING" to match the v9 format. `pdf-report.ts` lays out a
designed A4 document with jsPDF (dynamically imported, so the library loads
only on click): brand wordmark and accent rule, the question as the title, a
meta line (evidence label · studies reviewed · written-by), the prose
sections with accent-underlined headings, a genuinely **drawn table** (not an
image) for "What the evidence says" with wrapped cells, page-break handling,
clickable Study-cell links (http(s) only, `safeHttpUrl`) and a filled chip for
each Effectiveness label, three side-by-side boxed action-tier panels
(height-matched, breaking together as one unit across a page boundary) for
Quick wins / Medium term / Long term, the caveat, a closing note, and page
footers with numbers on every page. There is no separate references
section — the table is the only reference list, matching the v9 prompt. Text
is drawn straight from the validated `ReviewResult`; `doc.save()` downloads
`research-briefing-<slug>.pdf`. The layout is testable headlessly via the
exported `buildReviewPdf` (build the module with esbuild, call it with a
sample `ReviewResult`, render the resulting bytes to PNG with `pypdfium2` for
visual inspection — no browser needed).

### Loading states

A shared spinner (`spinner.ts`: Tailwind `animate-spin`, `motion-reduce`
fallback, `role="status"`, labels in an `aria-live` region) covers every wait:
framing, per-angle searching (with the v3 checklist), curating, and "reading
n studies and thinking". Once tokens flow, the report streaming onto the page
is itself the progress indicator.

## Models

| Call | Model | Params |
|---|---|---|
| translate / plan / brief | `claude-sonnet-4-6` | adaptive thinking, effort low |
| overview | `claude-sonnet-4-6` (`OVERVIEW_MODEL`) | adaptive thinking, effort low |
| review — selection pass | same model as the writer | adaptive thinking, effort low, JSON-only, max 4,000 tokens (`SELECT_MAX_TOKENS`) |
| review — writer | `claude-sonnet-5` (`REVIEW_MODEL`), falls back to Opus 4.8 → Sonnet 4.6; `RESEARCH_REVIEW_MODEL` env override leads the chain if set | adaptive thinking, **effort high**, streamed (edge function), max 16,000 tokens. Sonnet 5 at high is the proven-reliable config; a brief Opus-4.8-at-xhigh experiment thought for minutes per report and dropped connections, and was reverted. |

Model ids are pinned in `research-assist-prompts.ts` (shared by functions and
client provenance records) and registered in `personas.ts`
(`INTERPRET_MODELS`); `modelParams(id, effort)` gained the effort parameter.

## Removed in v4

- `mode: 'briefing'` + the three `BRIEFING_*_SYSTEM` depth prompts and
  `BRIEFING_DEPTHS/BRIEFING_MAX_TOKENS` (superseded by the review function).
- `mode: 'answer'` + `ANSWER_SYSTEM` and the search-pane question answer
  (superseded by Overview; Search is now AI-free).
- The depth slider and its copy; the `suggested (AI picks)` sort.
- `src/scripts/research/briefing.ts` → reworked as `review.ts`
  (`ReviewResult` keeps the exact stored shape, so saved v3 briefings and
  share links render unchanged).

## Files

- `src/lib/research-assist-prompts.ts` — v9; `OVERVIEW_SYSTEM` (readFirst),
  `REVIEW_SYSTEM`, `REVIEW_HEADINGS`, `EFFECTIVENESS_LABELS`,
  `REVIEW_CONFIDENCE_PREFIX`, model pins.
- `netlify/functions/research-assist.mts` — translate/overview/plan/brief
  (regular Function — these are short JSON round-trips, no streaming ceiling).
- `netlify/edge-functions/research-review.ts` — the streamed report. An **edge
  function**, not `netlify/functions/`, so the model has no execution-time
  ceiling to write against — see **Why an edge function**, above.
- `src/lib/ai-stream.ts` — `preamble` option (used by the Lambda-based
  functions; the edge function keeps its own copy — see above).
- `src/lib/cache-key.mjs` — shared `stableKey` (tests/cache-key.test.mjs).
- `src/scripts/research/review.ts` — pipeline + streaming + renderers.
- `src/scripts/research/assist.ts` — translate + overview panel.
- `src/scripts/research/spinner.ts`, `pdf-report.ts` — loading UI, the PDF.
- `src/scripts/research/main.ts` — the three-mode controller.
- `src/pages/research.astro` — mode switcher, panes, landing copy.

### Saving (and the honest failure message)

Saved reviews still require the `briefings` table migration (Part 4⅞ of
docs/google-login-setup.md) — a v3 manual step that is easy to miss. A failed
save no longer blames the per-user limit regardless of cause:
`saveBriefing` distinguishes `limit` from `error`, the UI says which it was
(and that the PDF download still works), and the underlying Supabase error is
logged to the console for the site owner ("relation does not exist" = run the
migration).

### Recent briefings — 30-day device history

Every finished review is also recorded to a per-device localStorage history
(`src/scripts/research/history-store.ts`, key `tap-research-history`),
independent of sign-in. A "Recent briefings" panel under the review form lists
them newest-first; clicking one re-renders it in place from its stored
`ReviewResult` (no network — the object carries its own studies, the same
property the shared read-only view relies on). Entries are pruned after 30 days
and capped at 30, and writes shed the oldest on a quota error. This is the
ephemeral safety net; the Supabase `saveBriefing` path above remains the
deliberate, permanent, shareable store, and a signed-in reader can promote any
history entry to it with one tap ("Save to your account"). The review runs at
`xhigh` effort with a 32,000-token ceiling so the heavier thinking can't
truncate the report.

## Research integrity — retraction screening (v20)

The search reaches the whole open scholarly record, which includes retracted
papers. A withdrawn finding must never inform a briefing, so the review
pipeline screens them out:

- **Signal.** OpenAlex ingests the [Retraction Watch](https://retractionwatch.com)
  database, so its `is_retracted` boolean is the broadest *free* retraction
  flag available — and OpenAlex is both the default source and part of every
  merged fan-out, so the flag reaches most records at no extra request.
  `mapOpenAlexWork` sets `retracted: true` only when flagged (ordinary works
  stay byte-identical, cache keys included). On a cross-source merge the flag
  **ORs** across copies — unlike `preprint`, which ANDs — because retraction is
  a property of the underlying work: if any catalogue knows it's retracted, it
  is (`research-merge.mjs`).
- **Where it acts.** `searchAngle` (in `review.ts`) drops flagged works
  *before* curation, so a retracted paper can't even occupy a pool slot and
  displace a sound study. The count is accumulated and surfaced under the
  finished briefing as a plain note ("N retracted studies were found in the
  search and left out of this briefing") — screened, not silently trimmed.
- **Plain search is different.** The `/research` search view still *shows*
  retracted papers, badged with a red "Retracted" pill (`cards.ts`). Hiding
  them there would be its own distortion; the briefing excludes them only
  because it speaks with one synthesised voice.
- **Not Scite.** Scite's richer *contradiction* signals (supporting vs
  contrasting Smart Citations) would need a paid API key, and the review runs
  in a Netlify Edge (Deno) function that can't hold one — so the deployable
  core uses the free OpenAlex signal. Contradiction-aware screening remains a
  possible phase 2 if a Scite key is ever provisioned server-side.

## Scoping — College of Policing and other EBP evidence sources

Notes on drawing in more UK evidence-based-policing material (investigated
July 2026), kept here so the trade-offs aren't re-litigated:

- **College of Policing Crime Reduction Toolkit / What Works Centre.** The
  gold-standard UK practitioner resource — EMMIE-rated (effect, mechanism,
  moderators, implementation, economic cost) summaries of systematic reviews.
  **No public API, feed, or dataset** (confirmed; it's a human-facing web
  resource, and the site blocks automated fetches). Options: (a) a curated
  static link-out to the toolkit from the review footer — honest, zero-risk,
  but not data; (b) the toolkit's *evidence base* is **Campbell Collaboration
  systematic reviews** (DOI prefix `10.4073`), which are already DOI-indexed
  and surface through our existing OpenAlex/Crossref search — a "systematic
  reviews first" boost would foreground exactly the studies the toolkit is
  built on, without scraping anyone. (a)+(b) is the recommended path.
- **Already covered.** GOV.UK (Home Office, HMICFRS, legacy College reports)
  is a live source; Europe PMC covers health-adjacent CJ topics; the policing
  ISSN facet locks to the core journals.
- **Deferred integrations.** Scite (contradiction/retraction, paid key),
  PubMed E-utilities (structured CJ-health metadata), and a Campbell/Cochrane
  systematic-review facet.

## Deferred

An overview→review escalation shortcut ("go deeper on this") pre-filling the
review from an overview's query; a "My reviews" list view (the store's
`listBriefings` is ready); saved-search alerts; an optional model re-rank in
curation if deterministic curation proves too blunt.
