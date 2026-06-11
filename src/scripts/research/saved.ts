// Google sign-in + the saved-research workspace, backed by Supabase. Loaded
// only when the PUBLIC_SUPABASE_* env vars were present at build time;
// supabase-js itself is imported dynamically so readers who never sign in
// don't download it.
//
// The saved_papers and folders tables are owner-only via row-level security
// (see docs/google-login-setup.md). metadata holds the full Work object so
// saved cards render identically without re-querying any catalogue. Folders
// are the reader's "research aims": each saved paper sits in at most one.

import { card, el, setStar, workKey, type Work, type CardHooks } from './cards';
import { formatReferenceList, toRis } from '../../lib/reference-format.mjs';

type SupabaseClient = any;

interface SavedRow {
  id: string;
  work: Work;
  note: string | null;
  folderId: string | null;
}

interface Folder {
  id: string;
  name: string;
}

export interface SavedStore {
  hooks: CardHooks;
  renderSavedView: (container: HTMLElement) => void;
  renderSignedOutView: (container: HTMLElement) => void;
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
  const saved = new Map<string, SavedRow>(); // workKey → row
  let folders: Folder[] = [];
  // The folder filter the Saved view is showing: 'all', 'none' (unsorted), or a folder id.
  let activeFolder = 'all';
  const listeners: (() => void)[] = [];
  const notify = () => listeners.forEach((fn) => fn());

  // When set, the signed-out pitch shows this contextual reason at the top
  // (e.g. the reader tried to star a paper). Cleared once shown.
  let signInPrompt: string | null = null;

  // Ask main.ts to switch to the Saved tab and show the sign-in pitch.
  function promptSignIn(reason?: string) {
    signInPrompt = reason ?? null;
    authSlot.dispatchEvent(new CustomEvent('research:show-signin', { bubbles: true }));
  }

  async function loadSaved() {
    saved.clear();
    folders = [];
    if (!user) return notify();
    const [papers, dirs] = await Promise.all([
      supabase
        .from('saved_papers')
        .select('id, doi, url, note, folder_id, metadata')
        .order('created_at', { ascending: false }),
      supabase.from('folders').select('id, name').order('created_at', { ascending: true }),
    ]);
    for (const row of papers.data ?? []) {
      const work = row.metadata as Work;
      const key = row.doi || row.url || workKey(work);
      if (key && work?.title) {
        saved.set(key, { id: row.id, work, note: row.note ?? null, folderId: row.folder_id ?? null });
      }
    }
    folders = (dirs.data ?? []).filter((f: any) => f?.id && f?.name);
    notify();
  }

  function renderAuth() {
    authSlot.replaceChildren();
    if (user) {
      const wrap = el('div', 'flex justify-end');
      const inner = el('span', 'inline-flex items-center gap-2 font-sans text-xs text-ink-600');
      const initial = (user.user_metadata?.name || user.email || '?').trim().charAt(0).toUpperCase();
      const dot = el('span', 'inline-flex items-center justify-center w-6 h-6 rounded-full bg-accent text-paper-50 font-medium', initial);
      inner.appendChild(dot);
      const out = el('button', 'underline underline-offset-2 hover:text-accent', 'Sign out') as HTMLButtonElement;
      out.type = 'button';
      out.addEventListener('click', async () => {
        await supabase.auth.signOut();
      });
      inner.appendChild(out);
      wrap.appendChild(inner);
      authSlot.appendChild(wrap);
    } else {
      // A quiet bar above the search box: the benefit, then both sign-in
      // routes right there (email link primary, Google secondary) — no
      // teaser that sends the reader hunting elsewhere.
      const bar = el('div', 'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between rounded-lg bg-paper-200 px-5 py-4');
      const blurb = el('div', 'max-w-sm');
      blurb.appendChild(el('p', 'font-sans text-sm font-medium text-ink-900', 'Save papers, notes and reference lists as you go'));
      blurb.appendChild(el('p', 'font-sans text-xs text-ink-600 mt-0.5', 'Free and optional — searching works without an account.'));
      bar.appendChild(blurb);
      const opts = el('div', 'shrink-0');
      renderSignInOptions(opts);
      bar.appendChild(opts);
      authSlot.appendChild(bar);
    }
  }

