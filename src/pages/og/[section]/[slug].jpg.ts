// Static endpoint that renders one 1200×630 social-share card per article at
// build time, written to dist/og/<section>/<slug>.jpg. ArticleLayout points
// og:image / twitter:image at the resulting URL, so this is the picture X,
// LinkedIn, Facebook and WhatsApp show when someone shares an article.
//
// Three card types, chosen by what the article actually has rather than applied
// uniformly — the system set out in docs/design/design-lab.html:
//
//   Type A  a photograph big enough to fill the frame, with the section, the
//           headline and the byline in a scrim along the bottom
//   Type B  a face or a square on a full-height plate, type on the left
//   Type C  the typographic card (src/lib/og-card.mjs) for charts, diagrams,
//           logos, and anything with no usable photograph
//
// Type A and B are composited here; the geometry and overlay artwork live in
// src/lib/og-hero-card.mjs. Everything is rasterised with `sharp` (already a
// devDependency, and the same technique scripts/generate-brand-assets.mjs uses
// for the static default card), so there are no extra dependencies and no
// vendored fonts.
//
// JPEG, not PNG: a photographic card is around 1.7MB as PNG and about a tenth of
// that as JPEG, and WhatsApp quietly declines to show a preview much over half a
// megabyte. Quality 86 with no chroma subsampling holds both the photograph and
// the type.
import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { renderCardSvg, escapeXml, MARK_SIZE, MARK_X, MARK_Y, PAPER } from '../../../lib/og-card.mjs';
import {
  planCard,
  paleGroundShare,
  renderTypeA,
  renderTypeB,
  WIDTH,
  HEIGHT,
  MARK_SIZE as PHOTO_MARK_SIZE,
} from '../../../lib/og-hero-card.mjs';
import { articleHero } from '../../../lib/article-hero.mjs';
import { SECTION_LABELS } from '../../../content/config';

type CardCopy = { title: string; section: string; author: string };

// ── Measuring type ─────────────────────────────────────────────────────────
//
// The cards name a font stack (Georgia, Times New Roman, serif) that no build
// host has in full, so each falls back to its own serif — and those faces are
// wide enough apart that a headline broken to fit one runs off the edge of the
// card on another. Rather than guess, measure the face that is actually here:
// rasterise a word on its own, trim the white, and read the width back.
//
// Widths are taken once at a reference size and scaled, because advance width is
// linear in font size. Per-word, because kerning inside a word matters and
// kerning across a space does not — so a line's width is the sum of its words
// plus its spaces. Cached across the whole build: article titles share a lot of
// short words.
const REFERENCE_SIZE = 100;
const SERIF_STACK = "Georgia, 'Times New Roman', serif";
const widthCache = new Map<string, Promise<number>>();

