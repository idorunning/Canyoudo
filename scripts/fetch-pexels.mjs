// Fetch the article photographs from Pexels and write them, resized, into
// public/images/ — plus a credits file so each photo can be attributed.
//
// Why this exists: the editor can also pull Pexels photos in the browser via the
// built-in Sveltia picker, but this script makes the set reproducible and lets
// the photos be refreshed in one command. It needs a Pexels API key and outbound
// access to api.pexels.com / images.pexels.com (some sandboxes block these).
//
//   PEXELS_API_KEY=xxxx node scripts/fetch-pexels.mjs
//   npm run fetch-pexels
//
// Pexels content is free to use; attribution is courteous (we credit "Photo via
// Pexels" in the figcaption) and the photo-page URLs are written to
// public/images/pexels-credits.json so the captions can link the right page.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'images');
const CREDITS = join(OUT_DIR, 'pexels-credits.json');
const TARGET_WIDTH = 1600;

// One entry per image slot. `query` drives the Pexels search; `out` is the file
// written to public/images. Keep subjects tasteful — the DARA piece is about
// domestic abuse, so evocative/atmospheric rather than depictions of victims.
const MANIFEST = [
  // Why Medium Risk Is the Safe Option (DARA)
  { out: 'dara-hero.webp', query: 'police car blue light night street', orientation: 'landscape' },
  { out: 'dara-decision.webp', query: 'person writing notes clipboard form', orientation: 'landscape' },
  { out: 'dara-doorstep-night.webp', query: 'front door porch light night house', orientation: 'landscape' },
  // The Power of Civil Orders
  { out: 'civil-orders-hero-photo.webp', query: 'british high street shops evening', orientation: 'landscape' },
  { out: 'civil-orders-shutters.webp', query: 'closed shop metal shutters street', orientation: 'landscape' },
  { out: 'civil-orders-boarded-house.webp', query: 'boarded up window terraced house', orientation: 'landscape' },
];

const API_KEY = process.env.PEXELS_API_KEY;
if (!API_KEY) {
  console.error(
    'PEXELS_API_KEY is not set. Get a free key at https://www.pexels.com/api/ ' +
      'and run: PEXELS_API_KEY=xxxx node scripts/fetch-pexels.mjs'
  );
  process.exit(1);
}

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error('Could not load "sharp" (needed to resize/convert). Install it with: npm i sharp');
  process.exit(1);
}

async function searchPhoto({ query, orientation }) {
  const url = new URL('https://api.pexels.com/v1/search');
  url.searchParams.set('query', query);
  url.searchParams.set('orientation', orientation ?? 'landscape');
  url.searchParams.set('per_page', '5');
  const res = await fetch(url, { headers: { Authorization: API_KEY } });
  if (!res.ok) throw new Error(`Pexels search failed (${res.status}) for "${query}"`);
  const data = await res.json();
  const photo = data.photos?.[0];
  if (!photo) throw new Error(`No Pexels results for "${query}"`);
  return photo;
}

async function run() {
  await mkdir(OUT_DIR, { recursive: true });
  const credits = {};
  for (const slot of MANIFEST) {
    try {
      const photo = await searchPhoto(slot);
      const srcUrl = photo.src?.large2x ?? photo.src?.original ?? photo.src?.large;
      const imgRes = await fetch(srcUrl);
      if (!imgRes.ok) throw new Error(`Download failed (${imgRes.status}) for ${slot.out}`);
      const input = Buffer.from(await imgRes.arrayBuffer());
      const output = await sharp(input).resize({ width: TARGET_WIDTH, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      await writeFile(join(OUT_DIR, slot.out), output);
      credits[slot.out] = {
        photographer: photo.photographer,
        photographer_url: photo.photographer_url,
        pexels_url: photo.url,
        alt: photo.alt ?? '',
      };
      console.log(`✓ ${slot.out}  ←  ${photo.photographer} (${photo.url})`);
    } catch (err) {
      console.error(`✗ ${slot.out}: ${err.message}`);
    }
  }
  await writeFile(CREDITS, JSON.stringify(credits, null, 2) + '\n');
  console.log(`\nWrote credits → ${CREDITS}`);
  console.log('Review the images, then wire them into the two articles (hero frontmatter + full-bleed figures).');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
