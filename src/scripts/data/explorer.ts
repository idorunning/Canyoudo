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

// Horizontal bar table — same markup/classes as components/data/BarChart.astro.
export function barTable(
  el: HTMLElement,
  data: { label: string; count: number; note?: string }[],
  opts: { asPercent?: boolean; max?: number; caption?: string } = {}
) {
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  const scaleMax = opts.max ?? Math.max(...data.map((d) => d.count), 1);
  const val = (d: { count: number }) => (opts.asPercent ? `${Math.round((d.count / total) * 100)}%` : fmt.format(d.count));
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

// Multi-series line chart over an aligned month axis. Decorative SVG with a
// legend and a readable value table folded underneath for accessibility.
export function lineChart(
  el: HTMLElement,
  months: string[],
  datasets: { label: string; values: (number | null)[]; format?: (v: number) => string }[],
  opts: { height?: number } = {}
) {
  const W = 640, H = opts.height ?? 180, padL = 8, padR = 8, padT = 8, padB = 18;
  const colors = ['#7c2828', '#2d6a8e', '#3f7d52', '#b07a2c'];
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
  el.innerHTML = `
    <div class="flex flex-wrap gap-x-4 gap-y-1 mb-2">
      ${datasets.map((d, i) => `<span class="inline-flex items-center gap-1.5 font-sans text-xs text-ink-600"><span class="inline-block w-3 h-0.5" style="background:${colors[i % colors.length]}"></span>${esc(d.label)}</span>`).join('')}
    </div>
    <svg viewBox="0 0 ${W} ${H}" class="w-full" role="img" aria-label="Trend chart">
      ${datasets.map((d, i) => `<path d="${path(d.values)}" fill="none" stroke="${colors[i % colors.length]}" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"/>`).join('')}
      ${ticks.map((m) => `<text x="${x(months.indexOf(m))}" y="${H - 4}" font-size="10" fill="#9a8f86" font-family="sans-serif" text-anchor="middle">${monthLabel(m)}</text>`).join('')}
    </svg>`;
}

// Stream a Markdown interpretation from /api/db-interpret into `out`, rendering
// progressively. Mirrors the PersonaInterpreter client. Returns the final text.
export async function streamInterpret(
  url: string,
  out: HTMLElement,
  meta?: { monthEl?: HTMLElement | null; modelEl?: HTMLElement | null }
): Promise<void> {
  out.innerHTML = '<p class="text-ink-400 font-serif italic">Reading the data…</p>';
  let res: Response;
  try { res = await fetch(url); }
  catch { out.innerHTML = '<p class="text-accent">Couldn’t reach the interpreter. Please try again.</p>'; return; }

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    out.innerHTML = `<p class="text-accent">${esc((body && body.error) || 'The interpreter is unavailable right now.')}</p>`;
    return;
  }
  if (meta?.modelEl) meta.modelEl.textContent = res.headers.get('x-model') || 'Claude';
  if (meta?.monthEl) {
    const m = res.headers.get('x-data-month');
    if (m) meta.monthEl.textContent = ` Data to ${m}.`;
  }
  const reader = res.body?.getReader();
  if (!reader) { out.innerHTML = '<p class="text-accent">No response.</p>'; return; }
  const dec = new TextDecoder();
  let text = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    text += dec.decode(value, { stream: true });
    out.innerHTML = renderMarkdown(text);
  }
  out.innerHTML = renderMarkdown(text);
}

function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}
