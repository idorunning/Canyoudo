// The /research page controller. Markup lives in src/pages/research.astro;
// this wires the search, source picker, filters, topic rail, shareable URL
// state, and — when configured at build time — the AI assist and saved-papers
// features. All network data renders via createElement/textContent.

import { SOURCE_CAPS } from '../../lib/research-sources.mjs';
import { card, el, type Work, type CardHooks } from './cards';
import { readStateFromUrl, writeStateToUrl, type SearchState } from './state';
import { translateQuestion, renderOverview, clearOverview } from './assist';
import type { SavedStore } from './saved';

interface PageConfig {
  hasAi: boolean;
  hasAuth: boolean;
  sources: string[];
}

export async function initResearch() {
  const root = document.querySelector<HTMLElement>('[data-research]');
  if (!root) return;
  const config: PageConfig = JSON.parse(
    document.getElementById('research-config')?.textContent ?? '{}'
  );

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const form = $<HTMLFormElement>('[data-research-form]');
  const input = $<HTMLInputElement>('[data-research-input]');
  const send = $<HTMLButtonElement>('[data-research-send]');
  const interpreted = root.querySelector<HTMLElement>('[data-research-interpreted]');
  const status = $('[data-research-status]');
  const list = $('[data-research-results]');
  const more = $<HTMLButtonElement>('[data-research-more]');
  const topics = $('[data-research-topics]');
  const overviewPanel = root.querySelector<HTMLElement>('[data-research-overview]');
  const oaBox = $<HTMLInputElement>('[data-filter-oa]');
  const reviewBox = $<HTMLInputElement>('[data-filter-review]');
  const fromSel = $<HTMLSelectElement>('[data-filter-from]');
  const sortSel = $<HTMLSelectElement>('[data-filter-sort]');
  const tabs = root.querySelector<HTMLElement>('[data-research-tabs]');
  const savedView = root.querySelector<HTMLElement>('[data-research-saved]');
  const authSlot = root.querySelector<HTMLElement>('[data-auth-slot]');

  let page = 1;
  let lastQuery = '';
  let shown = 0;
  let total = 0;
  let activeTab: 'results' | 'saved' = 'results';
  // What the AI picked when the sort select is on "suggested" (set per search).
  let aiSort: 'cited' | 'recent' | null = null;
  let savedStore: SavedStore | null = null;
  let cardHooks: CardHooks = {};

  // ---- saved papers (only when Supabase was configured at build time) ------
  if (config.hasAuth && authSlot) {
    try {
      const { initSaved } = await import('./saved');
      savedStore = await initSaved(
        import.meta.env.PUBLIC_SUPABASE_URL,
        import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
        authSlot
      );
      cardHooks = savedStore.hooks;
      savedStore.onChange(() => {
        updateTabs();
        if (activeTab === 'saved' && savedView) {
          if (savedStore!.signedIn()) savedStore!.renderSavedView(savedView);
          else savedStore!.renderSignedOutView(savedView);
        }
      });
      // The signed-out pill asks us to show the sign-in pitch (Saved tab).
      root.addEventListener('research:show-signin', () => showTab('saved'));
      updateTabs();
    } catch {
      // Auth never blocks the search.
    }
  }

  function updateTabs() {
    if (!tabs || !savedStore) return;
    // The tab bar shows even signed out — the Saved tab is the nudge.
    tabs.hidden = false;
    const count = tabs.querySelector('[data-saved-count]');
    if (count) count.textContent = String(savedStore.count());
  }

  function showTab(tab: 'results' | 'saved') {
    activeTab = tab;
    const resultsPane = $('[data-results-pane]');
    resultsPane.hidden = tab !== 'results';
    if (savedView) {
      savedView.hidden = tab !== 'saved';
      if (tab === 'saved' && savedStore) {
        if (savedStore.signedIn()) savedStore.renderSavedView(savedView);
        else savedStore.renderSignedOutView(savedView);
      }
    }
    tabs?.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => {
      const active = b.dataset.tab === tab;
      b.classList.toggle('text-accent', active);
      b.classList.toggle('border-accent', active);
      b.classList.toggle('text-ink-600', !active);
      b.classList.toggle('border-transparent', !active);
    });
  }
  tabs?.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => showTab(b.dataset.tab as 'results' | 'saved'))
  );

  // ---- source picker + capability-aware filters ----------------------------
  const sourceOf = () =>
    root.querySelector<HTMLInputElement>('[name="research-source"]:checked')?.value ?? 'openalex';

  function applyCaps() {
    const caps = (SOURCE_CAPS as Record<string, Record<string, boolean>>)[sourceOf()] ?? SOURCE_CAPS.openalex;
    if (!caps.oa) {
      oaBox.checked = true; // CORE is all open access
      oaBox.disabled = true;
    } else {
      oaBox.disabled = false;
    }
    reviewBox.disabled = !caps.review;
    if (!caps.review) reviewBox.checked = false;
    sortSel.disabled = !caps.sort;
    if (!caps.sort) sortSel.value = 'relevance';
    [oaBox, reviewBox, sortSel].forEach((c) =>
      c.closest('label')?.classList.toggle('opacity-40', c.disabled)
    );
  }

  // ---- search ---------------------------------------------------------------
  const currentState = (): SearchState => ({
    q: lastQuery,
    source: sourceOf(),
    oa: oaBox.checked,
    review: reviewBox.checked,
    from: fromSel.value,
    sort: sortSel.value,
  });

  async function search(append: boolean) {
    const q = lastQuery;
    if (!q) return;
    send.disabled = true;
    more.disabled = true;
    status.textContent = append ? 'Loading more…' : 'Searching…';
    if (!append && overviewPanel) clearOverview(overviewPanel);

    const s = currentState();
    const params = new URLSearchParams({ q, page: String(page) });
    if (s.source !== 'openalex') params.set('source', s.source);
    if (s.oa) params.set('oa', '1');
    if (s.review) params.set('review', '1');
    if (s.from) params.set('from', s.from);
    const effectiveSort = s.sort === 'suggested' ? aiSort ?? 'relevance' : s.sort;
    if (effectiveSort !== 'relevance') params.set('sort', effectiveSort);

    let res: Response;
    try {
      res = await fetch(`/api/research?${params}`);
    } catch {
      status.textContent = 'Couldn’t reach the search. Try again.';
      unlock();
      return;
    }

    let data: { error?: string; count?: number; results?: Work[] } = {};
    try {
      data = await res.json();
    } catch {}
    if (!res.ok || !Array.isArray(data.results)) {
      status.textContent = data.error || 'Search is unavailable right now. Try again in a moment.';
      unlock();
      return;
    }

    if (!append) {
      list.replaceChildren();
      shown = 0;
      topics.hidden = true;
      showTab('results');
    }
    total = data.count ?? 0;
    for (const w of data.results) list.appendChild(card(w, cardHooks));
    shown += data.results.length;

    status.replaceChildren();
    if (total === 0) {
      status.textContent = 'Nothing found. Try fewer words, or untick “free-to-read only”.';
    } else {
      status.appendChild(
        document.createTextNode(
          `Showing ${shown.toLocaleString('en-GB')} of ${total.toLocaleString('en-GB')} results. `
        )
      );
    }
    const back = el('button', 'underline underline-offset-2 hover:text-accent', 'Browse topics') as HTMLButtonElement;
    back.type = 'button';
    back.addEventListener('click', () => {
      topics.hidden = false;
      topics.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    status.appendChild(back);

    more.hidden = shown >= total || data.results!.length === 0;
    unlock();
    writeStateToUrl(s);

    if (!append && config.hasAi && overviewPanel && data.results.length > 0) {
      renderOverview(overviewPanel, q, data.results, (refined) => {
        input.value = refined;
        startSearch();
      });
    }
  }

  function unlock() {
    send.disabled = false;
    more.disabled = false;
  }

  function startSearch() {
    const q = input.value.trim();
    if (!q) return;
    lastQuery = q;
    page = 1;
    search(false);
  }

  // ---- one box, two behaviours ----------------------------------------------
  // Plain keywords search directly. Anything that reads like a question (or a
  // search with sort on "suggested") goes through the AI translator first, so
  // the one Search button covers both.
  function looksLikeQuestion(s: string) {
    return (
      s.includes('?') ||
      /^(what|how|why|does|do|is|are|can|could|should|would|which|who|when|where|will)\b/i.test(s) ||
      s.split(/\s+/).length >= 6
    );
  }

  async function submitQuery() {
    const raw = input.value.trim();
    if (!raw) return;
    aiSort = null;
    if (!config.hasAi || !(sortSel.value === 'suggested' || looksLikeQuestion(raw))) {
      if (interpreted) interpreted.hidden = true;
      startSearch();
      return;
    }
    send.disabled = true;
    status.textContent = 'Reading the question…';
    const t = await translateQuestion(raw);
    if (!t) {
      // Fall back to searching the raw text — never a dead end.
      status.textContent = 'Couldn’t interpret that — searching for it as typed.';
      unlock();
      startSearch();
      return;
    }
    input.value = t.query;
    reviewBox.checked = t.filters.review && !reviewBox.disabled;
    if (t.filters.from) {
      // Snap to the nearest available "since" option at or before the year.
      const options = [...fromSel.options].map((o) => Number(o.value)).filter(Boolean);
      const pick = options.filter((y) => y <= t.filters.from!).sort((a, b) => b - a)[0];
      fromSel.value = pick ? String(pick) : '';
    }
    aiSort = t.filters.sort;
    if (t.filters.sort && !sortSel.disabled && sortSel.value !== 'suggested') {
      sortSel.value = t.filters.sort;
    }
    showInterpreted(t.query, t.filters, t.note);
    unlock();
    startSearch();
  }

  function showInterpreted(query: string, t: { review: boolean; from: number | null; sort: string | null }, note: string | null) {
    if (!interpreted) return;
    interpreted.replaceChildren();
    const bits = [`Interpreted as: “${query}”`];
    if (t.review) bits.push('reviews only');
    if (t.from) bits.push(`since ${t.from}`);
    if (t.sort === 'cited') bits.push('most cited first');
    if (t.sort === 'recent') bits.push('newest first');
    interpreted.appendChild(el('span', '', bits.join(' · ')));
    if (note) interpreted.appendChild(el('span', 'text-ink-500', ` — ${note}`));
    const x = el('button', 'ml-3 underline underline-offset-2 hover:text-accent', 'dismiss') as HTMLButtonElement;
    x.type = 'button';
    x.addEventListener('click', () => (interpreted.hidden = true));
    interpreted.appendChild(x);
    interpreted.hidden = false;
  }

  // ---- wiring ---------------------------------------------------------------
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitQuery();
  });

  [oaBox, reviewBox, fromSel, sortSel].forEach((c) =>
    c.addEventListener('change', () => {
      if (!lastQuery) return;
      if (c === sortSel && sortSel.value === 'suggested' && config.hasAi) {
        // Re-translate so the AI actually gets to pick the order.
        submitQuery();
        return;
      }
      page = 1;
      search(false);
    })
  );

  root.querySelectorAll<HTMLInputElement>('[name="research-source"]').forEach((r) =>
    r.addEventListener('change', () => {
      applyCaps();
      if (lastQuery) {
        page = 1;
        search(false);
      }
    })
  );

  more.addEventListener('click', () => {
    page += 1;
    search(true);
  });

  root.querySelectorAll<HTMLButtonElement>('[data-topic-q]').forEach((b) =>
    b.addEventListener('click', () => {
      input.value = b.dataset.topicQ || '';
      if (b.dataset.topicReview === '1' && !reviewBox.disabled) reviewBox.checked = true;
      if (b.dataset.topicFrom) fromSel.value = b.dataset.topicFrom;
      if (interpreted) interpreted.hidden = true;
      startSearch();
    })
  );

  // Open the topic disclosure on desktop; mobile keeps it collapsed.
  const disclosure = topics.querySelector<HTMLDetailsElement>('details');
  if (disclosure && window.matchMedia('(min-width: 768px)').matches) disclosure.open = true;

  // ---- restore shareable URL state -----------------------------------------
  const initial = readStateFromUrl();
  if (initial.source && config.sources.includes(initial.source)) {
    const radio = root.querySelector<HTMLInputElement>(`[name="research-source"][value="${initial.source}"]`);
    if (radio) radio.checked = true;
  }
  applyCaps();
  if (initial.oa === false && !oaBox.disabled) oaBox.checked = false;
  if (initial.review && !reviewBox.disabled) reviewBox.checked = true;
  if (initial.from) fromSel.value = initial.from;
  if (initial.sort && !sortSel.disabled) sortSel.value = initial.sort;
  if (initial.q) {
    input.value = initial.q;
    startSearch();
  }
}
