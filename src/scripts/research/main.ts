// The /research page controller. Markup lives in src/pages/research.astro.
//
// The page has three regions, gated client-side after the Supabase session
// resolves: a logged-out marketing LANDING, the signed-in TOOL, and a
// read-only SHARED briefing view (opened via /research?b=<token>). The tool
// leads with the problem→briefing flow (briefing.ts) and keeps the original
// keyword/question search as a secondary mode. All network data renders via
// createElement/textContent.

import { SOURCE_CAPS } from '../../lib/research-sources.mjs';
import { workMergeKey } from '../../lib/research-merge.mjs';
import { card, el, type Work, type CardHooks } from './cards';
import { readStateFromUrl, writeStateToUrl, type SearchState } from './state';
import { translateQuestion, renderOverview, renderAnswer, clearOverview } from './assist';
import {
  runBriefingPipeline,
  renderBriefing,
  cancelBriefing,
  type BriefingPlan,
  type BriefingOutcome,
} from './briefing';
import type { BriefingDepth } from '../../lib/research-assist-prompts';

// The depth slider's three stops, in order — its integer value indexes this.
// Each carries the chip label and the live description shown under the slider.
const DEPTH_STOPS: { key: BriefingDepth; name: string; desc: string }[] = [
  {
    key: 'low',
    name: 'Quick scan',
    desc: 'A fast read of the open record — the headline findings and whether the problem is worth a deeper dig. A few cited paragraphs, in seconds.',
  },
  {
    key: 'mid',
    name: 'Overview',
    desc: 'A balanced summary — what the evidence says and how strong it is, cited to the studies. The default. About half a minute.',
  },
  {
    key: 'high',
    name: 'Full review',
    desc: 'A full evidence review — the problem framed, what the research shows, its strengths and gaps, and evidence-based approaches to try. Searches widest, so it takes a little longer.',
  },
];
import type { SavedStore } from './saved';
import type { BriefingsStore } from './briefings-store';

interface PageConfig {
  hasAi: boolean;
  hasAuth: boolean;
  hasBriefing: boolean;
  sources: string[];
}

export async function initResearch() {
  const root = document.querySelector<HTMLElement>('[data-research]');
  if (!root) return;
  const config: PageConfig = JSON.parse(
    document.getElementById('research-config')?.textContent ?? '{}'
  );

  const landing = root.querySelector<HTMLElement>('[data-research-landing]');
  const tool = root.querySelector<HTMLElement>('[data-research-tool]');
  const shared = root.querySelector<HTMLElement>('[data-research-shared]');
  const skeleton = root.querySelector<HTMLElement>('[data-research-skeleton]');

  // ---- shared briefing route (/research?b=token), ahead of the gate ---------
  const shareToken = new URLSearchParams(location.search).get('b');
  if (shareToken && config.hasAuth && shared) {
    document.documentElement.removeAttribute('data-maybe-authed');
    if (landing) landing.hidden = true;
    if (tool) tool.hidden = true;
    if (skeleton) skeleton.hidden = true;
    await showSharedBriefing(shared, shareToken);
    return;
  }

  // ---- auth + storage (only when Supabase was configured at build time) -----
  let savedStore: SavedStore | null = null;
  let briefingsStore: BriefingsStore | null = null;
  const authSlot = root.querySelector<HTMLElement>('[data-auth-slot]');
  if (config.hasAuth && authSlot) {
    try {
      const { initSaved } = await import('./saved');
      savedStore = await initSaved(
        import.meta.env.PUBLIC_SUPABASE_URL,
        import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
        authSlot
      );
      const { initBriefings } = await import('./briefings-store');
      briefingsStore = initBriefings(savedStore.supabase, savedStore.currentUser);
    } catch {
      // Auth init never blocks the tool from wiring up.
    }
  }

  // Wire both modes up-front; they live in the (possibly hidden) tool region.
  wireSearch(root, config, savedStore);
  if (config.hasBriefing) wireBriefing(root, config, savedStore, briefingsStore);

  // ---- gating: landing for logged-out, tool for signed-in -------------------
  const landingSignin = root.querySelector<HTMLElement>('[data-landing-signin]');
  function applyGate() {
    document.documentElement.removeAttribute('data-maybe-authed');
    if (skeleton) skeleton.hidden = true;
    const signedIn = Boolean(savedStore?.signedIn());
    if (signedIn) {
      if (landing) landing.hidden = true;
      if (tool) tool.hidden = false;
    } else {
      if (tool) tool.hidden = true;
      if (landing) {
        landing.hidden = false;
        if (landingSignin && savedStore) {
          landingSignin.replaceChildren();
          savedStore.renderSignInOptions(landingSignin);
        }
      }
    }
  }

  if (config.hasAuth) {
    // initSaved already resolved the session before returning, so this is
    // accurate immediately; re-run on sign-in/out for a live swap.
    applyGate();
    savedStore?.onChange(applyGate);
  }
  // Without auth there's no gate — the tool renders visible (astro), and the
  // briefing flow still works, just without save/share.
}

