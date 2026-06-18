// The problem-first briefing flow on /research — the primary experience.
// A practitioner states a problem; this orchestrates the pipeline entirely in
// the browser (like main.ts's translate→search→answer), so each step stays
// inside one short endpoint's time budget and reuses the existing Blobs cache
// and monthly budget guard:
//
//   plan     POST /api/research-assist {mode:'plan'}      → framing + ~3 angles
//   search   GET  /api/research?source=all&q=…            → per-angle studies
//   curate   src/lib/briefing-curate.mjs (deterministic)  → 12–15 studies
//   briefing POST /api/research-assist {mode:'briefing'}  → cited four-section briefing
//
// The search step is adaptive: it starts with one free-to-read page per angle
// and, only when that curates thin, automatically escalates — further pages,
// then beyond free-to-read — re-curating until the evidence base is healthy or
// the ladder is spent. Catalogue searches are free and edge-cached, so the
// scale grows with the difficulty of the problem at no extra AI cost.
//
// Citation safety is the same contract as the search answer: the model emits
// only [n] indices into the ONE curated list it was shown; the reference
// anchors are the real study cards, built here from the Work objects. Nothing
// from the network is ever interpolated into HTML.

import { card, el, type Work, type CardHooks } from './cards';
import { citationParagraph, CONFIDENCE_LABELS } from './citation-render';
import { curate } from '../../lib/briefing-curate.mjs';
import { ASSIST_PROMPT_VERSION, type BriefingDepth } from '../../lib/research-assist-prompts';

// Provenance recorded with a saved briefing (matches the function's model).
const BRIEFING_MODEL = 'claude-sonnet-4-6';
const REF_ID_PREFIX = 'briefing-ref-';

// The depth scale drives how hard the client searches before synthesising, in
// step with the synthesis prompt the function runs at the same level:
//  - thinThreshold: below this many curated studies, don't spend a synthesis
//    call — show what came back honestly (a quick scan tolerates a thinner base).
//  - targetStudies: a "healthy" evidence base. While the curated set is below
//    it, escalate; at or above it, stop.
//  - escalation: the ladder, applied in order while still below target — dig
//    deeper (further free-to-read pages) then widen beyond free-to-read.
//    Catalogue searches are free and edge-cached, so a deeper level costs only
//    latency. Quick scan never escalates; full review walks the whole ladder.
interface DepthSearch {
  thinThreshold: number;
  targetStudies: number;
  escalation: { page: number; oa: boolean }[];
}
const DEPTH_SEARCH: Record<BriefingDepth, DepthSearch> = {
  low: { thinThreshold: 3, targetStudies: 6, escalation: [] },
  mid: { thinThreshold: 4, targetStudies: 10, escalation: [{ page: 2, oa: true }] },
  high: {
    thinThreshold: 4,
    targetStudies: 14,
    escalation: [
      { page: 2, oa: true },
      { page: 3, oa: true },
      { page: 1, oa: false },
      { page: 2, oa: false },
    ],
  },
};

export interface BriefingAngle {
  label: string;
  query: string;
  review: boolean;
  from: number | null;
}

export interface BriefingPlan {
  framing: string;
  angles: BriefingAngle[];
}

export interface BriefingResult {
  problem: string;
  framing: string;
  briefing: string; // markdown with [n] markers
  used: number[];
  confidence: 'strong' | 'mixed' | 'thin';
  caveat: string;
  references: Work[]; // the curated, numbered studies — also the reference list
  model: string;
  promptVersion: string;
}

export type BriefingOutcome =
  | { status: 'ok'; result: BriefingResult }
  // Genuinely too little evidence to brief from — the open record is thin.
  | { status: 'thin'; problem: string; framing: string; references: Work[] }
  // A healthy evidence base was found, but the synthesis step itself failed —
  // the fault is the assistant, not the sources. Kept distinct from 'thin' so
  // the UI never blames the record for a model-side failure.
  | { status: 'failed'; problem: string; framing: string; references: Work[] }
  | { status: 'budget'; message: string }
  | { status: 'error'; message: string }
  | { status: 'stale' };

