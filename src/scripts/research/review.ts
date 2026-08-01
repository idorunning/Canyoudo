// The research-review pipeline on /research — the deep end of the tool.
// A practitioner states a question; this orchestrates the pipeline entirely in
// the browser, so each short step stays inside a synchronous endpoint's time
// budget and the one long step — the report itself — STREAMS:
//
//   plan     POST /api/research-assist {mode:'plan'}   → framing + ~3 angles
//   search   GET  /api/research?source=all&q=…         → per-angle studies
//            plus one page of source=preprints per angle — current, not yet
//            peer-reviewed work, tagged and capped so it never dominates
//   curate   src/lib/briefing-curate.mjs (deterministic) → a candidate pool,
//            sized by how much research the question surfaced (poolTargetFor)
//   review   POST /api/research-review                 → STREAMED markdown briefing
//            — the model selects the studies that belong from the pool
//                                                        (Sonnet 5, thinking hard)
//
// The old implementation asked a synchronous JSON function for the finished
// report in one go; at full-review depth the function was killed long before
// Sonnet finished writing, and the reader saw an error. Streaming is the fix:
// the first byte arrives immediately, the report takes the time it needs, and
// the reader watches it being written (which doubles as the loading state).
//
// The search step is adaptive: it starts with one free-to-read page per angle
// and, when that curates thin, escalates — further pages, then beyond
// free-to-read — re-curating until the evidence base is healthy or the ladder
// is spent. Catalogue searches are free and edge-cached.
//
// Citation safety is the established contract: the model emits only [n]
// indices into the ONE curated list it was shown; out-of-range markers are
// stripped here (citations.mjs) and the reference anchors are the real study
// cards, built from the Work objects. Nothing from the network is ever
// interpolated into HTML.

import { card, el, safeHttpUrl, type Work, type CardHooks } from './cards';
import { citationParagraph, CONFIDENCE_LABELS } from './citation-render';
import { curate, PREPRINT_CAP } from '../../lib/briefing-curate.mjs';
import { sanitizeCitations } from '../../lib/citations.mjs';
import {
  ASSIST_PROMPT_VERSION,
  REVIEW_OPENAI_MODEL,
  REVIEW_CONFIDENCE_PREFIX,
  REVIEW_POOL_MAX,
  STRENGTH_COLUMN,
  EFFECTIVENESS_EXPLANATIONS,
  PREPRINT_EXPLANATION,
} from '../../lib/research-assist-prompts';

const REF_ID_PREFIX = 'briefing-ref-';

// The standing caveat under every review — fixed here rather than model-
// written, so it can never soften.
const REVIEW_CAVEAT =
  'Synthesised from the abstracts of a curated set, not the full texts or a systematic review — and the legal and policy pointers need verifying against current official sources. Read the studies before relying on this.';

// The marker ai-stream.ts appends when a stream dies mid-report.
const INTERRUPT_MARKER = '_Interrupted — please try again._';

// How hard the review searches before synthesising:
//  - thinThreshold: below this many curated studies, don't stream a report —
//    show what came back honestly instead.
//  - poolTarget: how wide a CANDIDATE POOL to hand the model — sized by how
//    much relevant research the question actually surfaced (the catalogue
//    totals, summed across angles; see poolTargetFor). The model then SELECTS
//    the studies that belong in the briefing table (at most REVIEW_TABLE_MAX,
//    server-side prompt) and drops the rest, so the pool is what it chooses
//    FROM, not the report's length. A broad literature earns a bigger pool; a
//    niche one stays tight. While the curated pool is below target, escalate;
//    at or above it, stop. The briefing itself still prints to ~2 pages
//    (docs/research-assistant-v4.md) and the table is the only reference list.
//  - ESCALATION: the ladder, applied in order while still below target — dig
//    deeper (further free-to-read pages) then widen beyond free-to-read.
//    Catalogue searches are free and edge-cached, so a deeper rung costs only
//    latency. The review always walks the whole ladder if it has to: this is
//    the deep mode, and the report is only as good as its evidence base.
const THIN_THRESHOLD = 4;
const POOL_MIN = 12;
const POOL_MAX = REVIEW_POOL_MAX; // keep in step with the server's slice guard
const ESCALATION: { page: number; oa: boolean }[] = [
  { page: 2, oa: true },
  { page: 3, oa: true },
  { page: 1, oa: false },
  { page: 2, oa: false },
];

// Map how much relevant research a question surfaced (the catalogue totals,
// summed across its angles) to how wide a candidate pool to curate. Bands, not
// a curve, so it stays easy to read and tune later. The pool is what the model
// chooses FROM; the briefing table it writes stays a short, selected handful.
function poolTargetFor(available: number): number {
  if (available >= 800) return POOL_MAX; // a large literature — widest net
  if (available >= 200) return 18;
  if (available >= 60) return 15;
  return POOL_MIN; // niche or thin — keep it tight
}

export interface ReviewAngle {
  label: string;
  query: string;
  review: boolean;
  from: number | null;
}

export interface ReviewPlan {
  framing: string;
  angles: ReviewAngle[];
}

/** A finished review — also the shape stored/shared via briefings-store. */
export interface ReviewResult {
  problem: string;
  framing: string;
  briefing: string; // markdown with [n] markers
  used: number[];
  confidence: 'strong' | 'mixed' | 'thin';
  caveat: string;
  references: Work[]; // the curated, numbered studies — also the reference list
  model: string;
  promptVersion: string;
  /** Retracted studies the search surfaced and the pipeline kept out of the
   *  pool — shown as a transparency note. Absent/0 means none were found. */
  retractedExcluded?: number;
}

