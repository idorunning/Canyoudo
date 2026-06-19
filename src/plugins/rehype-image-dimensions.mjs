// Rehype plugin: give in-body article images explicit width/height so the
// browser can reserve their space before they load, cutting Cumulative Layout
// Shift (CLS) — a Core Web Vitals / SEO signal (see seo-improvments.md §4.4/5.1).
// Wired in astro.config.mjs after rehype-responsive-tables; @astrojs/mdx
// inherits markdown.rehypePlugins, so MDX articles get the same treatment.
//
// Two kinds of in-body image are covered:
//   • Markdown `![](…)` images, which are hast <img> *elements* at this stage —
//     handled by stamping width/height/loading/decoding on the node.
//   • Hand-written `<img …>` HTML (the common pattern here, often inside a
//     <figure>), which is still an unparsed `raw` node at this stage because
//     Astro runs rehype-raw *after* user plugins — handled by rewriting the
//     raw HTML string.
//
// In both cases dimensions come from the file's intrinsic size, read
// synchronously (Astro doesn't await async rehype transformers before
// serialising). Remote (`//…`) or missing files are skipped silently, matching
// the graceful image-failure handling in BaseLayout.astro.
import { visit } from 'unist-util-visit';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { imageSize } from 'image-size';

const PUBLIC_DIR = 'public';

// Intrinsic { width, height } of a local public asset, or null if the src isn't
// a local path or the file can't be read/measured (e.g. an image still awaiting
// a build-time fetch).
function localSize(src) {
  if (typeof src !== 'string' || !src.startsWith('/') || src.startsWith('//')) return null;
  try {
    const filePath = join(PUBLIC_DIR, decodeURIComponent(src.split(/[?#]/)[0]));
    const { width, height } = imageSize(readFileSync(filePath));
    return width && height ? { width, height } : null;
  } catch {
    return null;
  }
}

// Add width/height to any <img> in a raw HTML string that has a local src and
// isn't already sized. `sizeOf` is injected so the rewrite logic is unit
// testable without the filesystem. Pure string transform — leaves everything
// else (including the author's own attributes) untouched.
export function addDimsToRawImgs(html, sizeOf = localSize) {
  if (typeof html !== 'string' || !html.includes('<img')) return html;
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    if (/\s(?:width|height)\s*=/i.test(tag)) return tag;
    const m = tag.match(/\ssrc\s*=\s*["']([^"']+)["']/i);
    if (!m) return tag;
    const dim = sizeOf(m[1]);
    if (!dim) return tag;
    return tag.replace(/\s*\/?>$/, (end) => ` width="${dim.width}" height="${dim.height}"${end}`);
  });
}

export default function rehypeImageDimensions() {
  return (tree) => {
    // Markdown-syntax images: real hast <img> elements.
    visit(tree, 'element', (node) => {
      if (node.tagName !== 'img') return;
      const props = (node.properties = node.properties || {});

      // Lazy-load and async-decode in-body images (the eager hero lives in
      // ArticleLayout, not the markdown body, so it's untouched).
      if (props.loading == null) props.loading = 'lazy';
      if (props.decoding == null) props.decoding = 'async';

      if (props.width != null || props.height != null) return;
      const dim = localSize(typeof props.src === 'string' ? props.src : '');
      if (dim) {
        props.width = dim.width;
        props.height = dim.height;
      }
    });

    // Hand-written <img> HTML: still raw text until rehype-raw runs later.
    visit(tree, 'raw', (node) => {
      node.value = addDimsToRawImgs(node.value);
    });

    // MDX: <img> in .mdx files is a JSX element node (mdxJsxFlowElement /
    // mdxJsxTextElement), not a hast element or raw text, so it needs its own
    // pass that appends mdxJsxAttributes.
    const isJsxImg = (n) =>
      (n.type === 'mdxJsxFlowElement' || n.type === 'mdxJsxTextElement') && n.name === 'img';
    visit(tree, isJsxImg, (node) => {
      const attrs = (node.attributes = node.attributes || []);
      const attr = (name) => attrs.find((a) => a.type === 'mdxJsxAttribute' && a.name === name);
      const setIfAbsent = (name, value) => {
        if (!attr(name)) attrs.push({ type: 'mdxJsxAttribute', name, value });
      };

      setIfAbsent('loading', 'lazy');
      setIfAbsent('decoding', 'async');

      if (attr('width') || attr('height')) return;
      const srcAttr = attr('src');
      const dim = localSize(typeof srcAttr?.value === 'string' ? srcAttr.value : '');
      if (dim) {
        attrs.push({ type: 'mdxJsxAttribute', name: 'width', value: String(dim.width) });
        attrs.push({ type: 'mdxJsxAttribute', name: 'height', value: String(dim.height) });
      }
    });
  };
}
