#!/usr/bin/env node
// Bundle live article engagement counters (views, shares) from Supabase into a
// static JSON file, so the homepage "Most read" list and each article's share
// count can render real numbers without a client-side fetch. Runs in
// `prebuild`, so counts are as fresh as the last deploy — the site rebuilds on
// every push, plus the news-fetch cron every 12h (.github/workflows/news.yml).
//
// Degrades to an empty bundle if Supabase isn't configured, or the query
// fails, so a missing/misconfigured env never breaks the build (same
// convention as scripts/bundle-policedata.mjs and src/lib/police-db.ts).

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/lib/engagement-bundle.json');

const URL = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const KEY = process.env.PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

let rows = [];
if (URL && KEY) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(URL, KEY, { auth: { persistSession: false } });
    const { data, error } = await supabase
      .from('article_engagement')
      .select('slug, view_count, share_count');
    if (error) throw error;
    rows = data ?? [];
  } catch (err) {
    console.warn('bundle-engagement: could not fetch counters, writing an empty bundle —', err.message);
  }
} else {
  console.warn('bundle-engagement: Supabase not configured, writing an empty bundle');
}

const bundle = Object.fromEntries(
  rows.map((r) => [r.slug, { views: r.view_count, shares: r.share_count }])
);

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(bundle, null, 2) + '\n');
console.log(`bundle-engagement: wrote ${rows.length} article counter(s)`);
