// The two photo-led social-share card types, and the rule that picks between
// them and the typographic card. This is the system set out in
// docs/design/design-lab.html, drawn in the site's live Blue Book palette:
//
//   Type A · Photograph    The hero fills the card; a scrim along the bottom
//                          carries the section, the headline and the byline.
//   Type B · Portrait split A face or a square keeps a full-height plate on the
//                          right, the type takes the left, and the accent rule
//                          is the seam between them.
//   Type C · Typographic    Charts, diagrams, logos and anything with no usable
//                          photograph — rendered by src/lib/og-card.mjs.
//
// Kept as a plain module with no Astro or sharp imports, so the layout maths is
// unit-testable and the OG endpoint (src/pages/og/[section]/[slug].jpg.ts) can
// do the pixel work with `sharp`.

import { INK, PAPER, escapeXml } from './og-card.mjs';
import { estimateWidth, fitLines } from './og-wrap.mjs';

export const WIDTH = 1200;
export const HEIGHT = 630;

// --accent-light from the night palette in src/styles/global.css. Both photo
// card types set their labels on ink, so they take the palette's brightest blue
// rather than the light-surface accent, which would go muddy on a dark ground.
export const ACCENT_ON_INK = '#97d3ff';

const SERIF = "Georgia, 'Times New Roman', serif";
// The label voice. The rasteriser has no webfonts, so this resolves to whatever
// sans the render host provides — tracked-out uppercase is what carries the
// voice here, not the specific face.
const SANS = "'DejaVu Sans', 'Liberation Sans', Helvetica, Arial, sans-serif";

// The masthead rule: the same accent-into-ink two-segment rule that opens the
// typographic card and sits above every h2 in an article.
const RULE_HEIGHT = 8;
const RULE_ACCENT_WIDTH = 220;

// The mark is raster artwork, so each renderer returns where to composite it
// rather than inlining the logo into the SVG.
export const MARK_SIZE = 44;

const DOMAIN = 'thinkingaboutpolicing.org';

// ── Which card an article gets ─────────────────────────────────────────────

// Type A needs a shape that survives the crop to 1.905:1, and enough pixels to
// enlarge without falling apart. The floor is 500px rather than the card's own
// 1200: a card is rendered around 600px wide in a feed, so a 500px source holds
// up there even though it would not stand being printed. Below that there is
// genuinely nothing to work with, which is what Type C is for.
const A_MIN_ASPECT = 1.15;
const A_MIN_WIDTH = 500;

// Type B's plate is 500×630, so a portrait or square only needs to fill that.
const B_MAX_ASPECT = A_MIN_ASPECT;
const B_MIN_EDGE = 380;

// Drawn artwork — a chart, a diagram, a logo — sits on a pale flat ground; a
// photograph does not. Across this site's heroes drawn artwork runs 64–75%
// near-white pixels while the palest photograph (a floodlit stadium) reaches
// 16%, so a third of the frame is a safe line. Drawn artwork always takes
// Type C: cropping a chart to either card shape takes the axis labels with it.
export const PALE_GROUND_LIMIT = 0.35;
const NEAR_WHITE = 238;

// The share of a picture that is near-white, from raw interleaved pixels of
// `channels` bytes each (greyscale, RGB and RGBA all welcome). Measure it on a
// small downsample — this is a judgement about the whole frame, not the detail.
export function paleGroundShare(pixels, channels = 3) {
  let pale = 0;
  let total = 0;
  for (let i = 0; i + channels <= pixels.length; i += channels) {
    const r = pixels[i];
    const g = channels > 1 ? pixels[i + 1] : r;
    const b = channels > 2 ? pixels[i + 2] : r;
    if (r > NEAR_WHITE && g > NEAR_WHITE && b > NEAR_WHITE) pale += 1;
    total += 1;
  }
  return total ? pale / total : 0;
}

// Pick the card type for one hero from its dimensions and how pale its ground
// is. Returns 'A', 'B' or 'C'; a hero that cannot be measured at all is 'C'.
export function planCard({ width, height, paleGround = 0 } = {}) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 'C';
  if (paleGround > PALE_GROUND_LIMIT) return 'C';

  const aspect = width / height;
  if (aspect >= A_MIN_ASPECT && width >= A_MIN_WIDTH) return 'A';
  if (aspect < B_MAX_ASPECT && width >= B_MIN_EDGE && height >= B_MIN_EDGE) return 'B';
  return 'C';
}

const headlineTspans = (lines, x, firstBaseline, lineHeight) => lines
  .map((l, i) => `<tspan x="${x}" y="${firstBaseline + i * lineHeight}">${escapeXml(l)}</tspan>`)
  .join('');

// ── Type A · Photograph ────────────────────────────────────────────────────

const A_MARGIN = 64;
const A_MEASURE = 1000;
const A_BYLINE_BASELINE = 590;
const A_RULE_Y = 552;