async function inkWidth(text: string, weight: number): Promise<number> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="6000" height="200">`
    + `<rect width="6000" height="200" fill="#fff"/>`
    + `<text x="10" y="150" font-family="${SERIF_STACK}" font-size="${REFERENCE_SIZE}" `
    + `font-weight="${weight}" fill="#000">${escapeXml(text)}</text></svg>`;
  const { info } = await sharp(Buffer.from(svg)).trim().toBuffer({ resolveWithObject: true });
  return info.width;
}

const cachedWidth = (text: string, weight: number) => {
  const key = `${weight}|${text}`;
  let width = widthCache.get(key);
  if (!width) widthCache.set(key, (width = inkWidth(text, weight)));
  return width;
};

// A trimmed width is the ink, which stops just short of the advance the glyphs
// really occupy; a couple of per cent of headroom covers the difference and the
// kerning this ignores.
const SAFETY = 1.03;

// Measure every word of a title up front, then hand back a synchronous
// widthOf(text, fontSize) the pure card renderers can call while laying out.
async function serifMeasurer(title: string, weight = 700) {
  const words = String(title ?? '').trim().split(/\s+/).filter(Boolean);
  const widths = new Map<string, number>();
  await Promise.all(words.map(async (word) => widths.set(word, await cachedWidth(word, weight))));
  // A space cannot be measured on its own — it leaves no ink — so take it as the
  // difference two letters make with and without one between them.
  const [apart, together] = await Promise.all([
    cachedWidth('a a', weight),
    cachedWidth('aa', weight),
  ]);
  const space = Math.max(0, apart - together);

  return (text: string, fontSize: number) => {
    const parts = String(text ?? '').trim().split(/\s+/).filter(Boolean);
    const ink = parts.reduce((sum, part) => sum + (widths.get(part) ?? part.length * REFERENCE_SIZE * 0.55), 0);
    const gaps = Math.max(0, parts.length - 1) * space;
    return ((ink + gaps) * fontSize * SAFETY) / REFERENCE_SIZE;
  };
}

export const getStaticPaths: GetStaticPaths = async () => {
  // Same enumeration as src/pages/[section]/[slug].astro, so every published
  // article URL has a matching card.
  const articles = await getCollection('articles', ({ data }) => !data.draft);
  return articles.map((article) => ({
    params: { section: article.data.section, slug: article.slug },
    props: {
      title: article.data.title,
      section: SECTION_LABELS[article.data.section],
      author: article.data.author,
      // The same picture the article opens with, so the timeline preview and
      // the page agree.
      hero: articleHero(article.data),
    },
  }));
};

// The marks are raster artwork, so they are composited after rasterising rather
// than inlined into the card SVG — which would base64 the whole logo into all
// 30-odd cards. Read once and reused for every card in the build: the light cut
// for the two ink-grounded photo cards, the ink-on-paper cut for the
// typographic one. Lazily, so a build reads only the cuts it needs.
let photoMarkPromise: Promise<Buffer> | null = null;
const photoCardMark = () => (photoMarkPromise ??= sharp('public/logo-mark-dark.png')
  .resize(PHOTO_MARK_SIZE, PHOTO_MARK_SIZE)
  .png()
  .toBuffer());

let titleMarkPromise: Promise<Buffer> | null = null;
const titleCardMark = () => (titleMarkPromise ??= sharp('public/logo-mark.png')
  .resize(MARK_SIZE, MARK_SIZE)
  .png()
  .toBuffer());

// One encoder for every card type, so they cannot drift apart.
const encode = (image: sharp.Sharp) =>
  image.jpeg({ quality: 86, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer();

// Hero paths in content are site-absolute (/images/…), so they resolve inside
// public/. Anything that escapes that directory, points at another origin, or
// simply is not on disk yet (fetch-images.sh pulls some heroes during the
// Netlify build) counts as "no hero" and takes the typographic card instead.
const PUBLIC_DIR = path.resolve('public');
function resolveHeroFile(hero: string | undefined): string | null {
  if (!hero || /^[a-z][a-z0-9+.-]*:/i.test(hero)) return null;
  let file: string;
  try {
    file = path.resolve(PUBLIC_DIR, decodeURI(hero).replace(/^\/+/, ''));
  } catch {
    return null; // malformed percent-encoding
  }
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return null;
  return fs.existsSync(file) ? file : null;
}

// Decode the hero once, straighten it, and measure the two things the card
// choice turns on: its shape and how pale its ground is.
async function readHero(file: string) {
  const meta = await sharp(file).metadata();
  // Apply any EXIF rotation, and drop transparency onto paper rather than ink,
  // because the transparent sources here are charts drawn dark on light.
  const source = sharp(file).rotate();
  const buffer = await (meta.hasAlpha ? source.flatten({ background: PAPER }) : source)
    .png()
    .toBuffer();
  const { width, height } = await sharp(buffer).metadata();
  const thumb = await sharp(buffer)
    .resize(160, 160, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    buffer,
    width,
    height,
    paleGround: paleGroundShare(thumb.data, thumb.info.channels),
  };
}

// Type A: the photograph fills the card, cropped on whatever sharp judges to be
// the busiest part of it — which in a news photograph is the subject.
async function renderPhotoCard(hero: Buffer, copy: CardCopy): Promise<Buffer> {
  const { svg, mark } = renderTypeA({ ...copy, widthOf: await serifMeasurer(copy.title) });
  const photo = await sharp(hero)
    .resize(WIDTH, HEIGHT, { fit: 'cover', position: sharp.strategy.attention })
    .png()
    .toBuffer();
  return encode(sharp(photo).composite([
    { input: Buffer.from(svg) },
    { input: await photoCardMark(), left: mark.left, top: mark.top },
  ]));
}

// Type B: the face keeps its own plate, so it is never cropped to a letterbox.
async function renderSplitCard(hero: Buffer, copy: CardCopy): Promise<Buffer> {
  const { svg, mark, plate } = renderTypeB({ ...copy, widthOf: await serifMeasurer(copy.title) });
  const portrait = await sharp(hero)
    .resize(plate.width, plate.height, { fit: 'cover', position: sharp.strategy.attention })
    .png()
    .toBuffer();
  return encode(sharp(Buffer.from(svg)).composite([
    { input: portrait, left: plate.left, top: plate.top },
    { input: await photoCardMark(), left: mark.left, top: mark.top },
  ]));
}

// Type C: the hand-authored typographic card, unchanged.
async function renderTitleCard({ title, section, author }: CardCopy): Promise<Buffer> {
  const widthOf = await serifMeasurer(title);
  return encode(sharp(Buffer.from(renderCardSvg({ title, section, author, widthOf })))
    .composite([{ input: await titleCardMark(), left: MARK_X, top: MARK_Y }]));
}

export const GET: APIRoute = async ({ props }) => {
  const { title, section, author, hero } = props as CardCopy & { hero?: string };
  const copy: CardCopy = { title, section, author };

  const heroFile = resolveHeroFile(hero);
  let png: Buffer | null = null;
  if (heroFile) {
    try {
      const image = await readHero(heroFile);
      const type = planCard(image);
      if (type === 'A') png = await renderPhotoCard(image.buffer, copy);
      else if (type === 'B') png = await renderSplitCard(image.buffer, copy);
    } catch (err) {
      // A hero sharp cannot decode must not fail the build. The typographic card
      // is still a good share image, so log what happened and fall back to it.
      console.warn(`[og] no photo card for ${hero}: ${(err as Error).message}`);
    }
  }
  png ??= await renderTitleCard(copy);

  return new Response(png, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
