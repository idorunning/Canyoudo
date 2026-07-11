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
// The sign-in form also offers to add the reader to the MailerLite list — see
// src/lib/mailerlite-subscribe.ts for how that choice survives the redirect
// and gets applied at most once.
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

import { maybeSubscribeOnSignIn, setSubscribePreference } from '../../lib/mailerlite-subscribe';

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
    maybeSubscribeOnSignIn(_event, session?.user?.email);
  });

  // Listen for storage changes (e.g., sign-in from another tab or Supabase client
  // instance). This ensures the gate stays in sync with other auth listeners.
  window.addEventListener('storage', async (e) => {
    if (e.key?.includes('auth-token') || e.key?.includes('auth-expires')) {
      try {
        const { data } = await supabase.auth.getSession();
        applyGate(Boolean(data?.session?.user));
      } catch {}
    }
  });
}

function renderSignInOptions(supabase: any, container: HTMLElement): void {
  import("../auth/password-auth").then(({ initPasswordAuth }) => {
    initPasswordAuth(supabase, container);
  });
}
