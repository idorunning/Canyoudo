// AI assistance for the Overview mode on /research: plain-English question
// translation (server-side Sonnet) and the overview panel — a mid-tier model's
// read of what a search found, with a suggested reading order pointing at the
// numbered results on screen and refinement chips for the next search.
// All rendered via textContent; failures suppress the panel, never the search.

import { el, type Work } from './cards';

// The numbered result cards the overview's "read first" picks link to —
// main.ts stamps these ids on the Overview pane's cards.
export const OVERVIEW_RESULT_ID_PREFIX = 'overview-result-';

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
  readFirst: { n: number; why: string }[];
  refinements: string[];
  caveat: string;
}

let overviewSeq = 0;

/**
 * Fetch and render the assistant's overview for a fresh set of results:
 * what they add up to, which to open first (linked to the numbered cards),
 * and sharper searches to run next. Stale responses (a newer search started
 * meanwhile) are dropped.
 */
export async function renderOverview(
  panel: HTMLElement,
  query: string,
  results: Work[],
  onRefine: (q: string) => void
): Promise<void> {
  const seq = ++overviewSeq;
  panel.replaceChildren();
  panel.hidden = true;

  const works = results.slice(0, 10);
  const items = works.map((w) => ({
    title: w.title,
    authors: w.authors,
    year: w.year,
    venue: w.venue,
    abstract: w.tldr || w.abstract || '',
  }));
  if (items.length === 0) return;

  let data: Overview | null = null;
  let serverMessage: string | null = null;
  try {
    const res = await fetch('/api/research-assist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'overview', query, items }),
    });
    const body = await res.json().catch(() => null);
    if (res.ok && typeof body?.overview === 'string' && body.overview) {
      data = {
        overview: body.overview,
        readFirst: Array.isArray(body.readFirst) ? body.readFirst : [],
        refinements: Array.isArray(body.refinements) ? body.refinements : [],
        caveat: typeof body.caveat === 'string' ? body.caveat : '',
      };
    } else if (res.status === 503 && typeof body?.error === 'string') {
      serverMessage = body.error; // e.g. the monthly budget pause
    }
  } catch {}
  if (seq !== overviewSeq) return; // a newer search superseded us
  if (!data) {
    if (serverMessage) {
      panel.replaceChildren(el('p', 'font-serif text-xs italic text-ink-600', serverMessage));
      panel.hidden = false;
    }
    return;
  }

  const box = el('div', 'bg-paper-100 border-l-2 border-accent rounded-r-2 px-5 py-4');
  box.appendChild(
    el('p', 'font-sans text-[0.65rem] uppercase tracking-[0.15em] text-ink-500 mb-2', 'Assistant’s overview — read the studies, not the summary')
  );
  box.appendChild(el('p', 'font-serif text-sm text-ink-800 leading-relaxed', data.overview));

  // The reading order: which numbered results to open first, and why. Indices
  // were validated server-side against the list the model saw; re-check here
  // against the cards actually on screen anyway.
  const picks = data.readFirst.filter(
    (r) => Number.isInteger(r?.n) && r.n >= 1 && r.n <= works.length && typeof r?.why === 'string' && r.why
  );
  if (picks.length) {
    box.appendChild(
      el('p', 'font-sans text-[0.65rem] uppercase tracking-[0.15em] text-ink-500 mt-4 mb-1', 'Read these first')
    );
    const ol = el('ol', 'space-y-1.5');
    for (const pick of picks) {
      const work = works[pick.n - 1];
      const li = el('li', 'font-serif text-sm text-ink-800 leading-relaxed');
      const a = el('a', 'font-medium text-accent hover:text-accent-dark no-underline') as HTMLAnchorElement;
      a.href = `#${OVERVIEW_RESULT_ID_PREFIX}${pick.n}`;
      a.textContent = `[${pick.n}] ${work.title}`;
      li.appendChild(a);
      li.appendChild(document.createTextNode(` — ${pick.why}`));
      ol.appendChild(li);
    }
    box.appendChild(ol);
  }

  if (data.caveat) box.appendChild(el('p', 'font-serif text-xs italic text-ink-600 mt-3', data.caveat));

  const refinements = data.refinements.map((r) => (typeof r === 'string' ? r.trim() : '')).filter(Boolean);
  if (refinements.length) {
    const rail = el('div', 'flex flex-wrap gap-2 mt-3');
    for (const r of refinements) {
      const b = el('button', 'font-sans text-xs px-2.5 py-1 bg-paper-50 border border-ink-200 text-ink-700 rounded hover:text-accent hover:border-accent transition-colors', r) as HTMLButtonElement;
      b.type = 'button';
      b.addEventListener('click', () => onRefine(r));
      rail.appendChild(b);
    }
    box.appendChild(rail);
  }

  panel.replaceChildren(box);
  panel.hidden = false;
}

/** Hide any pending/visible overview (e.g. when a new search starts). */
export function clearOverview(panel: HTMLElement) {
  overviewSeq++;
  panel.replaceChildren();
  panel.hidden = true;
}
