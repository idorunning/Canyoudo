// Saved + shareable briefings, backed by Supabase (the `briefings` table; RLS
// in docs/google-login-setup.md). Reuses the Supabase client created in
// saved.ts — no second client, no second auth listener.
//
// A row stores the full briefing: the markdown, the valid citation indices and
// the curated Work[] (`references_`). That makes the read-only shared view
// render identically with NO catalogue or AI call — the reference cards are
// rebuilt client-side from the stored Work objects, so the citation-safety
// invariant holds even on the public page.
//
// Sharing is capability + flag: an unguessable 128-bit share_token is the
// link, and `visibility` is the kill switch (default 'private'; 'unlisted'
// makes the token work; flipping back revokes). Anon reads only ever return
// 'unlisted' rows (RLS), so a private briefing is invisible to anyone but its
// owner.

import type { Work } from './cards';
import type { BriefingResult } from './briefing';

export type Visibility = 'private' | 'unlisted';

export interface StoredBriefing extends BriefingResult {
  id: string;
  shareToken: string;
  visibility: Visibility;
  createdAt: string;
}

// A gentle ceiling so a single account can't fill the table.
const PER_USER_CAP = 200;

export interface BriefingsStore {
  /** Insert a new briefing (private). Returns its id + share token, or null. */
  saveBriefing: (result: BriefingResult) => Promise<{ id: string; shareToken: string } | null>;
  /** The signed-in user's briefings, newest first. */
  listBriefings: () => Promise<StoredBriefing[]>;
  /** Flip a briefing between private and unlisted (owner only). */
  setVisibility: (id: string, visibility: Visibility) => Promise<boolean>;
  /** Delete a briefing (owner only). */
  deleteBriefing: (id: string) => Promise<boolean>;
}

const ROW_COLUMNS =
  'id, problem, framing, briefing, used, references_, confidence, caveat, model, prompt_version, visibility, share_token, created_at';

function asWorks(value: unknown): Work[] {
  return Array.isArray(value) ? (value as Work[]) : [];
}

function rowToBriefing(row: any): StoredBriefing {
  return {
    id: row.id,
    problem: row.problem ?? '',
    framing: row.framing ?? '',
    briefing: row.briefing ?? '',
    used: Array.isArray(row.used) ? row.used : [],
    confidence: ['strong', 'mixed', 'thin'].includes(row.confidence) ? row.confidence : 'mixed',
    caveat: row.caveat ?? '',
    references: asWorks(row.references_),
    model: row.model ?? '',
    promptVersion: row.prompt_version ?? '',
    shareToken: row.share_token,
    visibility: row.visibility === 'unlisted' ? 'unlisted' : 'private',
    createdAt: row.created_at,
  };
}

export function initBriefings(supabase: any, getUser: () => any): BriefingsStore {
  async function saveBriefing(result: BriefingResult) {
    const user = getUser();
    if (!user) return null;
    // Cap storage per account (cheap head count, RLS scopes it to the owner).
    const { count } = await supabase
      .from('briefings')
      .select('id', { count: 'exact', head: true });
    if ((count ?? 0) >= PER_USER_CAP) return null;

    const { data, error } = await supabase
      .from('briefings')
      .insert({
        user_id: user.id,
        problem: result.problem,
        framing: result.framing,
        briefing: result.briefing,
        used: result.used,
        references_: result.references,
        confidence: result.confidence,
        caveat: result.caveat,
        model: result.model,
        prompt_version: result.promptVersion,
      })
      .select('id, share_token')
      .single();
    if (error || !data) return null;
    return { id: data.id, shareToken: data.share_token };
  }

  async function listBriefings(): Promise<StoredBriefing[]> {
    if (!getUser()) return [];
    const { data, error } = await supabase
      .from('briefings')
      .select(ROW_COLUMNS)
      .order('created_at', { ascending: false });
    if (error || !Array.isArray(data)) return [];
    return data.map(rowToBriefing);
  }

  async function setVisibility(id: string, visibility: Visibility): Promise<boolean> {
    const { error } = await supabase.from('briefings').update({ visibility }).eq('id', id);
    return !error;
  }

  async function deleteBriefing(id: string): Promise<boolean> {
    const { error } = await supabase.from('briefings').delete().eq('id', id);
    return !error;
  }

  return { saveBriefing, listBriefings, setVisibility, deleteBriefing };
}

/**
 * Load a shared briefing by its token. Works logged-out: the anon RLS policy
 * returns the row only when it is 'unlisted'. Returns null for an unknown,
 * private, or revoked token.
 */
export async function loadSharedBriefing(
  supabase: any,
  token: string
): Promise<StoredBriefing | null> {
  if (!token) return null;
  const { data, error } = await supabase
    .from('briefings')
    .select(ROW_COLUMNS)
    .eq('share_token', token)
    .eq('visibility', 'unlisted')
    .maybeSingle();
  if (error || !data) return null;
  return rowToBriefing(data);
}
