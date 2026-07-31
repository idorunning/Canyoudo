// Geometry and overlay artwork for the photo-led social-share card: the
// article's own hero image at 1200×630, finished with a brand band along the
// bottom. This is what X, LinkedIn, Facebook and WhatsApp show when someone
// shares an article, so the picture has to be the thing people see — the title
// is already printed next to the card by every one of those platforms, which is
// why nothing here repeats it.
//
// Kept as a plain module with no Astro or sharp imports, so the layout maths is
// unit-testable and the OG endpoint (src/pages/og/[section]/[slug].jpg.ts) can
// do the pixel work with `sharp`. src/lib/og-card.mjs still renders the
// text-only title card, which stands in for articles with no usable hero.

import { INK, PAPER, escapeXml } from './og-card.mjs';

export const WIDTH = 1200;
export const HEIGHT = 630;

// --accent-light from the night palette in src/styles/global.css. The band is
// ink, so the section label takes the palette's brightest blue rather than the
// light-surface accent, which would go muddy on a dark ground.
export const ACCENT_ON_INK = '#97d3ff';

// The masthead rule: the same accent-into-ink two-segment rule that opens the
// text card and sits above every h2 in an article.
const RULE_HEIGHT = 8;
const RULE_ACCENT_WIDTH = 220;

// The brand band. A gradient scrim rather than a solid bar, so it settles onto
// the photograph instead of boxing it in.
const BAND_TOP = 470;

// The mark, composited after rasterising (it is raster artwork, so inlining it
// in the SVG would base64 the logo into every card). logo-mark-dark.png is the
// light-on-dark cut, which is the one that belongs on the ink scrim.
export const MARK_SIZE = 64;
export const MARK_X = 64;
export const MARK_Y = HEIGHT - MARK_SIZE - 38;

// Text sits to the right of the mark, optically aligned with it.
const TEXT_X = MARK_X + MARK_SIZE + 22;
const WORDMARK_BASELINE = 562;
const LABEL_BASELINE = 596;

// Where a letterboxed hero is allowed to sit: full width less a margin, and
// clear of the brand band.
export const INSET_BOX = { left: 60, top: 24, width: WIDTH - 120, height: 446 };

// A hero smaller than the card gets scaled up, but only so far — past this the
// picture turns to mush and the card looks amateur rather than photographic.
const MAX_UPSCALE = 1.6;

// A hero only fills the frame when the crop needed to get it there is small
// enough to read as framing. The card is 1.905:1, so between 1.3 and 2.15 a
// cover-crop trims under a third of the height, or a tenth of the width, and
// sharp's attention strategy spends that on the empty edges. Outside that range
// — squares, portraits, tall photographs, wide charts — a crop would take the
// subject's head off or cut an axis away, so the hero is letterboxed whole onto
// a blurred blow-up of itself instead. Very small sources are letterboxed too:
// better a crisp small picture on a soft ground than a full-bleed smear.
const COVER_MIN_ASPECT = 1.3;
const COVER_MAX_ASPECT = 2.15;
const COVER_MIN_WIDTH = 380;

// Aspect ratio alone cannot tell a wide photograph from a wide chart, and a
// chart must never be cropped: the trim takes the axis labels, the legend or the
// caption with it. What separates them is the ground they are drawn on. Across
// this site's heroes, drawn artwork — charts, diagrams, screenshots — runs
// 64–75% near-white pixels, while the palest photograph (a floodlit stadium)
// reaches 16%, so a third of the frame is a safe line to draw between them.
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

// Decide how one hero meets the card. Takes its pixel dimensions and, when it
// has been measured, how pale its ground is (see paleGroundShare). Returns
// { layout: 'cover' } or { layout: 'inset', frame: { left, top, width, height } },
// where `frame` is where the whole picture lands on the card.
export function planHeroLayout({ width, height, paleGround = 0 }) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  const aspect = width / height;
  if (
    aspect >= COVER_MIN_ASPECT
    && aspect <= COVER_MAX_ASPECT
    && width >= COVER_MIN_WIDTH
    && paleGround <= PALE_GROUND_LIMIT
  ) {
    return { layout: 'cover' };
  }

  const scale = Math.min(INSET_BOX.width / width, INSET_BOX.height / height, MAX_UPSCALE);
  const frameWidth = Math.max(1, Math.round(width * scale));
  const frameHeight = Math.max(1, Math.round(height * scale));
  return {
    layout: 'inset',
    frame: {
      left: Math.round(INSET_BOX.left + (INSET_BOX.width - frameWidth) / 2),
      top: Math.round(INSET_BOX.top + (INSET_BOX.height - frameHeight) / 2),
      width: frameWidth,
      height: frameHeight,
    },
  };
}

// The transparent overlay laid over the hero: masthead rule, scrim, mark
// surround and brand line. `frame`, when given, draws a hairline around a
// letterboxed hero so it reads as a placed picture rather than a mistake.
export function renderHeroOverlaySvg({ section, siteName = 'Thinking About Policing', frame }) {
  const serif = "Georgia, 'Times New Roman', serif";
  const sans = "'DejaVu Sans', 'Liberation Sans', Helvetica, Arial, sans-serif";

  const frameStroke = frame
    ? `<rect x="${frame.left}" y="${frame.top}" width="${frame.width}" height="${frame.height}" `
      + `fill="none" stroke="${PAPER}" stroke-opacity="0.24" stroke-width="2"/>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="scrim" x1="0" y1="${BAND_TOP}" x2="0" y2="${HEIGHT}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${INK}" stop-opacity="0"/>
      <stop offset="0.42" stop-color="${INK}" stop-opacity="0.74"/>
      <stop offset="1" stop-color="${INK}" stop-opacity="0.95"/>
    </linearGradient>
  </defs>
  ${frameStroke}
  <rect x="0" y="${BAND_TOP}" width="${WIDTH}" height="${HEIGHT - BAND_TOP}" fill="url(#scrim)"/>
  <rect x="0" y="0" width="${WIDTH}" height="${RULE_HEIGHT}" fill="${INK}"/>
  <rect x="0" y="0" width="${RULE_ACCENT_WIDTH}" height="${RULE_HEIGHT}" fill="${ACCENT_ON_INK}"/>
  <text x="${TEXT_X}" y="${WORDMARK_BASELINE}" font-family="${serif}" font-size="30" font-weight="700" fill="${PAPER}">${escapeXml(siteName)}</text>
  <text x="${TEXT_X}" y="${LABEL_BASELINE}" font-family="${sans}" font-size="19" font-weight="600" letter-spacing="4" fill="${ACCENT_ON_INK}">${escapeXml(String(section ?? '').toUpperCase())}</text>
</svg>`;
}
