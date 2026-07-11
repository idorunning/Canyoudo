// Header account controller: the signed-in marker, the personalised greeting
// ("Good morning, Nathan. It is currently …") and the account panel where a
// reader can set their name, role, location and area of interest — all
// optional. Runs its own Supabase client, same pattern as
// src/scripts/members/gate.ts and src/scripts/research/saved.ts: several
// independent listeners on the same underlying session are normal here.
//
// Time-of-day and "it is currently …" use the reader's IP-derived timezone
// (netlify/edge-functions/geo.ts — Netlify's own edge geolocation, no
// third-party call) rather than the browser's clock/zone, falling back to the
// browser's own timezone if that lookup fails. Fetched once per browser
// session and cached in sessionStorage.
//
// New-account detection (for the welcome modal) mirrors maybeSubscribeOnSignIn
// in src/lib/mailerlite-subscribe.ts: only a genuine 'SIGNED_IN' event counts,
// never the initial session restore on page load. A Supabase user's
// created_at and last_sign_in_at land within a second or two of each other on
// the very first sign-in, then diverge on every return visit — that gap is
// the signal.

interface ReaderProfile {
  name: string | null;
  role: string | null;
  location: string | null;
  interest: string | null;
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
    // Offline, or the edge function isn't available in this environment —
    // the browser's own timezone is a fine fallback.
  }
  return browserTz;
}

function formatGreeting(name: string | null, timezone: string): { short: string; full: string } {
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
  return {
    short: name ? `Hi, ${name}` : 'Signed in',
    full: `${salutation}${who}. It is currently ${time}.`,
  };
}

export async function initHeaderAccount(): Promise<void> {
  const toggles = document.querySelectorAll<HTMLButtonElement>('[data-account-toggle]');
  if (!toggles.length) return; // no auth configured — AccountBar rendered nothing

  const panel = document.getElementById('tap-account-panel');
  const closeBtn = panel?.querySelector<HTMLButtonElement>('[data-account-close]');
  const signOutBtn = panel?.querySelector<HTMLButtonElement>('[data-account-signout]');
  const form = panel?.querySelector<HTMLFormElement>('[data-account-form]');
  const savedNote = panel?.querySelector<HTMLElement>('[data-account-saved]');
  const greetingFullEls = document.querySelectorAll<HTMLElement>('[data-account-greeting-full]');
  const greetingShortEls = document.querySelectorAll<HTMLElement>('[data-account-greeting-short]');
  const avatarEls = document.querySelectorAll<HTMLElement>('[data-account-avatar]');
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
  let profile: ReaderProfile = { name: null, role: null, location: null, interest: null };
  let clockTimer: ReturnType<typeof setInterval> | undefined;

  function renderGreeting() {
    const { short, full } = formatGreeting(profile.name, timezone);
    greetingShortEls.forEach((el) => (el.textContent = short));
    greetingFullEls.forEach((el) => (el.textContent = full));
    const initial = (profile.name || '•').trim().charAt(0).toUpperCase() || '•';
    avatarEls.forEach((el) => (el.textContent = initial));
  }

  function showMarker() {
    toggles.forEach((t) => (t.hidden = false));
  }
  function hideMarker() {
    toggles.forEach((t) => (t.hidden = true));
  }

  function openPanel() {
    if (!panel) return;
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

  toggles.forEach((t) => t.addEventListener('click', () => (panel?.classList.contains('hidden') ? openPanel() : closePanel())));
  closeBtn?.addEventListener('click', closePanel);
  panel?.addEventListener('click', (e) => {
    if (e.target === panel) closePanel();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel?.classList.contains('hidden')) closePanel();
  });

  function fillForm() {
    if (!form) return;
    (form.elements.namedItem('name') as HTMLInputElement).value = profile.name ?? '';
    (form.elements.namedItem('role') as HTMLInputElement).value = profile.role ?? '';
    (form.elements.namedItem('interest') as HTMLInputElement).value = profile.interest ?? '';
    const locationInput = form.elements.namedItem('location') as HTMLInputElement;
    if (profile.location) {
      locationInput.value = profile.location;
    } else {
      // Only a placeholder suggestion from IP geolocation — never overwrites
      // a reader's own choice, and is never saved unless they submit it.
      try {
        const cached = JSON.parse(sessionStorage.getItem(GEO_CACHE_KEY) || 'null');
        if (cached?.city) locationInput.placeholder = [cached.city, cached.country].filter(Boolean).join(', ');
      } catch {}
    }
  }

  async function loadProfile(userId: string) {
    try {
      const { data } = await supabase
        .from('reader_profiles')
        .select('name, role, location, interest')
        .eq('user_id', userId)
        .maybeSingle();
      if (data) profile = data;
    } catch {
      // Table not migrated yet, or offline — the greeting still works name-less.
    }
    renderGreeting();
    fillForm();
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { data } = await supabase.auth.getSession();
    const userId = data?.session?.user?.id;
    if (!userId) return;
    const fd = new FormData(form);
    const next: ReaderProfile = {
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
      profile = next;
      renderGreeting();
      if (savedNote) {
        savedNote.classList.remove('hidden');
        setTimeout(() => savedNote.classList.add('hidden'), 2000);
      }
    } catch {
      // Best-effort — a reader who can't save just keeps the panel open.
    }
  });

  signOutBtn?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    closePanel();
  });

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

  async function onSignedIn(user: any) {
    showMarker();
    if (!clockTimer) {
      timezone = await resolveTimezone();
      renderGreeting();
      clockTimer = setInterval(renderGreeting, 30_000);
    }
    await loadProfile(user.id);
  }

  function onSignedOut() {
    hideMarker();
    closePanel();
    if (clockTimer) {
      clearInterval(clockTimer);
      clockTimer = undefined;
    }
  }

  try {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.user) await onSignedIn(data.session.user);
  } catch {}

  supabase.auth.onAuthStateChange(async (event: string, session: any) => {
    if (session?.user) {
      await onSignedIn(session.user);
      if (event === 'SIGNED_IN') maybeShowWelcome(session.user);
    } else {
      onSignedOut();
    }
  });
}
