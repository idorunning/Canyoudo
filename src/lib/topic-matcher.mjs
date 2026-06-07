// Shared topic-matching logic — the single source of truth behind in-body
// auto-linking (rehype plugin), tag suggestions (scripts/suggest-tags.mjs) and
// the /topics/* archive pages. Plain ESM with no Astro imports so it can run in
// the Node build pipeline as well as inside .astro frontmatter.
import { readFileSync } from 'node:fs';

const TOPICS_PATH = 'src/content/topics/topics.json';

export function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalise(s) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

// Read + parse the dictionary from disk (for the plugin and node scripts).
// Astro pages should use getEntry('topics','topics') instead.
export function readTopics() {
  try {
    return JSON.parse(readFileSync(TOPICS_PATH, 'utf8')).topics ?? [];
  } catch {
    return [];
  }
}

// Build one matcher entry per topic. Each entry's regex matches any of the
// topic's terms (label + aliases), longest term first, as a whole token (not
// flanked by another alphanumeric), case-insensitive. Entries are sorted so
// that topics with a longer best-term are tried first.
export function buildEntries(topics) {
  const entries = topics
    .filter((t) => t && t.slug)
    .map((t) => {
      const terms = [t.label, ...(t.aliases ?? [])]
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);
      const alternation = terms.map(escapeRegExp).join('|');
      return {
        slug: t.slug,
        label: t.label,
        terms,
        longest: terms[0]?.length ?? 0,
        regex: new RegExp(`(?<![A-Za-z0-9])(${alternation})(?![A-Za-z0-9])`, 'i'),
      };
    })
    .filter((e) => e.terms.length > 0);
  entries.sort((a, b) => b.longest - a.longest);
  return entries;
}

// Does an article's tag correspond to a topic? (slug, label or alias match.)
export function topicForTag(topics, tag) {
  const t = normalise(tag);
  return (
    topics.find(
      (topic) =>
        normalise(topic.slug) === t ||
        normalise(topic.label) === t ||
        (topic.aliases ?? []).some((a) => normalise(a) === t)
    ) ?? null
  );
}

// Does an article belong on a topic page? True if any of its tags map to the
// topic, or the topic's term appears in the body text.
export function articleMatchesEntry(bodyText, tags, entry) {
  const t = (tags ?? []).map(normalise);
  if (
    t.includes(normalise(entry.slug)) ||
    t.includes(normalise(entry.label)) ||
    entry.terms.some((term) => t.includes(normalise(term)))
  ) {
    return true;
  }
  return entry.regex.test(bodyText || '');
}
