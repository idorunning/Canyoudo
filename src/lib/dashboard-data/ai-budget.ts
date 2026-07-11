// This month's estimated AI spend for the overview page, read from the same
// Netlify Blobs store that src/lib/ai-budget.ts writes (don't modify that
// file — it's the live guard for the AI functions). Blobs is unavailable in
// plain `astro dev`, so this tile shows its fail-soft reason locally and only
// lights up on Netlify (or under `netlify dev`).

import type { StatSection } from './types';
import { monthKey } from '../ai-budget-core.mjs';

export type AiSpend = { month: string; estimatedUsd: number; limitUsd: number };

export async function getAiSpend(): Promise<StatSection<AiSpend>> {
  const limitUsd = Number(process.env.AI_BUDGET_LIMIT_USD ?? 110);
  try {
    const { getStore } = await import('@netlify/blobs');
    const month = monthKey();
    const raw = await getStore('ai-budget').get(month);
    const estimatedUsd = raw ? Number(JSON.parse(raw).estimatedUsd) || 0 : 0;
    return { ok: true, data: { month, estimatedUsd, limitUsd } };
  } catch {
    return { ok: false, reason: 'AI spend tracking is only available on Netlify.' };
  }
}
