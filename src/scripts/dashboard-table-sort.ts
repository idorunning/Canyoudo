// Click-to-sort for the dashboard power tables. A table opts in with
// data-sortable; each sortable <th> carries data-sort-key, and each cell in
// that column carries data-sort-value (numeric or string). Totals rows live
// in <tfoot>, outside the sorted <tbody>, so they stay put.

function cellValue(row: HTMLTableRowElement, index: number): { num: number | null; str: string } {
  const cell = row.cells[index];
  const raw = cell?.getAttribute('data-sort-value') ?? cell?.textContent ?? '';
  const trimmed = raw.trim();
  const num = trimmed === '' ? NaN : Number(trimmed);
  return { num: Number.isNaN(num) ? null : num, str: trimmed.toLowerCase() };
}

document.querySelectorAll<HTMLTableElement>('table[data-sortable]').forEach((table) => {
  const body = table.tBodies[0];
  if (!body) return;

  table.querySelectorAll<HTMLTableCellElement>('th[data-sort-key]').forEach((th) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'inline-flex items-center gap-1 font-semibold hover:text-accent transition-colors';
    button.innerHTML = `${th.innerHTML}<span aria-hidden="true" data-sort-arrow class="text-ink-400"></span>`;
    th.replaceChildren(button);

    button.addEventListener('click', () => {
      const index = th.cellIndex;
      const currentlyAsc = th.getAttribute('aria-sort') === 'ascending';
      const dir = currentlyAsc ? -1 : 1;

      table.querySelectorAll('th[data-sort-key]').forEach((other) => {
        other.removeAttribute('aria-sort');
        const arrow = other.querySelector('[data-sort-arrow]');
        if (arrow) arrow.textContent = '';
      });
      th.setAttribute('aria-sort', dir === 1 ? 'ascending' : 'descending');
      const arrow = th.querySelector('[data-sort-arrow]');
      if (arrow) arrow.textContent = dir === 1 ? '↑' : '↓';

      const rows = [...body.rows];
      rows.sort((a, b) => {
        const va = cellValue(a, index);
        const vb = cellValue(b, index);
        if (va.num !== null && vb.num !== null) return (va.num - vb.num) * dir;
        return va.str.localeCompare(vb.str) * dir;
      });
      body.append(...rows);
    });
  });
});
