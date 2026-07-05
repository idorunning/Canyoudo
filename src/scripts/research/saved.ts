// Google sign-in + the saved-research workspace, backed by Supabase. Loaded
// only when the PUBLIC_SUPABASE_* env vars were present at build time;
// supabase-js itself is imported dynamically so readers who never sign in
// don't download it.
//
// The saved_papers, folders and paper_folders tables are owner-only via
// row-level security (see docs/google-login-setup.md). metadata holds the
// full Work object so saved cards render identically without re-querying any
// catalogue. Folders are the reader's "research aims": membership lives in
// the paper_folders junction table, so one paper can sit in several. Until
// that table's migration has been run, the code quietly falls back to the
// legacy single-folder column so nothing breaks mid-upgrade.

import { card, el, setStar, workKey, type Work, type CardHooks } from './cards';
import { formatReferenceList, formatReference, toRis } from '../../lib/reference-format.mjs';
import { maybeSubscribeOnSignIn, setSubscribePreference } from '../../lib/mailerlite-subscribe';

type SupabaseClient = any;

interface SavedRow {
  id: string;
  work: Work;
  note: string | null;
  folderIds: string[];
}

interface Folder {
  id: string;
  name: string;
}

export interface SavedStore {
  hooks: CardHooks;
  renderSavedView: (container: HTMLElement) => void;
  renderSignedOutView: (container: HTMLElement) => void;
  /** Mount the two sign-in routes (email link + Google) into a container. */
  renderSignInOptions: (container: HTMLElement) => void;
  count: () => number;
  signedIn: () => boolean;
  /** The signed-in Supabase user, or null. */
  currentUser: () => any;
  /** The shared Supabase client (reused by the briefings store). */
  supabase: any;
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
  // Free-text filter over the saved set (title/authors/venue/year/note).
  let savedQuery = '';
  // True once the paper_folders junction table answered a query — false means
  // the migration hasn't run yet and we use the legacy folder_id column.
  let hasJunction = false;
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
    const [papers, dirs, links] = await Promise.all([
      supabase
        .from('saved_papers')
        .select('id, doi, url, note, folder_id, metadata')
        .order('created_at', { ascending: false }),
      supabase.from('folders').select('id, name').order('created_at', { ascending: true }),
      supabase.from('paper_folders').select('paper_id, folder_id'),
    ]);
    // Multi-folder membership from the junction table; if its migration
    // hasn't run yet the query errors and the legacy column stands in.
    hasJunction = !links.error;
    const memberships = new Map<string, string[]>();
    for (const l of links.data ?? []) {
      if (!l?.paper_id || !l?.folder_id) continue;
      const list = memberships.get(l.paper_id) ?? [];
      list.push(l.folder_id);
      memberships.set(l.paper_id, list);
    }
    for (const row of papers.data ?? []) {
      const work = row.metadata as Work;
      const key = row.doi || row.url || workKey(work);
      if (key && work?.title) {
        const folderIds = hasJunction
          ? memberships.get(row.id) ?? []
          : row.folder_id
            ? [row.folder_id]
            : [];
        saved.set(key, { id: row.id, work, note: row.note ?? null, folderIds });
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

  // Defaults to on; the checkbox in subscribeToggle() below (rendered inside
  // renderSignInOptions) lets the reader opt out before either route fires.
  let subscribeToEmails = true;

  function signInWithGoogle() {
    setSubscribePreference(subscribeToEmails);
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + '/research' },
    });
  }

  async function signInWithEmail(email: string) {
    // Passwordless magic link — works for any address, including work
    // emails (police.gov.uk etc.) where personal Google is blocked.
    setSubscribePreference(subscribeToEmails);
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

    function subscribeToggle(): HTMLElement {
      const wrap = el('div', 'mt-3 max-w-md');
      wrap.appendChild(
        el(
          'p',
          'font-sans text-xs text-ink-500',
          'Signing in also adds you to the email list — occasional updates about new articles and research relevant to this site. Nothing else, and your data is never shared.'
        )
      );
      const label = el('label', 'flex items-center gap-2 font-sans text-xs text-ink-600 mt-1 cursor-pointer');
      const box = el('input', '') as HTMLInputElement;
      box.type = 'checkbox';
      box.checked = !subscribeToEmails;
      box.addEventListener('change', () => {
        subscribeToEmails = !box.checked;
      });
      label.appendChild(box);
      label.appendChild(el('span', '', 'Don’t add me to the list — just sign me in'));
      wrap.appendChild(label);
      return wrap;
    }

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
      container.appendChild(subscribeToggle());
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
      container.appendChild(subscribeToggle());
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
      if (data?.id) saved.set(key, { id: data.id, work: w, note: null, folderIds: [] });
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
    for (const row of saved.values()) row.folderIds = row.folderIds.filter((f) => f !== id);
    if (activeFolder === id) activeFolder = 'all';
    notify();
    // Junction rows cascade with the folder; the legacy folder_id column
    // clears itself via ON DELETE SET NULL.
    await supabase.from('folders').delete().eq('id', id);
  }

  // Membership toggles. With the junction table a paper can sit in several
  // folders; pre-migration the legacy column gives single-folder semantics
  // (adding to one folder moves it there).
  async function addToFolder(row: SavedRow, folderId: string) {
    if (row.folderIds.includes(folderId)) return;
    row.folderIds = hasJunction ? [...row.folderIds, folderId] : [folderId];
    notify();
    if (hasJunction) {
      await supabase
        .from('paper_folders')
        .insert({ paper_id: row.id, folder_id: folderId, user_id: user.id });
    } else {
      await supabase.from('saved_papers').update({ folder_id: folderId }).eq('id', row.id);
    }
  }

  async function removeFromFolder(row: SavedRow, folderId: string) {
    row.folderIds = row.folderIds.filter((f) => f !== folderId);
    notify();
    if (hasJunction) {
      await supabase.from('paper_folders').delete().eq('paper_id', row.id).eq('folder_id', folderId);
    } else {
      await supabase.from('saved_papers').update({ folder_id: null }).eq('id', row.id);
    }
  }

  async function setNote(row: SavedRow, note: string) {
    const trimmed = note.trim().slice(0, 2000);
    row.note = trimmed || null;
    notify();
    await supabase.from('saved_papers').update({ note: row.note }).eq('id', row.id);
  }

  function visibleRows(): SavedRow[] {
    let rows = [...saved.values()];
    if (activeFolder === 'none') rows = rows.filter((r) => r.folderIds.length === 0);
    else if (activeFolder !== 'all') rows = rows.filter((r) => r.folderIds.includes(activeFolder));
    const q = savedQuery.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => {
        const hay = `${r.work.title} ${(r.work.authors ?? []).join(' ')} ${r.work.venue ?? ''} ${r.work.year ?? ''} ${r.note ?? ''}`;
        return hay.toLowerCase().includes(q);
      });
    }
    return rows;
  }

  // ---- export ----------------------------------------------------------------

  // "Evidence brief": the assistant turns the visible papers (≤15) into a
  // structured, citation-marked brief; the reference list is assembled HERE
  // from the real saved records, never by the model, and the result downloads
  // as Markdown. Failures reset the button — never the saved view.
  const BRIEF_MAX = 15;
  function briefButton() {
    const btn = el('button', 'font-sans text-xs underline underline-offset-2 text-ink-600 hover:text-accent', 'Evidence brief') as HTMLButtonElement;
    btn.type = 'button';
    btn.title = 'Synthesise the papers shown into a short cited brief (Markdown download)';
    btn.addEventListener('click', async () => {
      const rows = visibleRows().slice(0, BRIEF_MAX);
      if (!rows.length || btn.disabled) return;
      const topic = folders.find((f) => f.id === activeFolder)?.name ?? 'Saved papers';
      btn.disabled = true;
      btn.textContent = 'Writing brief…';
      const reset = (label: string) => {
        btn.textContent = label;
        setTimeout(() => {
          btn.textContent = 'Evidence brief';
          btn.disabled = false;
        }, 2500);
      };
      let data: { brief: string; used: number[]; caveat: string } | null = null;
      let serverMessage: string | null = null;
      try {
        const res = await fetch('/api/research-assist', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            mode: 'brief',
            topic,
            items: rows.map((r) => ({
              title: r.work.title,
              authors: r.work.authors,
              year: r.work.year,
              venue: r.work.venue,
              abstract: r.work.tldr || r.work.abstract || '',
              note: r.note,
            })),
          }),
        });
        const body = await res.json().catch(() => null);
        if (res.ok && typeof body?.brief === 'string' && Array.isArray(body?.used)) data = body;
        else if (res.status === 503 && typeof body?.error === 'string') serverMessage = body.error;
      } catch {}
      if (!data) {
        return reset(serverMessage ? 'Over budget this month' : 'Brief failed — try again');
      }
      const refs = data.used
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= rows.length)
        .sort((a, b) => a - b)
        .map((n) => `[${n}] ${formatReference(rows[n - 1].work)}`)
        .join('\n\n');
      const md = `# Evidence brief — ${topic}\n\n${data.brief}\n\n> ${data.caveat}\n\n## References\n\n${refs}\n`;
      const blob = new Blob([md], { type: 'text/markdown' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `evidence-brief-${topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'saved'}.md`;
      a.click();
      URL.revokeObjectURL(a.href);
      reset('Downloaded ✓');
    });
    return btn;
  }

  function exportButtons() {
    const wrap = el('div', 'flex gap-3 items-center ml-auto');
    wrap.appendChild(briefButton());
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

    // Folder membership: a checkbox popover, since a paper can sit in several
    // folders at once. The summary shows current membership at a glance.
    const details = el('details', 'relative') as HTMLDetailsElement;
    const summaryLabel = () => {
      const names = folders.filter((f) => row.folderIds.includes(f.id)).map((f) => f.name);
      if (names.length === 0) return 'Folders ▾';
      if (names.length <= 2) return `${names.join(', ')} ▾`;
      return `${names[0]} +${names.length - 1} ▾`;
    };
    const summary = el('summary', 'cursor-pointer list-none border border-ink-300 rounded px-2 py-1 bg-paper-50 hover:border-ink-500 select-none', summaryLabel());
    details.appendChild(summary);
    const panel = el('div', 'absolute z-10 mt-1 min-w-[12rem] max-w-xs rounded-md border border-ink-200 bg-paper-50 shadow-lg p-2 space-y-1');
    if (folders.length === 0) {
      panel.appendChild(el('p', 'text-ink-500 px-1 py-0.5', 'No folders yet — create one below the chips.'));
    }
    for (const f of folders) {
      const label = el('label', 'flex items-center gap-2 px-1 py-0.5 rounded cursor-pointer hover:bg-paper-200');
      const box = el('input', 'accent-accent') as HTMLInputElement;
      box.type = 'checkbox';
      box.checked = row.folderIds.includes(f.id);
      box.addEventListener('change', async () => {
        if (box.checked) await addToFolder(row, f.id);
        else await removeFromFolder(row, f.id);
        summary.textContent = summaryLabel();
        // Membership changed under a folder filter → the row may leave the
        // view; re-render then. Under "All" the popover can stay open for
        // ticking several folders in one go.
        if (activeFolder !== 'all') renderSavedView(container);
      });
      label.appendChild(box);
      label.appendChild(el('span', 'truncate', f.name));
      panel.appendChild(label);
    }
    details.appendChild(panel);
    wrap.appendChild(details);

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
      const chip = folderChip(f.name, f.id, all.filter((r) => r.folderIds.includes(f.id)).length, container);
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
    const unsorted = all.filter((r) => r.folderIds.length === 0).length;
    if (folders.length && unsorted) bar.appendChild(folderChip('Unsorted', 'none', unsorted, container));
    bar.appendChild(newFolderControl(container));
    bar.appendChild(exportButtons());
    container.appendChild(bar);

    // Search within saved — pure client-side filter; only the rows re-render
    // per keystroke, so the input keeps focus.
    const searchWrap = el('div', 'pt-3');
    const searchInput = el('input', 'w-full max-w-xs border border-ink-300 rounded px-3 py-1.5 font-sans text-sm bg-paper-50 focus:outline-none focus:border-accent') as HTMLInputElement;
    searchInput.type = 'search';
    searchInput.placeholder = 'Search your saved papers…';
    searchInput.value = savedQuery;
    searchWrap.appendChild(searchInput);
    container.appendChild(searchWrap);

    const rowsBox = el('div', '');
    container.appendChild(rowsBox);

    function renderRows() {
      rowsBox.replaceChildren();
      const rows = visibleRows();
      if (rows.length === 0) {
        rowsBox.appendChild(
          el(
            'p',
            'font-sans text-sm text-ink-600 py-6',
            savedQuery.trim()
              ? 'No saved papers match that search.'
              : 'Nothing in this folder yet — tick it in a paper’s "Folders" control.'
          )
        );
        return;
      }
      for (const row of rows) {
        const c = card(row.work, hooks);
        c.appendChild(cardControls(row, container));
        rowsBox.appendChild(c);
      }
    }
    searchInput.addEventListener('input', () => {
      savedQuery = searchInput.value;
      renderRows();
    });
    renderRows();
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
      'Folders to organise by research aim — papers can sit in several',
      'One-click evidence brief: a cited synthesis of a folder, as Markdown',
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
    maybeSubscribeOnSignIn(_event, session?.user?.email);
  });

  return {
    hooks,
    renderSavedView,
    renderSignedOutView,
    renderSignInOptions,
    count: () => saved.size,
    signedIn: () => Boolean(user),
    currentUser: () => user,
    supabase,
    onChange: (fn) => listeners.push(fn),
  };
}
