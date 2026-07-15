// Controller for the Crime Map on /data. All rendering and I/O lives here;
// everything computable is imported from src/lib/crime-map-core.mjs (pure,
// unit-tested). Initialised by CrimeMap.astro after the members gate unlocks —
// Leaflet never loads for a logged-out visitor.
//
// The zoom ladder: force dots (tier 1, Supabase view=map-forces) → LSOA
// hotspot dots (tier 2, view=hotspots joined to the committed centroid
// lookup) → live per-crime dots (tier 3, data.police.uk via the /api/police
// proxy). Tier 3 works even when the database is down — it only needs the
// proxy — so failures degrade tier by tier, never to a blank map.

import { loadLeaflet } from '../loadLeaflet';
import { fetchJson, fmt, monthLabel } from './explorer';
import {
  CRIME_CATEGORY_META, categoryColor, categoryLabel, canonicalCategory,
  tierForZoom, effectiveTier, dominantCategory, dotRadius, ratePer1000,
  viewportPoly, viewportAreaKm2, cellSizeDeg, gridCluster,
  monthOptions, heatShade, FORCE_DATA_NOTES,
} from '../../lib/crime-map-core.mjs';

type Centroid = { lat: number; lng: number; name: string };
type MapForce = { id: string; total: number; byCategory: Record<string, number>; population: number | null; populationYear: string | null };
type Hotspot = { lsoa_code: string; lsoa_name: string | null; count: number };
type StreetCrime = { lat: number; lng: number; category: string; street: string; outcome: string; month: string };

const TILE = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  fallback: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
};
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
const HOME: [number, number] = [52.8, -1.8]; // England & Wales at a glance
const HOME_ZOOM = 6;
const STREET_AREA_LIMIT_KM2 = 400;
const CLUSTER_THRESHOLD = 2500;
const HOTSPOT_LIMIT = 400;

