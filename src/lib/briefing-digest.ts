// The Force Briefing's input: one aggregate-only JSON digest of everything the
// model may cite for a force (or England & Wales). Served by
// /api/police-db?view=briefing-digest and fetched server-side by the
// force-briefing edge function — the client also reads it, both to show the
// key figures and to verify the briefing's numbers against it (figures.mjs).
//
// Aggregate-only is the standing contract for every AI digest on the site: no
// street-level rows, nothing that isn't already public open data.

import {
  ALL,
  crimeByMonth,
  outcomesByMonth,
  ssByMonth,
  ssDim,
  populationByEthnicity,
  forcePopulation,
  force,
} from './police-db';
import { classifyOutcome } from './outcomes.mjs';

const titleCase = (s: string) => String(s).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const pct = (n: number | null) => (n == null ? null : Math.round(n * 1000) / 10);
const per1000 = (count: number, population: number | null) =>
  population ? Math.round((count / population) * 10000) / 10 : null;

export async function buildBriefingDigest(forceId: string) {
  const [crime, outcomes, ss, objects, ethnicity, popTotal, popEth, f] = await Promise.all([
    crimeByMonth(forceId),
    outcomesByMonth(forceId),
    ssByMonth(forceId),
    ssDim(forceId, 'object_of_search'),
    ssDim(forceId, 'officer_ethnicity'),
    forceId === ALL ? Promise.resolve(null) : forcePopulation(forceId),
    forceId === ALL ? Promise.resolve([]) : populationByEthnicity(forceId),
    forceId === ALL ? Promise.resolve(null) : force(forceId),
  ]);
  if (!crime.length) return null;

  const months = [...new Set(crime.map((r) => r.month))].sort();
  const latestMonth = months[months.length - 1];
  const window = months.slice(-12);
  const prevWindow = months.slice(-24, -12);
  const inWin = (win: string[]) => new Set(win);

  // --- recorded crime: categories, last 12 vs previous 12 -------------------
  const catIn = (win: string[]) => {
    const set = inWin(win);
    const by = new Map<string, number>();
    for (const r of crime) if (set.has(r.month)) by.set(r.category, (by.get(r.category) ?? 0) + r.count);
    return by;
  };
  const byCat = catIn(window);
  const byCatPrev = catIn(prevWindow);
  const categories = [...byCat]
    .map(([category, count]) => {
      const prev = byCatPrev.get(category) ?? null;
      return {
        category: titleCase(category),
        last12mo: count,
        previous12mo: prevWindow.length === 12 ? prev ?? 0 : null,
        changePct: prevWindow.length === 12 && prev ? Math.round(((count - prev) / prev) * 1000) / 10 : null,
      };
    })
    .sort((a, b) => b.last12mo - a.last12mo);

  // --- justice gap per aligned 12-month block -------------------------------
  const gapIn = (win: string[]) => {
    const set = inWin(win);
    let charged = 0, noSuspect = 0, total = 0;
    for (const o of outcomes) if (set.has(o.month)) {
      total += o.count;
      const kind = classifyOutcome(o.outcome_category);
      if (kind === 'charged') charged += o.count;
      else if (kind === 'noSuspect') noSuspect += o.count;
    }
    return { outcomesTotal: total, chargedSharePct: pct(total ? charged / total : null), noSuspectSharePct: pct(total ? noSuspect / total : null) };
  };
  const blocks: any[] = [];
  for (let end = months.length; end > 0 && blocks.length < 3; end -= 12) {
    const win = months.slice(Math.max(0, end - 12), end);
    if (win.length < 12 && blocks.length > 0) break;
    const set = inWin(win);
    blocks.unshift({
      from: win[0], to: win[win.length - 1], monthsCovered: win.length,
      totalCrimes: crime.reduce((s, r) => (set.has(r.month) ? s + r.count : s), 0),
      ...gapIn(win),
    });
  }
  const totalLast12 = blocks.length ? blocks[blocks.length - 1].totalCrimes : 0;

  // --- stop & search ---------------------------------------------------------
  const ssWin = ss.filter((r) => inWin(window).has(r.month));
  const ssPrev = ss.filter((r) => inWin(prevWindow).has(r.month));
  const sum = (rows: { total: number }[]) => rows.reduce((s, r) => s + r.total, 0);
  const findKnown = ssWin.reduce((s, r) => s + r.find_known, 0);
  const findCount = ssWin.reduce((s, r) => s + r.find_count, 0);
  const dimTotals = (rows: { month: string; value: string; count: number; find_count: number }[]) => {
    const set = inWin(window);
    const by = new Map<string, { count: number; find: number }>();
    for (const d of rows) if (set.has(d.month)) {
      const e = by.get(d.value) ?? { count: 0, find: 0 };
      e.count += d.count; e.find += d.find_count; by.set(d.value, e);
    }
    return by;
  };
  const objTotals = dimTotals(objects);
  const ethTotals = dimTotals(ethnicity);
  const searchTotal = [...ethTotals.values()].reduce((s, e) => s + e.count, 0) || 1;
  const popEthTotal = popEth.reduce((s: number, p: any) => s + p.population, 0);
  const popShare = new Map(popEth.map((p: any) => [p.ethnicity, p.population / (popEthTotal || 1)]));

  const stopSearch = ssWin.length
    ? {
        searchesLast12mo: sum(ssWin),
        searchesPrevious12mo: ssPrev.length === 12 ? sum(ssPrev) : null,
        findRatePct: pct(findKnown ? findCount / findKnown : null),
        byObjectOfSearch: [...objTotals]
          .map(([value, e]) => ({ object: value, count: e.count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 6),
        byOfficerEthnicity: [...ethTotals]
          .map(([value, e]) => ({
            ethnicity: value,
            searchSharePct: pct(e.count / searchTotal),
            populationSharePct: popShare.has(value) ? pct(popShare.get(value)!) : null,
            findRatePct: pct(e.count ? e.find / e.count : null),
          }))
          .sort((a, b) => (b.searchSharePct ?? 0) - (a.searchSharePct ?? 0)),
        hasPopulationDenominator: popEthTotal > 0,
      }
    : null;

  return {
    dataMonth: latestMonth,
    digest: {
      scope: f?.name ?? (forceId === ALL ? 'England & Wales' : forceId),
      forceId,
      source: 'data.police.uk (OGL v3.0)',
      firstMonth: months[0],
      latestMonth,
      monthsCovered: months.length,
      recordedCrime: {
        totalLast12mo: totalLast12,
        ratePer1000Residents: popTotal ? per1000(totalLast12, popTotal.population) : null,
        populationYear: popTotal?.year ?? null,
        categories,
        twelveMonthBlocks: blocks,
      },
      stopSearch,
    },
  };
}