  function signInWithGoogle() {
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + '/research' },
    });
  }

  async function signInWithEmail(email: string) {
    // Passwordless magic link — works for any address, including work
    // emails (police.gov.uk etc.) where personal Google is blocked.
    return supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + '/research' },
    });
  }

  // The two sign-in routes, shown wherever we offer sign-in (the bar above
  // the search box and the Saved-tab pitch). Email link is the primary,
  // password-free route; Google is the alternative. Clicking email expands
  // an inline form in place; submitting shows a "check your inbox" message.
  function renderSignInOptions(container: HTMLElement) {
    const primary = 'font-sans text-sm uppercase tracking-[0.12em] bg-accent text-paper-50 px-5 py-2.5 rounded-md hover:bg-accent-dark transition-colors disabled:opacity-50';
    const secondary = 'font-sans text-sm uppercase tracking-[0.12em] border border-ink-300 text-ink-700 px-5 py-2.5 rounded-md hover:text-ink-900 hover:border-ink-500 transition-colors';
    const textLink = 'font-sans text-xs underline underline-offset-2 text-ink-600 hover:text-accent';

    function showButtons() {
      container.replaceChildren();
      const row = el('div', 'flex flex-col sm:flex-row gap-3');
      const email = el('button', primary, 'Email me a sign-in link') as HTMLButtonElement;
      email.type = 'button';
      email.addEventListener('click', showEmailForm);
      row.appendChild(email);
      const google = el('button', secondary, 'Or use Google') as HTMLButtonElement;
      google.type = 'button';
      google.addEventListener('click', signInWithGoogle);
      row.appendChild(google);
      container.appendChild(row);
      container.appendChild(
        el('p', 'font-sans text-xs text-ink-500 mt-2', 'The email link is password-free and works with any address, including a work one (e.g. police.gov.uk).')
      );
    }

    function showEmailForm() {
      container.replaceChildren();
      const form = el('form', 'flex flex-col sm:flex-row gap-3 max-w-md') as HTMLFormElement;
      const input = el('input', 'flex-1 min-w-0 border border-ink-300 rounded-md px-4 py-2.5 font-sans text-sm text-ink-900 bg-paper-50 focus:outline-none focus:border-accent') as HTMLInputElement;
      input.type = 'email';
      input.autocomplete = 'email';
      input.placeholder = 'you@example.com';
      input.required = true;
      form.appendChild(input);
      const send = el('button', primary, 'Send link') as HTMLButtonElement;
      send.type = 'submit';
      form.appendChild(send);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const address = input.value.trim();
        if (!address) return;
        send.disabled = true;
        const { error } = await signInWithEmail(address);
        container.replaceChildren();
        container.appendChild(
          error
            ? el('p', 'font-sans text-sm text-ink-700', 'That didn’t send — check the address and try again in a minute.')
            : el('p', 'font-sans text-sm text-ink-700', `Sign-in link sent to ${address}. Check your inbox — it expires after one hour.`)
        );
        const again = el('button', `mt-2 ${textLink}`, error ? 'Try again' : 'Use a different email') as HTMLButtonElement;
        again.type = 'button';
        again.addEventListener('click', showEmailForm);
        container.appendChild(again);
      });
      container.appendChild(form);
      const cancel = el('button', `mt-2 ${textLink}`, 'Use Google instead') as HTMLButtonElement;
      cancel.type = 'button';
      cancel.addEventListener('click', showButtons);
      container.appendChild(cancel);
      input.focus();
    }

    showButtons();
  }

  async function toggleSave(w: Work, btn: HTMLButtonElement) {
    if (!user) {
      // Don't silently launch a provider — show the pitch so the reader
      // knows why, and can choose Google or email.
      return promptSignIn('Sign in to save papers — it’s free. Star results and they keep here, sorted into folders with your notes, on any device.');
    }
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
      if (data?.id) saved.set(key, { id: data.id, work: w, note: null, folderId: null });
      notify();
    }
  }

  const hooks: CardHooks = {
    isSaved: (w) => saved.has(workKey(w) || w.title),
    onToggleSave: toggleSave,
  };

  // ---- folders --------------------------------------------------------------
  async function createFolder(name: string) {
    const trimmed = name.trim().slice(0, 80);
    if (!trimmed || !user) return;
    const { data } = await supabase
      .from('folders')
      .insert({ user_id: user.id, name: trimmed })
      .select('id, name')
      .single();
    if (data?.id) {
      folders.push(data);
      activeFolder = data.id;
      notify();
    }
  }

  async function deleteFolder(id: string) {
    folders = folders.filter((f) => f.id !== id);
    for (const row of saved.values()) if (row.folderId === id) row.folderId = null;
    if (activeFolder === id) activeFolder = 'all';
    notify();
    // folder_id on papers clears itself via ON DELETE SET NULL.
    await supabase.from('folders').delete().eq('id', id);
  }

  async function setFolder(row: SavedRow, folderId: string | null) {
    row.folderId = folderId;
    notify();
    await supabase.from('saved_papers').update({ folder_id: folderId }).eq('id', row.id);
  }

  async function setNote(row: SavedRow, note: string) {
    const trimmed = note.trim().slice(0, 2000);
    row.note = trimmed || null;
    notify();
    await supabase.from('saved_papers').update({ note: row.note }).eq('id', row.id);
  }

  function visibleRows(): SavedRow[] {
    const all = [...saved.values()];
    if (activeFolder === 'all') return all;
    if (activeFolder === 'none') return all.filter((r) => !r.folderId);
    return all.filter((r) => r.folderId === activeFolder);
  }

  // ---- export ----------------------------------------------------------------
  function exportButtons() {
    const wrap = el('div', 'flex gap-3 items-center ml-auto');
    const copy = el('button', 'font-sans text-xs underline underline-offset-2 text-ink-600 hover:text-accent', 'Copy references') as HTMLButtonElement;
    copy.type = 'button';
    copy.addEventListener('click', async () => {
      const works = visibleRows().map((r) => r.work);
      if (!works.length) return;
      try {
        await navigator.clipboard.writeText(formatReferenceList(works));
        copy.textContent = 'Copied ✓';
        setTimeout(() => (copy.textContent = 'Copy references'), 1500);
      } catch {
        copy.textContent = 'Copy failed';
      }
    });
    const ris = el('button', 'font-sans text-xs underline underline-offset-2 text-ink-600 hover:text-accent', 'Download .ris') as HTMLButtonElement;
    ris.type = 'button';
    ris.title = 'Opens in Zotero, EndNote or Mendeley';
    ris.addEventListener('click', () => {
      const works = visibleRows().map((r) => r.work);
      if (!works.length) return;
      const blob = new Blob([toRis(works)], { type: 'application/x-research-info-systems' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'saved-papers.ris';
      a.click();
      URL.revokeObjectURL(a.href);
    });
    wrap.appendChild(copy);
    wrap.appendChild(ris);
    return wrap;
  }

  // ---- the Saved view ----------------------------------------------------------
  function folderChip(label: string, value: string, count: number, container: HTMLElement) {
    const active = activeFolder === value;
    const b = el(
      'button',
      `font-sans text-xs px-2.5 py-1 rounded border transition-colors ${
        active
          ? 'bg-ink-900 text-paper-50 border-ink-900'
          : 'bg-paper-200 text-ink-700 border-transparent hover:text-accent'
      }`,
      `${label} (${count})`
    ) as HTMLButtonElement;
    b.type = 'button';
    b.addEventListener('click', () => {
      activeFolder = value;
      renderSavedView(container);
    });
    return b;
  }

  function newFolderControl(container: HTMLElement) {
    const wrap = el('span', 'inline-flex items-center');
    const btn = el('button', 'font-sans text-xs px-2.5 py-1 text-ink-600 underline underline-offset-2 hover:text-accent', '+ New folder') as HTMLButtonElement;
    btn.type = 'button';
    btn.addEventListener('click', () => {
      wrap.replaceChildren();
      const input = el('input', 'font-sans text-xs border border-ink-300 rounded px-2 py-1 bg-paper-50 focus:outline-none focus:border-accent') as HTMLInputElement;
      input.placeholder = 'e.g. Hot spots evidence';
      input.maxLength = 80;
      input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          await createFolder(input.value);
          renderSavedView(container);
        }
        if (e.key === 'Escape') renderSavedView(container);
      });
      input.addEventListener('blur', () => {
        if (!input.value.trim()) renderSavedView(container);
      });
      wrap.appendChild(input);
      input.focus();
    });
    wrap.appendChild(btn);
    return wrap;
  }

  function cardControls(row: SavedRow, container: HTMLElement) {
    const wrap = el('div', 'mt-3 flex flex-wrap gap-x-5 gap-y-2 items-start font-sans text-xs text-ink-600');

    // Folder assignment.
    const select = el('select', 'border border-ink-300 rounded px-1.5 py-1 bg-paper-50 focus:outline-none focus:border-accent') as HTMLSelectElement;
    const none = el('option', '', 'No folder') as HTMLOptionElement;
    none.value = '';
    select.appendChild(none);
    for (const f of folders) {
      const o = el('option', '', f.name) as HTMLOptionElement;
      o.value = f.id;
      select.appendChild(o);
    }
    select.value = row.folderId ?? '';
    select.addEventListener('change', async () => {
      await setFolder(row, select.value || null);
      renderSavedView(container);
    });
    const folderLabel = el('label', 'flex items-center gap-1.5');
    folderLabel.appendChild(document.createTextNode('Folder'));
    folderLabel.appendChild(select);
    wrap.appendChild(folderLabel);

    // Note.
    const noteArea = el('div', 'flex-1 min-w-[12rem]');
    function showNote() {
      noteArea.replaceChildren();
      if (row.note) {
        const p = el('p', 'font-serif text-sm italic text-ink-700 leading-relaxed', row.note);
        noteArea.appendChild(p);
      }
      const edit = el('button', 'underline underline-offset-2 hover:text-accent', row.note ? 'Edit note' : 'Add note') as HTMLButtonElement;
      edit.type = 'button';
      edit.addEventListener('click', () => {
        noteArea.replaceChildren();
        const ta = el('textarea', 'w-full border border-ink-300 rounded px-2 py-1.5 font-serif text-sm bg-paper-50 focus:outline-none focus:border-accent') as HTMLTextAreaElement;
        ta.rows = 2;
        ta.maxLength = 2000;
        ta.placeholder = 'Why you saved this — what it answers, what to check…';
        ta.value = row.note ?? '';
        ta.addEventListener('blur', async () => {
          await setNote(row, ta.value);
          showNote();
        });
        ta.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') showNote();
        });
        noteArea.appendChild(ta);
        ta.focus();
      });
      noteArea.appendChild(edit);
    }
    showNote();
    wrap.appendChild(noteArea);
    return wrap;
  }

  function renderSavedView(container: HTMLElement) {
    container.replaceChildren();
    if (saved.size === 0) {
      container.appendChild(
        el('p', 'font-sans text-sm text-ink-600 py-6', 'Nothing saved yet. Star a result and it will keep here, on any device you sign in on.')
      );
      return;
    }

    // Folder chips + export controls.
    const bar = el('div', 'flex flex-wrap gap-2 items-center py-4 border-b border-ink-200');
    const all = [...saved.values()];
    bar.appendChild(folderChip('All', 'all', all.length, container));
    for (const f of folders) {
      const chip = folderChip(f.name, f.id, all.filter((r) => r.folderId === f.id).length, container);
      bar.appendChild(chip);
      if (activeFolder === f.id) {
        const x = el('button', 'font-sans text-xs text-ink-500 hover:text-accent -ml-1', '×') as HTMLButtonElement;
        x.type = 'button';
        x.title = `Delete folder "${f.name}" (papers stay saved)`;
        x.addEventListener('click', async () => {
          if (confirm(`Delete the folder "${f.name}"? The papers stay saved, just unsorted.`)) {
            await deleteFolder(f.id);
            renderSavedView(container);
          }
        });
        bar.appendChild(x);
      }
    }
    const unsorted = all.filter((r) => !r.folderId).length;
    if (folders.length && unsorted) bar.appendChild(folderChip('Unsorted', 'none', unsorted, container));
    bar.appendChild(newFolderControl(container));
    bar.appendChild(exportButtons());
    container.appendChild(bar);

    const rows = visibleRows();
    if (rows.length === 0) {
      container.appendChild(el('p', 'font-sans text-sm text-ink-600 py-6', 'Nothing in this folder yet — move a paper here with its "Folder" control.'));
      return;
    }
    for (const row of rows) {
      const c = card(row.work, hooks);
      c.appendChild(cardControls(row, container));
      container.appendChild(c);
    }
  }

  // Shown when the Saved tab is opened signed out — the nudge. Inviting,
  // not pushy: the benefits, then both sign-in routes (Google for speed,
  // email magic link for work machines where personal Google is blocked).
  function renderSignedOutView(container: HTMLElement) {
    container.replaceChildren();
    const box = el('div', 'py-8 max-w-xl');

    // A contextual banner when the reader arrived here by trying to save.
    if (signInPrompt) {
      box.appendChild(
        el('p', 'mb-5 px-4 py-3 rounded-md bg-paper-200 border-l-2 border-accent font-sans text-sm text-ink-800', signInPrompt)
      );
      signInPrompt = null;
    }

    box.appendChild(el('h2', 'font-sans font-medium text-lg text-ink-900', 'Sign in to save your research'));
    box.appendChild(
      el('p', 'font-serif text-ink-700 leading-relaxed mt-3', 'Save starred papers as you go, organise them into folders for each project, add notes, and export as a reference list when you write up. Free, and entirely optional — search works without an account.')
    );

    const ul = el('ul', 'mt-4 space-y-2 font-sans text-sm text-ink-700');
    for (const line of [
      'Your saved papers on any device you sign in on',
      'Folders to organise by research aim or report',
      'Export as formatted references or .ris for Zotero / EndNote',
    ]) {
      const li = el('li', 'flex gap-2');
      li.appendChild(el('span', 'text-accent', '✓'));
      li.appendChild(el('span', '', line));
      ul.appendChild(li);
    }
    box.appendChild(ul);

    // Both sign-in routes, shared with the bar above the search box.
    const options = el('div', 'mt-6');
    renderSignInOptions(options);
    box.appendChild(options);
    container.appendChild(box);
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
    renderSignedOutView,
    count: () => saved.size,
    signedIn: () => Boolean(user),
    onChange: (fn) => listeners.push(fn),
  };
}