export type ReviewOutcome =
  | { status: 'ok'; result: ReviewResult }
  // Genuinely too little evidence to review — the open record is thin.
  | { status: 'thin'; problem: string; framing: string; references: Work[] }
  // A healthy evidence base was found, but writing the report failed — the
  // fault is the assistant, not the sources. Kept distinct from 'thin' so the
  // UI never blames the record for a model-side failure. `message` carries a
  // specific server reason (e.g. model access) when one was given.
  | { status: 'failed'; problem: string; framing: string; references: Work[]; message?: string }
  | { status: 'budget'; message: string }
  | { status: 'error'; message: string }
  | { status: 'stale' };

export interface PipelineHooks {
  /** Live status line (drives the spinner label + aria-live region). */
  onProgress: (text: string) => void;
  /** The plan, as soon as it's known — lets the UI show framing + angle checklist. */
  onPlan?: (plan: ReviewPlan) => void;
  /** An angle finished searching (for ticking the checklist). */
  onAngleDone?: (index: number, count: number) => void;
  /** The report so far, as it streams in — already safe to render as a draft. */
  onDraft?: (markdown: string, references: Work[]) => void;
  /** Which catalogue to search: 'all' when configured, else 'openalex'. */
  source: string;
}

// A review runs while the tab is open; a second submit supersedes the first.
let reviewSeq = 0;
export function cancelReview() {
  reviewSeq++;
}

/** Decompose a problem into framing + ~3 search angles. Null on failure;
 *  a budget pause (503) is surfaced so the pipeline can stop immediately
 *  rather than searching for minutes and failing at the synthesis step. */
export async function planProblem(
  problem: string
): Promise<ReviewPlan | { budget: string } | null> {
  try {
    const res = await fetch('/api/research-assist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'plan', problem }),
    });
    const data = await res.json().catch(() => null);
    if (res.status === 503 && typeof data?.error === 'string') return { budget: data.error };
    if (!res.ok) return null;
    if (typeof data?.framing === 'string' && Array.isArray(data?.angles) && data.angles.length) {
      return data as ReviewPlan;
    }
    return null;
  } catch {
    return null;
  }
}

/** One angle's search. `page`/`oa` let the adaptive pass dig deeper (further
 *  pages) and wider (beyond free-to-read) when the first pass comes back thin.
 *  Returns the page of results AND the catalogue's grand total for the query
 *  (`count`) — the "how much research exists" signal that sizes the candidate
 *  pool. `count` is approximate for the "all" fan-out (a max across sources). */
async function searchAngle(
  angle: ReviewAngle,
  source: string,
  { page = 1, oa = true }: { page?: number; oa?: boolean } = {}
): Promise<{ results: Work[]; count: number; retracted: number }> {
  const params = new URLSearchParams({ q: angle.query });
  if (source !== 'openalex') params.set('source', source);
  if (oa) params.set('oa', '1'); // free-to-read: practitioners without library access
  if (angle.review) params.set('review', '1');
  if (angle.from) params.set('from', String(angle.from));
  if (page > 1) params.set('page', String(page));
  try {
    const res = await fetch(`/api/research?${params}`);
    const data = await res.json().catch(() => null);
    if (res.ok && Array.isArray(data?.results)) {
      const count = Number.isFinite(data?.count) ? Number(data.count) : data.results.length;
      // Retracted studies never enter a briefing pool — a withdrawn finding
      // must not inform a report, and dropping it here (before curation) means
      // it can't even displace a sound study from a pool slot. The plain
      // search view still shows retracted papers, badged; only the AI briefing
      // excludes them, because the briefing speaks with one synthesised voice.
      const all = data.results as Work[];
      const results = all.filter((w) => !w.retracted);
      return { results, count, retracted: all.length - results.length };
    }
  } catch {}
  return { results: [], count: 0, retracted: 0 };
}

// The protocol line, parsed tolerantly: the prompt asks for the bare form
// ("CONFIDENCE: strong") but a model can wrap it in emphasis or add a full
// stop, and the pill shouldn't fall back to "mixed" over punctuation.
const CONFIDENCE_LINE = /^[*_\s]*CONFIDENCE\b[:\s*_]*([a-z]+)/i;

/** The streamed text, tidied for display while still arriving: leading
 *  preamble whitespace and any interruption marker dropped, trailing blank
 *  lines and a trailing (possibly partial) CONFIDENCE line hidden so the
 *  protocol never flashes on screen. */
export function draftDisplayText(raw: string): string {
  const lines = raw.replace(/^\s+/, '').split(INTERRUPT_MARKER).join('').split('\n');
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const last = (lines[lines.length - 1] ?? '').trim().toUpperCase();
  if (last && (REVIEW_CONFIDENCE_PREFIX.startsWith(last) || /^[*_]*CONFIDENCE/.test(last))) {
    lines.pop();
  }
  return lines.join('\n');
}

/** Split the finished stream into the report text and the trailing
 *  "CONFIDENCE: level" protocol line. `found` is false when the line never
 *  arrived — a sign the report was cut short (defaults to mixed). */
function splitConfidence(raw: string): {
  text: string;
  confidence: ReviewResult['confidence'];
  found: boolean;
} {
  const lines = raw.trim().split('\n');
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  let confidence: ReviewResult['confidence'] = 'mixed';
  let found = false;
  const m = (lines[lines.length - 1] ?? '').trim().match(CONFIDENCE_LINE);
  if (m) {
    found = true;
    const value = m[1].toLowerCase();
    if (value === 'strong' || value === 'thin' || value === 'mixed') {
      confidence = value;
    }
    lines.pop();
  }
  return { text: lines.join('\n').trim(), confidence, found };
}

/**
 * Run the full review pipeline. Staleness-guarded throughout: if a newer
 * review started (or cancelReview ran), returns `{status:'stale'}` and the
 * caller drops the result.
 */
