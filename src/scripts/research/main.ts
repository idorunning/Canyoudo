// The /research page controller. Markup lives in src/pages/research.astro.
//
// The page has three regions, gated client-side after the Supabase session
// resolves: a logged-out marketing LANDING, the signed-in TOOL, and a
// read-only SHARED review view (opened via /research?b=<token>). The tool has
// three modes, and each mode's machinery matches its job:
//
//   SEARCH          no AI at all — the coded catalogue search, instant and
//                   free, with filters, topics and saved papers.
//   OVERVIEW        one quick mid-tier model call on top of a search: what the
//                   results add up to, which to read first, what to search next.
//   RESEARCH REVIEW the deep end — plan → multi-angle search → curate →
//                   a full research-assistant report STREAMED from Sonnet 5
//                   (review.ts), rendered live as it's written, downloadable
//                   as a branded PDF.
//
// All network data renders via createElement/textContent.

import { SOURCE_CAPS } from '../../lib/research-sources.mjs';
import { workMergeKey } from '../../lib/research-merge.mjs';
import { card, el, type Work, type CardHooks } from './cards';
import { readStateFromUrl, writeStateToUrl, type SearchState } from './state';
import {
  translateQuestion,
  renderOverview,
  clearOverview,
  OVERVIEW_RESULT_ID_PREFIX,
} from './assist';
import { spinner, setSpinnerLabel } from './spinner';
import {
  runReviewPipeline,
  renderReview,
  renderDraft,
  cancelReview,
  type ReviewOutcome,
} from './review';
import type { SavedStore } from './saved';
import type { BriefingsStore } from './briefings-store';
import {
  recordHistory,
  listHistory,
  deleteHistoryEntry,
  clearHistory,
  type HistoryEntry,
} from './history-store';

interface PageConfig {
  hasAi: boolean;
  hasAuth: boolean;
  sources: string[];
}

type Mode = 'search' | 'overview' | 'review';

// What each mode is for — shown under the mode switcher so the reader picks by
// function, not by guesswork.
const MODE_DESCRIPTIONS: Record<Mode, string> = {
  search:
    'Straight keyword search across the open research catalogues and UK official sources — no AI, instant, with filters and saved papers.',
  overview:
    'Ask in plain English. The assistant searches the catalogues, summarises what came back, and suggests which studies to open first. Seconds, not minutes.',
  review:
    'The deep end. The assistant researches your question from several angles, curates the strongest studies, and writes a full research review — cited throughout, with legal pointers and next steps — which you can download as a PDF. Takes a few minutes.',
};

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

  // ---- shared review route (/research?b=token), ahead of the gate ----------
  const shareToken = new URLSearchParams(location.search).get('b');
  if (shareToken && config.hasAuth && shared) {
    document.documentElement.removeAttribute('data-maybe-authed');
    if (landing) landing.hidden = true;
    if (tool) tool.hidden = true;
    if (skeleton) skeleton.hidden = true;
    await showSharedReview(shared, shareToken);
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

  // Wire all modes up-front; they live in the (possibly hidden) tool region.
  const setMode = wireModes(root, config);
  wireSearch(root, config, savedStore, setMode);
  if (config.hasAi) {
    wireOverview(root, savedStore);
    wireReview(root, config, savedStore, briefingsStore);
  }

  // ---- deep links from the crime dashboard ----------------------------------
  // /research?mode=review&problem=… lands with the review pre-filled — the
  // "what does the evidence say?" handoff from the dashboard's charts and
  // briefings. A link, not an auto-run: the reader presses the button.
  const deepLink = new URLSearchParams(location.search);
  const wantedMode = deepLink.get('mode');
  if (wantedMode === 'search' || wantedMode === 'overview' || wantedMode === 'review') {
    setMode(wantedMode);
  }
  const linkedProblem = (deepLink.get('problem') || '').trim().slice(0, 600);
  if (linkedProblem) {
    const reviewInput = root.querySelector<HTMLTextAreaElement>('[data-review-input]');
    if (reviewInput && !reviewInput.value) reviewInput.value = linkedProblem;
    if (!wantedMode) setMode('review');
  }

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
  // AI modes still work, just without save/share.
}

