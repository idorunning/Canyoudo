// Members gate controller, shared by the data dashboard pages. It mirrors the
// gating on /research, but auth-only — there's no saved-papers workspace here,
// just "are you signed in?". Loaded only when the PUBLIC_SUPABASE_* env vars
// were present at build time (each page passes that down as `hasAuth`);
// supabase-js itself is imported dynamically, so a logged-out reader who never
// signs in doesn't download it.
//
// Auth is the same Supabase project as the research assistant, so one sign-in
// covers the whole members area.
//
// Contract with the gated page scripts
// ------------------------------------
// Once the reader is unlocked (signed in, or no auth configured at all) the
// controller sets `data-members-unlocked` on <html> and dispatches a
// `members:unlock` event on document. Page/component scripts that auto-fetch on
// load — especially the ones that fire an AI interpretation — wait on
// `onMembersUnlock()` so that nothing runs, and nothing is billed, for a
// logged-out visitor. Purely user-initiated actions (chat, postcode lookups)
// need no such guard: they're inside the hidden tool until sign-in anyway.

/** Run `cb` once the members area is unlocked (now, if it already is). */
export function onMembersUnlock(cb: () => void): void {
  if (typeof document === 'undefined') return;
  if (document.documentElement.hasAttribute('data-members-unlocked')) cb();
  else document.addEventListener('members:unlock', () => cb(), { once: true });
}

function unlock(): void {
  document.documentElement.setAttribute('data-members-unlocked', '');
  document.dispatchEvent(new CustomEvent('members:unlock'));
}

// Minimal element helper (kept local so a data page doesn't pull in the
// research result-card module just for this).
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string | null
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

export async function initMembersGate(): Promise<void> {
  const root = document.querySelector<HTMLElement>('[data-members]');
  if (!root) return;
  const gate = root.querySelector<HTMLElement>('[data-members-gate]');
  const tool = root.querySelector<HTMLElement>('[data-members-tool]');
  const skeleton = root.querySelector<HTMLElement>('[data-members-skeleton]');
  const signinSlot = root.querySelector<HTMLElement>('[data-members-signin]');

  // Fail open: show the content and unlock the deferred scripts whenever auth
  // can't be used, so a configuration hiccup never traps the reader behind a
  // gate that can't be passed.
  function openUp() {
    document.documentElement.removeAttribute('data-maybe-authed');
    if (skeleton) skeleton.hidden = true;
    if (gate) gate.hidden = true;
    if (tool) tool.hidden = false;
    unlock();
  }

  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return openUp();

  let supabase: any;
  try {
    const { createClient } = await import('@supabase/supabase-js');
    supabase = createClient(url, key);
  } catch {
    return openUp();
  }

  let unlocked = false;
  function applyGate(signedIn: boolean) {
    document.documentElement.removeAttribute('data-maybe-authed');
    if (skeleton) skeleton.hidden = true;
    if (signedIn) {
      if (gate) gate.hidden = true;
      if (tool) tool.hidden = false;
      if (!unlocked) {
        unlocked = true;
        unlock(); // one-way: the page's scripts run once and stay run
      }
    } else {
      if (tool) tool.hidden = true;
      if (gate) {
        gate.hidden = false;
        if (signinSlot) {
          signinSlot.replaceChildren();
          renderSignInOptions(supabase, signinSlot);
        }
      }
    }
  }

  // Resolve the stored session, then gate. Two safety nets so a slow or wedged
  // auth read can never strand a signed-in reader on the skeleton:
  //   1. a timeout that fails OPEN (only readers who already hold a token ever
  //      reach the skeleton, so revealing the tool there is safe and correct);
  //   2. a try/catch that does the same on an outright error.
  // onAuthStateChange still fires for the live sign-in/out swap and supersedes
  // whichever net ran first.
  let settled = false;
  const safety = setTimeout(() => {
    if (settled) return;
    settled = true;
    openUp();
  }, 3500);

  try {
    const { data } = await supabase.auth.getSession();
    if (!settled) {
      settled = true;
      clearTimeout(safety);
      applyGate(Boolean(data?.session?.user));
    }
  } catch {
    if (!settled) {
      settled = true;
      clearTimeout(safety);
      openUp();
    }
  }

  supabase.auth.onAuthStateChange((_event: string, session: any) => {
    settled = true;
    clearTimeout(safety);
    applyGate(Boolean(session?.user));
  });
}

// The two sign-in routes — email magic link (primary, works on locked-down
// work machines) and Google (secondary). Ported from the research assistant's
// saved-store so the experience is identical; the only difference is that the
// redirect comes back to the current data page rather than /research.
function renderSignInOptions(supabase: any, container: HTMLElement): void {
  const primary =
    'font-sans text-sm uppercase tracking-[0.12em] bg-accent text-paper-50 px-5 py-2.5 rounded-md hover:bg-accent-dark transition-colors disabled:opacity-50';
  const secondary =
    'font-sans text-sm uppercase tracking-[0.12em] border border-ink-300 text-ink-700 px-5 py-2.5 rounded-md hover:text-ink-900 hover:border-ink-500 transition-colors';
  const textLink = 'font-sans text-xs underline underline-offset-2 text-ink-600 hover:text-accent';
  const redirectTo = location.origin + location.pathname + location.search;

  function signInWithGoogle() {
    supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  }
  function signInWithEmail(email: string) {
    return supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
  }

  function showButtons() {
    container.replaceChildren();
    const row = el('div', 'flex flex-col sm:flex-row gap-3');
    const email = el('button', primary, 'Email me a sign-in link');
    email.type = 'button';
    email.addEventListener('click', showEmailForm);
    row.appendChild(email);
    const google = el('button', secondary, 'Or use Google');
    google.type = 'button';
    google.addEventListener('click', signInWithGoogle);
    row.appendChild(google);
    container.appendChild(row);
    container.appendChild(
      el(
        'p',
        'font-sans text-xs text-ink-500 mt-2',
        'The email link is password-free and works with any address, including a work one (e.g. police.gov.uk).'
      )
    );
  }

  function showEmailForm() {
    container.replaceChildren();
    const form = el('form', 'flex flex-col sm:flex-row gap-3 max-w-md');
    const input = el(
      'input',
      'flex-1 min-w-0 border border-ink-300 rounded-md px-4 py-2.5 font-sans text-sm text-ink-900 bg-paper-50 focus:outline-none focus:border-accent'
    );
    input.type = 'email';
    input.autocomplete = 'email';
    input.placeholder = 'you@example.com';
    input.required = true;
    form.appendChild(input);
    const send = el('button', primary, 'Send link');
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
      const again = el('button', `mt-2 ${textLink}`, error ? 'Try again' : 'Use a different email');
      again.type = 'button';
      again.addEventListener('click', showEmailForm);
      container.appendChild(again);
    });
    container.appendChild(form);
    const cancel = el('button', `mt-2 ${textLink}`, 'Use Google instead');
    cancel.type = 'button';
    cancel.addEventListener('click', showButtons);
    container.appendChild(cancel);
    input.focus();
  }

  showButtons();
}
