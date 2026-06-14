// Shared rendering of cited evidence prose for /research — used by the search
// answer (assist.ts), the live briefing and the read-only shared briefing
// (briefing.ts). The model only ever emits bracketed indices [n] into the
// numbered studies it was shown; here those become superscript links to a
// reference list built from the REAL Work objects. A fabricated reference is
// therefore structurally impossible — the references are never model text.
// Everything renders via createElement/textContent; nothing is interpolated
// into HTML.

import { el, type Work } from './cards';
import { formatReference } from '../../lib/reference-format.mjs';

const DEFAULT_ID_PREFIX = 'research-ref-';
const PARAGRAPH_CLASS = 'font-serif text-sm text-ink-800 leading-relaxed mt-2 first:mt-0';
const LINK_CLASS =
  'text-accent font-sans font-medium hover:text-accent-dark no-underline px-0.5';

export interface CitationStyle {
  /** Tailwind classes for each paragraph. */
  paragraphClass?: string;
  /** Prefix for reference anchor ids (lets two cited blocks coexist on a page). */
  idPrefix?: string;
}

/**
 * One paragraph of prose, turning [n] markers into superscript links to the
 * matching reference line. Markers outside `valid` are dropped (the server
 * already stripped out-of-range ones, but the shared view re-validates against
 * a possibly-tampered stored row).
 */
export function citationParagraph(
  text: string,
  valid: Set<number>,
  style: CitationStyle = {}
): HTMLParagraphElement {
  const idPrefix = style.idPrefix ?? DEFAULT_ID_PREFIX;
  const p = el('p', style.paragraphClass ?? PARAGRAPH_CLASS);
  for (const part of text.split(/(\[\d{1,3}\])/)) {
    const m = part.match(/^\[(\d{1,3})\]$/);
    const n = m ? Number(m[1]) : 0;
    if (n && valid.has(n)) {
      const sup = document.createElement('sup');
      const a = document.createElement('a');
      a.href = `#${idPrefix}${n}`;
      a.className = LINK_CLASS;
      a.textContent = `[${n}]`;
      sup.appendChild(a);
      p.appendChild(sup);
    } else if (part) {
      p.appendChild(document.createTextNode(part));
    }
  }
  return p;
}

/**
 * The numbered reference list, built from the actual retrieved works and
 * numbered to match the markers. Returns null when nothing is cited.
 * `works` is index-aligned: marker [n] → works[n-1].
 */
export function referenceList(
  works: Work[],
  valid: Set<number>,
  heading = 'References (from the results below)',
  style: CitationStyle = {}
): HTMLElement | null {
  if (!valid.size) return null;
  const idPrefix = style.idPrefix ?? DEFAULT_ID_PREFIX;
  const wrap = el('div', '');
  wrap.appendChild(
    el('p', 'font-sans text-[0.65rem] uppercase tracking-[0.15em] text-ink-500 mt-4 mb-1', heading)
  );
  const list = el('ol', 'space-y-1');
  for (const n of [...valid].sort((a, b) => a - b)) {
    const work = works[n - 1];
    if (!work) continue;
    const li = el('li', 'font-serif text-xs text-ink-700 leading-relaxed');
    li.id = `${idPrefix}${n}`;
    li.appendChild(el('span', 'font-sans font-medium text-ink-500 mr-1', `[${n}]`));
    li.appendChild(document.createTextNode(formatReference(work)));
    list.appendChild(li);
  }
  wrap.appendChild(list);
  return wrap;
}

/** Confidence-pill labels, shared by the answer and the briefing. */
export const CONFIDENCE_LABELS: Record<'strong' | 'mixed' | 'thin', string> = {
  strong: 'Evidence: converging',
  mixed: 'Evidence: mixed',
  thin: 'Evidence: thin',
};
