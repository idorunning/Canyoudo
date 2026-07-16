// Roll raw ss_dim rows (one row per force × month × dimension × value) up to
// one row per value over a recent window. The table deliberately has no
// month-level aggregate — every consumer must do this — and skipping it is
// exactly the bug that rendered dozens of identical "White 2%" rows on
// /data/disproportionality: each month's row became its own chart row, with
// shares computed against an all-months grand total.
//
// Pure and dependency-free so node --test loads it directly. Used by the
// police-db ss-dim and disproportionality views and the db-interpret
// disproportionality digest. briefing-digest.ts keeps its own windowed rollup
// (it windows several datasets around one shared month list).

export function latestMonthOf(rows) {
  let latest = null;
  for (const r of rows) if (r.month && (!latest || r.month > latest)) latest = r.month;
  return latest;
}

// rows: { month, value, count, find_count }[] → one summed entry per value,
// restricted to the `windowMonths` months ending at the latest month present,
// sorted by count descending. When the caller already filtered to a single
// month upstream, the window is a no-op and this is a plain per-value sum.
export function rollupDim(rows, { windowMonths = 12 } = {}) {
  const latestMonth = latestMonthOf(rows);
  if (!latestMonth) return { latestMonth: null, window: null, values: [] };

  const [y, m] = latestMonth.split('-').map(Number);
  const fromD = new Date(Date.UTC(y, m - 1 - (windowMonths - 1), 1));
  const from = `${fromD.getUTCFullYear()}-${String(fromD.getUTCMonth() + 1).padStart(2, '0')}`;

  const by = new Map();
  for (const r of rows) {
    if (!r.month || r.month < from || r.month > latestMonth) continue;
    const e = by.get(r.value) ?? { value: r.value, count: 0, find_count: 0 };
    e.count += r.count;
    e.find_count += r.find_count ?? 0;
    by.set(r.value, e);
  }
  return {
    latestMonth,
    window: { from, to: latestMonth, months: windowMonths },
    values: [...by.values()].sort((a, b) => b.count - a.count),
  };
}
