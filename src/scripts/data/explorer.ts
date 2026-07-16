// Shared client helpers for the police-database explorer pages under /data/.
// Dependency-free charts (matching the BarChart/Sparkline house style) plus a
// streaming interpreter client that mirrors PersonaInterpreter. Imported by the
// explorer .astro pages; nothing here runs unless a page calls it.

import { renderMarkdown } from '../../lib/md';

export const fmt = new Intl.NumberFormat('en-GB');
export const pct = (n: number | null | undefined, dp = 0) =>
  n == null ? '—' : `${(n * 100).toFixed(dp)}%`;

export function monthLabel(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

export async function fetchJson<T = any>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error((body && body.error) || `Request failed (${res.status})`);
  return body as T;
}

// Small shares round down to a misleading "0%" — and a long tail of them
// makes a bar table look like a wall of zeroes. Fold anything under 1% of
// the total into a single "Other" row (summed), so what's shown either
// rounds to at least 1% or is honestly labelled "<1%".
export function collapseSmallShares<T extends { label: string; count: number; note?: string }>(
  data: T[],
  thresholdPct = 1
): T[] {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (!total) return data;
  const small = data.filter((d) => (d.count / total) * 100 < thresholdPct);
  if (small.length < 2) return data; // nothing worth merging just one row
  const big = data.filter((d) => (d.count / total) * 100 >= thresholdPct);
  const otherCount = small.reduce((s, d) => s + d.count, 0);
  return [...big, { ...small[0], label: `Other (${small.length})`, count: otherCount, note: undefined }];
}

function percentLabel(count: number, total: number): string {
  const p = (count / total) * 100;
  if (count > 0 && p < 1) return '<1%';
  return `${Math.round(p)}%`;
}

// Horizontal bar table — same markup/classes as components/data/BarChart.astro.
export function barTable(
  el: HTMLElement,
  data: { label: string; count: number; note?: string }[],
  opts: { asPercent?: boolean; max?: number; caption?: string; format?: (count: number) => string } = {}
) {
  if (opts.asPercent) data = collapseSmallShares(data);
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  const scaleMax = opts.max ?? Math.max(...data.map((d) => d.count), 1);
  const val = (d: { count: number }) =>
    opts.format ? opts.format(d.count) : opts.asPercent ? percentLabel(d.count, total) : fmt.format(d.count);
  const width = (d: { count: number }) => `${Math.max((d.count / scaleMax) * 100, 0.5)}%`;
  el.innerHTML = `
    <figure class="my-2">
      ${opts.caption ? `<figcaption class="font-sans text-sm font-medium text-ink-800 mb-3">${opts.caption}</figcaption>` : ''}
      <table class="w-full border-collapse font-sans text-sm"><tbody>
        ${data.map((d) => `
          <tr class="align-middle">
            <th scope="row" class="py-1.5 pr-3 text-left font-normal text-ink-700 whitespace-nowrap w-1/3 max-w-[14rem] truncate" title="${esc(d.label)}">${esc(d.label)}</th>
            <td class="py-1.5 w-2/3"><div class="flex items-center gap-2">
              <div class="flex-1 bg-paper-200 rounded-sm overflow-hidden h-3.5"><div class="h-full bg-accent/80 rounded-sm" style="width:${width(d)}"></div></div>
              <span class="tabular-nums text-ink-600 w-20 text-right shrink-0">${val(d)}${d.note ? ` <span class="text-ink-400">${esc(d.note)}</span>` : ''}</span>
            </div></td>
          </tr>`).join('')}
      </tbody></table>
    </figure>`;
}

