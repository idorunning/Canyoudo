// Shareable search URLs: the whole search state lives in the query string, so
// a colleague can be sent /research?q=hot+spots+policing&review=1 and land on
// the same results.

export interface SearchState {
  q: string;
  source: string;
  oa: boolean;
  review: boolean;
  from: string;
  sort: string;
}

export function readStateFromUrl(): Partial<SearchState> {
  const p = new URLSearchParams(location.search);
  const out: Partial<SearchState> = {};
  const q = (p.get('q') ?? '').trim();
  if (q) out.q = q;
  if (p.get('src')) out.source = p.get('src')!;
  if (p.get('oa') === '0') out.oa = false; // default is on; only "off" is notable
  if (p.get('review') === '1') out.review = true;
  if (p.get('from')) out.from = p.get('from')!;
  if (p.get('sort')) out.sort = p.get('sort')!;
  return out;
}

export function writeStateToUrl(s: SearchState) {
  const p = new URLSearchParams();
  if (s.q) p.set('q', s.q);
  if (s.source && s.source !== 'openalex') p.set('src', s.source);
  if (!s.oa) p.set('oa', '0');
  if (s.review) p.set('review', '1');
  if (s.from) p.set('from', s.from);
  if (s.sort && s.sort !== 'relevance') p.set('sort', s.sort);
  const qs = p.toString();
  history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname);
}