export async function runReviewPipeline(
  problem: string,
  hooks: PipelineHooks
): Promise<ReviewOutcome> {
  const seq = ++reviewSeq;
  const stale = () => seq !== reviewSeq;

  // Keep the running commentary to a minimum — three plain phases, no version
  // noise (the tool version lives on the page badge), no reassurance copy.
  const progress = hooks.onProgress;

  progress('Planning the search…');
  const planned = await planProblem(problem);
  if (stale()) return { status: 'stale' };
  if (planned && 'budget' in planned) {
    // The monthly budget is spent — say so now rather than searching for
    // minutes and failing at the synthesis step.
    return { status: 'budget', message: planned.budget };
  }
  // Never a dead end — search the problem verbatim as a single angle.
  const plan: ReviewPlan =
    planned ?? { framing: '', angles: [{ label: 'Your question', query: problem, review: false, from: null }] };
  hooks.onPlan?.(plan);

  const perAngle: Work[][] = plan.angles.map(() => []);
  let foundAny = false;
  // How many retracted studies the search surfaced and this pipeline dropped
  // before curation — surfaced in the finished briefing as a transparency note.
  let retractedExcluded = 0;
  // How much research the question surfaced across its angles — the signal that
  // sizes the candidate pool. Summed from the catalogue totals, so a broad
  // literature lets the model choose from more than a niche one.
  let scopeTotal = 0;
  // First pass: each planned angle, free-to-read, first page.
  progress('Searching the research…');
  for (let i = 0; i < plan.angles.length; i++) {
    const a = plan.angles[i];
    const { results, count, retracted } = await searchAngle(a, hooks.source, { page: 1, oa: true });
    if (stale()) return { status: 'stale' };
    perAngle[i] = results;
    scopeTotal += count;
    retractedExcluded += retracted;
    if (results.length) foundAny = true;
    hooks.onAngleDone?.(i, plan.angles.length);
  }
  // Size the candidate pool to the question's breadth. The model still selects
  // a briefing-length handful from it (server-side prompt) — this only widens
  // what it gets to choose from, so nothing on-point is cut before it's seen.
  const poolTarget = poolTargetFor(scopeTotal);

  // Preprint pass: one page of not-yet-peer-reviewed work per angle from the
  // preprints facet (CrimRxiv, SSRN, SocArXiv…), tagged `preprint: true` so
  // curation can cap them (≤ PREPRINT_CAP of the curated set), the model can
  // treat them with extra caution, and the renderers can label them. All
  // angles' hits form ONE pseudo-angle, so the round-robin admits at most one
  // preprint per round — current work joins the evidence base without ever
  // leading it. Never escalated: page 1 is plenty for the early rung.
  let preprintList: Work[] = [];
  for (const a of plan.angles) {
    const { results: pre, retracted } = await searchAngle({ ...a, review: false }, 'preprints', { page: 1, oa: true });
    if (stale()) return { status: 'stale' };
    retractedExcluded += retracted;
    preprintList = preprintList.concat(pre.map((w) => ({ ...w, preprint: true })));
  }
  if (preprintList.length) foundAny = true;

  if (!foundAny) {
    return {
      status: 'error',
      message: 'Couldn’t reach the research catalogues, or nothing came back. Try rephrasing the question.',
    };
  }

  // curate lives in untyped lib JS (like research-merge); it preserves the
  // Work shape it's given, so assert the element type back here. The preprint
  // pseudo-angle rides along, capped so early work never crowds out the
  // peer-reviewed base.
  const curateAll = () =>
    curate([...perAngle, preprintList], poolTarget, { preprintCap: PREPRINT_CAP }) as Work[];
  let references = curateAll();

  // Thin first pass → walk the escalation ladder: dig deeper (further pages)
  // then wider (beyond free-to-read), re-curating after each rung, until the
  // candidate pool hits its target size or the ladder is spent.
  for (let s = 0; s < ESCALATION.length && references.length < poolTarget; s++) {
    const step = ESCALATION[s];
    for (let i = 0; i < plan.angles.length; i++) {
      const { results: more, retracted } = await searchAngle(plan.angles[i], hooks.source, step);
      if (stale()) return { status: 'stale' };
      retractedExcluded += retracted;
      if (more.length) perAngle[i] = perAngle[i].concat(more);
    }
    references = curateAll();
  }

  const framing = plan.framing;

  // The numbered list must be identical on both sides: the server drops
  // untitled items before numbering, so drop them here first — otherwise a
  // single titleless record would shift every [n] after it onto the wrong
  // study.
  references = references.filter((w) => typeof w?.title === 'string' && w.title.trim());

  // Don't stream a report from near-nothing — show what came back honestly.
  if (references.length < THIN_THRESHOLD) {
    return { status: 'thin', problem, framing, references };
  }

  progress('The LLM is writing the research briefing…');
  const items = references.map((w) => ({
    title: w.title,
    authors: w.authors,
    year: w.year,
    venue: w.venue,
    abstract: w.tldr || w.abstract || '',
    // Not yet peer reviewed — the prompt pins these to the early rung of the
    // ladder. Only sent when true, so ordinary items are byte-identical.
    ...(w.preprint ? { preprint: true } : {}),
  }));

  // One write attempt against the streaming endpoint. The write is the one
  // step that can fail transiently for reasons that have nothing to do with
  // the request (a briefly-overloaded model, a dropped stream, a cold edge
  // function) — so it returns a discriminated outcome the caller can retry on
  // rather than surfacing every blip to the reader. `retry` carries any
  // specific server reason, so a *persistent* failure (e.g. model access)
  // still shows that reason instead of the generic message.
  type WriteAttempt =
    | { kind: 'ok'; result: ReviewResult }
    | { kind: 'budget'; message: string }
    | { kind: 'stale' }
    | { kind: 'retry'; message?: string };

  // One line of plain fact per failed attempt ("attempt 1: connection
  // dropped after 87s, 3,214 characters received") — surfaced in the failure
  // message so a screenshot of a failure IS its diagnosis, instead of another
  // round of guessing whether something blocked, timed out, or truncated.
  const diags: string[] = [];

  const attemptWrite = async (label: string): Promise<WriteAttempt> => {
    let raw = '';
    const t0 = Date.now();
    const secs = () => `${Math.round((Date.now() - t0) / 1000)}s`;
    // The model that actually wrote the report (the server picks the first its
    // account can reach, so it may not be the intended one) — reported via the
    // x-model header and stored so the page and PDF never claim a model that
    // didn't run.
    // Placeholder only — the server names the model that actually wrote the
    // report in x-model, and overwrites this on the very next line.
    let model = REVIEW_OPENAI_MODEL;
    // Idle watchdog: the server heartbeats a byte every ~15s while the model
    // thinks, so a healthy stream is never silent for long. A stream with NO
    // bytes at all for this long is genuinely dead (killed connection, hung
    // edge) — abort it so the attempt fails into the normal retry path
    // instead of waiting forever. Reset on every received chunk.
    const ac = new AbortController();
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const bump = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => ac.abort(), 120_000);
    };
    try {
      bump();
      const res = await fetch('/api/research-review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ problem, items }),
        signal: ac.signal,
      });
      const headerModel = res.headers.get('x-model');
      if (headerModel) model = headerModel;
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (stale()) return { kind: 'stale' };
        // A spent monthly budget won't clear on a retry — stop now.
        if (res.status === 503 && typeof body?.error === 'string') {
          return { kind: 'budget', message: body.error };
        }
        // Any other server error is worth one retry; keep a specific reason
        // (e.g. model access) to show if it fails again.
        diags.push(`${label}: server error ${res.status} after ${secs()}`);
        return { kind: 'retry', message: typeof body?.error === 'string' ? body.error : undefined };
      }
      const reader = res.body?.getReader();
      if (!reader) {
        diags.push(`${label}: no response stream`);
        return { kind: 'retry' };
      }
      const decoder = new TextDecoder();
      let lastDraw = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bump();
        // The server heartbeats a zero-width no-break space (U+FEFF) whenever
        // the model goes quiet mid-stream, to stop intermediaries idle-killing
        // the connection during thinking pauses. Strip it before ANY parsing —
        // it can land anywhere, including inside a [n] marker. The streaming
        // decoder reassembles a split character before emitting it, so
        // stripping per-chunk catches every one.
        raw += decoder.decode(value, { stream: true }).replace(/\uFEFF/g, '');
        if (stale()) {
          reader.cancel().catch(() => {});
          return { kind: 'stale' };
        }
        // Progressive render, throttled — the report writing itself onto the
        // page IS the loading state for the long synthesis step. Gated on
        // actual content: the preamble byte and the thinking-phase heartbeat
        // newlines are pure whitespace, and an empty draft must not flip the
        // status to "Writing…" while the model is still thinking.
        const now = Date.now();
        if (hooks.onDraft && now - lastDraw > 150) {
          const disp = draftDisplayText(raw);
          if (disp) {
            lastDraw = now;
            hooks.onDraft(disp, references);
          }
        }
      }
      raw += decoder.decode().replace(/\uFEFF/g, '');
    } catch (e: any) {
      if (stale()) return { kind: 'stale' };
      diags.push(
        `${label}: ${e?.name === 'AbortError' ? 'no data for 120s (watchdog)' : 'connection dropped'} after ${secs()}, ${raw.length} characters received`
      );
      return { kind: 'retry' };
    } finally {
      clearTimeout(watchdog);
    }
    if (stale()) return { kind: 'stale' };

    // A dropped stream leaves ai-stream's interruption marker in the text. A
    // report that got most of the way is still worth reading — keep it with an
    // honest note; a stub is not.
    let interrupted = false;
    if (raw.includes(INTERRUPT_MARKER)) {
      interrupted = true;
      raw = raw.split(INTERRUPT_MARKER).join('');
    }

    const { text, confidence, found } = splitConfidence(raw);
    // Strip out-of-range markers; a "report" citing nothing is unusable.
    const { text: briefing, used } = sanitizeCitations(text, references.length);
    const cutShort = interrupted || !found; // no protocol line ⇒ the stream was cut off
    if (!briefing || used.length === 0 || (cutShort && briefing.length < 500)) {
      diags.push(
        `${label}: incomplete report after ${secs()} (${briefing.length} usable characters${interrupted ? ', server reported an interruption' : ''})`
      );
      return { kind: 'retry' };
    }

    return {
      kind: 'ok',
      result: {
        problem,
        framing,
        briefing,
        used,
        confidence,
        caveat: cutShort
          ? `The stream was cut short, so this report may be incomplete. ${REVIEW_CAVEAT}`
          : REVIEW_CAVEAT,
        references,
        model,
        promptVersion: ASSIST_PROMPT_VERSION,
        ...(retractedExcluded > 0 ? { retractedExcluded } : {}),
      },
    };
  };

  // Write it, and quietly try once more on a transient failure — most of the
  // "the review couldn't be written" cases are a one-off blip that a second
  // attempt clears, so the reader rarely sees the fallback.
  let attempt = await attemptWrite('attempt 1');
  if (attempt.kind === 'retry') {
    if (stale()) return { status: 'stale' };
    attempt = await attemptWrite('attempt 2');
  }

  // Last resort: the server deliberately keeps writing after a dropped
  // connection and caches the finished report (research-review.ts). If both
  // live attempts died, one of them very likely completed in the background —
  // wait for it to land, then collect it as a cache hit.
  if (attempt.kind === 'retry') {
    if (stale()) return { status: 'stale' };
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (stale()) return { status: 'stale' };
    }
    attempt = await attemptWrite('rescue attempt');
  }

  switch (attempt.kind) {
    case 'ok':
      return { status: 'ok', result: attempt.result };
    case 'budget':
      return { status: 'budget', message: attempt.message };
    case 'stale':
      return { status: 'stale' };
    default: {
      // Every attempt failed. Say what actually happened, attempt by attempt —
      // the reader (or a bug report) shouldn't have to guess whether something
      // blocked, timed out or truncated, and the version pins which build ran.
      const detail = diags.length ? ` Technical detail (${ASSIST_PROMPT_VERSION}): ${diags.join('; ')}.` : '';
      const message =
        (attempt.message ??
          'The studies came back fine — but the review couldn’t be written this time. That’s on the assistant, not the evidence. Here’s the evidence base it found; try again in a moment.') +
        detail;
      return { status: 'failed', problem, framing, references, message };
    }
  }
}

