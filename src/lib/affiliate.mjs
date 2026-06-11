// Affiliate-link helper, shared by the book components and unit-tested in
// tests/affiliate.test.mjs. Pure and side-effect-free.

// Append an Amazon Associates tag to a buy link when (a) a tag is configured
// and (b) the link points at an Amazon storefront. Any existing tag param is
// replaced; non-Amazon links and malformed URLs pass through untouched, so a
// missing or odd buyUrl can never break the page.
export function withAffiliateTag(url, tag) {
  if (!url || !tag) return url ?? '';
  let u;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  const isAmazon = /(^|\.)amazon\.[a-z.]+$|(^|\.)amzn\.(to|eu)$/i.test(u.hostname);
  if (!isAmazon) return url;
  u.searchParams.set('tag', tag);
  return u.toString();
}
