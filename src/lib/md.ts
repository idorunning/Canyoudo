// Minimal, dependency-free Markdown for the constrained output our prompts
// produce (bold, italics, links, paragraphs, a short bullet list, a pipe
// table). Shared by the interpreter, the chat and the force briefing so they
// render identically.
export function renderMarkdown(src: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[(.+?)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return src
    .trim()
    .split(/\n{2,}/)
    .map((b) => {
      const lines = b.split('\n');
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`;
      }
      // GFM pipe table (header, |---| separator, rows) — emitted as the same
      // .table-wrap / table.data-table markup the article pipeline produces,
      // so it inherits the site's responsive table treatment.
      if (
        lines.length >= 2 &&
        lines.every((l) => /^\s*\|.*\|\s*$/.test(l)) &&
        /^\s*\|[\s:|-]+\|\s*$/.test(lines[1])
      ) {
        const cells = (l: string) =>
          l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
        const head = cells(lines[0]);
        const rows = lines.slice(2).map(cells);
        return `<div class="table-wrap"><table class="data-table"><thead><tr>${head
          .map((h) => `<th scope="col">${inline(h)}</th>`)
          .join('')}</tr></thead><tbody>${rows
          .map(
            (r) =>
              `<tr>${r
                .map((c, i) => `<td data-label="${esc(head[i] ?? '')}">${inline(c)}</td>`)
                .join('')}</tr>`
          )
          .join('')}</tbody></table></div>`;
      }
      if (/^#{1,6}\s/.test(b)) return `<h3>${inline(b.replace(/^#{1,6}\s/, ''))}</h3>`;
      return `<p>${inline(b)}</p>`;
    })
    .join('');
}
