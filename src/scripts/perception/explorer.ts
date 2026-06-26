// Interactive controller for the perception explorer. Progressive enhancement:
// the .astro component renders a working static fallback (default-year cloud,
// top-words table, sentiment spine); this script adds the year slider with
// play/animate, facet tabs, dimension views, client-redrawn trend/entity charts
// and the social-media context overlay. All data comes from the one-file bundle.

import { loadBundle, FACETS, THEME_KEYS, milestoneYear, type Bundle, type FacetKey, type YearData } from './data';

const THEME_COLORS: Record<string, string> = {
  trust: '#2f7d52', misconduct: '#b3402f', reform: '#3b6ea5', race: '#8a5a2b', leadership: '#6d4c91',
};

const CHART_W = 720;
const CHART_H = 300;
const PAD = { l: 40, r: 14, t: 24, b: 28 };
const innerW = CHART_W - PAD.l - PAD.r;
const innerH = CHART_H - PAD.t - PAD.b;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function initPerceptionExplorer(): void {
  const root = document.querySelector<HTMLElement>('[data-perception]');
  if (!root) return;

  loadBundle().then((bundle) => wire(root, bundle)).catch(() => {
    /* keep the static fallback on any failure */
  });
}

function wire(root: HTMLElement, bundle: Bundle): void {
  const years = bundle.years.slice().sort((a, b) => a.year - b.year);
  const byYear = new Map(years.map((y) => [y.year, y]));
  const minYear = years[0].year;
  const maxYear = years[years.length - 1].year;

  const state = { facet: 'police-general' as FacetKey, year: maxYear, view: 'cloud', context: false };
  let timer: number | null = null;

  const $ = <T extends Element>(sel: string) => root.querySelector<T>(sel);
  const cloud = $<HTMLImageElement>('[data-cloud]');
  const topwords = $<HTMLElement>('[data-topwords]');
  const slider = $<HTMLInputElement>('[data-year-slider]');
  const yearLabel = $<HTMLElement>('[data-year-label]');
  const play = $<HTMLButtonElement>('[data-play]');
  const statItems = $<HTMLElement>('[data-stat-items]');
  const statNeg = $<HTMLElement>('[data-stat-neg]');
  const caveat = $<HTMLElement>('[data-caveat]');
  const sentFallback = $<HTMLElement>('[data-sentiment-fallback]');
  const sentChart = $<HTMLElement>('[data-sentiment-chart]');
  const contextToggle = $<HTMLInputElement>('[data-context-toggle]');

  // Client owns the sentiment chart now (so facet + overlay work).
  if (sentFallback) sentFallback.hidden = true;
  if (sentChart) sentChart.hidden = false;

  function cur(): YearData {
    return byYear.get(state.year)!;
  }

  // --- word bar-chart-race (the animated "Words" view) ---------------------
  // The static SVG just swapped wholesale each year, so words flicked on/off
  // with no continuity. Here each word is a PERSISTENT, keyed row: its bar width
  // tracks frequency (grow/shrink) and its vertical position tracks rank (a slide
  // up/down as words rise and fall), so a play-through reads as motion you can
  // follow. CSS transitions do the morph; reduced-motion users get instant swaps.
  const ROW = 30; // px per bar row
  const TOPN = 20; // bars in the race (scroll to see ranks past the fold)
  const VISIBLE = 12; // rows visible before the race scrolls
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const DUR = reduceMotion ? 0 : 0.9; // seconds — the bar/slide transition (slow enough to follow a swap)
  // Fixed per-facet max rate across ALL years, so a bar's length is comparable
  // year-to-year; that's what makes the growth/shrink read as real change rather
  // than a per-year rescale.
  const facetMax: Record<string, number> = {};
  for (const f of FACETS) {
    let m = 0;
    for (const y of years) for (const w of y.facets[f].topWords) m = Math.max(m, w.ratePer10k);
    facetMax[f] = m || 1;
  }
  const raceRows = new Map<string, HTMLElement>();
  // Dark label ink + the site's light-orange bar fill (matching the hand-drawn
  // annotations elsewhere), so the year-by-year race reads in one warm palette.
  const LABEL_INK = '#3a3733';
  const BAR_FILL = '#F2994A';
  // Noise words to drop, and display casing (met→MET, hague→Hague), shared with
  // the static SVG via the bundle.
  const hideSet = new Set(bundle.wordHide ?? []);
  // Display casing: an explicit override (MET, "Sarah Everard", "Cannabis") wins;
  // otherwise capitalise the first letter so every word reads as a proper token.
  const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const display = (term: string): string => bundle.wordDisplay?.[term] ?? cap(term);
  // Significant events by year (for animated bubble annotation).
  const eventsByYear = new Map<number, string[]>();
  for (const e of bundle.events ?? []) {
    const list = eventsByYear.get(e.year) ?? [];
    list.push(e.label);
    eventsByYear.set(e.year, list);
  }
  const race = $<HTMLElement>('[data-wordrace]');
  // A spacer establishes the scroll height: the bar rows are absolutely
  // positioned (so they can slide/re-rank), which means they don't contribute
  // height on their own. The spacer (in-flow, sized to the word count) gives the
  // scroll container something to scroll, so ranks past the visible fold are
  // reachable. The visible window is VISIBLE rows tall; the rest scrolls.
  let spacer: HTMLElement | null = null;
  if (race) {
    race.style.height = ROW * VISIBLE + 'px';
    spacer = document.createElement('div');
    spacer.style.cssText = 'width:1px;flex:none;pointer-events:none;';
    race.appendChild(spacer);
    if (cloud) cloud.hidden = true; // the live race replaces the static image
    // The race IS the word list now — hide the static text list (kept for no-JS).
    const wordlist = $<HTMLElement>('[data-wordlist]');
    if (wordlist) wordlist.hidden = true;
  }

  function makeRow(term: string): HTMLElement {
    const row = document.createElement('div');
    // top-0 is essential: the rows are absolutely positioned and the in-flow
    // spacer would otherwise push their static origin below it, leaving blank
    // space above and forcing a scroll to reach the top word.
    row.className = 'absolute top-0 left-0 right-0 flex items-center gap-2';
    row.style.height = ROW + 'px';
    row.style.transition = `transform ${DUR}s cubic-bezier(.4,0,.2,1), opacity ${DUR}s`;
    row.style.willChange = 'transform';
    // Label: no truncation — a wider column + smaller, non-wrapping text keeps even
    // "Stephen Lawrence" / "Cressida Dick" fully readable on one line.
    row.innerHTML =
      `<span class="w-28 sm:w-36 shrink-0 text-right font-sans text-[11px] font-medium leading-tight whitespace-nowrap" style="color:${LABEL_INK}">${esc(display(term))}</span>` +
      `<span class="relative flex-1 h-4 rounded-sm bg-paper-200"><span data-bar class="absolute inset-y-0 left-0 rounded-sm" style="width:0%;background:${BAR_FILL};transition:width ${DUR}s cubic-bezier(.4,0,.2,1)"></span></span>` +
      `<span data-val class="w-10 shrink-0 font-sans text-xs tabular-nums text-ink-400"></span>`;
    return row;
  }

  function renderWords(): void {
    if (!race) return;
    race.hidden = false;
    const words = cur().facets[state.facet].topWords
      .filter((w) => !hideSet.has(w.term))
      .sort((a, b) => b.ratePer10k - a.ratePer10k)
      .slice(0, TOPN);
    // Container fits the visible window; the spacer carries the full scroll height
    // so lower ranks are reachable, while a sparse year leaves no empty gap.
    if (race) race.style.height = Math.min(VISIBLE, words.length) * ROW + 'px';
    if (spacer) spacer.style.height = words.length * ROW + 'px';
    const max = facetMax[state.facet] || 1;
    const present = new Set<string>();
    words.forEach((w, rank) => {
      present.add(w.term);
      const pct = Math.max(2, Math.min(100, Math.round((w.ratePer10k / max) * 100)));
      let row = raceRows.get(w.term);
      if (!row) {
        row = makeRow(w.term);
        race.appendChild(row);
        raceRows.set(w.term, row);
        // Start just below the chart, then rise into rank on the next frame so a
        // new word slides up into the race rather than popping in.
        row.style.transform = `translateY(${TOPN * ROW}px)`;
        row.style.opacity = '0';
        const bar = row.querySelector<HTMLElement>('[data-bar]')!;
        requestAnimationFrame(() => {
          row!.style.transform = `translateY(${rank * ROW}px)`;
          row!.style.opacity = '1';
          bar.style.width = pct + '%';
        });
      } else {
        row.style.transform = `translateY(${rank * ROW}px)`;
        row.style.opacity = '1';
        row.querySelector<HTMLElement>('[data-bar]')!.style.width = pct + '%';
      }
      row.querySelector<HTMLElement>('[data-val]')!.textContent = String(w.ratePer10k);
    });
    // Words that dropped out of the top N: fade + collapse and park below the
    // fold, kept in the map so a later re-entry revives the same element smoothly.
    for (const [term, row] of raceRows) {
      if (present.has(term)) continue;
      row.style.opacity = '0';
      row.style.transform = `translateY(${TOPN * ROW}px)`;
      row.querySelector<HTMLElement>('[data-bar]')!.style.width = '0%';
    }
  }

  function renderCloud(): void {
    const yd = cur();
    if (race) {
      renderWords(); // animated bar race (the enhanced view)
    } else if (cloud) {
      cloud.src = `/images/perception/${state.year}-${state.facet}.svg`;
      cloud.alt = `Word cloud of ${bundle.facetLabels[state.facet]} coverage in ${state.year}`;
    }
    if (topwords) {
      // Static no-JS fallback list — single neutral ink, no sentiment colouring.
      topwords.innerHTML = yd.facets[state.facet].topWords
        .filter((w) => !hideSet.has(w.term))
        .slice(0, 40)
        .map(
          (w) =>
            `<li class="flex justify-between gap-2"><span style="color:${LABEL_INK};font-weight:500">${esc(display(w.term))}</span><span class="text-ink-400 tabular-nums">${w.ratePer10k}</span></li>`
        )
        .join('');
    }
  }

  function renderStats(): void {
    const yd = cur();
    const f = yd.facets[state.facet];
    if (statItems) statItems.textContent = String(yd.provenance.itemCount);
    if (statNeg) {
      const s = f.sentiment;
      const total = s.positive + s.neutral + s.negative;
      statNeg.textContent = total > 0 ? Math.round((s.negative / total) * 100) + '%' : '—';
    }
    if (caveat) {
      caveat.innerHTML =
        (yd.provenance.sparse ? '<span class="text-accent">Sparse year — fewer online sources survive; read with caution. </span>' : '') +
        `Method: ${esc(yd.provenance.method)}. Tone and counts are derived aggregates over the sampled headlines; no article text is stored.`;
    }
  }

  // --- charts --------------------------------------------------------------
  function axisYears(): string {
    let out = '';
    for (let y = minYear; y <= maxYear; y++) {
      if (y % 5 !== 0) continue;
      const x = PAD.l + ((y - minYear) / (maxYear - minYear)) * innerW;
      out += `<text x="${x}" y="${CHART_H - 8}" font-size="10" fill="#8a857c" text-anchor="middle" font-family="system-ui,sans-serif">${y}</text>`;
    }
    return out;
  }
  const xf = (y: number) => PAD.l + ((y - minYear) / (maxYear - minYear || 1)) * innerW;

  function line(points: { year: number; value: number }[], lo: number, hi: number, color: string, width = 2, opacity = 1): string {
    const span = hi - lo || 1;
    const yf = (v: number) => PAD.t + innerH - ((v - lo) / span) * innerH;
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${xf(p.year).toFixed(1)},${yf(p.value).toFixed(1)}`).join(' ');
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-opacity="${opacity}" stroke-linejoin="round" stroke-linecap="round"/>`;
  }

  // Milestones that fall inside the chart's year span, grouped by year and
  // ordered — shared by the on-chart badges and the readable legend below.
  function milestoneGroups(): { year: number; labels: string[] }[] {
    if (!bundle.context) return [];
    const byYear = new Map<number, string[]>();
    for (const m of bundle.context.milestones) {
      const y = milestoneYear(m.date);
      if (y < minYear || y > maxYear) continue;
      (byYear.get(y) ?? byYear.set(y, []).get(y)!).push(m.label);
    }
    return [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, labels]) => ({ year, labels }));
  }

  // On-chart context: a dashed line + a small NUMBERED badge at each milestone
  // year (the words go in a readable legend below, not as tiny rotated text that
  // was illegible on a phone). Plus the social-news-adoption line.
  function contextLayer(): string {
    if (!state.context || !bundle.context) return '';
    let out = '';
    milestoneGroups().forEach((g, i) => {
      const x = xf(g.year);
      out +=
        `<line x1="${x}" x2="${x}" y1="${PAD.t + 9}" y2="${PAD.t + innerH}" stroke="#cdb9a8" stroke-width="1" stroke-dasharray="2 3"/>` +
        `<circle cx="${x}" cy="${PAD.t + 2}" r="7.5" fill="#9c5b3b"/>` +
        `<text x="${x}" y="${PAD.t + 5.2}" font-size="9.5" fill="#fff" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="700">${i + 1}</text>`;
    });
    const adopt = bundle.context.adoption.filter((a) => a.year >= minYear && a.year <= maxYear);
    if (adopt.length > 1) {
      const yf = (v: number) => PAD.t + innerH - (v / 100) * innerH;
      const d = adopt.map((a, i) => `${i ? 'L' : 'M'}${xf(a.year).toFixed(1)},${yf(a.share).toFixed(1)}`).join(' ');
      out += `<path d="${d}" fill="none" stroke="#b08968" stroke-width="1.5" stroke-dasharray="4 3"/>`;
    }
    return out;
  }

  // Readable, mobile-friendly legend listing each numbered milestone in full.
  function contextLegend(): string {
    if (!state.context || !bundle.context) return '';
    const items = milestoneGroups()
      .map(
        (g, i) =>
          `<li class="flex gap-2 items-start"><span class="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full bg-accent text-paper-50 text-[10px] font-semibold tabular-nums">${i + 1}</span><span class="leading-snug"><span class="tabular-nums text-ink-500">${g.year}</span> · ${esc(g.labels.join('; '))}</span></li>`
      )
      .join('');
    return (
      `<div class="mt-3 font-sans text-xs text-ink-700">` +
      `<p class="uppercase tracking-[0.15em] text-ink-500 mb-1.5">Social-media milestones</p>` +
      `<ol class="space-y-1.5">${items}</ol>` +
      `<p class="mt-2 text-ink-500 flex items-center gap-1.5"><span style="width:18px;height:0;border-top:2px dashed #b08968;display:inline-block"></span> Share of Britons getting news via social media (%)</p>` +
      `</div>`
    );
  }

  function nowMarker(): string {
    return `<line x1="${xf(state.year)}" x2="${xf(state.year)}" y1="${PAD.t}" y2="${PAD.t + innerH}" stroke="#44423d" stroke-width="1.5"/>`;
  }

  function svgWrap(inner: string, label: string): string {
    return `<figure class="not-prose my-2"><figcaption class="font-sans text-xs uppercase tracking-[0.15em] text-ink-500 mb-2">${esc(label)}</figcaption><svg width="100%" viewBox="0 0 ${CHART_W} ${CHART_H}" role="img" aria-label="${esc(label)}">${inner}</svg></figure>`;
  }

  // Sentiment reframed as positive vs negative word proportions — two lines,
  // red for negative%, green for positive%, y-axis in %. The old "mean tone"
  // decimal is gone; this is legible to any reader without explanation.
  function renderSentiment(): void {
    if (!sentChart) return;
    const pts = years.map((y) => {
      const s = y.facets[state.facet].sentiment;
      const total = s.positive + s.neutral + s.negative;
      return {
        year: y.year,
        negPct: total > 0 ? (s.negative / total) * 100 : 0,
        posPct: total > 0 ? (s.positive / total) * 100 : 0,
      };
    });
    const hi = Math.max(...pts.flatMap((p) => [p.negPct, p.posPct]), 5) * 1.18;
    const lo = 0;

    // Faint horizontal gridlines with % labels.
    let inner = '';
    const gridSteps = [25, 50, 75, 100].filter((g) => g <= hi * 1.05);
    for (const g of gridSteps) {
      const gy = PAD.t + innerH - (g / hi) * innerH;
      inner += `<line x1="${PAD.l}" x2="${CHART_W - PAD.r}" y1="${gy}" y2="${gy}" stroke="#ece7dd" stroke-width="1"/>`;
      inner += `<text x="${PAD.l - 3}" y="${gy + 3}" font-size="8" fill="#8a857c" text-anchor="end" font-family="system-ui,sans-serif">${g}%</text>`;
    }

    inner += contextLayer();
    inner += line(pts.map((p) => ({ year: p.year, value: p.negPct })), lo, hi, '#b3402f', 2.2);
    inner += line(pts.map((p) => ({ year: p.year, value: p.posPct })), lo, hi, '#2f7d52', 2.2);
    inner += nowMarker();
    inner += axisYears();

    const legend =
      `<span class="inline-flex items-center gap-1.5 mr-4"><span style="width:11px;height:11px;background:#b3402f;display:inline-block;border-radius:2px"></span>Negative words %</span>` +
      `<span class="inline-flex items-center gap-1.5"><span style="width:11px;height:11px;background:#2f7d52;display:inline-block;border-radius:2px"></span>Positive words %</span>`;

    sentChart.innerHTML =
      svgWrap(inner, 'Positive vs negative words in UK police coverage, per year') +
      `<p class="font-sans text-xs text-ink-600 mt-2 flex flex-wrap gap-y-1">${legend}</p>` +
      contextLegend();
  }

  // Themes as small multiples — one auto-scaled mini SVG per theme so lines
  // don't compete for space or compress against a shared zero-floor.
  function renderThemes(): void {
    const host = $<HTMLElement>('[data-themes-chart]');
    if (!host) return;

    const MINI_W = 220;
    const MINI_H = 140;
    const MP = { l: 30, r: 8, t: 28, b: 22 };
    const mW = MINI_W - MP.l - MP.r;
    const mH = MINI_H - MP.t - MP.b;
    const xfm = (y: number) => MP.l + ((y - minYear) / (maxYear - minYear || 1)) * mW;

    let html = '';
    for (const key of THEME_KEYS) {
      const pts = years.map((y) => ({ year: y.year, value: y.facets[state.facet].lexicons[key].ratePer10k }));
      const maxVal = Math.max(...pts.map((p) => p.value), 0.01);
      const hiVal = maxVal * 1.15;
      const color = THEME_COLORS[key];

      const yfm = (v: number) => MP.t + mH - (v / hiVal) * mH;

      // Area fill + line
      const linePath = pts.map((p, i) => `${i ? 'L' : 'M'}${xfm(p.year).toFixed(1)},${yfm(p.value).toFixed(1)}`).join(' ');
      const areaPath = linePath + ` L${xfm(pts[pts.length - 1].year).toFixed(1)},${yfm(0).toFixed(1)} L${xfm(pts[0].year).toFixed(1)},${yfm(0).toFixed(1)} Z`;

      // "Now" vertical marker
      const nowX = xfm(state.year);

      // Max value label on y-axis
      const maxLabel = maxVal < 1 ? maxVal.toFixed(2) : maxVal.toFixed(1);

      // Year axis ticks (start + end only, to keep it uncluttered)
      const yearAxis =
        `<text x="${xfm(minYear)}" y="${MINI_H - 5}" font-size="8" fill="#8a857c" text-anchor="middle" font-family="system-ui,sans-serif">${minYear}</text>` +
        `<text x="${xfm(maxYear)}" y="${MINI_H - 5}" font-size="8" fill="#8a857c" text-anchor="middle" font-family="system-ui,sans-serif">${maxYear}</text>`;

      const svgInner =
        // Filled area
        `<path d="${areaPath}" fill="${color}" fill-opacity="0.12"/>` +
        // Line
        `<path d="${linePath}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` +
        // "Now" marker
        `<line x1="${nowX}" x2="${nowX}" y1="${MP.t}" y2="${MP.t + mH}" stroke="${color}" stroke-width="1.5" stroke-opacity="0.45"/>` +
        // Y axis max label
        `<text x="${MP.l - 3}" y="${MP.t + 3}" font-size="7.5" fill="#8a857c" text-anchor="end" font-family="system-ui,sans-serif">${maxLabel}</text>` +
        // Zero label
        `<text x="${MP.l - 3}" y="${MP.t + mH + 1}" font-size="7.5" fill="#8a857c" text-anchor="end" font-family="system-ui,sans-serif">0</text>` +
        // Y axis line
        `<line x1="${MP.l}" x2="${MP.l}" y1="${MP.t}" y2="${MP.t + mH}" stroke="#d8d2c6" stroke-width="1"/>` +
        // Theme label
        `<text x="${MP.l + 2}" y="${MP.t - 9}" font-size="10" fill="${color}" font-weight="600" font-family="system-ui,sans-serif">${key.charAt(0).toUpperCase() + key.slice(1)}</text>` +
        yearAxis;

      html += `<div><svg width="100%" viewBox="0 0 ${MINI_W} ${MINI_H}" role="img" aria-label="${esc(key + ' theme mentions per 10k words over time')}">${svgInner}</svg></div>`;
    }

    host.innerHTML = html;
  }

  // "Who & what": two clean, clearly-separated lists rather than one jumble.
  //   • Police forces  — entities typed 'force' only (no role-titles, no people).
  //   • People         — named individuals, split into police figures (entities
  //     typed leader/officer) and members of the public (victims/figures who live
  //     in the word data, surfaced via the curated set below).
  // Role-titles ("Detective", "Chief constable", "Commissioner") are dropped — a
  // title is not a "who". Entities are aggregated across all three facets so the
  // single view is as rich as the data allows.
  const PUBLIC_PEOPLE = ['everard', 'lawrence', 'duggan', 'tomlinson', 'meneze', 'menezes'];

  function bars(items: { label: string; value: number }[]): string {
    if (!items.length) return '<p class="text-ink-400 text-sm italic">None named this year.</p>';
    const max = Math.max(...items.map((i) => i.value), 1);
    return items
      .map((i) => {
        const w = Math.round((i.value / max) * 100);
        return `<div class="flex items-center gap-2 text-sm"><span class="w-44 shrink-0 truncate text-ink-700">${esc(i.label)}</span><span class="h-3 rounded-sm" style="width:${w}%;background:#9c5b3b"></span><span class="text-ink-400 tabular-nums text-xs">${i.value}</span></div>`;
      })
      .join('');
  }

  function renderEntities(): void {
    const host = $<HTMLElement>('[data-entities-chart]');
    if (!host) return;
    const yd = cur();

    // Aggregate entities across all facets for this year (sum counts by name).
    const agg = new Map<string, { name: string; type: string; count: number }>();
    for (const f of FACETS) {
      for (const e of yd.facets[f]?.entities ?? []) {
        const prev = agg.get(e.name);
        if (prev) prev.count += e.count;
        else agg.set(e.name, { name: e.name, type: e.type, count: e.count });
      }
    }
    const all = [...agg.values()];

    const forces = all
      .filter((e) => e.type === 'force')
      .sort((a, b) => b.count - a.count)
      .slice(0, 12)
      .map((e) => ({ label: e.name, value: e.count }));

    const policePeople = all
      .filter((e) => e.type === 'leader' || e.type === 'officer')
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((e) => ({ label: e.name, value: e.count }));

    // Members of the public: pull curated person-words from this year's
    // police-general topWords, displayed via the full-name map.
    const words = new Map(yd.facets['police-general']?.topWords.map((w) => [w.term, w.count]) ?? []);
    const publicPeople = PUBLIC_PEOPLE.filter((t) => words.has(t))
      .map((t) => ({ label: display(t), value: words.get(t)! }))
      .sort((a, b) => b.value - a.value);

    const section = (title: string, body: string) =>
      `<div><p class="font-sans text-xs uppercase tracking-[0.15em] text-ink-500 mb-2">${esc(title)}</p><div class="space-y-1.5 font-sans">${body}</div></div>`;

    host.innerHTML =
      `<p class="font-sans text-sm text-ink-600 mb-4">Who got named in ${state.year}, by mentions.</p>` +
      `<div class="grid sm:grid-cols-2 gap-x-8 gap-y-6">` +
      section('Police forces', bars(forces)) +
      `<div class="space-y-5">` +
      section('People — police figures', bars(policePeople)) +
      section('People — members of the public', bars(publicPeople)) +
      `</div>` +
      `</div>`;
  }

  function setView(view: string): void {
    state.view = view;
    root.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => {
      p.hidden = p.getAttribute('data-panel') !== view;
    });
    root.querySelectorAll<HTMLButtonElement>('[data-view-tab]').forEach((b) => {
      const on = b.getAttribute('data-view-tab') === view;
      b.classList.toggle('bg-ink-900', on);
      b.classList.toggle('text-paper-50', on);
      b.classList.toggle('border-ink-900', on);
    });
    renderView();
  }

  function renderView(): void {
    if (state.view === 'cloud') renderCloud();
    else if (state.view === 'sentiment') renderSentiment();
    else if (state.view === 'themes') renderThemes();
    else if (state.view === 'entities') renderEntities();
  }

  // Significant policing events shown as animated pill bubbles below the race.
  // Each event for the current year pops in when the slider lands on it; clearing
  // when the year changes. A single neutral style is used for all events — some
  // describe deaths and tragedies, and colour-coding by type would trivialise them.
  function renderBubbles(): void {
    const zone = $<HTMLElement>('[data-events-zone]');
    if (!zone) return;
    zone.innerHTML = '';
    const labels = eventsByYear.get(state.year) ?? [];
    for (const label of labels) {
      const pill = document.createElement('span');
      pill.style.cssText =
        'display:inline-block;padding:0.3rem 0.75rem;border-radius:9999px;' +
        'background:rgba(60,55,50,0.06);border:1px solid rgba(60,55,50,0.22);' +
        'color:#3a3733;font-size:0.78rem;font-family:system-ui,sans-serif;' +
        'line-height:1.4;animation:bubbleIn 0.35s ease both;';
      pill.textContent = label;
      zone.appendChild(pill);
    }
  }

  function render(): void {
    if (yearLabel) yearLabel.textContent = String(state.year);
    if (slider) slider.value = String(state.year);
    renderCloud(); // keep the cloud + table current even when another view is open
    renderStats();
    renderBubbles();
    renderView();
  }

  // --- events --------------------------------------------------------------
  root.querySelectorAll<HTMLButtonElement>('[data-view-tab]').forEach((b) => {
    b.addEventListener('click', () => setView(b.getAttribute('data-view-tab')!));
  });
  slider?.addEventListener('input', () => {
    state.year = Number(slider.value);
    render();
  });
  // Year steppers — move one year at a time, clamped to the range.
  const stepYear = (delta: number) => {
    const next = Math.min(maxYear, Math.max(minYear, state.year + delta));
    if (next === state.year) return;
    state.year = next;
    render();
  };
  $<HTMLButtonElement>('[data-year-prev]')?.addEventListener('click', () => stepYear(-1));
  $<HTMLButtonElement>('[data-year-next]')?.addEventListener('click', () => stepYear(1));
  contextToggle?.addEventListener('change', () => {
    state.context = contextToggle.checked;
    renderView();
  });

  // Full-screen the whole explorer for a focused, big-canvas play-through.
  const fsBtn = $<HTMLButtonElement>('[data-fullscreen]');
  fsBtn?.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else root.requestFullscreen?.();
  });
  document.addEventListener('fullscreenchange', () => {
    if (fsBtn) fsBtn.textContent = document.fullscreenElement ? '⤢ Exit full screen' : '⤢ Full screen';
  });

  play?.addEventListener('click', () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
      play.textContent = '▶ Play';
      return;
    }
    play.textContent = '❚❚ Pause';
    if (state.year >= maxYear) state.year = minYear;
    timer = window.setInterval(() => {
      state.year = state.year >= maxYear ? minYear : state.year + 1;
      render();
      if (state.year === maxYear) {
        clearInterval(timer!);
        timer = null;
        play.textContent = '▶ Play';
      }
    }, 2200); // slow, so each year's swap/grow/shrink has time to land and be read
  });

  render();
}
