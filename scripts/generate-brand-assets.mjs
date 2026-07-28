// Generates every raster brand asset the site ships, from one master artwork.
//
// Source of truth: scripts/brand/logo-master.png — the TP roundel, trimmed of
// its original margin and re-padded to a square with a consistent 7% border, so
// every derived size has identical breathing room. Edit or replace that file and
// re-run this script; never hand-edit anything in public/.
//
//   node scripts/generate-brand-assets.mjs
//
// Outputs (all committed):
//   public/logo.png              512×512  Organization JSON-LD logo. Google's
//                                         structured-data guidance wants a
//                                         raster image on a solid ground.
//   public/logo-mark.png         512×512  Background keyed out, for the header
//                                         and footer where the mark sits on the
//                                         page's own paper colour.
//   public/logo-mark-dark.png    512×512  Same, with the black brushwork remapped
//                                         to paper tone. The mark is black ink on
//                                         white, so it is invisible on the dark
//                                         theme without this.
//   public/favicon.ico           16/32/48 Multi-size ICO. Browsers and crawlers
//                                         request /favicon.ico by path whether
//                                         or not a <link> points at it — before
//                                         this existed the site 404'd on it.
//   public/favicon-96.png        96×96    Google Search shows a favicon beside
//   public/favicon-192.png       192×192  results and wants a square that is a
//                                         multiple of 48px, at a stable URL.
//   public/apple-touch-icon.png  180×180  iOS home screen. Apple composites any
//                                         transparency onto black, so this one
//                                         keeps its solid ground.
//   public/icon-192.png          192×192  PWA manifest, purpose "any".
//   public/icon-512.png          512×512  PWA manifest, purpose "any".
//   public/icon-maskable-512.png 512×512  PWA manifest, purpose "maskable" —
//                                         extra padding so Android's circular
//                                         and squircle masks cannot clip the
//                                         roundel.
//   public/og-default.png       1200×630  Open Graph / Twitter card for every
//                                         page without its own hero.
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MASTER = 'scripts/brand/logo-master.png';
const OUT = 'public';
mkdirSync(OUT, { recursive: true });

// The artwork's own ground, sampled from the master. Kept as the solid
// background wherever transparency is unsafe (Apple, Google logo, OG card).
const GROUND = { r: 0xf7, g: 0xf8, b: 0xf7 };
const GROUND_HEX = '#f7f8f7';

const from = () => sharp(MASTER);
const square = (size, file, opts = {}) =>
  from()
    .resize(size, size, { fit: 'contain', background: GROUND_HEX, ...opts })
    .png({ compressionLevel: 9, palette: true })
    .toFile(join(OUT, file));

/* ------------------------------------------------------------------ */
/* Transparent variant                                                 */
/* ------------------------------------------------------------------ */
// The artwork is black and cyan on a near-white ground, so alpha is derived
// from distance to that ground rather than from luminance — a luminance key
// would make the cyan arcs semi-transparent.
//
// DEADZONE matters more than it looks. The scanned ground is not perfectly
// uniform, so without it every background pixel picks up a few units of alpha
// and the whole square shows as a faint lighter panel on any dark surface.
// Anything within DEADZONE of the ground is forced fully transparent; the ramp
// above it reaches opaque quickly so brush edges stay crisp rather than grey.
//
// `invert` produces the dark-mode variant: the black brush is remapped to the
// paper tone while the cyan arcs are left alone, because a straight inversion
// would swing the cyan to orange. Without this the mark disappears entirely on
// the site's dark theme — black ink on a near-black ground.
const DEADZONE = 14;
const RAMP = 46; // units above the deadzone to reach full opacity

async function keyOutGround(size, { invert = false } = {}) {
  const { data, info } = await from()
    .resize(size, size, { fit: 'contain', background: GROUND_HEX })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const LIGHT_INK = [0xee, 0xf0, 0xe8];

  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const d = Math.max(
      Math.abs(r - GROUND.r),
      Math.abs(g - GROUND.g),
      Math.abs(b - GROUND.b)
    );

    data[i + 3] = d <= DEADZONE ? 0 : Math.min(255, Math.round(((d - DEADZONE) / RAMP) * 255));

    // Neutral (low-chroma) pixels are the black brushwork; anything with a blue
    // bias is a cyan arc and keeps its colour.
    if (invert && data[i + 3] > 0) {
      const chroma = Math.max(r, g, b) - Math.min(r, g, b);
      const isCyan = b > r + 18 && chroma > 24;
      if (!isCyan) {
        const t = 1 - Math.min(r, g, b) / 255; // how dark the ink was
        data[i] = Math.round(r + (LIGHT_INK[0] - r) * t);
        data[i + 1] = Math.round(g + (LIGHT_INK[1] - g) * t);
        data[i + 2] = Math.round(b + (LIGHT_INK[2] - b) * t);
      }
    }
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/* ------------------------------------------------------------------ */
/* ICO container                                                       */
/* ------------------------------------------------------------------ */
// Hand-built because sharp cannot write ICO. Since Vista, an .ico may embed
// PNG payloads directly, so each entry is just the PNG bytes for that size —
// no BMP/DIB encoding, no AND mask.
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, buf }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // palette size
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += buf.length;
    return e;
  });

  return Buffer.concat([header, ...entries, ...images.map((i) => i.buf)]);
}

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

