// Shared login/logout/session handling for every /dashboard page, lifted out
// of the original single-page dashboard.astro so each sub-page (articles,
// audience, newsletter, traffic) gets the same gate with one call. The
// password check itself lives in admin-auth.ts; this wraps it in the
// request/response choreography (POST form, cookie, logout link).

import type { AstroGlobal } from 'astro';
import { ADMIN_COOKIE, checkPassword, configured, isValidSession, sessionToken } from './admin-auth';

export type AdminAuth =
  | { state: 'ok' }
  | { state: 'login'; failed: boolean }
  | { state: 'unconfigured' }
  | { state: 'redirect'; response: Response };

export async function adminGuard(Astro: AstroGlobal): Promise<AdminAuth> {
  if (Astro.request.method === 'POST') {
    const form = await Astro.request.formData();
    const password = String(form.get('password') ?? '');
    if (checkPassword(password)) {
      Astro.cookies.set(ADMIN_COOKIE, sessionToken(), {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });
      // Redirect back to the page that was posted to, so signing in on
      // /dashboard/articles lands you on /dashboard/articles.
      return { state: 'redirect', response: Astro.redirect(Astro.url.pathname) };
    }
    return { state: 'login', failed: true };
  }

  if (Astro.url.searchParams.get('logout') === '1') {
    Astro.cookies.delete(ADMIN_COOKIE, { path: '/' });
    return { state: 'redirect', response: Astro.redirect('/dashboard') };
  }

  if (!configured()) return { state: 'unconfigured' };
  if (isValidSession(Astro.cookies.get(ADMIN_COOKIE)?.value)) return { state: 'ok' };
  return { state: 'login', failed: false };
}