// ---- shared read-only briefing --------------------------------------------

async function showSharedBriefing(container: HTMLElement, token: string) {
  container.hidden = false;
  container.replaceChildren();
  container.appendChild(el('p', 'font-sans text-sm text-ink-600 py-8', 'Loading shared briefing…'));

  const notShared = () => {
    container.replaceChildren();
    const box = el('div', 'py-10 max-w-xl');
    box.appendChild(el('h2', 'font-display text-2xl font-semibold text-ink-900', 'This briefing isn’t available'));
    box.appendChild(
      el('p', 'font-serif text-ink-700 leading-relaxed mt-3', 'The link may be wrong, or the briefing has been made private. Ask whoever shared it for an up-to-date link.')
    );
    const a = el('a', 'inline-block mt-5 font-sans text-sm uppercase tracking-[0.12em] text-accent hover:text-accent-dark', 'Go to the research assistant →') as HTMLAnchorElement;
    a.href = '/research';
    box.appendChild(a);
    container.appendChild(box);
  };

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      import.meta.env.PUBLIC_SUPABASE_URL,
      import.meta.env.PUBLIC_SUPABASE_ANON_KEY
    );
    const { loadSharedBriefing } = await import('./briefings-store');
    const briefing = await loadSharedBriefing(supabase, token);
    if (!briefing) return notShared();

    renderBriefing(container, briefing, { readOnly: true });

    // A quiet "make your own" footer — the share link is also a funnel.
    const cta = el('div', 'mt-10 border-t border-ink-200 pt-6');
    const a = el('a', 'inline-block font-sans text-sm uppercase tracking-[0.12em] bg-accent text-paper-50 px-5 py-2.5 rounded-md hover:bg-accent-dark transition-colors', 'Build your own briefing →') as HTMLAnchorElement;
    a.href = '/research';
    cta.appendChild(a);
    container.appendChild(cta);
  } catch {
    notShared();
  }
}

// ---- briefing mode ---------------------------------------------------------