// Multi-series line chart over an aligned month axis: SVG with a legend,
// labelled y-axis gridlines, and the actual values folded underneath in a
// <details> table so the chart is readable without a pointer (and by screen
// readers).
export function lineChart(
  el: HTMLElement,
  months: string[],
  datasets: { label: string; values: (number | null)[]; format?: (v: number) => string }[],
  opts: { height?: number; label?: string; format?: (v: number) => string } = {}
) {
  const W = 640, H = opts.height ?? 180, padL = 46, padR = 8, padT = 8, padB = 18;
  const colors = ['#7c2828', '#2d6a8e', '#3f7d52', '#b07a2c'];
  const fmtV = opts.format ?? ((v: number) => fmt.format(Math.round(v)));
  const all = datasets.flatMap((d) => d.values.filter((v): v is number => v != null));
  const max = Math.max(...all, 1), min = Math.min(...all, 0), span = max - min || 1;
  const n = months.length;
  const x = (i: number) => (n <= 1 ? padL : padL + (i / (n - 1)) * (W - padL - padR));
  const y = (v: number) => padT + (1 - (v - min) / span) * (H - padT - padB);
  const path = (vals: (number | null)[]) => {
    let d = '', pen = false;
    vals.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `; pen = true; });
    return d.trim();
  };
  const ticks = [months[0], months[Math.floor(n / 2)], months[n - 1]].filter(Boolean);
  const gridVals = [min, min + span / 2, max];
  const title = opts.label || datasets.map((d) => d.label).join(', ');
  el.innerHTML = `
    <div class="flex flex-wrap gap-x-4 gap-y-1 mb-2">
      ${datasets.map((d, i) => `<span class="inline-flex items-center gap-1.5 font-sans text-xs text-ink-600"><span class="inline-block w-3 h-0.5" style="background:${colors[i % colors.length]}"></span>${esc(d.label)}</span>`).join('')}
    </div>
    <svg viewBox="0 0 ${W} ${H}" class="w-full" role="img" aria-label="${esc(title)} — values in the table below">
      ${gridVals.map((v) => `
        <line x1="${padL}" y1="${y(v).toFixed(1)}" x2="${W - padR}" y2="${y(v).toFixed(1)}" stroke="#e4ddd4" stroke-width="1"/>
        <text x="${padL - 6}" y="${(y(v) + 3).toFixed(1)}" font-size="10" fill="#9a8f86" font-family="sans-serif" text-anchor="end">${esc(fmtV(v))}</text>`).join('')}
      ${datasets.map((d, i) => `<path d="${path(d.values)}" fill="none" stroke="${colors[i % colors.length]}" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"/>`).join('')}
      ${ticks.map((m) => `<text x="${x(months.indexOf(m))}" y="${H - 4}" font-size="10" fill="#9a8f86" font-family="sans-serif" text-anchor="middle">${monthLabel(m)}</text>`).join('')}
    </svg>
    <details class="mt-2">
      <summary class="cursor-pointer font-sans text-xs text-ink-500 hover:text-accent">See the values</summary>
      <div class="mt-2 max-h-64 overflow-y-auto">
        <table class="w-full border-collapse font-sans text-xs">
          <thead><tr class="text-left text-ink-500">
            <th scope="col" class="py-1 pr-3 font-normal">Month</th>
            ${datasets.map((d) => `<th scope="col" class="py-1 pr-3 font-normal">${esc(d.label)}</th>`).join('')}
          </tr></thead>
          <tbody>
            ${months.map((m, i) => `<tr class="border-t border-ink-200/60">
              <th scope="row" class="py-1 pr-3 text-left font-normal text-ink-700">${monthLabel(m)}</th>
              ${datasets.map((d) => `<td class="py-1 pr-3 tabular-nums text-ink-600">${d.values[i] == null ? '—' : esc((d.format ?? fmtV)(d.values[i] as number))}</td>`).join('')}
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </details>`;
}

// Stream a Markdown interpretation from /api/db-interpret into `out`, rendering
// progressively. Mirrors the PersonaInterpreter client.
//
// Concurrent calls against the same element supersede each other: the earlier
// request is aborted (so it also stops billing tokens) and its stream stops
// writing — without this, switching the force picker twice interleaves two
// readings into the same box.
const activeStreams = new WeakMap<HTMLElement, AbortController>();

// Callers that rebuild their DOM (the Crime Map panel) can't rely on the
// element-keyed supersede above — the old output node is simply detached, and
// a live-model stream would run (and bill) to completion into it. They must
// abort explicitly before discarding the element.
export function abortInterpret(out: HTMLElement | null): void {
  if (out) activeStreams.get(out)?.abort();
}

export async function streamInterpret(
  url: string,
  out: HTMLElement,
  meta?: { monthEl?: HTMLElement | null; modelEl?: HTMLElement | null }
): Promise<void> {
  activeStreams.get(out)?.abort();
  const ctrl = new AbortController();
  activeStreams.set(out, ctrl);
  const current = () => activeStreams.get(out) === ctrl;

  out.innerHTML = '<p class="text-ink-400 font-serif italic">Reading the data…</p>';
  let res: Response;
  try { res = await fetch(url, { signal: ctrl.signal }); }
  catch {
    if (current()) out.innerHTML = '<p class="text-accent">Couldn’t reach the interpreter. Please try again.</p>';
    return;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (current()) out.innerHTML = `<p class="text-accent">${esc((body && body.error) || 'The interpreter is unavailable right now.')}</p>`;
    return;
  }
  if (meta?.modelEl) meta.modelEl.textContent = res.headers.get('x-model') || 'the site’s AI';
  if (meta?.monthEl) {
    const m = res.headers.get('x-data-month');
    if (m) meta.monthEl.textContent = ` Data to ${m}.`;
  }
  const reader = res.body?.getReader();
  if (!reader) { if (current()) out.innerHTML = '<p class="text-accent">No response.</p>'; return; }
  const dec = new TextDecoder();
  let text = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      text += dec.decode(value, { stream: true });
      if (!current()) return; // superseded mid-stream
      out.innerHTML = renderMarkdown(text);
    }
  } catch {
    return; // aborted
  }
  if (current()) out.innerHTML = renderMarkdown(text);
}

// Download tabular data as a CSV file — analysts re-make these charts in
// their own tools, so hand them the series rather than making them scrape it.
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null)[][]
): void {
  const cell = (v: string | number | null) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows].map((r) => r.map(cell).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}
