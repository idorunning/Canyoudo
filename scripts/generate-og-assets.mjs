// Generates the static brand raster assets that the meta tags and structured
// data reference but that can't be authored as code:
//   • public/og-default.png — the 1200×630 Open Graph / Twitter card used on
//     every page without its own hero image (home, /about, /data, sections, …).
//   • public/logo.png       — the square raster logo for Organization JSON-LD
//     (Google's logo guidelines want a raster image, not the SVG favicon).
//
// Run once and commit the output: `node scripts/generate-og-assets.mjs`.
// Re-run whenever the wording or brand colours change. Uses `sharp` (already a
// devDependency) to rasterise hand-written SVG so the result is crisp and
// reproducible without any binary-editing.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'public';
mkdirSync(OUT, { recursive: true });

// Brand palette (mirrors tailwind.config.mjs).
const INK = '#1a1817';
const PAPER = '#f7f3eb';
const ACCENT = '#7c2828';
const MUTED = '#9c9389';

const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${INK}"/>
  <rect x="0" y="0" width="1200" height="10" fill="${ACCENT}"/>
  <rect x="80" y="120" width="64" height="6" fill="${ACCENT}"/>
  <text x="80" y="116" font-family="Georgia, 'Times New Roman', serif" font-size="26" letter-spacing="6" fill="${ACCENT}">A WEBLOG BY NATHAN TRACEY</text>
  <text x="80" y="250" font-family="Georgia, 'Times New Roman', serif" font-size="92" font-weight="700" fill="${PAPER}">Thinking About</text>
  <text x="80" y="358" font-family="Georgia, 'Times New Roman', serif" font-size="92" font-weight="700" font-style="italic" fill="${PAPER}">Policing</text>
  <text x="80" y="470" font-family="Georgia, 'Times New Roman', serif" font-size="34" fill="${MUTED}">Evidence-based writing on policing</text>
  <text x="80" y="516" font-family="Georgia, 'Times New Roman', serif" font-size="34" fill="${MUTED}">and public policy.</text>
  <text x="80" y="588" font-family="Georgia, 'Times New Roman', serif" font-size="26" letter-spacing="2" fill="${MUTED}">thinkingaboutpolicing.org</text>
</svg>`;

// Square logo: the same dark tile + serif "T" as favicon.svg, at raster size.
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="64" fill="${INK}"/>
  <text x="256" y="352" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="300" font-weight="700" fill="${PAPER}">T</text>
</svg>`;

await sharp(Buffer.from(ogSvg)).png().toFile(join(OUT, 'og-default.png'));
await sharp(Buffer.from(logoSvg)).png().toFile(join(OUT, 'logo.png'));

console.log('Wrote public/og-default.png (1200×630) and public/logo.png (512×512)');