function wireBriefing(
  root: HTMLElement,
  config: PageConfig,
  savedStore: SavedStore | null,
  briefingsStore: BriefingsStore | null
) {
  const modeNav = root.querySelector<HTMLElement>('[data-research-mode]');
  const briefingMode = root.querySelector<HTMLElement>('[data-briefing-mode]');
  const searchMode = root.querySelector<HTMLElement>('[data-search-mode]');
  const form = root.querySelector<HTMLFormElement>('[data-briefing-form]');
  const input = root.querySelector<HTMLTextAreaElement>('[data-briefing-input]');
  const send = root.querySelector<HTMLButtonElement>('[data-briefing-send]');
  const progress = root.querySelector<HTMLElement>('[data-briefing-progress]');
  const result = root.querySelector<HTMLElement>('[data-briefing-result]');
  if (!briefingMode || !form || !input || !send || !progress || !result) return;

  // ---- research depth slider ----
  const depthSlider = root.querySelector<HTMLInputElement>('[data-briefing-depth]');
  const depthName = root.querySelector<HTMLElement>('[data-depth-name]');
  const depthDesc = root.querySelector<HTMLElement>('[data-depth-desc]');
  function currentDepthStop() {
    const i = depthSlider ? Number(depthSlider.value) : 1;
    return DEPTH_STOPS[i] ?? DEPTH_STOPS[1];
  }
  function syncDepthLabels() {
    const stop = currentDepthStop();
    if (depthName) depthName.textContent = stop.name;
    if (depthDesc) depthDesc.textContent = stop.desc;
  }
  depthSlider?.addEventListener('input', syncDepthLabels);
  syncDepthLabels();

  // ---- mode toggle ----
  function setMode(mode: 'briefing' | 'search') {
    if (briefingMode) briefingMode.hidden = mode !== 'briefing';
    if (searchMode) searchMode.hidden = mode !== 'search';
    modeNav?.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => {
      const active = b.dataset.mode === mode;
      b.classList.toggle('bg-ink-900', active);
      b.classList.toggle('text-paper-50', active);
      b.classList.toggle('border', !active);
      b.classList.toggle('border-ink-300', !active);
      b.classList.toggle('text-ink-700', !active);
    });
  }
  modeNav?.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) =>
    b.addEventListener('click', () => setMode(b.dataset.mode as 'briefing' | 'search'))
  );

  const cardHooks: CardHooks = savedStore?.hooks ?? {};
  const briefingSource = config.sources.includes('all') ? 'all' : 'openalex';

  // ---- progress + angle checklist ----
  function startProgress() {
    progress!.replaceChildren();
    progress!.hidden = false;
    const status = el('p', 'font-sans text-sm text-ink-700');
    status.dataset.role = 'status';
    status.textContent = 'Framing the problem…';
    progress!.appendChild(status);
  }
  function setProgressText(text: string) {
    const s = progress!.querySelector<HTMLElement>('[data-role="status"]');
    if (s) s.textContent = text;
  }
  function renderPlan(plan: BriefingPlan) {
    if (plan.framing && !progress!.querySelector('[data-role="framing"]')) {
      const f = el('p', 'font-serif text-sm text-ink-700 leading-relaxed mt-2 italic', plan.framing);
      f.dataset.role = 'framing';
      progress!.appendChild(f);
    }
    if (!progress!.querySelector('[data-role="checklist"]')) {
      const ul = el('ul', 'mt-3 space-y-1 font-sans text-sm text-ink-600');
      ul.dataset.role = 'checklist';
      for (const a of plan.angles) {
        const li = el('li', 'flex items-center gap-2');
        li.appendChild(el('span', 'text-ink-400', '○'));
        li.appendChild(el('span', '', a.label));
        ul.appendChild(li);
      }
      progress!.appendChild(ul);
    }
  }
  function tickAngle(index: number) {
    const items = progress!.querySelectorAll<HTMLElement>('[data-role="checklist"] li');
    const li = items[index];
    if (li) {
      const marker = li.querySelector('span');
      if (marker) {
        marker.textContent = '✓';
        marker.className = 'text-accent';
      }
    }
  }

  // ---- the thin / failure fallback: show the curated studies plainly ----
  function renderStudyList(framing: string, references: Work[], lead: string) {
    result!.replaceChildren();
    const wrap = el('div', 'max-w-3xl');
    wrap.appendChild(el('p', 'font-serif text-base text-ink-800 leading-relaxed', lead));
    if (framing) wrap.appendChild(el('p', 'font-serif text-sm text-ink-600 italic mt-2', framing));
    if (references.length) {
      const head = el('div', 'mt-6');
      head.appendChild(el('h3', 'font-sans text-xs uppercase tracking-[0.2em] text-ink-500 mb-2', `Studies found — ${references.length}`));
      for (const w of references) head.appendChild(card(w, cardHooks));
      wrap.appendChild(head);
    }
    result!.appendChild(wrap);
  }

  function showMessage(text: string) {
    progress!.replaceChildren();
    progress!.hidden = false;
    progress!.appendChild(el('p', 'font-serif text-sm text-ink-700', text));
  }

  async function handleOutcome(outcome: BriefingOutcome) {
    if (outcome.status === 'stale') return;
    if (outcome.status === 'budget') {
      showMessage(outcome.message);
      return;
    }
    if (outcome.status === 'error') {
      showMessage(outcome.message);
      return;
    }
    if (outcome.status === 'thin') {
      progress!.hidden = true;
      renderStudyList(
        outcome.framing,
        outcome.references,
        outcome.references.length
          ? 'The open record is thin on this one — not enough to synthesise a confident briefing, but here’s what came back. Read the studies and try a sharper problem statement.'
          : 'Nothing usable came back. Try rephrasing the problem, or broaden it.'
      );
      return;
    }
    if (outcome.status === 'failed') {
      // A healthy evidence base came back, but writing the briefing failed —
      // an assistant-side problem, not a thin record. Say so plainly and show
      // the studies it would have drawn on.
      progress!.hidden = true;
      renderStudyList(
        outcome.framing,
        outcome.references,
        'The studies came back fine — but the briefing couldn’t be written this time. That’s on the assistant, not the evidence. Here’s the evidence base it found; try again in a moment.'
      );
      return;
    }
    // status === 'ok'
    progress!.hidden = true;
    renderBriefing(result!, outcome.result, { hooks: cardHooks });
    // Save + share (only when signed in and storage is configured).
    if (savedStore?.signedIn() && briefingsStore) {
      const bar = el('div', 'mt-8 border-t border-ink-200 pt-5');
      result!.querySelector('.max-w-3xl')?.appendChild(bar);
      await renderSaveBar(bar, outcome, briefingsStore);
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const problem = input.value.trim();
    if (problem.split(/\s+/).filter(Boolean).length < 3) {
      showMessage('Describe the problem in a sentence or two — a few words isn’t enough to research.');
      return;
    }
    cancelBriefing(); // supersede any in-flight run
    send.disabled = true;
    result.replaceChildren();
    startProgress();
    let outcome: BriefingOutcome;
    try {
      outcome = await runBriefingPipeline(problem, {
        source: briefingSource,
        depth: currentDepthStop().key,
        onProgress: setProgressText,
        onPlan: renderPlan,
        onAngleDone: (i) => tickAngle(i),
      });
    } catch {
      outcome = { status: 'error', message: 'Something went wrong building the briefing. Try again.' };
    }
    send.disabled = false;
    await handleOutcome(outcome);
  });

  // Default to briefing; the search-mode region is hidden by astro when
  // hasBriefing, so this only normalises the toggle styling.
  setMode('briefing');
}

