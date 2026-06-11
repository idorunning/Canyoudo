// AI assistance on /research: plain-English question translation (Sonnet,
// server-side) and the evidence-overview panel + refinement chips (Haiku).
// All rendered via textContent; failures suppress the panel, never the search.

import { el, type Work } from './cards';

export interface Translation {
  query: string;
  filters: { review: boolean; from: number | null; sort: 'cited' | 'recent' | null };
  note: string | null;
}

export async function translateQuestion(question: string): Promise<Translation | null> {
  try {
    const res = await fetch('/api/research-assist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'translate', question }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.query === 'string' && data.query ? (data as Translation) : null;
  } catch {
    return null;
  }
}

interface Overview {
  overview: string;
  caveat: string;
  refinements: string[];
}

let overviewSeq = 0;

/**
 * Fetch and render the evidence overview for a fresh set of results.
 * Stale responses (a newer search started meanwhile) are dropped.
 */
export async function renderOverview(
  panel: HTMLElement,
  query: string,
  results: Work[],
  onRefine: (q: string) => void
) {
  const seq = ++overviewSeq;
  panel.replaceChildren();
  panel.hidden = true;

  const items = results.slice(0, 8).map((w) => ({
    title: w.title,
    year: w.year,
    abstract: w.tldr || w.abstract || '',
  }));
  if (items.length === 0) return;

  let data: Overview | null = null;
  try {
    const res = await fetch('/api/research-assist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'overview', query, items }),
    });
    if (res.ok) {
      const body = await res.json();
      if (typeof body?.overview === 'string' && body.overview) data = body as Overview;
    }
  } catch {}
  if (!data || seq !== overviewSeq) return; // failed, or a newer search superseded us

  const box = el('div', 'bg-paper-100 border-l-2 border-accent rounded-r-md px-5 py-4');
  box.appendChild(
    el('p', 'font-sans text-[0.65rem] uppercase tracking-[0.15em] text-ink-500 mb-2', 'Assistant’s overview — read the studies, not the summary')
  );
  box.appendChild(el('p', 'font-serif text-sm text-ink-800 leading-relaxed', data.overview));
  box.appendChild(el('p', 'font-serif text-xs italic text-ink-600 mt-2', data.caveat));

  if (data.refinements.length) {
    const rail = el('div', 'flex flex-wrap gap-2 mt-3');
    for (const r of data.refinements) {
      const b = el('button', 'font-sans text-xs px-2.5 py-1 bg-paper-50 border border-ink-200 text-ink-700 rounded hover:text-accent hover:border-accent transition-colors', r) as HTMLButtonElement;
      b.type = 'button';
      b.addEventListener('click', () => onRefine(r));
      rail.appendChild(b);
    }
    box.appendChild(rail);
  }

  panel.appendChild(box);
  panel.hidden = false;
}

/** Hide any pending/visible overview (e.g. when a new search starts). */
export function clearOverview(panel: HTMLElement) {
  overviewSeq++;
  panel.replaceChildren();
  panel.hidden = true;
}
