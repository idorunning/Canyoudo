# The Blue Book — the site's design language

Status: **live** (July 2026). Replaces the "Evidence Desk" palette and the
four candidate colour directions that used to sit on `/design-preview`.

The system is named for the thing it is trying to feel like: a bound
government report with working instruments in it. The live reference —
tokens, surfaces, elevation, type, controls, rendered from the real CSS — is
`/design-preview` (internal, noindexed, unlinked). This file is the *why*.

---

## 1. The brief, and what was actually wrong

The ask was: not AI-generated-looking, not flat, modern, technically expert,
one design language across the whole site, and a fresher palette — probably
blue, possibly dark.

Four things were making the old design read as generated rather than designed.

**A teal accent on near-white.** `#0f766e` is Tailwind's `teal-700`. Teal,
indigo and violet on white are the house palette of every template and every
generated landing page; the tell is not that the colour is bad but that it is
a *default*. Search-engine and design-press write-ups of the "AI look" in
2025–26 name exactly this: the same indigo-ish family and the same washes,
because tools trained on 2020–21 dribbble output keep reproducing them.

**Decoration standing in for structure.** Two floating gradient orbs
(`hero-orb-a/b`) and an idle `soft-pulse` glow were defined in the
stylesheet — the aurora-blob vocabulary — plus pulsing dots used to imply
"live". All of it was ornament that carried no information. (The orbs turned
out to be dead code, which rather makes the point.)

**No depth at all.** The page ground and the cards were both `--paper-50`.
A card was a white rectangle on a white page with a hairline round it, and a
1px/4%-opacity shadow. Nothing was above anything else, so nothing read as an
object — the definition of flat.

**Micro-typography without a system.** The same uppercase label was
hand-rolled at `10.5px`/`0.66rem`/`0.68rem`/`0.7rem` with four different
letter-spacings across pages, and `rounded-full`, `rounded-md`,
`rounded-lg`, `rounded-xl`, `rounded-2xl` and `rounded-[18px]` all appeared
as card and button radii.

## 2. The three rules

Everything in `src/styles/global.css` follows from these.

**One hue.** Every neutral is a blue-grey on the same ~254° OKLCH axis as the
accent, so no colour in the palette is an orphan. Colour is reserved for
meaning: `accent` = interactive, `signal` = a figure worth stopping on,
`flag` = harm or a withdrawn claim. Decoration gets none.

**Surfaces stack.** `--canvas` is the desk; `--paper-50` is a sheet resting
on it; `--paper-200` is a well cut into the sheet. Every panel declares which
of the three it is and takes the matching edge and elevation. The depth in
this design is one relationship — ground below, sheet above — repeated
everywhere, which is why it holds up on pages nobody redesigned.

**Ramps are perceptual.** Every value was generated in OKLCH at fixed
lightness steps and checked for contrast: body ink ≥ 7:1, meta ink and the
accent ≥ 4.5:1 on every surface they are actually used on. That is why the
neutrals step evenly instead of bunching in the mid-tones the way an
eyeballed hex ramp does.

## 3. The palette

Light mode ("day"):

| Token | Value | Job |
|---|---|---|
| `--canvas` | `#e9eff6` | The desk — the page ground |
| `--paper-50` | `#fbfdfe` | The sheet — cards, panels, chrome |
| `--paper-100` | `#f0f5fa` | A band — secondary regions |
| `--paper-200` | `#dee7f1` | A well — inputs, code, chart grounds |
| `--ink-900` … `--ink-200` | `#0c1728` → `#d8dfe7` | Eight perceptual steps of blue-grey |
| `--accent` | `#1059ac` | Links, controls, active state |
| `--accent-dark` | `#0a448f` | Hover / pressed |
| `--accent-light` | `#3b90e0` | Washes, and text on the night surface |
| `--signal` | `#a76319` | A live reading, a headline figure |
| `--flag` | `#b53434` | Harm, or a claim withdrawn |
| `--rule` | `#0c1728` | The structural 2px line |

Dark mode is the same room with the lights off, not a different room: the
desk drops to `#040a14`, sheets to `#0d1520`, and the accent lifts to
`#63b2fe` (8.2:1 on its own ground). The `--night-*` surface — footer, quote
plate, tools CTA — stays dark in *both* themes; it is an inverse surface, not
a theme flip.

Two details are worth keeping:

- **`--rule` is its own token, not `--ink-900`.** Inverting ink for dark mode
  would print a bright white bar under every section head. On navy the rule
  steps back to `#5a6a7e`.
- **The chart ramp is separate from the brand.** Series colours are
  categorical, matched in lightness so no series shouts louder than another.
  The 14-colour crime-category scale in `src/lib/crime-map-core.mjs` was left
  alone deliberately — it is CVD-validated against both map surfaces, and
  brand tidiness is not a good enough reason to break that.

## 4. Depth, without skeuomorphism

- **Elevation** is `--e1`…`--e4`, each a *pair* of shadows: a tight contact
  shadow plus a wide ambient one. One blurred rectangle reads as a grey
  smudge; two read as an object above a surface. Shadows are tinted
  blue-black (`--shadow-rgb`) so an elevated card looks lit rather than
  dirty.
- **Edges** carry as much of the effect as the shadows. A raised surface gets
  `inset 0 1px 0` of white at 90% (`--edge-lit`); a well gets an inner shadow
  and no highlight. That one hairline is the whole difference between a card
  that sits *on* the page and a rectangle painted on it.
- **Radii** are four steps — 3/6/10/14px — used for what they are named for.
  Pills are for status dots, never buttons.