/** The save state + share-link control beneath a finished briefing. */
async function renderSaveBar(
  bar: HTMLElement,
  outcome: Extract<BriefingOutcome, { status: 'ok' }>,
  briefingsStore: BriefingsStore
) {
  bar.replaceChildren();
  bar.appendChild(el('p', 'font-sans text-sm text-ink-600', 'Saving to your account…'));
  const saved = await briefingsStore.saveBriefing(outcome.result);
  bar.replaceChildren();
  if (!saved) {
    bar.appendChild(el('p', 'font-sans text-sm text-ink-600', 'Couldn’t save this briefing (you may have reached the saved limit). It’s still on screen.'));
    return;
  }

  const row = el('div', 'flex flex-wrap items-center gap-3');
  row.appendChild(el('span', 'font-sans text-sm text-ink-700', '✓ Saved to your account.'));
  const shareBtn = el('button', 'font-sans text-xs uppercase tracking-[0.12em] border border-ink-300 text-ink-700 px-4 py-2 rounded-md hover:border-ink-500', 'Copy share link') as HTMLButtonElement;
  shareBtn.type = 'button';
  row.appendChild(shareBtn);
  bar.appendChild(row);
  const note = el('p', 'font-sans text-xs text-ink-500 mt-2', '');
  bar.appendChild(note);

  let shared = false;
  shareBtn.addEventListener('click', async () => {
    const url = `${location.origin}/research?b=${encodeURIComponent(saved.shareToken)}`;
    if (!shared) {
      // First share flips visibility to unlisted so the link works.
      const ok = await briefingsStore.setVisibility(saved.id, 'unlisted');
      if (!ok) {
        note.textContent = 'Couldn’t create the share link — try again.';
        return;
      }
      shared = true;
    }
    try {
      await navigator.clipboard.writeText(url);
      note.textContent = `Link copied — anyone with it can view this briefing (read-only): ${url}`;
    } catch {
      note.textContent = `Share this read-only link: ${url}`;
    }
    // Offer to revoke once shared.
    if (!bar.querySelector('[data-role="revoke"]')) {
      const revoke = el('button', 'font-sans text-xs underline underline-offset-2 text-ink-500 hover:text-accent mt-1', 'Make private again') as HTMLButtonElement;
      revoke.type = 'button';
      revoke.dataset.role = 'revoke';
      revoke.addEventListener('click', async () => {
        const ok = await briefingsStore.setVisibility(saved.id, 'private');
        if (ok) {
          shared = false;
          note.textContent = 'This briefing is private again — the share link no longer works.';
          revoke.remove();
        }
      });
      bar.appendChild(revoke);
    }
  });
}

