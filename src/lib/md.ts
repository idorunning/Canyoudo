// Minimal, dependency-free Markdown for the constrained output our prompts
// produce (bold, italics, links, paragraphs, a short bullet list). Shared by the
// interpreter and the chat so they render identically.
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
      if (/^#{1,6}\s/.test(b)) return `<h3>${inline(b.replace(/^#{1,6}\s/, ''))}</h3>`;
      return `<p>${inline(b)}</p>`;
    })
    .join('');
}
