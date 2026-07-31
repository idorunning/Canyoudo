// Static endpoint that renders one 1200×630 social-share card per article at
// build time, written to dist/og/<section>/<slug>.jpg. ArticleLayout points
// og:image / twitter:image at the resulting URL, so this is the picture X,
// LinkedIn, Facebook and WhatsApp show when someone shares an article.
//
// JPEG, not PNG: a photographic card is around 1.7MB as PNG and about a tenth of
// that as JPEG, and WhatsApp quietly declines to show a preview much over half a
// megabyte. Quality 86 with no chroma subsampling holds both the photograph and
// the type in the brand band.
//
// The card leads with the article's own hero photograph, finished with the brand
// band from src/lib/og-hero-card.mjs. Every platform prints the headline beside
// the card already, so the card does not repeat it — a photograph earns the
// click, a wall of text does not. Articles with no usable hero on disk fall back
// to the hand-authored title card in src/lib/og-card.mjs. Both are rasterised
// with `sharp` (already a devDependency, and the same technique
// scripts/generate-brand-assets.mjs uses for the static default card), so there
// are no extra dependencies and no vendored fonts.
import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { renderCardSvg, MARK_SIZE, MARK_X, MARK_Y, INK, PAPER } from '../../../lib/og-card.mjs';
import {
  planHeroLayout,
  paleGroundShare,
  renderHeroOverlaySvg,
  WIDTH,
  HEIGHT,
  MARK_SIZE as HERO_MARK_SIZE,
  MARK_X as HERO_MARK_X,
  MARK_Y as HERO_MARK_Y,
} from '../../../lib/og-hero-card.mjs';
import { articleHero } from '../../../lib/article-hero.mjs';
import { SECTION_LABELS } from '../../../content/config';

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
// 30-odd cards. Read once and reused for every card in the build: the
// ink-on-paper cut for the title card, the light cut for the hero card's dark
// scrim. Lazily, so a build reads only the cut it actually needs.
let titleMarkPromise: Promise<Buffer> | null = null;
const titleCardMark = () => (titleMarkPromise ??= sharp('public/logo-mark.png')
  .resize(MARK_SIZE, MARK_SIZE)
  .png()
  .toBuffer());

let heroMarkPromise: Promise<Buffer> | null = null;
const heroCardMark = () => (heroMarkPromise ??= sharp('public/logo-mark-dark.png')
  .resize(HERO_MARK_SIZE, HERO_MARK_SIZE)
  .png()
  .toBuffer());

// One encoder for both card types, so they cannot drift apart.
const encode = (image: sharp.Sharp) =>
  image.jpeg({ quality: 86, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer();

// Hero paths in content are site-absolute (/images/…), so they resolve inside
// public/. Anything that escapes that directory, points at another origin, or
// simply is not on disk yet (fetch-images.sh pulls some heroes during the
// Netlify build) counts as "no hero" and takes the title card instead.
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

async function renderHeroCard(file: string, section: string): Promise<Buffer | null> {
  const meta = await sharp(file).metadata();

  // Normalise once: apply any EXIF rotation, and drop transparency onto paper
  // rather than ink, because the transparent sources here are charts drawn dark
  // on light. Both passes below then work from one plain RGB buffer.
  const source = sharp(file).rotate();
  const normalised = await (meta.hasAlpha ? source.flatten({ background: PAPER }) : source)
    .png()
    .toBuffer();
  const { width, height } = await sharp(normalised).metadata();

  // How much of the frame is near-white, judged on a thumbnail: the tell that
  // separates a chart or diagram, which must be letterboxed whole, from a
  // photograph, which can be cropped to fill the card.
  const thumb = await sharp(normalised)
    .resize(160, 160, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const plan = planHeroLayout({
    width,
    height,
    paleGround: paleGroundShare(thumb.data, thumb.info.channels),
  });
  if (!plan) return null;

  let base: sharp.Sharp;
  if (plan.layout === 'cover') {
    // Fill the frame, keeping whatever sharp judges to be the busiest part of
    // the picture — which in a news photograph is the subject.
    base = sharp(normalised).resize(WIDTH, HEIGHT, {
      fit: 'cover',
      position: sharp.strategy.attention,
    });
  } else {
    // The whole picture, uncropped, on a blurred and dimmed blow-up of itself —
    // the standard treatment for a square, a portrait or a chart that a 1.9:1
    // crop would cut into.
    const picture = await sharp(normalised)
      .resize(plan.frame.width, plan.frame.height, { fit: 'fill' })
      .png()
      .toBuffer();
    base = sharp(normalised)
      .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'centre' })
      .blur(36)
      .modulate({ brightness: 0.6, saturation: 0.85 })
      .composite([{ input: picture, left: plan.frame.left, top: plan.frame.top }]);
  }

  const photo = await base.flatten({ background: INK }).png().toBuffer();
  const overlay = renderHeroOverlaySvg({
    section,
    frame: plan.layout === 'inset' ? plan.frame : undefined,
  });
  return encode(sharp(photo).composite([
    { input: Buffer.from(overlay) },
    { input: await heroCardMark(), left: HERO_MARK_X, top: HERO_MARK_Y },
  ]));
}

async function renderTitleCard(title: string, section: string, author: string): Promise<Buffer> {
  const svg = renderCardSvg({ title, section, author });
  return encode(sharp(Buffer.from(svg))
    .composite([{ input: await titleCardMark(), left: MARK_X, top: MARK_Y }]));
}

export const GET: APIRoute = async ({ props }) => {
  const { title, section, author, hero } = props as {
    title: string;
    section: string;
    author: string;
    hero?: string;
  };

  const heroFile = resolveHeroFile(hero);
  let png: Buffer | null = null;
  if (heroFile) {
    try {
      png = await renderHeroCard(heroFile, section);
    } catch (err) {
      // A hero sharp cannot decode must not fail the build. The title card is
      // still a good share image, so log what happened and fall back to it.
      console.warn(`[og] no hero card for ${hero}: ${(err as Error).message}`);
    }
  }
  png ??= await renderTitleCard(title, section, author);

  return new Response(png, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