// ---- search mode (the original keyword/question search) --------------------

function wireSearch(root: HTMLElement, config: PageConfig, savedStore: SavedStore | null) {
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

  let page = 1;
  let lastQuery = '';
  let lastQuestion: string | null = null;
  let shown = 0;
  let total = 0;
  let totalApproximate = false;
  const seenKeys = new Set<string>();
  let activeTab: 'results' | 'saved' = 'results';
  let aiSort: 'cited' | 'recent' | null = null;
  let cardHooks: CardHooks = savedStore?.hooks ?? {};

  // ---- saved papers wiring (when configured) -------------------------------
  if (savedStore) {
    savedStore.onChange(() => {
      updateTabs();
      if (activeTab === 'saved' && savedView) {
        if (savedStore!.signedIn()) savedStore!.renderSavedView(savedView);
        else savedStore!.renderSignedOutView(savedView);
      }
    });
    root.addEventListener('research:show-signin', () => {
      showTab('saved');
      (tabs ?? savedView)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
    updateTabs();
  }

  function updateTabs() {
    if (!tabs || !savedStore) return;
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
      oaBox.checked = true;
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

    let data: { error?: string; count?: number; approximate?: boolean; results?: Work[] } = {};
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
      seenKeys.clear();
      topics.hidden = true;
      showTab('results');
    }
    total = data.count ?? 0;
    totalApproximate = Boolean(data.approximate);
    const fresh = data.results.filter((w) => {
      const key = workMergeKey(w);
      if (key && seenKeys.has(key)) return false;
      if (key) seenKeys.add(key);
      return true;
    });
    for (const w of fresh) list.appendChild(card(w, cardHooks));
    shown += fresh.length;

    status.replaceChildren();
    if (total === 0) {
      status.textContent = 'Nothing found. Try fewer words, or untick “free-to-read only”.';
    } else {
      const totalText = totalApproximate
        ? `about ${total.toLocaleString('en-GB')} across sources`
        : total.toLocaleString('en-GB');
      status.appendChild(
        document.createTextNode(`Showing ${shown.toLocaleString('en-GB')} of ${totalText} results. `)
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
      if (lastQuestion) {
        renderAnswer(overviewPanel, lastQuestion, data.results);
      } else {
        renderOverview(overviewPanel, q, data.results, (refined) => {
          input.value = refined;
          startSearch();
        });
      }
    }
  }

  function unlock() {
    send.disabled = false;
    more.disabled = false;
  }

  function startSearch(question: string | null = null) {
    const q = input.value.trim();
    if (!q) return;
    lastQuery = q;
    lastQuestion = question;
    page = 1;
    search(false);
  }

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
      status.textContent = 'Couldn’t interpret that — searching for it as typed.';
      unlock();
      startSearch();
      return;
    }
    input.value = t.query;
    reviewBox.checked = t.filters.review && !reviewBox.disabled;
    if (t.filters.from) {
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
    startSearch(looksLikeQuestion(raw) ? raw : null);
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
