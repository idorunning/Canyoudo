// A per-device, 30-day auto-history of finished research reviews, in
// localStorage. Every completed review is recorded automatically (signed in or
// not), so the reader can reopen any recent briefing from the page without
// having deliberately saved it — the safety net beneath the deliberate,
// permanent save (briefings-store.ts / Supabase, which needs sign-in).
//
// Why localStorage and not Supabase: the auto-history must capture EVERY
// review including logged-out ones, must not consume the 200-row permanent-
// save cap, and only needs to be readable on the device that produced it. A
// ReviewResult is plain JSON (see review.ts), so it round-trips cleanly and
// re-renders offline via renderReview — the same property the shared-view
// relies on. Entries older than 30 days are pruned on every read/write; the
// list is also capped so a heavy user can't exhaust the localStorage quota.

import type { ReviewResult } from './review';

const KEY = 'tap-research-history';
export const HISTORY_TTL_DAYS = 30;
const TTL_MS = HISTORY_TTL_DAYS * 24 * 60 * 60 * 1000;
// Bounds storage: each entry embeds the full curated Work[] (abstracts and
// all) plus the markdown briefing, so a handful are tens of KB. 30 recent
// briefings is a generous window well inside the ~5MB localStorage budget.
const HISTORY_CAP = 30;

export interface HistoryEntry {
  id: string;
  savedAt: string; // ISO 8601
  result: ReviewResult;
}

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

/** Drop entries older than the TTL and anything past the cap (newest kept). */
function prune(entries: HistoryEntry[]): HistoryEntry[] {
  const cutoff = Date.now() - TTL_MS;
  return entries
    .filter((e) => {
      const t = Date.parse(e?.savedAt ?? '');
      return Number.isFinite(t) && t >= cutoff && e?.result?.briefing;
    })
    .slice(0, HISTORY_CAP);
}

function read(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Corrupt/unavailable storage (private mode, disabled) — behave as empty.
    return [];
  }
}

function write(entries: HistoryEntry[]): void {
  // On a quota error, shed the oldest entries and retry a few times rather
  // than losing the write entirely.
  let list = entries;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      return;
    } catch {
      if (list.length <= 1) return; // can't shrink further — give up quietly
      list = list.slice(0, Math.ceil(list.length / 2));
    }
  }
}

/** Newest first, with expired entries pruned (and the prune persisted). */
export function listHistory(): HistoryEntry[] {
  const pruned = prune(read());
  return pruned;
}

/** Record a finished review. De-duplicates by problem text (a re-run of the
 *  same question replaces its older entry) so the list stays a clean set of
 *  distinct briefings. Returns the stored entry. */
export function recordHistory(result: ReviewResult): HistoryEntry {
  const entry: HistoryEntry = { id: newId(), savedAt: new Date().toISOString(), result };
  const problemKey = (result.problem ?? '').trim().toLowerCase();
  const rest = read().filter((e) => (e?.result?.problem ?? '').trim().toLowerCase() !== problemKey);
  const next = prune([entry, ...rest]);
  write(next);
  return entry;
}

export function deleteHistoryEntry(id: string): void {
  write(prune(read().filter((e) => e?.id !== id)));
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
