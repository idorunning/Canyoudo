// Builds the 1200×630 branded title-card SVG — Type C of the share-card system
// in docs/design/design-lab.html, used for charts, diagrams, logos and anything
// with no usable photograph. Kept as a plain module — with
// no Astro or sharp imports — so the wrapping logic can be unit-tested and so
// the OG endpoint (src/pages/og/[section]/[slug].jpg.ts) can rasterise the SVG
// with `sharp`, exactly as scripts/generate-brand-assets.mjs does for the static
// default card. Mirrors that script's palette and serif styling so the
// per-article cards stay brand-consistent with og-default.png.

import { estimateWidth, fitLines, wrapToWidth } from './og-wrap.mjs';

// The site's live palette, mirroring src/styles/global.css — paper-50, ink-900,
// accent and ink-600 of the Blue Book system. A shared link should look like
// the page it opens, so these four values move only when the tokens do.
export const INK = '#0c1728';
export const PAPER = '#fbfdfe';
export const ACCENT = '#1059ac';
export const MUTED = '#5d6978';
export const RULE = '#d8dfe7';

// Reserved square at the top right for the mark, composited by the endpoint
// after rasterising (the logo is raster artwork, so it cannot live in the SVG
// without inlining it as a data URI on every card).
export const MARK_SIZE = 108;
export const MARK_X = 1200 - 80 - MARK_SIZE;
export const MARK_Y = 74;

const WIDTH = 1200;
const HEIGHT = 630;
const MARGIN = 80;
const USABLE = WIDTH - MARGIN * 2; // 1040px of text width

// The band the headline sits in: under the section eyebrow at y=160, and clear
// of the rule above the byline at y=540. A four-line title set too big would
// otherwise cross that rule, so the size stepping below is held to this band.
const TITLE_TOP = 180;
const TITLE_BOTTOM = 520;
const TITLE_MIN_TOP = 190;

// Where the block starts: vertically centred in the band, never above its top.
const blockTopFor = (lines, lineHeight) => Math.max(
  TITLE_MIN_TOP,
  Math.round((TITLE_TOP + TITLE_BOTTOM) / 2 - (lines.length * lineHeight) / 2)
);

const lastBaselineFor = (lines, lineHeight, fontSize) =>
  blockTopFor(lines, lineHeight) + (lines.length - 1) * lineHeight + fontSize;

// Escape the five XML entities so titles containing & < > " ' can't break the
// SVG (article titles routinely contain ampersands and quotes).
export function escapeXml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]
  ));
}

// Wrapping and size-stepping live in og-wrap.mjs, so the type-C card, the two
// photo cards and the OG endpoint all break lines the same way. `wrapTitle` is
// kept as the estimate-only entry point.
export function wrapTitle(title, { fontSize, maxWidth = USABLE, maxLines = 4 } = {}) {
  return wrapToWidth(title, { fontSize, maxWidth, maxLines });
}

// Render the full card SVG for one article.
export function renderCardSvg({
  title,
  section,
  author = 'Nathan Tracey',
  domain = 'thinkingaboutpolicing.org',
  widthOf = estimateWidth,
}) {
  const { fontSize, lines, lineHeight } = fitLines(title, {
    widthOf,
    sizes: [80, 72, 64, 56],
    maxWidth: USABLE,
    maxLines: 4,
    lineHeightRatio: 1.12,
    fits: (l) => lastBaselineFor(l.lines, l.lineHeight, l.fontSize) <= TITLE_BOTTOM,
  });

  const blockTop = blockTopFor(lines, lineHeight);
  const serif = "Georgia, 'Times New Roman', serif";
  const sans = "'DejaVu Sans', 'Liberation Sans', Helvetica, Arial, sans-serif";
  // The label voice. The rasteriser has no webfonts, so this resolves to
  // whatever sans the render host provides — tracked-out uppercase is what
  // carries the voice here, not the specific face.

  const titleTspans = lines
    .map((l, i) => `<tspan x="${MARGIN}" y="${blockTop + i * lineHeight + fontSize}">${escapeXml(l)}</tspan>`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${PAPER}"/>
  <!-- The masthead rule: an accent lead into the ink bar, the same two-segment
       rule that sits above every h2 in an article. -->
  <rect x="0" y="0" width="${WIDTH}" height="10" fill="${INK}"/>
  <rect x="0" y="0" width="240" height="10" fill="${ACCENT}"/>
  <text x="${MARGIN}" y="160" font-family="${sans}" font-size="24" font-weight="600" letter-spacing="5" fill="${ACCENT}">${escapeXml(String(section).toUpperCase())}</text>
  <text font-family="${serif}" font-size="${fontSize}" font-weight="700" fill="${INK}">${titleTspans}</text>
  <rect x="${MARGIN}" y="540" width="${WIDTH - MARGIN * 2}" height="2" fill="${INK}"/>
  <text x="${MARGIN}" y="584" font-family="${sans}" font-size="23" letter-spacing="1" fill="${MUTED}">${escapeXml(author)} · ${escapeXml(domain)}</text>
</svg>`;
}