// ---- mode switcher ----------------------------------------------------------

function wireModes(root: HTMLElement, config: PageConfig): (mode: Mode) => void {
  const nav = root.querySelector<HTMLElement>('[data-research-mode]');
  const desc = root.querySelector<HTMLElement>('[data-mode-desc]');
  const panes: Record<Mode, HTMLElement | null> = {
    search: root.querySelector<HTMLElement>('[data-search-mode]'),
    overview: root.querySelector<HTMLElement>('[data-overview-mode]'),
    review: root.querySelector<HTMLElement>('[data-review-mode]'),
  };

  function setMode(mode: Mode) {
    (Object.keys(panes) as Mode[]).forEach((m) => {
      if (panes[m]) panes[m]!.hidden = m !== mode;
    });
    if (desc) desc.textContent = MODE_DESCRIPTIONS[mode];
    nav?.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) => {
      const active = b.dataset.mode === mode;
      b.classList.toggle('bg-ink-900', active);
      b.classList.toggle('text-paper-50', active);
      b.classList.toggle('border-transparent', active);
      b.classList.toggle('border-ink-300', !active);
      b.classList.toggle('text-ink-700', !active);
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  if (config.hasAi) {
    nav?.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => setMode(b.dataset.mode as Mode))
    );
    setMode('review'); // the flagship; normalises button styling on load
  }
  return setMode;
}

// ---- shared read-only review ------------------------------------------------