export interface PipelineHooks {
  /** Live status line (goes to the aria-live region). */
  onProgress: (text: string) => void;
  /** The plan, as soon as it's known — lets the UI show framing + angle checklist. */
  onPlan?: (plan: BriefingPlan) => void;
  /** An angle finished searching (for ticking the checklist). */
  onAngleDone?: (index: number, count: number) => void;
  /** Which catalogue to search: 'all' when configured, else 'openalex'. */
  source: string;
  /** How deep to go: quick scan, overview, or full review. */
  depth: BriefingDepth;
}

// A briefing runs while the tab is open; a second submit supersedes the first.
let briefingSeq = 0;
export function cancelBriefing() {
  briefingSeq++;
}

/** Decompose a problem into framing + ~3 search angles. Null on failure. */
export async function planProblem(problem: string): Promise<BriefingPlan | null> {
  try {
    const res = await fetch('/api/research-assist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'plan', problem }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data?.framing === 'string' && Array.isArray(data?.angles) && data.angles.length) {
      return data as BriefingPlan;
    }
    return null;
  } catch {
    return null;
  }
}

/** One angle's search. `page`/`oa` let the adaptive pass dig deeper (further
 *  pages) and wider (beyond free-to-read) when the first pass comes back thin. */
async function searchAngle(
  angle: BriefingAngle,
  source: string,
  { page = 1, oa = true }: { page?: number; oa?: boolean } = {}
): Promise<Work[]> {
  const params = new URLSearchParams({ q: angle.query });
  if (source !== 'openalex') params.set('source', source);
  if (oa) params.set('oa', '1'); // free-to-read: practitioners without library access
  if (angle.review) params.set('review', '1');
  if (angle.from) params.set('from', String(angle.from));
  if (page > 1) params.set('page', String(page));
  try {
    const res = await fetch(`/api/research?${params}`);
    const data = await res.json().catch(() => null);
    if (res.ok && Array.isArray(data?.results)) return data.results as Work[];
  } catch {}
  return [];
}

/**
 * Run the full briefing pipeline. Staleness-guarded throughout: if a newer
 * briefing started (or cancelBriefing ran), returns `{status:'stale'}` and the
 * caller drops the result.
 */
