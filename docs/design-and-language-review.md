# Design, Language & Format Review

A full review of the site's reading experience, with the rationale behind the
changes shipped in this pass and a prioritised backlog of what remains. The brief
was to fix the "wall of text" feeling and give the site a bolder, magazine-style
front without altering the author's voice.

The writing itself is strong and disciplined (`writing-style.md` is well
respected); the problems were almost entirely in presentation and structure.

---

## 1. Design audit

### Typography & reading measure — the core fix
The single biggest contributor to "wall of text" was line length. `.prose-article`
(`src/styles/global.css`) set no max-width of its own, so body text was held only
by the `max-w-3xl` (768px) column in `ArticleLayout.astro` — roughly **90–100
characters per line** at 18px serif, well past the comfortable 60–75. A
`prose: 38rem` token existed in `tailwind.config.mjs` but was never used.

**Shipped:** a `--measure` (36rem, ≈ 68ch) applied to the text-level children of
`.prose-article` only (`p`, `h2`, `h3`, `h4`, `ul`, `ol`, `dl`, `blockquote`),
while figures, tables, code blocks, the route-map explorer and full-bleed images
keep the full column. This is the magazine "narrow text / wide media" pattern. The
`prose` token was retuned to 36rem so it matches and is no longer dead.

### Lead-in & heading rhythm
Articles opened with no visual entry point and headings sat adrift in even spacing.

**Shipped:** a **lead paragraph** treatment (larger, darker first paragraph) with a
restrained serif **drop cap**, scoped to a paragraph that is the article's first
child so it never lands on a callout or figure. Headings are bolder (h2 to 700
weight, tighter tracking) with a short **accent rule above each h2** for cadence,
and tightened top-margins so sections feel deliberate.

### Colour & theme
The warm-paper / burgundy / serif palette is a genuine asset and was kept. It is
light-only; **dark mode** is the main gap (see backlog) but was deliberately
deferred to avoid half-theming every component.

### Homepage
The front page was a tall stack of near-identical full-width bands, with the
latest piece buried below Popular and the section overview, and "More writing"
rendered as a single-column list.

**Shipped:** a **masthead** that pairs the hero with the latest article as a
weighted lead story (`src/pages/index.astro`), Popular and Browse promoted up the
page, the editorial pull-quotes moved to a mid-page divider, and "More writing"
converted to a **two-up card grid** for scannability.

### Navigation & components
- `ArticleCard` gained a `stack` layout (image-top, even heights) for grids,
  alongside the existing row layout used on section pages.
- `SectionBadge` is slightly stronger (semibold, marginally larger) so the
  primary taxonomy reads as primary.
- Long articles now get an **"On this page"** contents rail and a **reading
  progress bar** (see §3).

### Mobile / accessibility
- The mobile menu was a bare class-toggle. It now tracks `aria-expanded`, exposes
  `aria-controls`, and closes on Escape and outside-click.
- All new interactive scripts are dependency-free and honour
  `prefers-reduced-motion`, matching `StickyNav`/`NewsTicker`.

---

## 2. Language & readability notes (recommendations only — no prose was rewritten)

The voice is excellent and adherence to `writing-style.md` is high (concrete
openers, judgement-led closes, no AI-tell vocabulary, British idiom, hard figures
in bold). The notes below are structural/light-touch and safe within the guide.

**Cross-cutting**
- **Citations in prose.** Several essays carry inline numeric markers (`[1] [2]`)
  that interrupt flow. Consider footnote-style references (superscript linking to
  a references block) — a presentation change, not a wording one.
- **Standardise `updatedDate`.** Many files carry `updatedDate: ''`; the schema
  already coerces blank to absent, so this is harmless, but clearing the empty
  strings would tidy the frontmatter.

**Per article**
- *The Legal Aid Paradox* — dense, well-woven research; the new key-takeaways box
  gives it a scannable entry. A small table contrasting advised vs. unadvised
  custody outcomes would earn its place. (Now has takeaways.)