// Google Organization logo, PWA icons, Apple touch icon — solid ground.
await square(512, 'logo.png');
await square(192, 'icon-192.png');
await square(512, 'icon-512.png');
await square(180, 'apple-touch-icon.png');
await square(96, 'favicon-96.png');
await square(192, 'favicon-192.png');

// Maskable: Android masks crop to a circle inscribed in the middle 80%, so the
// roundel is inset to ~62% of the canvas to stay clear of every mask shape.
const maskableInner = Math.round(512 * 0.62);
await sharp({ create: { width: 512, height: 512, channels: 3, background: GROUND_HEX } })
  .composite([
    {
      input: await from().resize(maskableInner, maskableInner).png().toBuffer(),
      gravity: 'centre',
    },
  ])
  .png({ compressionLevel: 9, palette: true })
  .toFile(join(OUT, 'icon-maskable-512.png'));

// On-page marks, background keyed out — one per theme. The header and footer
// swap between them, the same way the theme-toggle icons already do.
writeFileSync(join(OUT, 'logo-mark.png'), await keyOutGround(512));
writeFileSync(join(OUT, 'logo-mark-dark.png'), await keyOutGround(512, { invert: true }));

// Favicon. Small sizes get a tighter crop — at 16px the 7% margin costs more
// legibility than it buys, and the roundel needs every pixel it can get.
const icoSizes = [16, 32, 48];
const tight = await from()
  .extract({
    left: Math.round(1024 * 0.05),
    top: Math.round(1024 * 0.05),
    width: Math.round(1024 * 0.9),
    height: Math.round(1024 * 0.9),
  })
  .toBuffer();
const icoImages = await Promise.all(
  icoSizes.map(async (size) => ({
    size,
    buf: await sharp(tight)
      .resize(size, size, { fit: 'contain', background: GROUND_HEX })
      .png({ compressionLevel: 9 })
      .toBuffer(),
  }))
);
writeFileSync(join(OUT, 'favicon.ico'), buildIco(icoImages));

// Open Graph default card: the mark on the left, the name and strapline beside
// it. Uses the site's live palette (paper-50, ink-900, accent, ink-600 from
// src/styles/global.css) rather than the logo's own ground, so a shared link
// looks like the page it opens — and matches src/lib/og-card.mjs, which draws
// the per-article cards. The mark goes on keyed rather than as the master
// tile, or its slightly different ground would show as a square on the card.
const OG_PAPER = '#fbfcfd';
const OG_INK = '#14161b';
const OG_MUTED = '#646971';
const OG_ACCENT = '#0f766e';
const ogText = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${OG_PAPER}"/>
  <rect x="0" y="0" width="1200" height="12" fill="${OG_ACCENT}"/>
  <text x="470" y="250" font-family="Georgia, 'Times New Roman', serif" font-size="72" font-weight="700" fill="${OG_INK}">Thinking About</text>
  <text x="470" y="336" font-family="Georgia, 'Times New Roman', serif" font-size="72" font-weight="700" fill="${OG_INK}">Policing</text>
  <text x="470" y="404" font-family="Georgia, 'Times New Roman', serif" font-size="30" fill="${OG_MUTED}">Evidence-based writing on policing and public policy.</text>
  <text x="470" y="470" font-family="Georgia, 'Times New Roman', serif" font-size="25" letter-spacing="2" fill="${OG_MUTED}">Nathan Tracey &#183; thinkingaboutpolicing.org</text>
</svg>`;
await sharp(Buffer.from(ogText))
  .composite([{ input: await keyOutGround(300), left: 110, top: 165 }])
  .png({ compressionLevel: 9 })
  .toFile(join(OUT, 'og-default.png'));

console.log('brand assets: logo, logo-mark, favicon.ico (16/32/48), favicon-96/192,');
console.log('              apple-touch-icon, icon-192/512, icon-maskable-512, og-default');
