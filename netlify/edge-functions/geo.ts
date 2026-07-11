// Reader's approximate location and timezone, derived from IP by Netlify's
// edge network — never a client-side call to a third-party geolocation
// service, and no browser Geolocation API prompt (the site already blocks
// that via Permissions-Policy). Powers the header greeting's "it is
// currently …" time and, optionally, a location suggestion in the profile
// tab. Best-effort only: a reader on a VPN or with no geo data just gets no
// greeting personalisation, never an error.
//
//   GET /api/geo → { city, country, timezone }
//
// Per-visitor, so never cached by a shared cache; the page caches the result
// itself (sessionStorage) rather than re-fetching on every navigation.

interface Geo {
  city?: string;
  country?: { name?: string };
  timezone?: string;
}

export default async (_req: Request, context: { geo?: Geo }) => {
  const geo = context.geo ?? {};
  return new Response(
    JSON.stringify({
      city: geo.city ?? null,
      country: geo.country?.name ?? null,
      timezone: geo.timezone ?? null,
    }),
    {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'private, no-store',
      },
    }
  );
};

export const config = { path: '/api/geo' };
