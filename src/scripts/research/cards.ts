// Result-card factory for /research. Everything from the network is rendered
// via createElement/textContent — nothing is ever interpolated into HTML.

export type Work = {
  title: string;
  authors: string[];
  moreAuthors: number;
  year: number | null;
  venue: string | null;
  publisher: string | null;
  doi: string | null;
  pdfUrl: string | null;
  oaUrl: string | null;
  isOa: boolean;
  citedBy: number;
  abstract: string | null;
  source: string;
  tldr?: string;
  /** Provenance when the "All sources" search merged catalogues. */
  sources?: string[];
};

export const SOURCE_LABELS: Record<string, string> = {
  openalex: 'OpenAlex',
  policing: 'OpenAlex · policing journals',
  scholar: 'Semantic Scholar',
  core: 'CORE',
  crossref: 'Crossref',
  europepmc: 'Europe PMC',
  govuk: 'GOV.UK',
};

// Compact per-catalogue labels for merged-result provenance badges.
const SHORT_SOURCE_LABELS: Record<string, string> = {
  openalex: 'OpenAlex',
  scholar: 'S2',
  core: 'CORE',
  crossref: 'Crossref',
  europepmc: 'Europe PMC',
};

/** "OpenAlex · S2" provenance text for a work, falling back to its source. */
export function sourceBadge(w: Work): string | null {
  if (w.sources && w.sources.length > 0) {
    return w.sources.map((s) => SHORT_SOURCE_LABELS[s] ?? s).join(' · ');
  }
  return SOURCE_LABELS[w.source] ?? null;
}

/** A stable identity for saving/starring: DOI when present, else best URL. */
export function workKey(w: Work): string | null {
  return w.doi || w.oaUrl || w.pdfUrl || null;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string | null
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

function link(href: string, className: string, text: string) {
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  a.className = className;
  a.textContent = text;
  return a;
}

export interface CardHooks {
  /** Return true if this work is currently saved (renders the star filled). */
  isSaved?: (w: Work) => boolean;
  /** Star clicked. Receives the work and the button (for state flips). */
  onToggleSave?: (w: Work, btn: HTMLButtonElement) => void;
}

export function setStar(btn: HTMLButtonElement, saved: boolean) {
  btn.textContent = saved ? '★' : '☆';
  btn.classList.toggle('text-accent', saved);
  btn.classList.toggle('text-ink-400', !saved);
  btn.setAttribute('aria-label', saved ? 'Remove from saved' : 'Save for later');
  btn.title = saved ? 'Remove from saved' : 'Save for later';
}

export function card(w: Work, hooks: CardHooks = {}) {
  const art = el('article', 'py-6 border-b border-ink-200');

  const head = el('div', 'flex items-start justify-between gap-3');
  const h = el('h3', 'font-display text-xl font-semibold text-ink-900 leading-snug');
  const href = w.oaUrl || w.doi;
  if (href) h.appendChild(link(href, 'hover:text-accent transition-colors', w.title));
  else h.textContent = w.title;
  head.appendChild(h);

  if (hooks.onToggleSave) {
    const btn = el('button', 'shrink-0 text-xl leading-none p-1 -mr-1 transition-colors hover:text-accent') as HTMLButtonElement;
    btn.type = 'button';
    setStar(btn, hooks.isSaved ? hooks.isSaved(w) : false);
    btn.addEventListener('click', () => hooks.onToggleSave!(w, btn));
    head.appendChild(btn);
  }
  art.appendChild(head);

  const metaBits = [
    w.authors.join(', ') + (w.moreAuthors > 0 ? ` and ${w.moreAuthors} others` : ''),
    w.venue,
    w.year ? String(w.year) : null,
    w.citedBy ? `cited ${w.citedBy.toLocaleString('en-GB')} times` : null,
    sourceBadge(w),
  ].filter(Boolean);
  art.appendChild(el('p', 'font-sans text-xs text-ink-600 mt-2', metaBits.join(' · ')));

  if (w.tldr) {
    const p = el('p', 'font-serif text-sm text-ink-800 leading-relaxed mt-3 max-w-2xl');
    const tag = el('span', 'font-sans text-[0.65rem] uppercase tracking-[0.12em] text-ink-500 mr-2', 'TL;DR — AI summary via Semantic Scholar');
    p.appendChild(tag);
    p.appendChild(document.createTextNode(w.tldr));
    art.appendChild(p);
  } else if (w.abstract) {
    art.appendChild(el('p', 'font-serif text-sm text-ink-700 leading-relaxed mt-3 max-w-2xl', w.abstract));
  }

  const links = el('p', 'font-sans text-xs mt-3 flex flex-wrap gap-x-4 gap-y-1');
  if (w.pdfUrl) {
    links.appendChild(link(w.pdfUrl, 'text-accent font-medium hover:text-accent-dark', 'Free PDF →'));
  } else if (w.oaUrl) {
    links.appendChild(link(w.oaUrl, 'text-accent font-medium hover:text-accent-dark', 'Free copy →'));
  }
  if (w.doi) {
    // The DOI resolves to the version of record — label it with where it
    // lands (publisher, else journal) rather than the acronym "DOI".
    const at = w.publisher || w.venue || 'Publisher site';
    links.appendChild(link(w.doi, 'text-ink-600 hover:text-accent', `${at} →`));
  }
  if (links.childNodes.length) art.appendChild(links);
  return art;
}