async function showSharedReview(container: HTMLElement, token: string) {
  container.hidden = false;
  container.replaceChildren();
  container.appendChild(el('p', 'font-sans text-sm text-ink-600 py-8', 'Loading shared review…'));

  const notShared = () => {
    container.replaceChildren();
    const box = el('div', 'py-10 max-w-xl');
    box.appendChild(el('h2', 'font-display text-2xl font-semibold text-ink-900', 'This review isn’t available'));
    box.appendChild(
      el('p', 'font-serif text-ink-700 leading-relaxed mt-3', 'The link may be wrong, or the review has been made private. Ask whoever shared it for an up-to-date link.')
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
    const review = await loadSharedBriefing(supabase, token);
    if (!review) return notShared();

    renderReview(container, review, { readOnly: true });

    // A quiet "make your own" footer — the share link is also a funnel.
    const cta = el('div', 'mt-10 border-t border-ink-200 pt-6');
    const a = el('a', 'inline-block font-sans text-sm uppercase tracking-[0.12em] bg-accent text-paper-50 px-5 py-2.5 rounded-2 hover:bg-accent-dark transition-colors', 'Build your own research review →') as HTMLAnchorElement;
    a.href = '/research';
    cta.appendChild(a);
    container.appendChild(cta);
  } catch {
    notShared();
  }
}

// ---- research review mode ----------------------------------------------------

function wireReview(
  root: HTMLElement,
  config: PageConfig,
  savedStore: SavedStore | null,
  briefingsStore: BriefingsStore | null
) {
  const form = root.querySelector<HTMLFormElement>('[data-review-form]');
  const input = root.querySelector<HTMLTextAreaElement>('[data-review-input]');
  const send = root.querySelector<HTMLButtonElement>('[data-review-send]');
  const progress = root.querySelector<HTMLElement>('[data-review-progress]');
  const result = root.querySelector<HTMLElement>('[data-review-result]');
  if (!form || !input || !send || !progress || !result) return;

  const cardHooks: CardHooks = savedStore?.hooks ?? {};
  const reviewSource = config.sources.includes('all') ? 'all' : 'openalex';

  // ---- progress: spinner + framing + angle checklist ----
  // Progress is a single spinner + a short label, nothing else — no framing
  // paragraph, no angle checklist, no reassurance copy. The streaming report
  // below is the real "it's working" signal.
  function startProgress() {
    progress!.replaceChildren();
    progress!.hidden = false;
    const row = el('div', '');
    row.dataset.role = 'status';
    row.appendChild(spinner('Planning the search…'));
    progress!.appendChild(row);
  }
  function setProgressText(text: string) {
    // Update the label in place: the ring keeps spinning smoothly and the
    // aria-live region announces only the changed text, not a rebuilt widget.
    const spin = progress!.querySelector<HTMLElement>('[data-role="status"] [role="status"]');
    if (spin) setSpinnerLabel(spin, text);
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

  // ---- 30-day recent-briefings history (per-device, localStorage) ----------
  const historyWrap = root.querySelector<HTMLElement>('[data-review-history-wrap]');
  const historyList = root.querySelector<HTMLElement>('[data-review-history]');

  function agoLabel(iso: string): string {
    const then = Date.parse(iso);
    if (!Number.isFinite(then)) return '';
    const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
    const days = Math.round(hrs / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  // Reopen a stored briefing: re-render it in place from its ReviewResult (no
  // network — the object carries its own studies). Signed-in readers get a
  // one-tap "Save to your account" to promote it to the permanent store.
  function openFromHistory(entry: HistoryEntry) {
    cancelReview(); // a history view supersedes any in-flight run
    progress!.hidden = true;
    renderReview(result!, entry.result, { hooks: cardHooks });
    if (savedStore?.signedIn() && briefingsStore) {
      const bar = el('div', 'mt-8 border-t border-ink-200 pt-5');
      const btn = el(
        'button',
        'font-sans text-sm uppercase tracking-[0.12em] border border-ink-300 text-ink-700 px-5 py-2.5 rounded-2 hover:text-ink-900 hover:border-ink-500 transition-colors disabled:opacity-50',
        'Save to your account'
      ) as HTMLButtonElement;
      btn.type = 'button';
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Saving…';
        const saved = await briefingsStore!.saveBriefing(entry.result);
        btn.textContent = saved.ok
          ? '✓ Saved to your account'
          : saved.reason === 'limit'
            ? 'Save limit reached'
            : 'Couldn’t save — try again';
        if (!saved.ok && saved.reason !== 'limit') btn.disabled = false;
      });
      bar.appendChild(btn);
      bar.appendChild(
        el('p', 'font-sans text-xs text-ink-500 mt-2', 'Recent briefings are kept on this device for 30 days. Saving keeps this one for good on your account.')
      );
      result!.querySelector('.max-w-3xl')?.appendChild(bar);
    }
    result!.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderHistory() {
    if (!historyWrap || !historyList) return;
    const entries = listHistory();
    if (!entries.length) {
      historyWrap.hidden = true;
      historyList.replaceChildren();
      return;
    }
    historyWrap.hidden = false;
    historyList.replaceChildren();
    const ul = el('ul', 'space-y-2');
    for (const entry of entries) {
      const li = el('li', 'flex items-start gap-3');
      const open = el(
        'button',
        'flex-1 text-left group',
        ''
      ) as HTMLButtonElement;
      open.type = 'button';
      open.appendChild(
        el('span', 'block font-serif text-sm text-ink-800 group-hover:text-accent leading-snug', entry.result.problem || 'Untitled review')
      );
      const meta = `${agoLabel(entry.savedAt)} · ${entry.result.confidence} confidence · ${entry.result.references.length} studies`;
      open.appendChild(el('span', 'block font-sans text-xs text-ink-500 mt-0.5', meta));
      open.addEventListener('click', () => openFromHistory(entry));
      const del = el(
        'button',
        'shrink-0 font-sans text-xs text-ink-400 hover:text-ink-700 px-1',
        '✕'
      ) as HTMLButtonElement;
      del.type = 'button';
      del.title = 'Remove from history';
      del.setAttribute('aria-label', 'Remove from history');
      del.addEventListener('click', () => {
        deleteHistoryEntry(entry.id);
        renderHistory();
      });
      li.appendChild(open);
      li.appendChild(del);
      ul.appendChild(li);
    }
    historyList.appendChild(ul);
    const clear = el(
      'button',
      'mt-4 font-sans text-xs uppercase tracking-[0.12em] text-ink-400 hover:text-ink-700',
      `Clear history (${entries.length})`
    ) as HTMLButtonElement;
    clear.type = 'button';
    clear.addEventListener('click', () => {
      clearHistory();
      renderHistory();
    });
    historyList.appendChild(clear);
  }

  async function handleOutcome(outcome: ReviewOutcome) {
    if (outcome.status === 'stale') return;
    if (outcome.status === 'budget' || outcome.status === 'error') {
      result!.replaceChildren();
      showMessage(outcome.message);
      return;
    }
    if (outcome.status === 'thin') {
      progress!.hidden = true;
      renderStudyList(
        outcome.framing,
        outcome.references,
        outcome.references.length
          ? 'The open record is thin on this one — not enough to review with any confidence, but here’s what came back. Read the studies and try a sharper question.'
          : 'Nothing usable came back. Try rephrasing the question, or broaden it.'
      );
      return;
    }
    if (outcome.status === 'failed') {
      // A healthy evidence base came back, but writing the review failed —
      // an assistant-side problem, not a thin record. Prefer the specific
      // server reason (e.g. model access) when there is one; otherwise say so
      // plainly. Either way, show the studies it would have drawn on.
      progress!.hidden = true;
      renderStudyList(
        outcome.framing,
        outcome.references,
        outcome.message ??
          'The studies came back fine — but the review couldn’t be written this time. That’s on the assistant, not the evidence. Here’s the evidence base it found; try again in a moment.'
      );
      return;
    }
    // status === 'ok'
    progress!.hidden = true;
    renderReview(result!, outcome.result, { hooks: cardHooks });
    // Auto-history: record every finished review on this device (signed in or
    // not), then refresh the recent-briefings list so it appears immediately.
    recordHistory(outcome.result);
    renderHistory();
    // Save + share (only when signed in and storage is configured) — the
    // deliberate, permanent store beyond the 30-day device history.
    if (savedStore?.signedIn() && briefingsStore) {
      const bar = el('div', 'mt-8 border-t border-ink-200 pt-5');
      result!.querySelector('.max-w-3xl')?.appendChild(bar);
      await renderSaveBar(bar, outcome, briefingsStore);
    }
  }

  // Populate the recent-briefings panel on load (survives reloads; per device).
  renderHistory();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const problem = input.value.trim();
    if (problem.split(/\s+/).filter(Boolean).length < 3) {
      showMessage('Describe the problem in a sentence or two — a few words isn’t enough to research.');
      return;
    }
    cancelReview(); // supersede any in-flight run
    send.disabled = true;
    result.replaceChildren();
    startProgress();
    let outcome: ReviewOutcome;
    try {
      outcome = await runReviewPipeline(problem, {
        source: reviewSource,
        onProgress: setProgressText,
        // The report streams onto the page as it's written — the real "it's
        // working" signal, so the label above just stays "…writing the
        // research briefing" until it's done.
        onDraft: (markdown, references) => renderDraft(result, markdown, references),
      });
    } catch {
      outcome = { status: 'error', message: 'Something went wrong building the review. Try again.' };
    }
    // A stale outcome belongs to a superseded run — the newer run owns the
    // button now, so don't re-enable it from under that run's feet.
    if (outcome.status !== 'stale') send.disabled = false;
    await handleOutcome(outcome);
  });
}

/** The save state + share-link control beneath a finished review. */
async function renderSaveBar(
  bar: HTMLElement,
  outcome: Extract<ReviewOutcome, { status: 'ok' }>,
  briefingsStore: BriefingsStore
) {
  bar.replaceChildren();
  bar.appendChild(el('p', 'font-sans text-sm text-ink-600', 'Saving to your account…'));
  const saved = await briefingsStore.saveBriefing(outcome.result);
  bar.replaceChildren();
  if (!saved.ok) {
    bar.appendChild(
      el(
        'p',
        'font-sans text-sm text-ink-600',
        saved.reason === 'limit'
          ? 'Couldn’t save — you’ve reached the saved-review limit. Delete some older ones to make room. This review is still on screen, and you can download it as a PDF.'
          : 'Couldn’t save this review — saving isn’t available right now (if this keeps happening, the site’s saved-reviews storage may need setting up). It’s still on screen, and you can download it as a PDF.'
      )
    );
    return;
  }

  const row = el('div', 'flex flex-wrap items-center gap-3');
  row.appendChild(el('span', 'font-sans text-sm text-ink-700', '✓ Saved to your account.'));
  const shareBtn = el('button', 'font-sans text-xs uppercase tracking-[0.12em] border border-ink-300 text-ink-700 px-4 py-2 rounded-2 hover:border-ink-500', 'Copy share link') as HTMLButtonElement;
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
      note.textContent = `Link copied — anyone with it can view this review (read-only): ${url}`;
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
          note.textContent = 'This review is private again — the share link no longer works.';
          revoke.remove();
        }
      });
      bar.appendChild(revoke);
    }
  });
}

