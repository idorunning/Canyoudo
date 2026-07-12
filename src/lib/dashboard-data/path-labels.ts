// Turn raw URL paths (as GoatCounter records them) into readable labels for
// the dashboard: article paths become their headline, and the handful of
// standing pages get friendly names. Everything else falls back to a
// title-cased last path segment, so a new page is still legible without a
// code change.

import type { ArticleRow } from './articles';

// Standing (non-article) pages worth naming explicitly. Anything not listed
// is title-cased from its final segment.
const STATIC_LABELS: Record<string, string> = {
  '/': 'Home',
  '/about': 'About',
  '/library': 'Your library',
  '/subscribe': 'Subscribe',
  '/research': 'Research',
  '/research-tools': 'Research tools',
  '/practical-summaries': 'Practical summaries',
  '/perception': 'Perception explorer',
  '/curiosities': 'Curiosities',
  '/further-reading': 'Further reading',
  '/all': 'All articles',
  '/contact': 'Contact',
  '/dashboard': 'Dashboard — overview',
  '/dashboard/articles': 'Dashboard — articles',
  '/dashboard/audience': 'Dashboard — audience',
  '/dashboard/newsletter': 'Dashboard — newsletter',
  '/dashboard/traffic': 'Dashboard — traffic',
};

function titleCase(segment: string): string {
  return segment
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export type PathLabel = { label: string; path: string; isArticle: boolean };

// Build a labeller closed over the current article set. Kept as a factory so
// the (local, always-available) article rows are fetched once per request and
// reused across every widget on the page.
export function makePathLabeller(articles: ArticleRow[]): (rawPath: string) => PathLabel {
  // Index articles by their public URL (/{section}/{slug}) and by bare slug,
  // so both `/police-policy/foo` and a stray `/foo` resolve to the headline.
  const byUrl = new Map<string, ArticleRow>();
  const bySlug = new Map<string, ArticleRow>();
  for (const a of articles) {
    byUrl.set(`/${a.section}/${a.slug}`, a);
    bySlug.set(a.slug, a);
  }

  return (rawPath: string): PathLabel => {
    // Normalise: ensure a leading slash, drop any query/hash and trailing slash.
    let path = (rawPath || '').split(/[?#]/)[0];
    if (!path.startsWith('/')) path = `/${path}`;
    if (path.length > 1) path = path.replace(/\/+$/, '');

    const article = byUrl.get(path) ?? bySlug.get(path.replace(/^\//, ''));
    if (article) return { label: article.title, path, isArticle: true };

    const staticLabel = STATIC_LABELS[path];
    if (staticLabel) return { label: staticLabel, path, isArticle: false };

    // Topic pages: /topics/leadership → "Topic: Leadership".
    const topic = path.match(/^\/topics\/(.+)$/);
    if (topic) return { label: `Topic: ${titleCase(topic[1])}`, path, isArticle: false };

    const last = path.split('/').filter(Boolean).pop() ?? '';
    return { label: last ? titleCase(last) : path, path, isArticle: false };
  };
}

// ISO 3166-1 alpha-2 country code → regional-indicator flag emoji. GoatCounter
// tags location stats with the alpha-2 code; this needs no lookup table beyond
// the codepoint maths, so it stays dependency- and asset-free.
export function flagEmoji(iso: string): string {
  const code = (iso || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '🌐';
  const A = 0x1f1e6;
  return String.fromCodePoint(A + (code.charCodeAt(0) - 65), A + (code.charCodeAt(1) - 65));
}
