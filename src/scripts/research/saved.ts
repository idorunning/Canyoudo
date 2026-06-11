// Google sign-in + saved papers, backed by Supabase. Loaded only when the
// PUBLIC_SUPABASE_* env vars were present at build time; supabase-js itself is
// imported dynamically so readers who never sign in don't download it.
//
// The saved_papers table is owner-only via row-level security (see
// docs/google-login-setup.md). metadata holds the full Work object so saved
// cards render identically without re-querying any catalogue.

import { card, el, setStar, workKey, type Work, type CardHooks } from './cards';

type SupabaseClient = any;

export interface SavedStore {
  hooks: CardHooks;
  renderSavedView: (container: HTMLElement) => void;
  count: () => number;
  signedIn: () => boolean;
  onChange: (fn: () => void) => void;
}

export async function initSaved(
  supabaseUrl: string,
  supabaseKey: string,
  authSlot: HTMLElement
): Promise<SavedStore> {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

  let user: any = null;
  const saved = new Map<string, { id: string; work: Work }>(); // workKey → row
  const listeners: (() => void)[] = [];
  const notify = () => listeners.forEach((fn) => fn());

  async function loadSaved() {
    saved.clear();
    if (!user) return notify();
    const { data } = await supabase
      .from('saved_papers')
      .select('id, doi, url, metadata')
      .order('created_at', { ascending: false });
    for (const row of data ?? []) {
      const work = row.metadata as Work;
      const key = row.doi || row.url || workKey(work);
      if (key && work?.title) saved.set(key, { id: row.id, work });
    }
    notify();
  }

  function renderAuth() {
    authSlot.replaceChildren();
    if (user) {
      const wrap = el('span', 'inline-flex items-center gap-2 font-sans text-xs text-ink-600');
      const initial = (user.user_metadata?.name || user.email || '?').trim().charAt(0).toUpperCase();
      const dot = el('span', 'inline-flex items-center justify-center w-6 h-6 rounded-full bg-accent text-paper-50 font-medium', initial);
      wrap.appendChild(dot);
      const out = el('button', 'underline underline-offset-2 hover:text-accent', 'Sign out') as HTMLButtonElement;
      out.type = 'button';
      out.addEventListener('click', async () => {
        await supabase.auth.signOut();
      });
      wrap.appendChild(out);
      authSlot.appendChild(wrap);
    } else {
      const btn = el('button', 'font-sans text-xs text-ink-600 underline underline-offset-2 hover:text-accent', 'Sign in with Google to save papers') as HTMLButtonElement;
      btn.type = 'button';
      btn.addEventListener('click', signIn);
      authSlot.appendChild(btn);
    }
  }

  function signIn() {
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + '/research' },
    });
  }

  async function toggleSave(w: Work, btn: HTMLButtonElement) {
    if (!user) return signIn();
    const key = workKey(w) || w.title;
    const existing = saved.get(key);
    if (existing) {
      saved.delete(key);
      setStar(btn, false);
      notify();
      await supabase.from('saved_papers').delete().eq('id', existing.id);
    } else {
      setStar(btn, true);
      const { data } = await supabase
        .from('saved_papers')
        .insert({
          user_id: user.id,
          title: w.title,
          doi: w.doi,
          url: w.oaUrl || w.pdfUrl,
          source: w.source,
          year: w.year,
          venue: w.venue,
          metadata: w,
        })
        .select('id')
        .single();
      if (data?.id) saved.set(key, { id: data.id, work: w });
      notify();
    }
  }

  const hooks: CardHooks = {
    isSaved: (w) => saved.has(workKey(w) || w.title),
    onToggleSave: toggleSave,
  };

  function renderSavedView(container: HTMLElement) {
    container.replaceChildren();
    if (saved.size === 0) {
      container.appendChild(
        el('p', 'font-sans text-sm text-ink-600 py-6', 'Nothing saved yet. Star a result and it will keep here, on any device you sign in on.')
      );
      return;
    }
    for (const { work } of saved.values()) container.appendChild(card(work, hooks));
  }

  // Track auth state (covers the OAuth redirect landing back here too).
  const { data: sess } = await supabase.auth.getSession();
  user = sess?.session?.user ?? null;
  renderAuth();
  await loadSaved();
  supabase.auth.onAuthStateChange((_event: string, session: any) => {
    const next = session?.user ?? null;
    if (next?.id !== user?.id) {
      user = next;
      renderAuth();
      loadSaved();
    }
  });

  return {
    hooks,
    renderSavedView,
    count: () => saved.size,
    signedIn: () => Boolean(user),
    onChange: (fn) => listeners.push(fn),
  };
}