- *When Police Stop Investigating Crime (fuel theft)* — **fixed a duplicated
  `### The diversity dimension` heading** (the preceding "What it means when
  police stop policing" line had lost its `###`). One diagram in the dense
  "Islands of enquiry" / "Cooperation crisis" stretch would help. (Now has
  takeaways.)
- *Why Medium Risk Is the Safe Option* — already a model piece; takeaways added.
- *Self-Selection Policing* — strong; takeaways added.
- *A Police Leader's Guide to AI* — exemplary use of diagrams/tables; lightly
  over-bolded in places (defensible for a reference piece). A pull quote was added
  to demonstrate the device, lifting an existing line.
- *Sir Robert Peel* and the other Influential People essays — essayistic register,
  long paragraphs are deliberate; a single pull quote each would add a beat
  without touching the argument.

---

## 3. Format / structure recommendations

What was added, and where each device belongs:

| Device | Where | Status |
| --- | --- | --- |
| **Reading measure** (narrow text column) | all articles | shipped |
| **Lead paragraph + drop cap** | all articles | shipped |
| **Reading progress bar** | all articles | shipped (`ReadingProgress.astro`) |
| **"On this page" contents** | articles with ≥3 sections | shipped (`ArticleContents.astro`); auto-detects whether sections are `##` or `###` |
| **Key takeaways box** | long essays, via `keyTakeaways` frontmatter | shipped on 8 essays |
| **Pull quote** | mid-article beats | shipped (`PullQuote.astro`), used in 4 MDX pieces |
| **Dark mode** | whole site | shipped — CSS-variable palette + class toggle |
| **Footnote citations** | articles with numeric refs | GFM footnotes styled; flagship piece converted |

**Heading levels.** Most articles split their sections with `###` (h3) rather than
`##` (h2). The contents rail handles both, but standardising on `##` for top-level
sections would be cleaner long-term and make the TOC logic trivial.

**Key takeaways** is a pure-frontmatter field (`keyTakeaways: []`) that touches no
prose. It is now on eight essays (legal aid, fuel theft, risk grading,
self-selection, neighbourhood policing, cognitive diversity, Palantir, burnout);
extend to any remaining long pieces the same way.

**Pull quotes.** `<PullQuote>` works in `.mdx` today and is used in the AI guide,
PoliceAI, the deepfakes piece and the civil-orders guide. To use it in the many
`.md` essays, those files need converting to `.mdx` (a mechanical change) — worth
doing for the flagship essays.

**Dark mode.** Colours are now CSS variables (RGB channels) in `global.css`, with
the Tailwind tokens compiled to `rgb(var(--x) / <alpha-value>)` so opacity
modifiers keep working. A `.dark` class on `<html>` reskins everything; a
no-flash inline script in `BaseLayout` sets it pre-paint from saved choice or OS
preference, and a header toggle (desktop + mobile) flips and persists it. Code
blocks are pinned to a dark surface in both themes for legibility.

**Footnotes.** GFM footnotes (`[^1]` … `[^1]: …`) are styled across the site
(superscript refs, a "Notes" section, backrefs). `the-murder-of-henry-nowak`
was converted from inline `[n]` + a manual Sources list as the flagship. Note
that some `[n]` patterns are law-report years (e.g. `Boness [2005]`,
`Cadder … [2010]`) and must be left alone.

---

## 4. Prioritised backlog

**Shipped since**
- **Five flagship essays converted `.md` → `.mdx`** (legal aid, risk grading,
  self-selection, Peel, Sherman) with a mid-article `PullQuote` in each. Note
  the gotcha: MDX rejects `<https://…>` autolinks — rewrite them as
  `[url](url)` when converting.
- **Related reading** — `RelatedArticles.astro` shows up to three tag-matched
  articles at the foot of each piece (wired into `ArticleLayout`).
- **Breadcrumbs** — `Breadcrumbs.astro` on all eight `/data` pages, surfacing the
  trail the JSON-LD already described.

**Medium**
1. **Data Explorer discoverability** — `/data/explore` is only linked from inside
   the dashboard; promote it.
2. **Convert further numeric-citation articles** to GFM footnotes (e.g. the draft
   self-selection precursor) once out of draft.

**Lower**
3. Author archive pages (matters only if the site goes multi-author).
4. Research page — **partly done.** The source selector and the four search
   filters now collapse behind a "Refine sources & filters" disclosure so the
   search box leads; sensible defaults (all sources, free-to-read) apply whether
   or not it is opened. The briefing/search mode toggle was left as-is — it
   already reads as a filled-primary / outlined-secondary pair, not two equal
   tabs.
5. **Heading levels — mostly done.** Top-level sections are now `##` everywhere
   except two articles (`martyns-law`, `the-hidden-crisis` burnout) that carry a
   genuine but inconsistent two-level structure and need an authorial pass before
   flattening. The `ArticleContents` TOC still infers the section level, so it
   keeps working for those two; the heuristic can be dropped once they're fixed.

---

## Files changed in this pass

- `src/styles/global.css` — reading measure, lead + drop cap, heading rhythm.
- `tailwind.config.mjs` — `prose` token retuned to 36rem (now used).
- `src/layouts/ArticleLayout.astro` — wires in progress bar, contents rail,
  takeaways; computes the section level for the TOC.
- `src/pages/[section]/[slug].astro` — passes `headings` and `keyTakeaways`.
- `src/content/config.ts` — optional `keyTakeaways` field.
- `src/pages/index.astro` — magazine masthead + card grid.
- New components: `ReadingProgress.astro`, `ArticleContents.astro`,
  `KeyTakeaways.astro`, `PullQuote.astro`.
- `src/components/ArticleCard.astro` — `stack` layout.
- `src/components/Header.astro` — mobile-menu a11y.
- `src/components/SectionBadge.astro` — stronger weight.
- Content: `keyTakeaways` added to four essays; duplicate heading fixed in the
  fuel-theft article; a pull quote added to the AI guide.
