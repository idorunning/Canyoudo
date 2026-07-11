// Header account controller. Drives the single account control in the header
// (see src/components/AccountBar.astro) and the panel it opens.
//
// Two states off one Supabase session:
//   • Signed OUT → red status dot, "Sign in" label. The panel shows the
//     sign-in / create-account form (initPasswordAuth). One sign-in here is the
//     site-wide sign-in: every gated page and tool reads the same session, so
//     nothing else needs its own login.
//   • Signed IN  → green status dot, the reader's name. The panel becomes
//     Account Settings: personal details, the email-updates toggle, a library
//     manager, a privacy note, delete-account, and sign out.
//
// Runs its own Supabase client, same pattern as src/scripts/members/gate.ts and
// src/scripts/research/saved.ts — several independent listeners on the same
// underlying session are normal here.
//
// Sign OUT reloads the page: the cleanest guarantee that every gated page,
// the library and any in-memory state reset to the logged-out view, rather
// than relying on cross-instance session propagation within the tab.
//
// Time-of-day greeting uses the reader's IP-derived timezone
// (netlify/edge-functions/geo.ts), falling back to the browser's own zone.
// New-account detection (for the welcome modal) only fires on a genuine
// 'SIGNED_IN' event, never the initial session restore on load.

interface ReaderProfile {
  name: string | null;
  role: string | null;
  location: string | null;
  interest: string | null;
  subscribed: boolean | null;
}

const GEO_CACHE_KEY = 'tap:geo';
const WELCOMED_PREFIX = 'tap:welcomed:';

function timeOfDayGreeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

async function resolveTimezone(): Promise<string> {
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    const cached = sessionStorage.getItem(GEO_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed?.timezone) return parsed.timezone;
    }
  } catch {}

  try {
    const res = await fetch('/api/geo');
    if (res.ok) {
      const geo = await res.json();
      try {
        sessionStorage.setItem(GEO_CACHE_KEY, JSON.stringify(geo));
      } catch {}
      if (geo?.timezone) return geo.timezone;
    }
  } catch {
    // Offline, or the edge function isn't available — browser tz is a fine fallback.
  }
  return browserTz;
}

function greetingLine(name: string | null, timezone: string): string {
  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: 'numeric', hour12: false }).format(now)
  );
  const salutation = timeOfDayGreeting(hour);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);
  const who = name ? `, ${name}` : '';
  return `${salutation}${who}. It is currently ${time}.`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