// The transparent layer that goes over the photograph. The scrim rises only as
// far as the type needs it to, so a short headline leaves more of the picture
// in the clear. Returns the SVG and where the mark goes.
export function renderTypeA({
  title,
  section,
  author = 'Nathan Tracey',
  domain = DOMAIN,
  widthOf = estimateWidth,
}) {
  const { fontSize, lines, lineHeight } = fitLines(title, {
    widthOf,
    sizes: [56, 50, 44],
    maxWidth: A_MEASURE,
    maxLines: 3,
  });
  const firstBaseline = A_RULE_Y - 32 - (lines.length - 1) * lineHeight;
  const kicker = firstBaseline - fontSize - 26;
  const scrimTop = Math.max(150, kicker - 96);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="scrim" x1="0" y1="${scrimTop}" x2="0" y2="${HEIGHT}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${INK}" stop-opacity="0"/>
      <stop offset="0.38" stop-color="${INK}" stop-opacity="0.72"/>
      <stop offset="1" stop-color="${INK}" stop-opacity="0.96"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${scrimTop}" width="${WIDTH}" height="${HEIGHT - scrimTop}" fill="url(#scrim)"/>
  <rect x="0" y="0" width="${WIDTH}" height="${RULE_HEIGHT}" fill="${INK}"/>
  <rect x="0" y="0" width="${RULE_ACCENT_WIDTH}" height="${RULE_HEIGHT}" fill="${ACCENT_ON_INK}"/>
  <rect x="${A_MARGIN}" y="${kicker - 32}" width="56" height="4" fill="${ACCENT_ON_INK}"/>
  <text x="${A_MARGIN}" y="${kicker}" font-family="${SANS}" font-size="20" font-weight="600" letter-spacing="4.5" fill="${ACCENT_ON_INK}">${escapeXml(String(section ?? '').toUpperCase())}</text>
  <text font-family="${SERIF}" font-size="${fontSize}" font-weight="700" fill="${PAPER}">${headlineTspans(lines, A_MARGIN, firstBaseline, lineHeight)}</text>
  <rect x="${A_MARGIN}" y="${A_RULE_Y}" width="${WIDTH - A_MARGIN * 2}" height="1" fill="${PAPER}" fill-opacity="0.3"/>
  <text x="${A_MARGIN + MARK_SIZE + 14}" y="${A_BYLINE_BASELINE}" font-family="${SANS}" font-size="21" letter-spacing="0.5" fill="${PAPER}" fill-opacity="0.82">${escapeXml(author)} · ${escapeXml(domain)}</text>
</svg>`;

  return { svg, mark: { left: A_MARGIN, top: A_BYLINE_BASELINE - 33, size: MARK_SIZE } };
}

// ── Type B · Portrait split ────────────────────────────────────────────────

export const B_PLATE_WIDTH = 500;
const B_SEAM = 5;
const B_MARGIN = 56;
const B_TEXT_WIDTH = WIDTH - B_PLATE_WIDTH - B_SEAM - B_MARGIN * 2;

// The whole card except the plate: an ink ground, the accent seam, and the type
// centred on the left so a short headline is not stranded at the bottom.
// Returns the SVG, where the mark goes, and where to composite the plate.
export function renderTypeB({
  title,
  section,
  author = 'Nathan Tracey',
  domain = DOMAIN,
  widthOf = estimateWidth,
}) {
  const { fontSize, lines, lineHeight } = fitLines(title, {
    widthOf,
    sizes: [46, 40, 35],
    maxWidth: B_TEXT_WIDTH,
    maxLines: 4,
  });

  // Block: kicker (28 above the headline), headline, rule (40 below it), byline.
  const blockHeight = 28 + fontSize + 28 + (lines.length - 1) * lineHeight + 40 + 38;
  const kicker = Math.round((HEIGHT - blockHeight) / 2) + 28;
  const firstBaseline = kicker + 28 + fontSize;
  const ruleY = firstBaseline + (lines.length - 1) * lineHeight + 40;
  const byline = ruleY + 38;
  const seamX = WIDTH - B_PLATE_WIDTH - B_SEAM;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${INK}"/>
  <rect x="${seamX}" y="0" width="${B_SEAM}" height="${HEIGHT}" fill="${ACCENT_ON_INK}"/>
  <rect x="0" y="0" width="${seamX}" height="${RULE_HEIGHT}" fill="${ACCENT_ON_INK}"/>
  <text x="${B_MARGIN}" y="${kicker}" font-family="${SANS}" font-size="19" font-weight="600" letter-spacing="4.5" fill="${ACCENT_ON_INK}">${escapeXml(String(section ?? '').toUpperCase())}</text>
  <text font-family="${SERIF}" font-size="${fontSize}" font-weight="700" fill="${PAPER}">${headlineTspans(lines, B_MARGIN, firstBaseline, lineHeight)}</text>
  <rect x="${B_MARGIN}" y="${ruleY}" width="${B_TEXT_WIDTH}" height="1" fill="${PAPER}" fill-opacity="0.3"/>
  <text x="${B_MARGIN + MARK_SIZE + 14}" y="${byline}" font-family="${SANS}" font-size="20" letter-spacing="0.5" fill="${PAPER}" fill-opacity="0.82">${escapeXml(author)} · ${escapeXml(domain)}</text>
</svg>`;

  return {
    svg,
    mark: { left: B_MARGIN, top: byline - 32, size: MARK_SIZE },
    plate: { left: WIDTH - B_PLATE_WIDTH, top: 0, width: B_PLATE_WIDTH, height: HEIGHT },
  };
}