- **Texture** is a 1px ruled grid (`.grid-ground`, and the body's
  `.paper-grain`), masked out radially. Drafting paper. It is texture derived
  from measurement, which is the one kind this site can justify.

Cards press back down on `:active` — the shadow shrinks rather than
disappearing — so a click feels attached to the page.

## 5. Type: one superfamily, two jobs

| Face | Job |
|---|---|
| **Source Sans 3** (variable, self-hosted) | The institution *and* its instruments: nav, headlines, card titles, buttons, and every label, date and figure |
| **Source Serif 4** (variable, self-hosted) | The argument: article bodies, standfirsts, pull quotes |

Plus Jakarta Sans was replaced because it is a geometric-humanist face that
reads as a product-marketing site. Source Sans 3 is plain and quiet, and it is
the sans half of the superfamily the site's reading face already comes from —
so a caption and the paragraph under it agree by construction rather than by
tuning.

**There is no monospace webfont.** An earlier draft of this system set the
instrument voice in IBM Plex Mono, on the theory that a fixed pitch says "this
is a reading, not a sentence". In practice it was harder to read at 11px, and
it made ordinary metadata — a date, a section name, a source count — look like
terminal output, on a site whose readers are police officers and policy people
rather than developers. The voice survives; the face does not. Labels are
tracked-out uppercase in the sans, and every figure carries `tabular-nums`,
which is what was actually doing the work of keeping columns aligned.

Mono is now used for exactly one thing — code samples — and comes from the
system stack, so it costs no download.

Four label *roles*, one face and one class each. With the mono gone they are
separated by colour, position and tabular figures rather than by typeface —
which is the honest description, and still enough to tell a section label from
a reading. Using the class rather than re-deriving the values inline is what
carries the language into pages nobody redesigned:

| Class | Use |
|---|---|
| `.u-eyebrow` | Opens a page. Tracked caps led by a short accent rule. |
| `.u-datum` | A reading: a date, a count, a state, a source. Tracked caps, tabular figures. |
| `.u-kicker` | Editorial chrome: section and card kickers. |
| `.u-figure` | A number printed at size — a stat, a rank, a delta. Tabular figures. |

## 6. The furniture

- **`.rule-head`** — kicker, title, 2px rule, a reading on the right. The
  strongest piece in the system: it is what makes a page read as a document
  rather than a feed. Used on every index, section row and dashboard panel.
- **`.surface-sheet` / `.surface-well` / `.surface-night` /
  `.surface-reading`** — the four declarations a panel can make. Articles and
  section listings sit on `.surface-reading`: a paper sheet on the tinted
  desk, which is the single change that gives the reading experience depth.
- **`.btn` + `--primary/--secondary/--ghost/--night`** — one button grammar,
  replacing the pill-shaped buttons that were defined inline on twelve pages.
- **`.chip`** — a filter, tag or source, in the label voice.
- **`.tile-blank`** — a card with no photograph gets the measured ground with
  its initial ghosted into it, rather than an empty rectangle. A grid of
  blank tiles is one of the things that made the card rows read as a
  template.

## 7. Motion

Motion answers the pointer or reports a state change. Nothing animates at
rest. The idle `soft-pulse` and the pulsing "live" dots were removed; "live"
is now a readout that says what it is (`Live · refreshed on load`),
which is both more honest and more legible. Scroll reveal, the arrow nudge
and the card lift all remain, all behind `prefers-reduced-motion`.

## 8. Applying it

The tokens are a stable API: retune `global.css` and the whole site follows.
When adding a surface:

1. Decide which layer it is — sheet, band, well or night — and take the
   matching class. Do not invent a background.
2. Label it with one of the four voices. Do not hand-roll an uppercase run.
3. Head it with `.rule-head` if it is a section, `.u-eyebrow` if it is a page.
4. Radius from the four-step scale; elevation from `e1`–`e4`.
5. If a colour is not carrying meaning, it is the wrong colour.

If what you need is not on `/design-preview`, add it there first.

## 9. What this system refuses

Written out on `/design-preview` §05, and worth repeating here because it is
the part that decays:

- No gradient as decoration — no aurora grounds, floating orbs, gradient
  headline text.
- No second or third brand hue "because the section needed some colour".
- No pill buttons, and no per-component radius.
- No flat card separated by nothing but a hairline.
- No idle animation.
- No hand-rolled micro-labels.

## 10. Files this touched

- `src/styles/global.css` — the token blocks, the component layer (surfaces,
  controls, label voices, `.rule-head`, `.grid-ground`, `.tile-blank`), prose
  restyling, the map explorer moved onto tokens, dead orb/pulse CSS deleted.
- `tailwind.config.mjs` — the Source families, `canvas`/`rule`/`signal`/`flag`/
  `chart-*` colours, the `e1`–`e4` elevation scale, the four radii.
- `src/layouts/BaseLayout.astro` — font imports, split light/dark
  `theme-color`.
- `src/components/*`, `src/pages/*` — the language applied: header, footer,
  cards, badges, takeaways, pull quotes, gates, forms, article layout, the
  homepage, the tools portal, and the eyebrow rolled across every page.
- `src/lib/og-card.mjs`, `scripts/generate-brand-assets.mjs`,
  `public/manifest.webmanifest` — share cards, favicons and PWA chrome moved
  onto the new palette, so a shared link looks like the page it opens.
  **Re-run `node scripts/generate-brand-assets.mjs` to regenerate the static
  PNGs** (the committed ones still carry the old teal until you do).