export async function initHeaderAccount(): Promise<void> {
  const toggles = document.querySelectorAll<HTMLButtonElement>('[data-account-toggle]');
  if (!toggles.length) return; // no auth configured — AccountBar rendered nothing

  const panel = document.getElementById('tap-account-panel');
  const closeBtn = panel?.querySelector<HTMLButtonElement>('[data-account-close]');
  const signedOutRegion = panel?.querySelector<HTMLElement>('[data-account-signedout]');
  const signedInRegion = panel?.querySelector<HTMLElement>('[data-account-signedin]');
  const signInSlot = panel?.querySelector<HTMLElement>('[data-account-signin-slot]');
  const headingEl = panel?.querySelector<HTMLElement>('[data-account-heading]');

  const form = panel?.querySelector<HTMLFormElement>('[data-account-form]');
  const savedNote = panel?.querySelector<HTMLElement>('[data-account-saved]');
  const subscribeBox = panel?.querySelector<HTMLInputElement>('[data-account-subscribe]');
  const subscribeNote = panel?.querySelector<HTMLElement>('[data-account-subscribe-note]');
  const libraryList = panel?.querySelector<HTMLElement>('[data-account-library-list]');
  const libraryEmpty = panel?.querySelector<HTMLElement>('[data-account-library-empty]');
  const libraryClear = panel?.querySelector<HTMLButtonElement>('[data-account-library-clear]');
  const deleteBtn = panel?.querySelector<HTMLButtonElement>('[data-account-delete]');
  const deleteNote = panel?.querySelector<HTMLElement>('[data-account-delete-note]');
  const signOutBtn = panel?.querySelector<HTMLButtonElement>('[data-account-signout]');

  const dotEls = document.querySelectorAll<HTMLElement>('[data-account-dot]');
  const labelEls = document.querySelectorAll<HTMLElement>('[data-account-label]');

  const welcomeModal = document.getElementById('tap-welcome-modal');
  const welcomeClose = welcomeModal?.querySelector<HTMLButtonElement>('[data-welcome-close]');

  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return;

  let supabase: any;
  try {
    const { createClient } = await import('@supabase/supabase-js');
    supabase = createClient(url, key);
  } catch {
    return;
  }

  let timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let profile: ReaderProfile = { name: null, role: null, location: null, interest: null, subscribed: null };
  let clockTimer: ReturnType<typeof setInterval> | undefined;
  let signedIn = false;
  let signInMounted = false;

  // ------------------------------------------------------------ status control
  function setStatus(isIn: boolean) {
    signedIn = isIn;
    if (isIn) document.documentElement.setAttribute('data-tap-authed', '');
    else document.documentElement.removeAttribute('data-tap-authed');

    dotEls.forEach((el) => {
      el.className = isIn
        ? 'w-2.5 h-2.5 rounded-full bg-green-500 shrink-0 ring-2 ring-green-500/20'
        : 'w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 ring-2 ring-red-500/20';
    });
    labelEls.forEach((el) => {
      el.textContent = isIn ? profile.name || 'Account' : 'Sign in';
    });
  }

  function renderHeading() {
    if (!headingEl) return;
    headingEl.textContent = signedIn ? greetingLine(profile.name, timezone) : 'Sign in';
  }

  // ------------------------------------------------------------- panel open/close
  function showRegions() {
    if (signedOutRegion) signedOutRegion.hidden = signedIn;
    if (signedInRegion) signedInRegion.hidden = !signedIn;
  }

  function openPanel() {
    if (!panel) return;
    showRegions();
    if (!signedIn && !signInMounted && signInSlot) {
      signInMounted = true;
      import('../auth/password-auth').then(({ initPasswordAuth }) => {
        initPasswordAuth(supabase, signInSlot);
      });
    }
    if (signedIn) renderLibrary();
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    toggles.forEach((t) => t.setAttribute('aria-expanded', 'true'));
  }
  function closePanel() {
    if (!panel) return;
    panel.classList.add('hidden');
    panel.setAttribute('aria-hidden', 'true');
    toggles.forEach((t) => t.setAttribute('aria-expanded', 'false'));
  }

  toggles.forEach((t) =>
    t.addEventListener('click', () => (panel?.classList.contains('hidden') ? openPanel() : closePanel()))
  );
  closeBtn?.addEventListener('click', closePanel);
  panel?.addEventListener('click', (e) => {
    if (e.target === panel) closePanel();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel?.classList.contains('hidden')) closePanel();
  });

  // -------------------------------------------------------------- details form
  function fillForm() {
    if (!form) return;
    (form.elements.namedItem('name') as HTMLInputElement).value = profile.name ?? '';
    (form.elements.namedItem('role') as HTMLInputElement).value = profile.role ?? '';
    (form.elements.namedItem('interest') as HTMLInputElement).value = profile.interest ?? '';
    const locationInput = form.elements.namedItem('location') as HTMLInputElement;
    if (profile.location) {
      locationInput.value = profile.location;
    } else {
      try {
        const cached = JSON.parse(sessionStorage.getItem(GEO_CACHE_KEY) || 'null');
        if (cached?.city) locationInput.placeholder = [cached.city, cached.country].filter(Boolean).join(', ');
      } catch {}
    }
    if (subscribeBox) subscribeBox.checked = Boolean(profile.subscribed);
  }

  async function loadProfile(userId: string) {
    try {
      const { data } = await supabase
        .from('reader_profiles')
        .select('name, role, location, interest, subscribed')
        .eq('user_id', userId)
        .maybeSingle();
      if (data) profile = { ...profile, ...data };
    } catch {
      // Table not migrated yet, or offline — the greeting still works name-less.
    }
    setStatus(true);
    renderHeading();
    fillForm();
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { data } = await supabase.auth.getSession();
    const userId = data?.session?.user?.id;
    if (!userId) return;
    const fd = new FormData(form);
    const next = {
      name: String(fd.get('name') || '').trim() || null,
      role: String(fd.get('role') || '').trim() || null,
      location: String(fd.get('location') || '').trim() || null,
      interest: String(fd.get('interest') || '').trim() || null,
    };
    try {
      await supabase.from('reader_profiles').upsert({
        user_id: userId,
        ...next,
        updated_at: new Date().toISOString(),
      });
      profile = { ...profile, ...next };
      setStatus(true);
      renderHeading();
      if (savedNote) {
        savedNote.classList.remove('hidden');
        setTimeout(() => savedNote.classList.add('hidden'), 2000);
      }
    } catch {
      // Best-effort — a reader who can't save just keeps the panel open.
    }
  });

  // --------------------------------------------------------- email-updates toggle
  subscribeBox?.addEventListener('change', async () => {
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;
    if (!user) return;
    const want = subscribeBox.checked;
    subscribeBox.disabled = true;
    try {
      await supabase.from('reader_profiles').upsert({
        user_id: user.id,
        subscribed: want,
        updated_at: new Date().toISOString(),
      });
    } catch {}
    try {
      await fetch('/api/mailerlite-subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: user.email, subscribe: want }),
      });
    } catch {}
    profile.subscribed = want;
    subscribeBox.disabled = false;
    if (subscribeNote) {
      subscribeNote.textContent = want
        ? "You're subscribed — new articles will come by email."
        : "Unsubscribed — you won't get article emails.";
      subscribeNote.classList.remove('hidden');
      setTimeout(() => subscribeNote.classList.add('hidden'), 3000);
    }
  });

  // ---------------------------------------------------------- library manager
  let libraryApi: typeof import('../library') | null = null;
  async function getLibrary() {
    if (!libraryApi) libraryApi = await import('../library');
    return libraryApi;
  }

  async function renderLibrary() {
    if (!libraryList || !libraryEmpty) return;
    const { listSaved, removeArticle } = await getLibrary();
    const { items } = await listSaved();
    libraryList.replaceChildren();
    libraryEmpty.hidden = items.length > 0;
    if (libraryClear) libraryClear.hidden = items.length === 0;
    for (const a of items.slice(0, 8)) {
      const li = document.createElement('li');
      li.className = 'flex items-start justify-between gap-3';

      const link = document.createElement('a');
      link.href = `/${a.section}/${a.slug}/`;
      link.className = 'group min-w-0 block';
      const h = document.createElement('span');
      h.className = 'block font-sans text-[13px] font-semibold text-ink-800 group-hover:text-accent transition-colors truncate';
      h.textContent = a.title;
      const meta = document.createElement('span');
      meta.className = 'block font-mono text-[10px] uppercase tracking-[0.08em] text-ink-400';
      meta.textContent = `Saved ${fmtDate(a.savedAt)}`;
      link.appendChild(h);
      link.appendChild(meta);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'shrink-0 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-400 hover:text-accent-dark transition-colors';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove "${a.title}" from your library`);
      remove.addEventListener('click', async () => {
        await removeArticle(a.slug);
      });

      li.appendChild(link);
      li.appendChild(remove);
      libraryList.appendChild(li);
    }
    if (items.length > 8) {
      const more = document.createElement('li');
      more.className = 'font-sans text-[11px] text-ink-400 pt-1';
      more.textContent = `+${items.length - 8} more in your full library`;
      libraryList.appendChild(more);
    }
  }

  libraryClear?.addEventListener('click', async () => {
    if (libraryClear.dataset.armed !== '1') {
      libraryClear.dataset.armed = '1';
      libraryClear.textContent = 'Tap again to clear';
      setTimeout(() => {
        if (libraryClear.dataset.armed === '1') {
          libraryClear.dataset.armed = '';
          libraryClear.textContent = 'Clear all';
        }
      }, 4000);
      return;
    }
    libraryClear.dataset.armed = '';
    libraryClear.textContent = 'Clear all';
    const { clearAll } = await getLibrary();
    await clearAll();
  });

  // Keep the panel's library list live as saves change elsewhere on the page.
  getLibrary().then(({ onLibraryChange }) => onLibraryChange(() => renderLibrary()));

  // ---------------------------------------------------------- delete account
  deleteBtn?.addEventListener('click', async () => {
    if (deleteBtn.dataset.armed !== '1') {
      deleteBtn.dataset.armed = '1';
      deleteBtn.textContent = 'Tap again to permanently delete';
      setTimeout(() => {
        if (deleteBtn.dataset.armed === '1') {
          deleteBtn.dataset.armed = '';
          deleteBtn.textContent = 'Delete account';
        }
      }, 5000);
      return;
    }
    deleteBtn.dataset.armed = '';
    deleteBtn.textContent = 'Deleting…';
    deleteBtn.disabled = true;
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) {
      deleteBtn.disabled = false;
      deleteBtn.textContent = 'Delete account';
      if (deleteNote) {
        deleteNote.textContent = 'Please sign in again first.';
        deleteNote.classList.remove('hidden');
      }
      return;
    }
    try {
      const res = await fetch('/api/delete-account', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('delete failed');
      try {
        await supabase.auth.signOut();
      } catch {}
      location.href = '/';
    } catch {
      deleteBtn.disabled = false;
      deleteBtn.textContent = 'Delete account';
      if (deleteNote) {
        deleteNote.textContent = 'Could not delete right now — try again in a moment.';
        deleteNote.classList.remove('hidden');
      }
    }
  });

  // ---------------------------------------------------------------- sign out
  signOutBtn?.addEventListener('click', async () => {
    signOutBtn.disabled = true;
    try {
      await supabase.auth.signOut();
    } catch {}
    // Full reload: guarantees every gated page and in-memory view resets to the
    // signed-out state, rather than relying on in-tab session propagation.
    location.reload();
  });

  // ---------------------------------------------------------- welcome modal
  function isNewAccount(user: any): boolean {
    const created = user?.created_at ? new Date(user.created_at).getTime() : NaN;
    const lastSignIn = user?.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : created;
    return Number.isFinite(created) && Math.abs(lastSignIn - created) < 10_000;
  }

  function maybeShowWelcome(user: any) {
    if (!welcomeModal || !user?.id) return;
    const flag = WELCOMED_PREFIX + user.id;
    try {
      if (localStorage.getItem(flag)) return;
    } catch {}
    if (!isNewAccount(user)) return;
    welcomeModal.classList.remove('hidden');
    welcomeModal.setAttribute('aria-hidden', 'false');
    try {
      localStorage.setItem(flag, '1');
    } catch {}
  }

  welcomeClose?.addEventListener('click', () => {
    welcomeModal?.classList.add('hidden');
    welcomeModal?.setAttribute('aria-hidden', 'true');
  });

  // ------------------------------------------------------------- state wiring
  async function onSignedIn(user: any) {
    setStatus(true);
    showRegions();
    if (!clockTimer) {
      timezone = await resolveTimezone();
      renderHeading();
      clockTimer = setInterval(renderHeading, 30_000);
    }
    await loadProfile(user.id);
    showRegions();
  }

  function onSignedOut() {
    setStatus(false);
    showRegions();
    if (clockTimer) {
      clearInterval(clockTimer);
      clockTimer = undefined;
    }
  }

  // Initial paint: default to signed-out unless the session says otherwise.
  setStatus(false);
  showRegions();

  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.user) await onSignedIn(data.session.user);
    else onSignedOut();
  } catch {
    onSignedOut();
  }

  supabase.auth.onAuthStateChange(async (event: string, session: any) => {
    if (session?.user) {
      await onSignedIn(session.user);
      if (event === 'SIGNED_IN') maybeShowWelcome(session.user);
    } else {
      onSignedOut();
    }
  });

  // Listen for storage changes (e.g., sign-in from another Supabase client
  // instance or tab). This ensures the header stays in sync with the gate.
  window.addEventListener('storage', async (e) => {
    if (e.key?.includes('auth-token') || e.key?.includes('auth-expires')) {
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.user) {
          await onSignedIn(data.session.user);
        } else {
          onSignedOut();
        }
      } catch {}
    }
  });
}
