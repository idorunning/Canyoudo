// Same-origin proxy for the data.police.uk API.
//
// The /data/lookup page makes live, browser-side calls for crime and
// neighbourhood data. Rather than depend on the API's CORS headers, the browser
// calls this function at /api/police/* and we forward server-side, where CORS
// doesn't apply. The upstream host is hard-pinned, so this can only ever reach
// data.police.uk — it cannot be turned into an open proxy.
//
// Responses are cached at Netlify's edge (the data only changes monthly), which
// also keeps us comfortably inside the API's 15 req/sec limit under any load.

const UPSTREAM = 'https://data.police.uk/api';
const UA = 'thinkingaboutpolicing.org (+https://thinkingaboutpolicing.org)';

export default async (req) => {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/police/, '');
  if (!path.startsWith('/') || path.includes('..')) {
    return new Response(JSON.stringify({ error: 'Bad path' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const upstream = `${UPSTREAM}${path}${url.search}`;

  let res;
  try {
    res = await fetch(upstream, { headers: { 'User-Agent': UA } });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Upstream unreachable', detail: String(err) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await res.text();
  return new Response(body, {
    status: res.status,
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'application/json',
      'Access-Control-Allow-Origin': '*',
      // Monthly data → cache hard at the edge, short in the browser.
      'Cache-Control': res.ok ? 'public, max-age=600, s-maxage=86400' : 'no-store',
    },
  });
};

export const config = { path: '/api/police/*' };