const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export async function initCrimeMap(root: HTMLElement): Promise<void> {
  if (root.dataset.ready === '1') return;
  root.dataset.ready = '1';

  const mapEl = root.querySelector<HTMLElement>('[data-cm-map]')!;
  const tierEl = root.querySelector<HTMLElement>('[data-cm-tier]')!;
  const legendEl = root.querySelector<HTMLElement>('[data-cm-legend]')!;
  const legendNoteEl = root.querySelector<HTMLElement>('[data-cm-legend-note]')!;
  const monthWrap = root.querySelector<HTMLElement>('[data-cm-month-wrap]')!;
  const monthEl = root.querySelector<HTMLSelectElement>('[data-cm-month]')!;
  const statusEl = root.querySelector<HTMLElement>('[data-cm-status]')!;
  const panelEl = root.querySelector<HTMLElement>('[data-cm-panel]')!;
  const centroids: Record<string, Centroid> = JSON.parse(
    root.querySelector('script[data-cm-centroids]')!.textContent || '{}'
  ).forces;

  // --- URL state: ?force=&month= plus #map=zoom/lat/lng (OSM convention) ------
  const urlNow = new URL(location.href);
  const hash = location.hash.match(/^#map=(\d+(?:\.\d+)?)\/(-?[\d.]+)\/(-?[\d.]+)$/);
  const state = {
    month: urlNow.searchParams.get('month') || '',
    force: urlNow.searchParams.get('force') || '',
    hidden: new Set<string>(),
    asRate: sessionStorage.getItem('cm-rate') === '1',
    dark: document.documentElement.classList.contains('dark'),
  };

  const status = (msg: string, isError = false) => {
    statusEl.textContent = msg;
    statusEl.hidden = !msg;
    statusEl.classList.toggle('text-accent', isError);
  };

  const L = await loadLeaflet().catch(() => null);
  if (!L) { status('The map library couldn’t load — check your connection and reload.', true); return; }

  const map = L.map(mapEl, {
    preferCanvas: true,
    minZoom: 5,
    maxZoom: 17,
    zoomControl: false,
    maxBounds: [[47.5, -12.5], [62.5, 5.5]],
    maxBoundsViscosity: 0.7,
  });
  L.control.zoom({ position: 'topright' }).addTo(map);
  if (hash) map.setView([Number(hash[2]), Number(hash[3])], Number(hash[1]));
  else map.setView(HOME, HOME_ZOOM);

  let tiles = L.tileLayer(state.dark ? TILE.dark : TILE.light, { maxZoom: 19, attribution: ATTRIBUTION });
  let tileFellBack = false;
  tiles.on('tileerror', () => {
    if (tileFellBack) return;
    tileFellBack = true;
    tiles.setUrl(TILE.fallback); // proven fallback (CodeMap uses OSM tiles)
  });
  tiles.addTo(map);

  // Floating chrome shouldn't drag/scroll the map underneath it.
  const fsBtn = root.querySelector<HTMLButtonElement>('[data-cm-fs]');
  const keyDetails = legendEl.closest('details');
  for (const el of [tierEl, legendEl, monthWrap, statusEl, fsBtn].filter(Boolean) as HTMLElement[]) {
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
  }
  // On phones the open key covers too much of a 60vh map — start it collapsed.
  if (keyDetails && matchMedia('(max-width: 1023px)').matches) keyDetails.removeAttribute('open');

  // Fullscreen: a fixed-position layer, not the Fullscreen API (iOS Safari has
  // no element fullscreen, and the CSS route keeps the side panel usable).
  let savedScrollY = 0;
  function setFullscreen(on: boolean) {
    if (!fsBtn) return;
    if (on) savedScrollY = window.scrollY;
    root.classList.toggle('cm-fs', on);
    document.body.classList.toggle('overflow-hidden', on);
    fsBtn.setAttribute('aria-pressed', String(on));
    fsBtn.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
    fsBtn.title = on ? 'Exit full screen (Esc)' : 'Full screen';
    fsBtn.querySelector('[data-fs-expand]')?.toggleAttribute('hidden', on);
    fsBtn.querySelector('[data-fs-compress]')?.toggleAttribute('hidden', !on);
    // Leaflet must re-measure its container after any size change.
    setTimeout(() => map.invalidateSize(), 250);
    if (!on) { window.scrollTo(0, savedScrollY); fsBtn.focus(); }
  }
  fsBtn?.addEventListener('click', () => setFullscreen(!root.classList.contains('cm-fs')));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root.classList.contains('cm-fs')) setFullscreen(false);
  });

  const groups: Record<1 | 2 | 3, any> = { 1: L.layerGroup(), 2: L.layerGroup(), 3: L.layerGroup() };
  const boundaryPane = L.layerGroup().addTo(map);

  const currentBox = () => {
    const b = map.getBounds();
    return { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() };
  };
  // The tier actually rendered — zoom-based, but demoted from streets back to
  // hotspots while the viewport is too large for the street API.
  const effTier = (): 1 | 2 | 3 => effectiveTier(map.getZoom(), viewportAreaKm2(currentBox())) as 1 | 2 | 3;

  // --- data caches -------------------------------------------------------------
  let mapForces: MapForce[] | null = null;
  let mapForcesError = '';
  let window12: { from: string; to: string } | null = null;
  // Promise caches so concurrent renders (init runs twice; month + zoom churn)
  // share one fetch instead of racing two.
  let lsoaLookupPromise: Promise<Record<string, [number, number]>> | null = null;
  const hotspotCache = new Map<string, Promise<Hotspot[]>>();
  const streetCache = new Map<string, StreetCrime[]>();
  let streetFetchSeq = 0;
  let hotspotFetchSeq = 0;

  // --- legend (doubles as the category filter, and hosts the rate toggle) --------
  function renderLegend() {
    const tier = effTier();
    const hasPop = Boolean(mapForces?.some((f) => f.population));
    legendEl.innerHTML = CRIME_CATEGORY_META.map((m) => {
      const off = state.hidden.has(m.key);
      return `
        <button type="button" data-cat="${m.key}" aria-pressed="${!off}" ${tier === 2 ? 'disabled' : ''}
          class="flex items-center gap-1.5 font-sans text-[11px] leading-tight text-left py-1 ${off ? 'opacity-40' : ''} ${tier === 2 ? 'opacity-40 cursor-default' : 'hover:opacity-75 cursor-pointer'}">
          <span class="inline-block w-2.5 h-2.5 rounded-full shrink-0" style="background:${categoryColor(m.key, state.dark)}"></span>
          <span>${esc(m.label)}</span>
        </button>`;
    }).join('') + (tier === 1 && hasPop ? `
      <label class="col-span-2 flex items-center gap-1.5 font-sans text-[11px] text-ink-700 py-1 mt-1 border-t border-ink-200 cursor-pointer">
        <input type="checkbox" data-cm-rate class="accent-current" ${state.asRate ? 'checked' : ''}>
        Size dots per 1,000 residents
      </label>` : '');
    legendNoteEl.textContent =
      tier === 2
        ? 'Hotspots show volume only — crime types return at street level.'
        : tier === 1
          ? 'Force dots take the colour of their most common crime type (excluding anti-social behaviour and “other”); tap a dot for the full breakdown. Tap a type to hide it.'
          : 'Tap a crime type to show or hide it.';
    legendEl.querySelectorAll<HTMLButtonElement>('[data-cat]').forEach((btn) => {
      btn.onclick = () => {
        const k = btn.dataset.cat!;
        state.hidden.has(k) ? state.hidden.delete(k) : state.hidden.add(k);
        renderLegend();
        renderCurrentTier();
      };
    });
    const rate = legendEl.querySelector<HTMLInputElement>('[data-cm-rate]');
    if (rate) rate.onchange = () => {
      state.asRate = rate.checked;
      try { sessionStorage.setItem('cm-rate', rate.checked ? '1' : '0'); } catch {}
      renderTier1();
    };
  }

  // --- month picker ---------------------------------------------------------------
  function renderMonthPicker() {
    const tier = effTier();
    const latest = window12?.to;
    // Never show an empty disabled select: hidden at tier 1 (force dots are a
    // rolling 12 months) and hidden whenever the database hasn't answered yet.
    monthWrap.hidden = tier === 1 || !latest;
    if (monthWrap.hidden) return;
    const months = monthOptions(latest!, tier === 2 ? 12 : 24);
    if (state.month && !months.includes(state.month)) {
      // The chosen month fell outside this tier's window — the view falls back
      // to latest, so the URL must fall back with it.
      state.month = '';
      pushUrl();
    }
    monthEl.disabled = false;
    monthEl.innerHTML = months
      .map((m, i) => `<option value="${i === 0 ? '' : m}" ${m === (state.month || latest) ? 'selected' : ''}>${monthLabel(m)}</option>`)
      .join('');
  }
  monthEl.addEventListener('change', () => {
    state.month = monthEl.value;
    pushUrl();
    renderCurrentTier();
  });

  // --- tier chip -----------------------------------------------------------------
  function renderTierChip() {
    const tier = effTier();
    const demoted = tier === 2 && tierForZoom(map.getZoom()) === 3;
    const dual = (full: string, short: string) =>
      `<span class="hidden sm:inline">${full}</span><span class="sm:hidden">${short}</span>`;
    tierEl.innerHTML =
      tier === 1
        ? dual('<strong>Forces</strong> · zoom in for hotspots, then streets', '<strong>Forces</strong> · zoom for more')
        : tier === 2
          ? demoted
            ? dual('<strong>Hotspots</strong> · zoom in a little further for individual crimes', '<strong>Hotspots</strong> · zoom for crimes')
            : dual('<strong>Hotspots</strong> · neighbourhood volume, England &amp; Wales · zoom for streets', '<strong>Hotspots</strong> · zoom for streets')
          : `<strong>Streets</strong> · ${dual('individual reports', 'reports')}${state.month ? ` · ${monthLabel(state.month)}` : window12 ? ` · ${monthLabel(window12.to)}` : ''}`;
  }

  // --- URL sync --------------------------------------------------------------------
  function pushUrl() {
    const u = new URL(location.href);
    state.force ? u.searchParams.set('force', state.force) : u.searchParams.delete('force');
    state.month ? u.searchParams.set('month', state.month) : u.searchParams.delete('month');
    // Only claim the hash when it's ours (or empty) — a reader who followed the
    // page's #caveats anchor keeps it; map state just isn't hash-persisted then.
    if (!location.hash || location.hash.startsWith('#map=')) {
      const c = map.getCenter();
      u.hash = `#map=${map.getZoom()}/${c.lat.toFixed(4)}/${c.lng.toFixed(4)}`;
    }
    history.replaceState(null, '', u);
  }

  // --- side panel --------------------------------------------------------------------
  function panelNational() {
    if (!mapForces) {
      panelEl.innerHTML = `<p class="font-serif text-sm text-ink-600 leading-relaxed">${esc(mapForcesError || 'Loading force data…')}</p>
        <p class="font-serif text-sm text-ink-600 leading-relaxed mt-2">You can still zoom all the way in — street-level dots load straight from data.police.uk.</p>`;
      return;
    }
    const top = [...mapForces].sort((a, b) => b.total - a.total).slice(0, 5);
    panelEl.innerHTML = `
      <h3 class="font-display text-base font-semibold text-ink-900">England, Wales &amp; NI by force</h3>
      <p class="font-sans text-xs text-ink-500 mt-1 mb-3">Rolling 12 months${window12 ? ` to ${monthLabel(window12.to)}` : ''} · recorded crime</p>
      <ol class="space-y-1.5">${top.map((f) => `
        <li><button type="button" data-pick-force="${f.id}" class="w-full text-left font-sans text-sm text-ink-700 hover:text-accent flex justify-between gap-2">
          <span class="truncate">${esc(centroids[f.id]?.name ?? f.id)}</span>
          <span class="tabular-nums text-ink-500 shrink-0">${fmt.format(f.total)}</span>
        </button></li>`).join('')}
      </ol>
      <label class="mt-4 block">
        <span class="sr-only">Jump to a force</span>
        <select data-pick-any class="w-full border border-ink-300 rounded-md px-2 py-1.5 font-sans text-xs text-ink-900 bg-paper-50">
          <option value="">Jump to a force…</option>
          ${Object.entries(centroids).map(([id, c]) => `<option value="${id}">${esc(c.name)}</option>`).join('')}
        </select>
      </label>
      <p class="font-sans text-xs text-ink-500 mt-4 leading-relaxed">Tap any dot — or pick a force — for its breakdown. Zoom for neighbourhood hotspots, then street-level reports.</p>`;
    panelEl.querySelectorAll<HTMLButtonElement>('[data-pick-force]').forEach((b) => (b.onclick = () => selectForce(b.dataset.pickForce!)));
    panelEl.querySelector<HTMLSelectElement>('[data-pick-any]')!.onchange = (e) => {
      const id = (e.target as HTMLSelectElement).value;
      if (id) selectForce(id);
    };
  }

  async function panelForce(id: string) {
    const c = centroids[id];
    const f = mapForces?.find((x) => x.id === id);
    const note = (FORCE_DATA_NOTES as Record<string, string>)[id];
    const rate = f ? ratePer1000(f.total, f.population ?? 0) : null;
    const cats = f
      ? Object.entries(f.byCategory).sort((a, b) => b[1] - a[1])
      : [];
    const maxCat = cats[0]?.[1] ?? 1;
    panelEl.innerHTML = `
      <button type="button" data-back class="font-sans text-xs text-accent hover:text-accent-dark mb-2">← All forces</button>
      <h3 class="font-display text-base font-semibold text-ink-900">${esc(c?.name ?? id)}</h3>
      ${f ? `
        <p class="font-sans text-xs text-ink-500 mt-1">Rolling 12 months${window12 ? ` to ${monthLabel(window12.to)}` : ''}</p>
        <p class="font-display text-2xl font-semibold text-ink-900 mt-2">${fmt.format(f.total)} <span class="font-sans text-xs font-normal text-ink-500">recorded crimes${rate != null ? ` · ${rate.toFixed(1)}/1,000 residents` : ''}</span></p>
      ` : `<p class="font-serif text-sm text-ink-600 mt-2">${esc(mapForcesError || 'No force-level data available right now.')}</p>`}
      ${note ? `<p class="font-serif text-xs text-ink-600 leading-relaxed mt-2 border-l-2 border-accent/60 pl-2">${esc(note)}</p>` : ''}
      ${cats.length ? `
        <div class="mt-3 space-y-1" role="table" aria-label="Crime types, 12-month counts">
          ${cats.map(([k, n]) => `
            <div class="flex items-center gap-2 font-sans text-[11px] text-ink-700" role="row">
              <span class="inline-block w-2.5 h-2.5 rounded-full shrink-0" style="background:${categoryColor(k, state.dark)}"></span>
              <span class="w-32 truncate" title="${esc(categoryLabel(k))}">${esc(categoryLabel(k))}</span>
              <span class="flex-1 h-2 bg-paper-200 rounded-sm overflow-hidden"><span class="block h-full rounded-sm" style="width:${Math.max((n / maxCat) * 100, 1)}%;background:${categoryColor(k, state.dark)}"></span></span>
              <span class="tabular-nums text-ink-500 w-14 text-right shrink-0">${fmt.format(n)}</span>
            </div>`).join('')}
        </div>` : ''}
      <div class="mt-4 flex flex-wrap gap-2">
        <button type="button" data-zoom-force class="font-sans text-xs border border-ink-300 rounded-md px-2.5 py-1.5 text-ink-700 hover:border-accent hover:text-accent">Zoom into ${esc(shortName(c?.name ?? id))} →</button>
      </div>
      <ul class="mt-4 space-y-1 font-sans text-xs">
        <li><a class="text-accent hover:text-accent-dark underline underline-offset-2" href="/data/crime?force=${id}">Crime &amp; outcomes over time →</a></li>
        <li><a class="text-accent hover:text-accent-dark underline underline-offset-2" href="/data/briefing?force=${id}">Force briefing →</a></li>
        <li><a class="text-accent hover:text-accent-dark underline underline-offset-2" href="/data/force/${id}">Latest-month reading →</a></li>
      </ul>`;
    panelEl.querySelector<HTMLButtonElement>('[data-back]')!.onclick = () => {
      state.force = '';
      pushUrl();
      panelNational();
    };
    panelEl.querySelector<HTMLButtonElement>('[data-zoom-force]')!.onclick = () => {
      if (c) map.flyTo([c.lat, c.lng], 10, { duration: 0.8 });
    };
  }

  const shortName = (name: string) => name.replace(/\b(Constabulary|Police( Service)?( of)?)\b/gi, '').trim() || name;

  function selectForce(id: string) {
    state.force = id;
    pushUrl();
    panelForce(id);
  }

  // --- tier 1: force dots ------------------------------------------------------------
  function renderTier1() {
    groups[1].clearLayers();
    if (!mapForces) return;
    // In rate mode, dots without a population denominator can't sit on the
    // same scale as rates — they render at minimum size, and say so.
    const asRate = state.asRate && mapForces.some((f) => f.population);
    const values = mapForces.map((f) =>
      asRate ? (f.population ? ratePer1000(f.total, f.population)! : 0) : f.total
    );
    const maxVal = Math.max(...values, asRate ? 0.001 : 1);
    mapForces.forEach((f, i) => {
      const c = centroids[f.id];
      if (!c) return;
      const visible = Object.fromEntries(Object.entries(f.byCategory).filter(([k]) => !state.hidden.has(canonicalCategory(k))));
      const dom = dominantCategory(visible);
      const color = dom ? categoryColor(dom, state.dark) : (state.dark ? '#555b64' : '#c6cad1');
      const marker = L.circleMarker([c.lat, c.lng], {
        radius: dotRadius(values[i], maxVal),
        color: state.dark ? '#101318' : '#ffffff',
        weight: 1.5,
        fillColor: color,
        fillOpacity: 0.85,
      });
      const rateNote = asRate
        ? f.population
          ? `<br>${ratePer1000(f.total, f.population)!.toFixed(1)} per 1,000 residents`
          : '<br>(no population loaded — shown at minimum size)'
        : '';
      marker.bindTooltip(
        `<strong>${esc(c.name)}</strong><br>${fmt.format(f.total)} crimes in 12 months${rateNote}${dom ? `<br>Most common: ${esc(categoryLabel(dom))}` : ''}`,
        { direction: 'top', offset: [0, -4] }
      );
      marker.on('click', () => selectForce(f.id));
      groups[1].addLayer(marker);
    });
  }

  // --- tier 2: LSOA hotspot dots -------------------------------------------------------
  let lsoaLookup: Record<string, [number, number]> | null = null;
  let lastHotspots: Hotspot[] = [];
  async function renderTier2() {
    const seq = ++hotspotFetchSeq;
    const monthKey = state.month || 'latest';
    try {
      if (!lsoaLookup) {
        status('Loading neighbourhood lookup…');
        lsoaLookupPromise ??= fetch('/geo/lsoa-centroids.json').then(async (raw) => {
          if (!raw.ok) throw new Error('centroid lookup unreachable');
          return (await raw.json()).c;
        });
        try { lsoaLookup = await lsoaLookupPromise; }
        catch (err) { lsoaLookupPromise = null; throw err; }
      }
      let rowsP = hotspotCache.get(monthKey);
      if (!rowsP) {
        status('Loading hotspots…');
        rowsP = fetchJson<{ lsoas: Hotspot[] }>(
          `/api/police-db?view=hotspots&limit=${HOTSPOT_LIMIT}${state.month ? `&month=${state.month}` : ''}`
        ).then((res) => res.lsoas ?? []);
        hotspotCache.set(monthKey, rowsP);
        rowsP.catch(() => hotspotCache.delete(monthKey)); // a failed fetch shouldn't poison the cache
      }
      const rows = await rowsP;
      // A newer render superseded this one (month change, zoom churn, theme
      // flip, the double init) — let the newest own the layer.
      if (seq !== hotspotFetchSeq || effTier() !== 2) return;
      groups[2].clearLayers();
      lastHotspots = rows;
      if (!rows.length) {
        status('No hotspot data for this month yet — the database may still be filling.');
        return;
      }
      status('');
      let misses = 0;
      const max = rows[0]?.count ?? 1;
      for (const r of rows) {
        const ll = lsoaLookup![r.lsoa_code];
        if (!ll) { misses++; continue; }
        const marker = L.circleMarker(ll, {
          radius: dotRadius(r.count, max, { min: 3, max: 14 }),
          color: state.dark ? '#101318' : '#ffffff',
          weight: 1,
          fillColor: heatShade(r.count, max, state.dark),
          fillOpacity: 0.85,
        });
        marker.bindTooltip(
          `<strong>${esc(r.lsoa_name || r.lsoa_code)}</strong><br>${fmt.format(r.count)} crimes this month`,
          { direction: 'top', offset: [0, -4] }
        );
        groups[2].addLayer(marker);
      }
      if (misses) console.warn(`crime-map: ${misses} hotspot LSOAs missing from the centroid lookup`);
    } catch (err: any) {
      if (seq !== hotspotFetchSeq) return;
      status(`Couldn’t load hotspots: ${err?.message || 'unknown error'}. Street-level dots still work — keep zooming.`, true);
    }
  }

  // --- tier 3: live street dots -----------------------------------------------------------
  async function renderTier3() {
    // Oversized viewports are demoted to tier 2 upstream (effectiveTier); this
    // guard only catches a stale call racing a pan/zoom.
    if (effTier() !== 3) return;
    const box = currentBox();
    const poly = viewportPoly(box);
    const key = `${poly}|${state.month}`;
    const seq = ++streetFetchSeq;
    let points = streetCache.get(key);
    if (!points) {
      status('Loading crimes for this view…');
      try {
        const dateParam = state.month ? `&date=${state.month}` : '';
        const res = await fetch(`/api/police/crimes-street/all-crime?poly=${poly}${dateParam}`);
        if (res.status === 503) {
          status('Too many crimes in this view for the national API — zoom in a little further.');
          return;
        }
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        const raw = await res.json();
        points = (raw as any[]).map((cr) => ({
          lat: Number(cr.location?.latitude),
          lng: Number(cr.location?.longitude),
          category: cr.category,
          street: cr.location?.street?.name ?? 'Unknown street',
          outcome: cr.outcome_status?.category ?? 'Outcome not yet recorded',
          month: cr.month,
        })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
        streetCache.set(key, points);
        if (streetCache.size > 20) streetCache.delete(streetCache.keys().next().value!);
      } catch (err: any) {
        status(`Couldn’t load street-level crimes: ${err?.message || 'unknown error'}. Try again in a moment.`, true);
        return;
      }
    }
    if (seq !== streetFetchSeq) return; // superseded by a newer pan/zoom
    groups[3].clearLayers();
    const shown = points.filter((p) => !state.hidden.has(canonicalCategory(p.category)));
    if (!shown.length) {
      status(points.length
        ? 'Every crime here is in a hidden category — tap types in the key to show them.'
        : `No crimes recorded in this view${state.month ? ` for ${monthLabel(state.month)}` : ' for the latest month'}.`);
      return;
    }
    status('');
    if (shown.length > CLUSTER_THRESHOLD) {
      const clusters = gridCluster(shown, cellSizeDeg(map.getZoom()));
      for (const cl of clusters) {
        const marker = L.circleMarker([cl.lat, cl.lng], {
          radius: dotRadius(cl.n, CLUSTER_THRESHOLD / 4, { min: 6, max: 20 }),
          color: state.dark ? '#101318' : '#ffffff',
          weight: 1.5,
          fillColor: cl.dominant ? categoryColor(cl.dominant, state.dark) : '#888888',
          fillOpacity: 0.85,
        });
        marker.bindTooltip(`<strong>${fmt.format(cl.n)} crimes</strong><br>Mostly ${esc(categoryLabel(cl.dominant ?? 'other-crime'))} — click to zoom`, { direction: 'top' });
        marker.on('click', () => map.setView([cl.lat, cl.lng], map.getZoom() + 1));
        groups[3].addLayer(marker);
      }
    } else {
      for (const p of shown) {
        const marker = L.circleMarker([p.lat, p.lng], {
          radius: 5,
          color: state.dark ? '#101318' : '#ffffff',
          weight: 1,
          fillColor: categoryColor(p.category, state.dark),
          fillOpacity: 0.9,
        });
        marker.bindPopup(
          `<strong>${esc(categoryLabel(p.category))}</strong><br>${esc(p.street)}<br>${esc(p.outcome)}<br><span style="opacity:.7">${monthLabel(p.month)} · location anonymised to a nearby map point</span>`
        );
        groups[3].addLayer(marker);
      }
    }
  }

  // --- tier switching -----------------------------------------------------------------------
  let currentTier: 1 | 2 | 3 = effTier();
  function renderCurrentTier() {
    const tier = effTier();
    if (tier !== currentTier) {
      map.removeLayer(groups[currentTier]);
      currentTier = tier;
      status('');
      renderBoundaries(); // interactivity + visibility are tier-dependent
    }
    if (!map.hasLayer(groups[tier])) groups[tier].addTo(map);
    renderTierChip();
    renderLegend();
    renderMonthPicker();
    if (tier === 2 && tierForZoom(map.getZoom()) === 3) {
      // Demoted: the zoom says streets but the viewport is too wide for the
      // street API — keep hotspots on screen and say why.
      status('Zoom in a little further to load individual crimes.');
    }
    if (tier === 1) renderTier1();
    else if (tier === 2) renderTier2();
    else renderTier3();
  }

  // One URL write and one tier evaluation per gesture: Leaflet always fires
  // moveend after zoomend, so zoomend needs no handler of its own. Pans at
  // street zoom must re-evaluate too — the effective tier depends on viewport
  // area, and the viewport must re-fetch.
  let moveTimer: ReturnType<typeof setTimeout> | undefined;
  map.on('moveend', () => {
    pushUrl();
    const tier = effTier();
    if (tier !== currentTier) { renderCurrentTier(); return; }
    if (tier === 3) {
      clearTimeout(moveTimer);
      moveTimer = setTimeout(renderTier3, 400);
    }
  });

  // --- dark mode: retint tiles and every live marker when the theme flips ---------------------
  new MutationObserver(() => {
    const dark = document.documentElement.classList.contains('dark');
    if (dark === state.dark) return;
    state.dark = dark;
    if (!tileFellBack) tiles.setUrl(dark ? TILE.dark : TILE.light);
    renderCurrentTier();
    if (state.force) panelForce(state.force);
    renderBoundaries();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  // --- boundaries: progressive enhancement, fetched when the browser is idle ------------------
  // Interactive (hover highlight, click-to-select) only at tier 1; passive
  // outlines at tier 2; hidden at street level, where they're clutter.
  let boundaryData: any = null;
  function renderBoundaries() {
    boundaryPane.clearLayers();
    if (!boundaryData || currentTier === 3) return;
    const interactive = currentTier === 1;
    const layer = L.geoJSON(boundaryData, {
      style: () => ({
        color: state.dark ? '#4a5160' : '#a1a6ae',
        weight: 1,
        fill: interactive,
        fillOpacity: 0,
        opacity: 0.6,
        interactive,
      }),
      onEachFeature: interactive
        ? (feature: any, lyr: any) => {
            lyr.on('mouseover', () => lyr.setStyle({ weight: 2, opacity: 1 }));
            lyr.on('mouseout', () => lyr.setStyle({ weight: 1, opacity: 0.6 }));
            lyr.on('click', () => selectForce(feature.properties.id));
          }
        : undefined,
    });
    boundaryPane.addLayer(layer);
  }
  const loadBoundaries = async () => {
    try {
      const res = await fetch('/geo/pfa-boundaries.json');
      if (!res.ok) return; // outlines are decoration — dots carry the data
      boundaryData = await res.json();
      renderBoundaries();
    } catch { /* same: enhancement only */ }
  };
  'requestIdleCallback' in window ? requestIdleCallback(loadBoundaries) : setTimeout(loadBoundaries, 2000);

  // --- initial data ------------------------------------------------------------------------------
  panelNational();
  renderCurrentTier();
  try {
    const res = await fetchJson<{ window: { from: string; to: string } | null; forces: MapForce[] }>(
      '/api/police-db?view=map-forces'
    );
    window12 = res.window;
    mapForces = res.forces?.length ? res.forces : null;
    if (!mapForces) mapForcesError = 'The force database is still filling — dots will appear once the first ingest lands.';
  } catch (err: any) {
    mapForcesError = `The force database isn’t reachable (${err?.message || 'unknown error'}) — the street-level view still works if you zoom in.`;
    status(mapForcesError, true);
  }
  renderCurrentTier();
  if (state.force && centroids[state.force]) panelForce(state.force);
  else panelNational();
}