export async function runBriefingPipeline(
  problem: string,
  hooks: PipelineHooks
): Promise<BriefingOutcome> {
  const seq = ++briefingSeq;
  const stale = () => seq !== briefingSeq;

  hooks.onProgress('Framing the problem…');
  let plan = await planProblem(problem);
  if (stale()) return { status: 'stale' };
  if (!plan) {
    // Never a dead end — search the problem verbatim as a single angle.
    plan = { framing: '', angles: [{ label: 'Your problem', query: problem, review: false, from: null }] };
  }
  hooks.onPlan?.(plan);

  const perAngle: Work[][] = plan.angles.map(() => []);
  let foundAny = false;
  // First pass: each planned angle, free-to-read, first page.
  for (let i = 0; i < plan.angles.length; i++) {
    const a = plan.angles[i];
    hooks.onProgress(`Searching angle ${i + 1} of ${plan.angles.length}: ${a.label}…`);
    const results = await searchAngle(a, hooks.source, { page: 1, oa: true });
    if (stale()) return { status: 'stale' };
    perAngle[i] = results;
    if (results.length) foundAny = true;
    hooks.onAngleDone?.(i, plan.angles.length);
  }
  if (!foundAny) {
    return {
      status: 'error',
      message: 'Couldn’t reach the research catalogues, or nothing came back. Try rephrasing the problem.',
    };
  }

  hooks.onProgress('Curating the strongest studies…');
  // curate lives in untyped lib JS (like research-merge); it preserves the
  // Work shape it's given, so assert the element type back here.
  let references = curate(perAngle) as Work[];

  // Adaptive depth, scaled by the chosen level: a thin first pass triggers
  // escalation — dig deeper (further pages) then wider (beyond free-to-read),
  // re-curating after each step, until the evidence base hits the level's target
  // or its ladder is exhausted. A quick scan has no ladder and stops after one
  // pass; a full review searches hardest, pulling in more sources, at no extra
  // AI cost (catalogue searches are free and edge-cached).
  const ds = DEPTH_SEARCH[hooks.depth];
  for (let s = 0; s < ds.escalation.length && references.length < ds.targetStudies; s++) {
    const step = ds.escalation[s];
    hooks.onProgress(
      step.oa
        ? 'Thin so far — digging deeper for more studies…'
        : 'Widening the search beyond free-to-read…'
    );
    for (let i = 0; i < plan.angles.length; i++) {
      const more = await searchAngle(plan.angles[i], hooks.source, step);
      if (stale()) return { status: 'stale' };
      if (more.length) perAngle[i] = perAngle[i].concat(more);
    }
    references = curate(perAngle) as Work[];
  }

  const framing = plan.framing;

  // Don't spend a synthesis call on near-nothing — show what came back honestly.
  if (references.length < ds.thinThreshold) {
    return { status: 'thin', problem, framing, references };
  }

  hooks.onProgress('Writing the briefing…');
  const items = references.map((w) => ({
    title: w.title,
    authors: w.authors,
    year: w.year,
    venue: w.venue,
    abstract: w.tldr || w.abstract || '',
  }));

  let data: any = null;
  let budgetMessage: string | null = null;
  try {
    const res = await fetch('/api/research-assist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'briefing', problem, items, depth: hooks.depth }),
    });
    const body = await res.json().catch(() => null);
    if (res.ok && typeof body?.briefing === 'string' && body.briefing && Array.isArray(body?.used)) {
      data = body;
    } else if (res.status === 503 && typeof body?.error === 'string') {
      budgetMessage = body.error; // the monthly budget pause
    }
  } catch {}
  if (stale()) return { status: 'stale' };
  if (!data) {
    if (budgetMessage) return { status: 'budget', message: budgetMessage };
    // The evidence base was healthy (we passed THIN_THRESHOLD above) — the
    // synthesis call is what failed. Report that honestly rather than blaming
    // the record: still show the curated studies, which are worth reading.
    return { status: 'failed', problem, framing, references };
  }

  return {
    status: 'ok',
    result: {
      problem,
      framing,
      briefing: data.briefing,
      used: (Array.isArray(data.used) ? data.used : []).filter(
        (n: any) => Number.isInteger(n) && n >= 1 && n <= references.length
      ),
      confidence: ['strong', 'mixed', 'thin'].includes(data.confidence) ? data.confidence : 'mixed',
      caveat: typeof data.caveat === 'string' ? data.caveat : '',
      references,
      model: BRIEFING_MODEL,
      promptVersion: ASSIST_PROMPT_VERSION,
    },
  };
}

// ---- rendering -------------------------------------------------------------

function stripInline(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1');
}

