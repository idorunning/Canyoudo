// Shared shape for every dashboard data source (moved from the original
// src/lib/dashboard-stats.ts): if a service isn't configured, its section
// quietly reports "not connected yet" instead of throwing, so a missing API
// key never takes down a whole page.

export type StatSection<T> = { ok: true; data: T } | { ok: false; reason: string };

export async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
