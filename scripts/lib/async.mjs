// Tiny async helpers shared by the ingest scripts. Kept dependency-free and pure
// so they can be unit-tested without the I/O orchestration in ingest-bulk-police.mjs.

// Run `fn` over `items` with at most `concurrency` promises in flight, returning
// results in the original order. Used to parallelise the police API neighbourhood
// crawl while staying well under data.police.uk's rate limit.
export async function pMap(items, fn, concurrency = 6) {
  const results = new Array(items.length);
  let next = 0;
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const workers = Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}
