#!/usr/bin/env node
// Bundle live monthly-poll vote tallies from Supabase into a static JSON
// file, so the homepage's current question and its scrollable archive of
// past months can render real tallies without a client-side fetch. Runs in
// `prebuild`, so counts are as fresh as the last deploy — same convention as
// scripts/bundle-engagement.mjs.
//
// Degrades to an empty bundle if Supabase isn't configured, or the query
// fails, so a missing/misconfigured env never breaks the build.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/lib/polls-bundle.json');

const URL = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const KEY = process.env.PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

let rows = [];
if (URL && KEY) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(URL, KEY, { auth: { persistSession: false } });
    const { data, error } = await supabase
      .from('monthly_poll_votes')
      .select('month, choice, votes');
    if (error) throw error;
    rows = data ?? [];
  } catch (err) {
    console.warn('bundle-polls: could not fetch vote tallies, writing an empty bundle —', err.message);
  }
} else {
  console.warn('bundle-polls: Supabase not configured, writing an empty bundle');
}

const bundle = {};
for (const r of rows) {
  (bundle[r.month] ??= {})[r.choice] = r.votes;
}

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(bundle, null, 2) + '\n');
console.log(`bundle-polls: wrote tallies for ${Object.keys(bundle).length} month(s)`);