// ---- overview mode -----------------------------------------------------------

function wireOverview(root: HTMLElement, savedStore: SavedStore | null) {
  const form = root.querySelector<HTMLFormElement>('[data-overview-form]');
  const input = root.querySelector<HTMLInputElement>('[data-overview-input]');
  const send = root.querySelector<HTMLButtonElement>('[data-overview-send]');
  const status = root.querySelector<HTMLElement>('[data-overview-status]');
  const note = root.querySelector<HTMLElement>('[data-overview-note]');
  const panel = root.querySelector<HTMLElement>('[data-overview-panel]');
  const list = root.querySelector<HTMLElement>('[data-overview-results]');
  if (!form || !input || !send || !status || !panel || !list) return;

  const cardHooks: CardHooks = savedStore?.hooks ?? {};
  let seq = 0;

  function setStatus(label: string | null) {
    status!.replaceChildren();
    if (label) status!.appendChild(spinner(label));
  }

  /** Numbered result cards — the anchors the "read these first" picks link to. */
  function renderNumberedResults(works: Work[]) {
    list!.replaceChildren();
    works.forEach((w, i) => {
      const n = i + 1;
      const row = el('div', 'flex gap-3 scroll-mt-24');
      row.id = `${OVERVIEW_RESULT_ID_PREFIX}${n}`;
      row.appendChild(
        el('span', 'font-sans text-sm font-medium text-ink-500 pt-6 shrink-0 w-7 text-right', `[${n}]`)
      );
      const c = card(w, cardHooks);
      c.classList.add('flex-1', 'min-w-0');
      row.appendChild(c);
      list!.appendChild(row);
    });
  }

  async function runOverview(raw: string) {
    const mySeq = ++seq;
    const stale = () => mySeq !== seq;
    send!.disabled = true;
    if (note) note.hidden = true;
    clearOverview(panel!);
    list!.replaceChildren();

    // 1. Read the question into the literature's vocabulary (when it looks
    //    like a question — plain keywords search as typed).
    let query = raw;
    let filters: { review: boolean; from: number | null } = { review: false, from: null };
    if (/\?|^(what|how|why|does|do|is|are|can|could|should|would|which|who|when|where|will)\b/i.test(raw) || raw.split(/\s+/).length >= 6) {
      setStatus('Reading the question…');
      const t = await translateQuestion(raw);
      if (stale()) return;
      if (t) {
        query = t.query;
        filters = { review: t.filters.review, from: t.filters.from };
        if (note) {
          note.replaceChildren(el('span', '', `Interpreted as: “${t.query}”${t.note ? ` — ${t.note}` : ''}`));
          note.hidden = false;
        }
      }
    }

    // 2. One merged search — free-to-read leads, and the translator's
    //    filters (reviews-only, recency) actually shape it.
    setStatus('Searching the research catalogues…');
    let works: Work[] = [];
    let searchFailed = false;
    try {
      const params = new URLSearchParams({ q: query, source: 'all', oa: '1' });
      if (filters.review) params.set('review', '1');
      if (filters.from) params.set('from', String(filters.from));
      const res = await fetch(`/api/research?${params}`);
      const data = await res.json().catch(() => null);
      if (res.ok && Array.isArray(data?.results)) works = data.results as Work[];
      else searchFailed = true;
    } catch {
      searchFailed = true;
    }
    if (stale()) return;
    if (works.length === 0) {
      setStatus(null);
      status!.appendChild(
        el(
          'p',
          'font-sans text-sm text-ink-600',
          searchFailed
            ? 'Couldn’t reach the research catalogues just now — try again in a moment.'
            : 'Nothing found. Try different words, or switch to Search for filters.'
        )
      );
      send!.disabled = false;
      return;
    }

    works = works.slice(0, 10);
    renderNumberedResults(works);

    // 3. The assistant reads what came back and suggests a reading order.
    setStatus('Reading the results and writing an overview…');
    await renderOverview(panel!, query, works, (refined) => {
      input!.value = refined;
      submitOverview(refined);
    });
    if (stale()) return;
    setStatus(null);
    send!.disabled = false;
  }

  // One entry point for submit + refinement chips: whatever happens inside
  // the run, a failure can never leave the button wedged disabled.
  function submitOverview(raw: string) {
    runOverview(raw).catch(() => {
      setStatus(null);
      status!.appendChild(
        el('p', 'font-sans text-sm text-ink-600', 'Something went wrong building the overview. Try again.')
      );
      send!.disabled = false;
    });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = input.value.trim();
    if (!raw) return;
    submitOverview(raw);
  });
}