// ---- rendering -------------------------------------------------------------

export function stripInline(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1');
}

export function parseSections(md: string): { heading: string | null; body: string }[] {
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

// ---- the evidence-rating table -------------------------------------------

/** True when a block of lines is a GFM pipe table: a header row, then a
 *  separator row of only `-`, `:`, `|` and whitespace. Exported so the PDF
 *  renderer (pdf-report.ts) shares this one detection implementation rather
 *  than a second regex that could drift out of sync. */
export function looksLikeTable(lines: string[]): boolean {
  return (
    lines.length >= 2 &&
    /^\|.*\|$/.test(lines[0]) &&
    /^\|[\s:-]+\|[\s:|-]*$/.test(lines[1])
  );
}

/** Split one `| a | b |` row into trimmed cells, dropping the outer pipes. */
export function tableRow(line: string): string[] {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/** Which numbered studies actually got a row in the evidence table — the
 *  model may drop a curated study that isn't specific enough to the problem
 *  (research-assist-prompts.ts), so the table is no longer a guaranteed
 *  one-row-per-curated-study dump. Shared by the web renderer and the PDF so
 *  "studies reviewed" and the "Read the studies" list only ever show what
 *  actually made the report, not the full curated set behind it. Returns an
 *  empty set if the table can't be found (e.g. a cut-short stream) — callers
 *  should fall back to the full reference list in that case. Since v11 the
 *  rows run strongest-first, so the numbers are deliberately NOT ascending —
 *  never assume [n] order here or downstream. */
export function tableStudyNumbers(markdown: string): Set<number> {
  const nums = new Set<number>();
  for (const sec of parseSections(markdown)) {
    for (const block of sec.body.split(/\n{2,}/)) {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      if (!looksLikeTable(lines)) continue;
      for (const row of lines.slice(2)) {
        const n = Number(tableRow(row)[0]);
        if (Number.isInteger(n) && n >= 1) nums.add(n);
      }
    }
  }
  return nums;
}

// Visual weight per effectiveness label — deliberately not a red/amber/green
// traffic light (this site avoids sensational framing elsewhere, and a
// stoplight implies more precision than a single plain-English reading of an
// abstract can bear). Fill/weight signals "how much", not "good/bad".
const EFFECTIVENESS_STYLE: Record<string, string> = {
  'Well-established': 'bg-accent text-paper-50 border-accent',
  Promising: 'bg-accent/10 text-accent-dark border-accent/40',
  'Mixed evidence': 'bg-paper-200 text-ink-700 border-ink-300',
  'Early or limited evidence': 'bg-paper-100 text-ink-500 border-ink-200 border-dashed',
};

/** The evidence-rating table: # / Study / Key finding / Effectiveness. The
 *  Study cell links DOWN to the matching card in the evidence base below —
 *  citation markers elsewhere in the prose keep linking to those same cards
 *  (unchanged), so the table never needs its own competing anchor ids. */
/** Split a "Key finding" cell into its lead paragraph and any bullet points
 *  below it. The model writes the whole cell on one raw-markdown line (it's
 *  one row of a pipe table), so it uses literal `<br>` tags rather than real
 *  line breaks to separate the paragraph from the bullets. */
function findingCellNodes(raw: string): Node[] {
  const parts = stripInline(raw)
    .split(/<br\s*\/?>/i)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return [];
  const nodes: Node[] = [el('p', '', parts[0])];
  const bullets = parts.slice(1).map((p) => p.replace(/^[-•]\s*/, ''));
  if (bullets.length) {
    const ul = el('ul', 'list-disc pl-4 mt-1.5 space-y-0.5 text-ink-600 text-[0.85em]');
    for (const b of bullets) ul.appendChild(el('li', '', b));
    nodes.push(ul);
  }
  return nodes;
}

function renderTable(
  header: string[],
  rows: string[][],
  valid: Set<number>,
  refs?: Work[]
): HTMLElement | null {
  // Tolerate column reordering/renaming by the model: find each column by
  // its expected header text rather than assuming a fixed position. The
  // strength column matches BOTH names forever — v11 renamed it to "Strength
  // of evidence", but saved v10 briefings carry "Effectiveness" in their
  // stored markdown.
  const idx = (name: string) => header.findIndex((h) => h.toLowerCase().includes(name));
  const nCol = idx('#');
  const studyCol = idx('stud');
  const findingCol = idx('finding');
  const effCol = header.findIndex((h) => /strength|effective/i.test(h));
  if (nCol === -1 || studyCol === -1 || findingCol === -1) return null;

  const outer = el('div', 'mt-4');
  const wrap = el('div', 'overflow-x-auto rounded-2 border border-ink-200');
  const table = document.createElement('table');
  table.className = 'w-full text-left border-collapse';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.className = 'bg-paper-200';
  const headLabels = ['#', 'Study', 'Key finding', STRENGTH_COLUMN];
  for (const label of headLabels) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.className = 'font-sans text-[0.65rem] uppercase tracking-[0.1em] text-ink-500 px-3 py-2 align-bottom';
    th.textContent = label;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const row of rows) {
    const n = Number((row[nCol] ?? '').replace(/[^\d]/g, ''));
    if (!Number.isInteger(n) || n < 1) continue;
    const tr = document.createElement('tr');
    tr.className = 'border-t border-ink-200 align-top';

    const nTd = document.createElement('td');
    nTd.className = 'font-sans text-xs text-ink-500 px-3 py-2.5 whitespace-nowrap';
    nTd.textContent = `[${n}]`;
    tr.appendChild(nTd);

    const studyTd = document.createElement('td');
    studyTd.className = 'font-sans text-sm font-medium text-ink-900 px-3 py-2.5 whitespace-nowrap';
    if (valid.has(n)) {
      const a = document.createElement('a');
      a.href = `#${REF_ID_PREFIX}${n}`;
      a.className = 'text-accent hover:text-accent-dark no-underline hover:underline';
      a.textContent = row[studyCol] ?? '';
      studyTd.appendChild(a);
    } else {
      studyTd.textContent = row[studyCol] ?? '';
    }
    if (refs?.[n - 1]?.preprint) {
      studyTd.appendChild(
        el(
          'span',
          'block w-fit mt-1 font-sans text-[0.6rem] uppercase tracking-[0.08em] text-ink-500 border border-dashed border-ink-300 rounded px-1.5 py-0.5',
          'Preprint — not yet peer reviewed'
        )
      );
    }
    tr.appendChild(studyTd);

    const findingTd = document.createElement('td');
    findingTd.className = 'font-serif text-sm text-ink-800 px-3 py-2.5 leading-snug min-w-[16rem]';
    for (const child of findingCellNodes(row[findingCol] ?? '')) findingTd.appendChild(child);
    tr.appendChild(findingTd);

    const effTd = document.createElement('td');
    effTd.className = 'px-3 py-2.5 whitespace-nowrap';
    const rawLabel = (effCol >= 0 ? row[effCol] : '')?.trim();
    // Render whatever the model wrote even if it's not one of the four
    // labels (fail open, don't hide information) — an unrecognised label
    // just gets a neutral badge instead of one of the weighted styles.
    if (rawLabel) {
      const badge = el(
        'span',
        `inline-block font-sans text-[0.65rem] font-medium px-2 py-0.5 rounded-full border ${EFFECTIVENESS_STYLE[rawLabel] ?? 'bg-paper-100 text-ink-600 border-ink-200'}`,
        rawLabel
      );
      badge.title =
        (EFFECTIVENESS_EXPLANATIONS as Record<string, string>)[rawLabel] ??
        `${rawLabel} — the assistant's plain reading of this study's abstract, not a formal rating.`;
      effTd.appendChild(badge);
    }
    tr.appendChild(effTd);

    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  outer.appendChild(wrap);
  const hasPreprint = Boolean(
    refs &&
      rows.some((row) => {
        const n = Number((row[nCol] ?? '').replace(/[^\d]/g, ''));
        return Number.isInteger(n) && refs[n - 1]?.preprint;
      })
  );
  outer.appendChild(effectivenessLegend(hasPreprint));
  return outer;
}

/** The plain-English key under the evidence table: what each strength label
 *  means and how much weight to give it — fixed text from the prompts module
 *  (EFFECTIVENESS_EXPLANATIONS), never model-written, so it can't drift. The
 *  preprint line appears only when a preprint actually made the table. */
export function effectivenessLegend(hasPreprint: boolean): HTMLElement {
  const box = el('div', 'mt-3 space-y-1.5');
  box.appendChild(
    el('p', 'font-sans text-[0.65rem] uppercase tracking-[0.12em] text-ink-500', 'How to read the strength labels')
  );
  for (const [label, explanation] of Object.entries(EFFECTIVENESS_EXPLANATIONS)) {
    const row = el('p', 'font-sans text-xs text-ink-600 leading-snug');
    row.appendChild(
      el(
        'span',
        `inline-block font-sans text-[0.65rem] font-medium px-2 py-0.5 rounded-full border mr-2 ${EFFECTIVENESS_STYLE[label] ?? 'bg-paper-100 text-ink-600 border-ink-200'}`,
        label
      )
    );
    row.appendChild(document.createTextNode(explanation));
    box.appendChild(row);
  }
  if (hasPreprint) {
    box.appendChild(el('p', 'font-sans text-xs italic text-ink-600 leading-snug', PREPRINT_EXPLANATION));
  }
  return box;
}

// ---- prose / bullets -------------------------------------------------------

/** Render a section's body as paragraphs, bullet lists and (where present) a
 *  markdown table, with [n] markers linked to the matching study card. Blocks
 *  may MIX bullets and prose (a list closed by a plain sentence is common),
 *  so group consecutive runs rather than judging a whole block all-or-nothing. */
function renderSectionBody(body: string, valid: Set<number>, refs?: Work[]): Node[] {
  const nodes: Node[] = [];
  const pushPara = (lines: string[]) => {
    if (!lines.length) return;
    nodes.push(citationParagraph(stripInline(lines.join(' ')), valid, { idPrefix: REF_ID_PREFIX }));
  };
  const pushList = (items: string[]) => {
    if (!items.length) return;
    const ul = el('ul', 'list-disc pl-5 space-y-1.5 mt-3');
    for (const item of items) {
      const li = el('li', 'font-serif text-sm text-ink-800 leading-relaxed');
      const p = citationParagraph(stripInline(item), valid, {
        idPrefix: REF_ID_PREFIX,
        paragraphClass: '',
      });
      while (p.firstChild) li.appendChild(p.firstChild);
      ul.appendChild(li);
    }
    nodes.push(ul);
  };
  for (const block of body.split(/\n{2,}/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (looksLikeTable(lines)) {
      const t = renderTable(tableRow(lines[0]), lines.slice(2).map(tableRow), valid, refs);
      if (t) {
        nodes.push(t);
        continue;
      }
      // Not a table we recognise (unexpected columns) — fall through and
      // render it as plain text rather than silently dropping content.
    }
    let para: string[] = [];
    let items: string[] = [];
    for (const l of lines) {
      if (/^([-*]|\d+\.)\s+/.test(l)) {
        pushPara(para);
        para = [];
        items.push(l.replace(/^([-*]|\d+\.)\s+/, ''));
      } else {
        pushList(items);
        items = [];
        para.push(l);
      }
    }
    pushPara(para);
    pushList(items);
  }
  return nodes;
}

// ---- the three action tiers, as a boxed grid -------------------------------

// The exact headings that group into the "what to do" grid, each with its own
// accent weight (heaviest for the easiest win, so the eye lands there first —
// same "make the recommendation stand out" principle as the effectiveness
// badges, applied to urgency instead of evidence strength). Exported so
// pdf-report.ts recognises the same three headings without re-typing them.
// The `icon` rides on the web render only (renderActionBox below) — the
// briefing is simplest-first, so the top "what to do" tier boxes get a friendly
// glyph. pdf-report.ts imports this same array for its heading text + styling
// and simply ignores `icon` (jsPDF core fonts don't carry emoji).
export const ACTION_TIERS: { heading: string; style: string; icon: string }[] = [
  { heading: 'Quick wins', style: 'border-accent bg-accent/[0.06]', icon: '⚡' },
  { heading: 'Medium term', style: 'border-ink-400 bg-paper-100', icon: '📅' },
  { heading: 'Long term — higher effort', style: 'border-ink-300 bg-paper-50', icon: '🎯' },
];

// Emoji only for the plain-English top sections — the summary and to-do
// headings. The detailed lower sections (evidence, confidence, powers) stay
// plain and academic, so the page reads ELI5→practitioner top to bottom.
const SECTION_ICONS: Record<string, string> = {
  'In brief': '🔑',
  'What you could do': '✅',
};

function renderActionBox(
  heading: string,
  style: string,
  icon: string,
  body: string,
  valid: Set<number>,
  refs?: Work[]
): HTMLElement {
  const box = el('div', `rounded-2 border-l-[3px] px-4 py-3.5 ${style}`);
  box.appendChild(
    el('h4', 'u-datum !text-ink-900 mb-2', `${icon} ${heading}`)
  );
  for (const node of renderSectionBody(body, valid, refs)) box.appendChild(node);
  return box;
}

/** Heading + sectioned body — shared by the live draft and the final render.
 *  The three action-tier headings (Quick wins / Medium term / Long term)
 *  render together as one responsive grid of boxes rather than as three
 *  separate flowing subsections — the visual "distinct recommendation block"
 *  the briefing format is built around. Works correctly with 0–3 of them
 *  present, so a partial live stream renders sensibly mid-write. */
function renderReportBody(md: string, valid: Set<number>, refs?: Work[]): HTMLElement {
  const body = el('div', 'mt-6');
  const sections = parseSections(md);
  const tierHeadings = new Set(ACTION_TIERS.map((t) => t.heading));
  let grid: HTMLElement | null = null;

  for (const sec of sections) {
    const tier = sec.heading ? ACTION_TIERS.find((t) => t.heading === sec.heading) : undefined;
    if (tier) {
      if (!grid) {
        grid = el('div', 'grid sm:grid-cols-3 gap-3 mt-7');
        body.appendChild(grid);
      }
      grid.appendChild(renderActionBox(tier.heading, tier.style, tier.icon, sec.body, valid, refs));
      continue;
    }
    grid = null; // a non-tier heading ends the run, so a repeat later starts a fresh grid
    if (sec.heading && !tierHeadings.has(sec.heading)) {
      const icon = SECTION_ICONS[sec.heading];
      body.appendChild(
        el(
          'h3',
          'font-display text-lg font-semibold text-ink-900 mt-7 mb-1',
          icon ? `${icon}  ${sec.heading}` : sec.heading
        )
      );
    }
    for (const node of renderSectionBody(sec.body, valid, refs)) body.appendChild(node);
  }
  return body;
}

/**
 * Render the report as it streams in. Citation markers link optimistically to
 * every study in the curated set (the final render re-validates against the
 * sanitised `used` list).
 */
export function renderDraft(container: HTMLElement, markdown: string, references: Work[]): void {
  const valid = new Set(references.map((_, i) => i + 1));
  container.replaceChildren();
  const article = el('div', 'max-w-3xl');
  article.appendChild(el('p', 'font-sans text-xs uppercase tracking-[0.2em] text-accent mb-3', 'Research review — writing…'));
  article.appendChild(renderReportBody(markdown, valid, references));
  container.appendChild(article);
}

/** The studies that made the evidence table, numbered to match the citation
 *  markers — each card is the anchor a [n] link scrolls to, and (with hooks)
 *  is starrable. `tableNums` restricts the list to rows actually in the
 *  table (a curated study too tangential for this problem may have been
 *  dropped by the model); pass an empty set to fall back to showing every
 *  curated study, e.g. when the table couldn't be parsed. */
function evidenceBase(references: Work[], tableNums: Set<number>, hooks: CardHooks): HTMLElement {
  const shown = references
    .map((w, i) => ({ w, n: i + 1 }))
    .filter(({ n }) => tableNums.size === 0 || tableNums.has(n));
  const wrap = el('div', 'mt-10 border-t border-ink-200 pt-6');
  wrap.appendChild(
    el('h3', 'font-sans text-xs uppercase tracking-[0.2em] text-ink-500 mb-1', `Sources & further reading — ${shown.length}`)
  );
  wrap.appendChild(
    el('p', 'font-serif text-sm text-ink-600 mb-2', 'The full study behind each row of the evidence table — numbered the same way. Weigh the study, not the summary.')
  );
  shown.forEach(({ w, n }) => {
    const row = el('div', 'flex gap-3 scroll-mt-24');
    row.id = `${REF_ID_PREFIX}${n}`;
    row.appendChild(
      el('span', 'font-sans text-sm font-medium text-ink-500 pt-6 shrink-0 w-7 text-right', `[${n}]`)
    );
    const c = card(w, hooks);
    c.classList.add('flex-1', 'min-w-0');
    if (w.preprint) {
      c.appendChild(
        el(
          'p',
          'w-fit mt-2 font-sans text-[0.65rem] uppercase tracking-[0.08em] text-ink-500 border border-dashed border-ink-300 rounded px-1.5 py-0.5',
          'Preprint — not yet peer reviewed'
        )
      );
    }
    row.appendChild(c);
    wrap.appendChild(row);
  });
  return wrap;
}

export interface RenderReviewOptions {
  /** Card hooks (star/save) — omit for the read-only shared view. */
  hooks?: CardHooks;
  /** Read-only banner for the shared view. */
  readOnly?: boolean;
}

/**
 * Render a complete review into `container`. Works for the live result, saved
 * reviews and the read-only shared view — the latter passes no hooks and
 * `readOnly`. The `used` list is re-validated against the reference count
 * here, so a tampered shared row can never link past the studies actually
 * stored. Every review gets a branded "Download as PDF" button — the print
 * document is built client-side from the same validated data.
 */
export function renderReview(
  container: HTMLElement,
  result: ReviewResult,
  opts: RenderReviewOptions = {}
): void {
  container.replaceChildren();
  const valid = new Set(
    (result.used ?? []).filter((n) => Number.isInteger(n) && n >= 1 && n <= result.references.length)
  );

  const article = el('div', 'max-w-3xl');

  if (opts.readOnly) {
    article.appendChild(
      el('p', 'font-sans text-xs text-ink-600 bg-paper-200 rounded px-3 py-2 mb-5', 'Shared research review — read-only. Sources are curated from the open research record; read the studies before relying on this.')
    );
  }

  article.appendChild(el('p', 'font-sans text-xs uppercase tracking-[0.2em] text-accent mb-3', 'Research review'));
  article.appendChild(
    el('h2', 'font-display text-2xl md:text-3xl font-semibold text-ink-900 leading-tight', result.problem)
  );

  const meta = el('div', 'flex flex-wrap items-center gap-3 mt-3');
  meta.appendChild(
    el('span', 'inline-block font-sans text-[0.65rem] uppercase tracking-[0.12em] text-ink-500 border border-ink-200 rounded px-1.5 py-0.5', CONFIDENCE_LABELS[result.confidence] ?? CONFIDENCE_LABELS.mixed)
  );
  const pdfBtn = el('button', 'font-sans text-[0.65rem] uppercase tracking-[0.12em] text-ink-700 border border-ink-300 rounded px-2 py-0.5 hover:border-accent hover:text-accent transition-colors disabled:opacity-50', 'Download PDF') as HTMLButtonElement;
  pdfBtn.type = 'button';
  pdfBtn.addEventListener('click', async () => {
    pdfBtn.disabled = true;
    pdfBtn.textContent = 'Building PDF…';
    try {
      // A real .pdf file, generated client-side — jsPDF loads only on click.
      const { downloadReviewPdf } = await import('./pdf-report');
      await downloadReviewPdf(result);
      pdfBtn.textContent = 'Downloaded ✓';
      setTimeout(() => {
        pdfBtn.textContent = 'Download PDF';
        pdfBtn.disabled = false;
      }, 1500);
    } catch {
      pdfBtn.textContent = 'PDF failed — try again';
      pdfBtn.disabled = false;
    }
  });
  meta.appendChild(pdfBtn);
  // Name the model that actually wrote it — the server falls back down a chain
  // if the intended model isn't reachable, so this must reflect reality. This
  // is the ONE place the report is marked AI-generated — kept plain and not
  // repeated elsewhere in the flow.
  if (result.model) {
    meta.appendChild(
      el('span', 'font-sans text-[0.65rem] uppercase tracking-[0.12em] text-ink-400', `AI-generated · ${result.model}`)
    );
  }
  article.appendChild(meta);

  // Transparency note: if the search turned up retracted studies, say so and
  // that they were held out — a reader should know the pool was screened, not
  // silently trimmed.
  if (result.retractedExcluded && result.retractedExcluded > 0) {
    const n = result.retractedExcluded;
    article.appendChild(
      el(
        'p',
        'font-sans text-xs text-ink-500 mt-2',
        `${n} retracted ${n === 1 ? 'study was' : 'studies were'} found in the search and left out of this briefing.`
      )
    );
  }

  article.appendChild(renderReportBody(result.briefing, valid, result.references));

  if (result.caveat) {
    article.appendChild(el('p', 'font-serif text-xs italic text-ink-600 mt-5', result.caveat));
  }

  article.appendChild(evidenceBase(result.references, tableStudyNumbers(result.briefing), opts.hooks ?? {}));
  container.appendChild(article);
}
