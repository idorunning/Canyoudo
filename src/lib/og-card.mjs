// Builds the 1200×630 branded title-card SVG used as the social-share image
// (og:image / twitter:image) for every article. Kept as a plain module — with
// no Astro or sharp imports — so the wrapping logic can be unit-tested and so
// the OG endpoint (src/pages/og/[section]/[slug].png.ts) can rasterise the SVG
// with `sharp`, exactly as scripts/generate-og-assets.mjs does for the static
// default card. Mirrors that script's palette and serif styling so the
// per-article cards stay brand-consistent with og-default.png.

// Brand palette (mirrors tailwind.config.mjs / generate-og-assets.mjs).
export const INK = '#1a1817';
export const PAPER = '#f7f3eb';
export const ACCENT = '#7c2828';
export const MUTED = '#9c9389';

const WIDTH = 1200;
const HEIGHT = 630;
const MARGIN = 80;
const USABLE = WIDTH - MARGIN * 2; // 1040px of text width

// Escape the five XML entities so titles containing & < > " ' can't break the
// SVG (article titles routinely contain ampersands and quotes).
export function escapeXml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]
  ));
}

// Greedy word-wrap into lines that fit `maxWidth` at `fontSize`. SVG <text>
// does not wrap, so we estimate each line's width from an average glyph width
// (~0.5em for this serif at display sizes) and break on whole words. Lines
// beyond `maxLines` are dropped and the last kept line gets an ellipsis.
export function wrapTitle(title, { fontSize, maxWidth = USABLE, maxLines = 4 } = {}) {
  const charWidth = fontSize * 0.5;
  const maxChars = Math.max(8, Math.floor(maxWidth / charWidth));
  const words = String(title ?? '').trim().split(/\s+/).filter(Boolean);

  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);

  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[\s.,;:]+$/, '')}…`;
    return kept;
  }
  return lines;
}

// Pick the largest font size at which the title fits within maxLines, so short
// titles read big and long ones step down gracefully before any truncation.
function chooseLayout(title) {
  for (const fontSize of [80, 72, 64, 56]) {
    const lines = wrapTitle(title, { fontSize, maxLines: 4 });
    if (lines.length <= 3 || fontSize === 56) {
      return { fontSize, lines, lineHeight: Math.round(fontSize * 1.12) };
    }
  }
  const fontSize = 56;
  return { fontSize, lines: wrapTitle(title, { fontSize, maxLines: 4 }), lineHeight: Math.round(fontSize * 1.12) };
}

// Render the full card SVG for one article.
export function renderCardSvg({ title, section, author = 'Nathan Tracey', domain = 'thinkingaboutpolicing.org' }) {
  const { fontSize, lines, lineHeight } = chooseLayout(title);

  // Vertically centre the title block in the area between the eyebrow and the
  // footer (roughly y=180–520), then lay the lines out from its top.
  const blockHeight = lines.length * lineHeight;
  const blockTop = Math.max(190, Math.round((180 + 520) / 2 - blockHeight / 2));
  const serif = "Georgia, 'Times New Roman', serif";

  const titleTspans = lines
    .map((l, i) => `<tspan x="${MARGIN}" y="${blockTop + i * lineHeight + fontSize}">${escapeXml(l)}</tspan>`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${INK}"/>
  <rect x="0" y="0" width="${WIDTH}" height="10" fill="${ACCENT}"/>
  <rect x="${MARGIN}" y="118" width="64" height="6" fill="${ACCENT}"/>
  <text x="${MARGIN}" y="160" font-family="${serif}" font-size="26" letter-spacing="6" fill="${ACCENT}">${escapeXml(String(section).toUpperCase())}</text>
  <text font-family="${serif}" font-size="${fontSize}" font-weight="700" fill="${PAPER}">${titleTspans}</text>
  <text x="${MARGIN}" y="578" font-family="${serif}" font-size="26" letter-spacing="2" fill="${MUTED}">${escapeXml(author)} · ${escapeXml(domain)}</text>
</svg>`;
}