// ---- search mode (the coded catalogue search — no AI) -------------------------

function wireSearch(
  root: HTMLElement,
  config: PageConfig,
  savedStore: SavedStore | null,
  setMode: (mode: Mode) => void
) {
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const form = $<HTMLFormElement>('[data-research-form]');
  const input = $<HTMLInputElement>('[data-research-input]');
  const send = $<HTMLButtonElement>('[data-research-send]');
  const status = $('[data-research-status]');
  const list = $('[data-research-results]');
  const more = $<HTMLButtonElement>('[data-research-more]');
  const topics = $('[data-research-topics]');
  const oaBox = $<HTMLInputElement>('[data-filter-oa]');
  const reviewBox = $<HTMLInputElement>('[data-filter-review]');
  const fromSel = $<HTMLSelectElement>('[data-filter-from]');
  const sortSel = $<HTMLSelectElement>('[data-filter-sort]');
  const tabs = root.querySelector<HTMLElement>('[data-research-tabs]');
  const savedView = root.querySelector<HTMLElement>('[data-research-saved]');

  let page = 1;
  let lastQuery = '';
  let shown = 0;
  let total = 0;
  let totalApproximate = false;
  const seenKeys = new Set<string>();
  let activeTab: 'results' | 'saved' = 'results';
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
      setMode('search');
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
    status.replaceChildren(spinner(append ? 'Loading more…' : 'Searching…'));

    const s = currentState();
    const params = new URLSearchParams({ q, page: String(page) });
    if (s.source !== 'openalex') params.set('source', s.source);
    if (s.oa) params.set('oa', '1');
    if (s.review) params.set('review', '1');
    if (s.from) params.set('from', s.from);
    if (s.sort !== 'relevance') params.set('sort', s.sort);

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

  // ---- wiring ---------------------------------------------------------------
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    startSearch();
  });

  [oaBox, reviewBox, fromSel, sortSel].forEach((c) =>
    c.addEventListener('change', () => {
      if (!lastQuery) return;
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
  // Only restore a sort the select still offers — an old shared URL may carry
  // the retired 'suggested' value, which would blank the select.
  if (
    initial.sort &&
    !sortSel.disabled &&
    [...sortSel.options].some((o) => o.value === initial.sort)
  ) {
    sortSel.value = initial.sort;
  }
  if (initial.q) {
    // A shared search link lands straight in Search mode with the results up.
    setMode('search');
    input.value = initial.q;
    startSearch();
  }
}
