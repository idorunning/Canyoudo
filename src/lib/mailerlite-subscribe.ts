// Sign-in → newsletter bridge. The two sign-in flows (src/scripts/members/gate.ts
// and src/scripts/research/saved.ts) each show a checkbox offering to add the
// reader to the MailerLite list at the same time they sign in. That's a
// separate, server-side path from the embedded form in NewsletterForm.astro —
// this one calls /api/mailerlite-subscribe (netlify/functions/mailerlite-subscribe.mts).
//
// The checkbox choice has to survive a full redirect (magic-link email, or the
// Google OAuth round trip), so it's stashed in localStorage right before the
// sign-in call and consumed the moment a real sign-in lands. Both gate.ts and
// saved.ts run their own Supabase client and can both be on the same page (see
// research.astro, which mounts both) — each fires its own onAuthStateChange for
// the same underlying session, so without care the reader would get double-
// subscribed. consumePreference() reads-then-deletes the flag synchronously
// (no await in between), so whichever listener's callback runs first claims it
// and the other finds nothing left — JS's single-threaded execution makes that
// race-free without any extra locking.
const PREF_KEY = 'tap:subscribe-on-signin';

/** Call right before signInWithOtp / signInWithOAuth, from the checkbox's current value. */
export function setSubscribePreference(subscribe: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, subscribe ? '1' : '0');
  } catch {
    // Storage blocked (private mode, etc.) — maybeSubscribeOnSignIn treats a
    // missing flag as "don't subscribe", which is the safe default.
  }
}

function consumePreference(): boolean {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw === null) return false;
    localStorage.removeItem(PREF_KEY);
    return raw === '1';
  } catch {
    return false;
  }
}

/**
 * Call from every onAuthStateChange handler. Only acts on a genuine new
 * sign-in ('SIGNED_IN') — never on the initial session restore or a token
 * refresh — and only when the reader actually left the checkbox on. Fire-and-
 * forget: a failure here must never surface in the auth flow.
 */
export function maybeSubscribeOnSignIn(event: string, email: string | null | undefined): void {
  if (event !== 'SIGNED_IN' || !email) return;
  if (!consumePreference()) return;
  fetch('/api/mailerlite-subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  }).catch(() => {});
}