function parseSections(md: string): { heading: string | null; body: string }[] {
  const out: { heading: string | null; body: string[] }[] = [];
  let cur: { heading: string | null; body: string[] } = { heading: null, body: [] };
  for (const line of String(md ?? '').split('\n')) {
    const m = line.match(/^#{2,3}\s+(.*)$/);
    if (m) {
      if (cur.heading !== null || cur.body.join('').trim()) out.push(cur);
      cur = { heading: m[1].trim(), body: [] };
    } else {
      cur.body.push(line);
    }
  }
  out.push(cur);
  return out
    .map((s) => ({ heading: s.heading, body: s.body.join('\n') }))
    .filter((s) => s.heading || s.body.trim());
}

/** Render a section's body as paragraphs and (where present) bullet lists,
 *  with [n] markers linked to the matching study card. */
function renderSectionBody(body: string, valid: Set<number>): Node[] {
  const nodes: Node[] = [];
  for (const block of body.split(/\n{2,}/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const isList = lines.length > 1 && lines.every((l) => /^([-*]|\d+\.)\s+/.test(l));
    if (isList) {
      const ul = el('ul', 'list-disc pl-5 space-y-1.5 mt-3');
      for (const l of lines) {
        const li = el('li', 'font-serif text-sm text-ink-800 leading-relaxed');
        const p = citationParagraph(stripInline(l.replace(/^([-*]|\d+\.)\s+/, '')), valid, {
          idPrefix: REF_ID_PREFIX,
          paragraphClass: '',
        });
        while (p.firstChild) li.appendChild(p.firstChild);
        ul.appendChild(li);
      }
      nodes.push(ul);
    } else {
      nodes.push(citationParagraph(stripInline(block.replace(/\n/g, ' ')), valid, { idPrefix: REF_ID_PREFIX }));
    }
  }
  return nodes;
}

/** The curated studies, numbered to match the citation markers — each card is
 *  the anchor a [n] link scrolls to, and (with hooks) is starrable. */
function evidenceBase(references: Work[], hooks: CardHooks): HTMLElement {
  const wrap = el('div', 'mt-10 border-t border-ink-200 pt-6');
  wrap.appendChild(
    el('h3', 'font-sans text-xs uppercase tracking-[0.2em] text-ink-500 mb-1', `The evidence base — ${references.length} studies`)
  );
  wrap.appendChild(
    el('p', 'font-serif text-sm text-ink-600 mb-2', 'The studies the briefing draws on, numbered as cited. Weigh the study, not the summary.')
  );
  references.forEach((w, i) => {
    const n = i + 1;
    const row = el('div', 'flex gap-3 scroll-mt-24');
    row.id = `${REF_ID_PREFIX}${n}`;
    row.appendChild(
      el('span', 'font-sans text-sm font-medium text-ink-500 pt-6 shrink-0 w-7 text-right', `[${n}]`)
    );
    const c = card(w, hooks);
    c.classList.add('flex-1', 'min-w-0');
    row.appendChild(c);
    wrap.appendChild(row);
  });
  return wrap;
}

export interface RenderBriefingOptions {
  /** Card hooks (star/save) — omit for the read-only shared view. */
  hooks?: CardHooks;
  /** Read-only banner for the shared view. */
  readOnly?: boolean;
}

/**
 * Render a complete briefing into `container`. Works for both the live result
 * and the read-only shared view — the latter passes no hooks and `readOnly`.
 * The `used` list is re-validated against the reference count here, so a
 * tampered shared row can never link past the studies actually stored.
 */
export function renderBriefing(
  container: HTMLElement,
  result: BriefingResult,
  opts: RenderBriefingOptions = {}
): void {
  container.replaceChildren();
  const valid = new Set(
    (result.used ?? []).filter((n) => Number.isInteger(n) && n >= 1 && n <= result.references.length)
  );

  const article = el('div', 'max-w-3xl');

  if (opts.readOnly) {
    article.appendChild(
      el('p', 'font-sans text-xs text-ink-600 bg-paper-200 rounded px-3 py-2 mb-5', 'Shared evidence briefing — read-only. Sources are curated from the open research record; read the studies before relying on this.')
    );
  }

  article.appendChild(el('p', 'font-sans text-xs uppercase tracking-[0.2em] text-accent mb-3', 'Evidence briefing'));
  article.appendChild(
    el('h2', 'font-display text-2xl md:text-3xl font-semibold text-ink-900 leading-tight', result.problem)
  );

  article.appendChild(
    el('span', 'inline-block mt-3 font-sans text-[0.65rem] uppercase tracking-[0.12em] text-ink-500 border border-ink-200 rounded px-1.5 py-0.5', CONFIDENCE_LABELS[result.confidence] ?? CONFIDENCE_LABELS.mixed)
  );

  const body = el('div', 'mt-6');
  for (const sec of parseSections(result.briefing)) {
    if (sec.heading) {
      body.appendChild(el('h3', 'font-display text-lg font-semibold text-ink-900 mt-7 mb-1', sec.heading));
    }
    for (const node of renderSectionBody(sec.body, valid)) body.appendChild(node);
  }
  article.appendChild(body);

  if (result.caveat) {
    article.appendChild(el('p', 'font-serif text-xs italic text-ink-600 mt-5', result.caveat));
  }

  article.appendChild(evidenceBase(result.references, opts.hooks ?? {}));
  container.appendChild(article);
}
