// AI assistance on /research: plain-English question translation (Sonnet,
// server-side), the evidence-overview panel + refinement chips (Haiku), and
// the cited evidence answer for question searches (Sonnet; references built
// here from the real retrieved works, never by the model).
// All rendered via textContent; failures suppress the panel, never the search.

import { el, type Work } from './cards';
import { citationParagraph, referenceList, CONFIDENCE_LABELS } from './citation-render';

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

// ---- cited evidence answers ------------------------------------------------

interface Answer {
  answer: string;
  used: number[];
  caveat: string;
  confidence: 'strong' | 'mixed' | 'thin';
}

/**
 * Fetch and render the cited evidence answer for a question search. The
 * numbered reference list is built locally from the retrieved Work objects —
 * the model only ever points at them by index. Failures hide the panel
 * (except an explicit server message, e.g. the monthly budget pause, which
 * is shown quietly); the result list is never affected.
 */
export async function renderAnswer(
  panel: HTMLElement,
  question: string,
  results: Work[]
) {
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

  panel.hidden = false;
  panel.appendChild(el('p', 'font-sans text-xs text-ink-500 italic', 'Synthesising an evidence answer…'));

  let data: Answer | null = null;
  let serverMessage: string | null = null;
  try {
    const res = await fetch('/api/research-assist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'answer', question, items }),
    });
    const body = await res.json().catch(() => null);
    if (res.ok && typeof body?.answer === 'string' && body.answer && Array.isArray(body?.used)) {
      data = body as Answer;
    } else if (res.status === 503 && typeof body?.error === 'string') {
      serverMessage = body.error; // e.g. the monthly budget pause
    }
  } catch {}
  if (seq !== overviewSeq) return; // a newer search superseded us
  if (!data) {
    panel.replaceChildren();
    if (serverMessage) {
      panel.appendChild(el('p', 'font-serif text-xs italic text-ink-600', serverMessage));
    } else {
      panel.hidden = true;
    }
    return;
  }

  const valid = new Set(data.used.filter((n) => Number.isInteger(n) && n >= 1 && n <= works.length));
  panel.replaceChildren();

  const box = el('div', 'bg-paper-100 border-l-2 border-accent rounded-r-md px-5 py-4');
  const kicker = el('div', 'flex flex-wrap items-baseline justify-between gap-2 mb-2');
  kicker.appendChild(
    el('p', 'font-sans text-[0.65rem] uppercase tracking-[0.15em] text-ink-500', 'Evidence answer — every claim cites a study below')
  );
  kicker.appendChild(
    el('span', 'font-sans text-[0.65rem] uppercase tracking-[0.12em] text-ink-500 border border-ink-200 rounded px-1.5 py-0.5', CONFIDENCE_LABELS[data.confidence] ?? CONFIDENCE_LABELS.mixed)
  );
  box.appendChild(kicker);

  for (const para of data.answer.split(/\n{2,}/)) {
    if (para.trim()) box.appendChild(citationParagraph(para.trim(), valid));
  }
  box.appendChild(el('p', 'font-serif text-xs italic text-ink-600 mt-3', data.caveat));

  // References: built from the actual retrieved works, numbered to match the
  // markers. Each line links nothing the model wrote — only real records.
  const refs = referenceList(works, valid);
  if (refs) box.appendChild(refs);

  panel.appendChild(box);
  panel.hidden = false;
}
