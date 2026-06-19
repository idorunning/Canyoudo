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
| **Key takeaways box** | long essays, via `keyTakeaways` frontmatter | shipped on 4 essays; roll out to more |
| **Pull quote** | mid-article beats | component shipped (`PullQuote.astro`), used in 1 MDX piece; extend to others |

**Heading levels.** Most articles split their sections with `###` (h3) rather than
`##` (h2). The contents rail handles both, but standardising on `##` for top-level
sections would be cleaner long-term and make the TOC logic trivial.

**Rolling out key takeaways.** It is a pure-frontmatter field (`keyTakeaways: []`)
that touches no prose. Good next candidates: the neighbourhood-policing pieces,
the burnout essay, the cognitive-diversity essay, Palantir, and nitazenes.

**Pull quotes.** `<PullQuote>` works in `.mdx` today. To use it in the many `.md`
essays, those files would need converting to `.mdx` (a mechanical change) — worth
doing for the flagship essays, recommended rather than done this pass.

---

## 4. Prioritised backlog (deferred)

**High value**
1. **Dark mode** — theme tokens + a toggle; needs every component checked, hence
   deferred from this pass.
2. **Roll out key takeaways and pull quotes** to the remaining flagship essays.
3. **Footnote-style citations** to replace inline numeric markers.

**Medium**
4. **Related articles by tag** at the foot of each article (the data — tags +
   topics — already exists) to lift in-site engagement.
5. **Breadcrumbs on `/data` subpages** (JSON-LD breadcrumbs already exist; surface
   them visually).
6. **Data Explorer discoverability** — `/data/explore` is only linked from inside
   the dashboard; promote it.

**Lower**
7. Author archive pages (matters only if the site goes multi-author).
8. Research page: the briefing/search dual-mode UI could be simplified.
9. Standardise heading levels to `##` across articles.

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
