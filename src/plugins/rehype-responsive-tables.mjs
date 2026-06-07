// Rehype plugin: make article data tables readable on small screens. For every
// <table> in an article body it (1) wraps the table in a scrollable container
// so a wide table can never break the page layout, and (2) copies each column's
// header text onto the matching <td>/<th> in the body as a data-label, so CSS
// can collapse each row into a self-labelled card on narrow viewports. Wired in
// astro.config.mjs alongside rehype-topic-links; @astrojs/mdx inherits it, so
// MDX articles (e.g. the Somerton Man piece) get the same treatment.
//
// Progressive enhancement only: it adds a wrapper and attributes, never removes
// content, so a table still renders fine if the CSS is absent.

function toText(node) {
  if (!node) return '';
  if (node.type === 'text') return node.value;
  if (node.children) return node.children.map(toText).join('');
  return '';
}

function elementChildren(node, tagNames) {
  if (!node || !node.children) return [];
  return node.children.filter(
    (c) => c.type === 'element' && tagNames.includes(c.tagName)
  );
}

function findFirst(node, tagName) {
  if (!node || !node.children) return null;
  for (const c of node.children) {
    if (c.type !== 'element') continue;
    if (c.tagName === tagName) return c;
    const nested = findFirst(c, tagName);
    if (nested) return nested;
  }
  return null;
}

function transformTable(table) {
  // Column labels come from the header row: prefer <thead>, else the first row.
  const thead = findFirst(table, 'thead');
  let headerRow = thead ? findFirst(thead, 'tr') : null;
  if (!headerRow) headerRow = findFirst(table, 'tr');
  const labels = headerRow
    ? elementChildren(headerRow, ['th', 'td']).map((c) => toText(c).trim())
    : [];

  // Label every body cell with its column header. Skip the header row itself.
  const bodies = elementChildren(table, ['tbody']);
  const rowSources = bodies.length ? bodies : [table];
  for (const source of rowSources) {
    for (const row of elementChildren(source, ['tr'])) {
      if (row === headerRow) continue;
      const cells = elementChildren(row, ['td', 'th']);
      cells.forEach((cell, i) => {
        const label = labels[i];
        if (!label) return;
        cell.properties = cell.properties || {};
        cell.properties['data-label'] = label;
      });
    }
  }

  // Mark the table so styling is scoped to article data tables only.
  table.properties = table.properties || {};
  const cls = table.properties.className;
  table.properties.className = (Array.isArray(cls) ? cls : cls ? [cls] : []).concat('data-table');

  // Wrap in a horizontal-scroll container for the desktop fallback.
  return {
    type: 'element',
    tagName: 'div',
    properties: { className: ['table-wrap'] },
    children: [table],
  };
}

export default function rehypeResponsiveTables() {
  return (tree) => {
    const walk = (node) => {
      const children = node.children;
      if (!children) return;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.type !== 'element') continue;
        if (child.tagName === 'table') {
          children.splice(i, 1, transformTable(child));
          // Don't descend into the wrapper we just created.
          continue;
        }
        walk(child);
      }
    };
    walk(tree);
  };
}
