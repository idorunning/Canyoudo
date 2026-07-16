// Computed context lines for the Crime Map — the free, instant stratum of the
// "understanding the numbers" layer. A count on its own says almost nothing:
// these helpers turn counts into rates, comparisons and fixed-vocabulary trend
// words so the panel always says what a number *means*, never just what it is.
// AI readings are the second stratum (on-demand, budget-guarded) — nothing
// here calls a model.
//
// Register rules (the site's More or Less discipline, see personas.ts BASE):
// movements are only ever rising / falling / steady / too early to say; no
// dramatic vocabulary; a rate sentence only when a real denominator exists;
// disparity shares are never called bias.

export const TREND = ['Rising', 'Falling', 'Steady', 'Too early to say'];

const fmt = new Intl.NumberFormat('en-GB');

// Fixed-vocabulary trend: |change| under `threshold` reads as steady; an
// absent or empty previous window is "too early to say", never a fake fall.
export function trendLabel(last12, prev12, { threshold = 0.05 } = {}) {
  if (prev12 == null || !(prev12 > 0)) return 'Too early to say';
  const change = (last12 - prev12) / prev12;
  if (Math.abs(change) < threshold) return 'Steady';
  return change > 0 ? 'Rising' : 'Falling';
}

export function changePct(last12, prev12) {
  if (prev12 == null || !(prev12 > 0)) return null;
  return Math.round(((last12 - prev12) / prev12) * 1000) / 10;
}

export function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const per1000 = (total, population) => (population > 0 ? (total / population) * 1000 : null);

// "close to / somewhat above / well below the England & Wales average" —
// comparative bands so a rate is never left hanging without a reference point.
function compareBand(value, reference) {
  if (!(reference > 0)) return null;
  const ratio = value / reference;
  if (ratio >= 0.9 && ratio <= 1.1) return 'close to';
  if (ratio > 1.25) return 'well above';
  if (ratio > 1.1) return 'somewhat above';
  if (ratio < 0.75) return 'well below';
  return 'somewhat below';
}

const monthName = (m) => {
  const [y, mo] = String(m).split('-').map(Number);
  if (!y || !mo) return String(m);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

// Context sentences for one force. `force` is a view=map-forces row;
// `national` is the response's national aggregate (either may lack
// populations — sentences degrade rather than invent denominators).
export function forceInsightLines(force, national, name) {
  const lines = [];
  const to = national?.windowTo; // optional 'YYYY-MM'
  const rate = per1000(force.total, force.population);
  // The population denominator covers England & Wales only, so the comparison
  // rate must use the E&W numerator (ewTotal), never a total that includes
  // PSNI or BTP.
  const natRate = national ? per1000(national.ewTotal ?? 0, national.population) : null;
  let head = `${name} recorded ${fmt.format(force.total)} crimes in the 12 months${to ? ` to ${monthName(to)}` : ''}`;
  if (rate != null && natRate != null) {
    head += ` — ${rate.toFixed(0)} per 1,000 residents, ${compareBand(rate, natRate)} the England & Wales average of ${natRate.toFixed(0)}.`;
  } else if (rate != null) {
    head += ` — ${rate.toFixed(0)} per 1,000 residents.`;
  } else {
    head += '.';
  }
  lines.push(head);

  const label = trendLabel(force.total, force.prevTotal);
  const pctChange = changePct(force.total, force.prevTotal);
  if (label === 'Too early to say') {
    lines.push('The data doesn’t reach back far enough to compare with the previous 12 months — too early to say which way it’s moving.');
  } else if (label === 'Steady') {
    lines.push(`That’s within ${Math.abs(pctChange)}% of the previous 12 months — steady.`);
  } else {
    lines.push(`That’s ${Math.abs(pctChange)}% ${pctChange > 0 ? 'higher' : 'lower'} than the previous 12 months — ${label.toLowerCase()}.`);
  }
  return lines;
}

// The national panel's context: headline + how spread the force rates are.
export function nationalInsightLines(national, forces) {
  if (!national) return [];
  const lines = [];
  // The trend compares like with like: only forces whose previous 12-month
  // window is complete contribute to both sides (trendTotal ↔ prevTotal).
  const trendBase = national.trendTotal ?? national.total;
  const label = trendLabel(trendBase, national.prevTotal);
  const pctChange = changePct(trendBase, national.prevTotal);
  let head = `${fmt.format(national.total)} crimes recorded across all forces in 12 months`;
  if (label === 'Too early to say') head += '.';
  else if (label === 'Steady') head += ` — within ${Math.abs(pctChange)}% of the previous 12 months, steady.`;
  else head += ` — ${Math.abs(pctChange)}% ${pctChange > 0 ? 'higher' : 'lower'} than the previous 12 months, ${label.toLowerCase()}.`;
  lines.push(head);

  const rates = (forces ?? [])
    .map((f) => per1000(f.total, f.population))
    .filter((r) => r != null);
  if (rates.length >= 10) {
    lines.push(`Rates run from ${Math.min(...rates).toFixed(0)} to ${Math.max(...rates).toFixed(0)} crimes per 1,000 residents by force — raw counts mostly reflect how many people live there, so compare rates, not dots.`);
  } else {
    lines.push('Bigger dots mostly mean bigger populations — a raw count is not a rate. Tap a force for its context.');
  }
  return lines;
}

// "214 crimes — 8× the median hotspot shown on this map."
export function hotspotInsight(count, counts) {
  const med = median(counts);
  if (!(med > 0)) return `${fmt.format(count)} crimes this month.`;
  const ratio = count / med;
  if (ratio >= 0.8 && ratio <= 1.25) return `${fmt.format(count)} crimes this month — about the median hotspot on this map.`;
  const times = ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10;
  return `${fmt.format(count)} crimes this month — ${times}× the median hotspot on this map.`;
}

// Tier-3 street points → what this view actually contains.
export function viewSummary(points) {
  const byCategory = new Map();
  const byStreet = new Map();
  for (const p of points) {
    byCategory.set(p.category, (byCategory.get(p.category) ?? 0) + 1);
    if (p.street) byStreet.set(p.street, (byStreet.get(p.street) ?? 0) + 1);
  }
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  return { total: points.length, topCategories: top(byCategory, 3), topStreets: top(byStreet, 3) };
}

// One ethnicity row from view=disproportionality → a careful sentence.
// "Disparity" is only claimed when there is one: ratios near 1 are said to be
// in line, ratios below 1 are below the resident share — never "a 0.6× disparity".
// group: { ethnicity, searchShare, populationShare, disparityRatio }
export function disparityLine(group) {
  const s = Math.round(group.searchShare * 100);
  if (group.populationShare == null || group.disparityRatio == null) {
    return `${group.ethnicity}: ${s}% of searches (no population share loaded for comparison).`;
  }
  const p = Math.round(group.populationShare * 100);
  const ratio = Math.round(group.disparityRatio * 10) / 10;
  const base = `${group.ethnicity} people account for ${s}% of searches and ${p}% of residents`;
  if (ratio >= 0.9 && ratio <= 1.1) return `${base} — in line with their share of the population.`;
  if (ratio < 0.9) return `${base} — below their share of the population (${ratio}×).`;
  return `${base} — a ${ratio}× disparity.`;
}

export const DISPARITY_CAVEAT =
  'A disparity ratio compares who is searched with who lives here. It is a starting question, not proof of bias — it has no denominator for who police encounter, where patrols are tasked, or local crime mix.';
