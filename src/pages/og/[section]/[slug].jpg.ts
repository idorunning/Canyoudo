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
import { renderCardSvg, MARK_SIZE, MARK_X, MARK_Y, PAPER } from '../../../lib/og-card.mjs';
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
  const { svg, mark } = renderTypeA(copy);
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
  const { svg, mark, plate } = renderTypeB(copy);
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
  return encode(sharp(Buffer.from(renderCardSvg({ title, section, author })))
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
