// Pure reference formatting for the saved-papers export on /research —
// shared by the page (src/scripts/research/saved.ts) and the unit tests.
// Works carry at most the first four authors plus a "more" count (that's all
// the result cards keep), so long author lists render as "and N others".

/** "A. Braga, B. Turchan and 2 others" from a Work's authors + moreAuthors. */
function authorLine(work) {
  const names = (work.authors ?? []).filter(Boolean);
  if (names.length === 0) return null;
  const more = work.moreAuthors > 0 ? ` and ${work.moreAuthors} others` : '';
  if (names.length === 1) return names[0] + more;
  if (more) return `${names.join(', ')}${more}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * One Harvard-ish reference line, UK style:
 *   Authors (Year) 'Title', Venue. Available at: https://doi.org/…
 * Fields that are missing are simply skipped — never "undefined".
 */
export function formatReference(work) {
  const bits = [];
  const authors = authorLine(work);
  if (authors) bits.push(authors);
  if (work.year) bits.push(`(${work.year})`);
  let cite = `${bits.join(' ')}${bits.length ? ' ' : ''}‘${work.title}’`;
  if (work.venue) cite += `, ${work.venue}`;
  cite += '.';
  const url = work.doi || work.oaUrl || work.pdfUrl;
  if (url) cite += ` Available at: ${url}`;
  return cite;
}

/** Alphabetical (by the line itself, i.e. first author) newline-joined list. */
export function formatReferenceList(works) {
  return works
    .map(formatReference)
    .sort((a, b) => a.localeCompare(b, 'en-GB'))
    .join('\n\n');
}

/**
 * RIS export (imports into Zotero, EndNote, Mendeley). One record per work;
 * only the authors we actually have are listed.
 */
export function toRis(works) {
  const records = works.map((w) => {
    const lines = ['TY  - JOUR'];
    for (const a of w.authors ?? []) lines.push(`AU  - ${a}`);
    lines.push(`TI  - ${w.title}`);
    if (w.venue) lines.push(`JO  - ${w.venue}`);
    if (w.year) lines.push(`PY  - ${w.year}`);
    if (w.doi) lines.push(`DO  - ${String(w.doi).replace(/^https?:\/\/doi\.org\//, '')}`);
    const url = w.oaUrl || w.pdfUrl || w.doi;
    if (url) lines.push(`UR  - ${url}`);
    lines.push('ER  - ');
    return lines.join('\r\n');
  });
  return records.join('\r\n') + '\r\n';
}
