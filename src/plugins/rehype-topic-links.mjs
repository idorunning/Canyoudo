// Rehype plugin: auto-link the first occurrence of each dictionary topic in an
// article's body to its /topics/<slug> page. Wired in astro.config.mjs
// (markdown.rehypePlugins); @astrojs/mdx inherits it, so MDX articles get the
// same treatment.
//
// Safe by construction — it never links inside: headings, existing links, code,
// figcaptions, or the footnotes/citations section; it links each topic at most
// once per article (first occurrence); and it leaves MDX/JSX nodes untouched.
import { readTopics, buildEntries } from '../lib/topic-matcher.mjs';

const SKIP_TAGS = new Set([
  'a', 'code', 'pre', 'kbd', 'samp', 'script', 'style', 'figcaption',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
]);

// Built once from disk at module load — the dictionary is read fresh on each
// production build.
const ENTRIES = buildEntries(readTopics());

function classList(node) {
  const c = node.properties && node.properties.className;
  if (!c) return [];
  return Array.isArray(c) ? c : [c];
}

function isFootnotes(node) {
  return (
    node.tagName === 'section' &&
    ((node.properties && node.properties.dataFootnotes !== undefined) ||
      classList(node).includes('footnotes'))
  );
}

export default function rehypeTopicLinks() {
  return (tree) => {
    if (!ENTRIES.length) return;
    const used = new Set();

    const linkify = (value) => {
      let best = null;
      for (const e of ENTRIES) {
        if (used.has(e.slug)) continue;
        const m = e.regex.exec(value);
        if (!m) continue;
        const start = m.index;
        const end = m.index + m[0].length;
        if (!best || start < best.start || (start === best.start && end - start > best.end - best.start)) {
          best = { start, end, slug: e.slug };
        }
      }
      if (!best) return null;
      used.add(best.slug);
      const before = value.slice(0, best.start);
      const text = value.slice(best.start, best.end);
      const after = value.slice(best.end);
      const out = [];
      if (before) out.push({ type: 'text', value: before });
      out.push({
        type: 'element',
        tagName: 'a',
        properties: { href: `/topics/${best.slug}`, className: ['topic-link'] },
        children: [{ type: 'text', value: text }],
      });
      if (after) {
        const rest = linkify(after);
        if (rest) out.push(...rest);
        else out.push({ type: 'text', value: after });
      }
      return out;
    };

    const walk = (node, inSkip) => {
      const children = node.children;
      if (!children) return;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.type === 'element') {
          const skip = inSkip || SKIP_TAGS.has(child.tagName) || isFootnotes(child);
          walk(child, skip);
        } else if (child.type === 'text' && !inSkip) {
          const replaced = linkify(child.value);
          if (replaced) {
            children.splice(i, 1, ...replaced);
            i += replaced.length - 1;
          }
        }
        // Other node types (MDX JSX elements, comments) are left alone.
      }
    };

    walk(tree, false);
  };
}
