// The in-code half of the £100/month AI spend cap (docs/research-assistant-v2.md),
// shared by netlify/functions/research-assist.mts and interpret.mts the same
// way personas.ts is. A monthly running total of estimated spend lives in
// Netlify Blobs; when it crosses the limit, AI calls return a friendly 503
// until the month rolls over. Search, cached answers and cached
// interpretations keep working.
//
// This is the soft governor — deliberately set BELOW the true hard stop, the
// Anthropic Console workspace spend limit (~$120), so this one trips first
// with a graceful message. Approximate by design: a read-then-write race can
// under-count a call or two, and the Console limit backstops that.

import { getStore } from '@netlify/blobs';
import { costUsd, monthKey } from './ai-budget-core.mjs';

// ≈ £88. Override with AI_BUDGET_LIMIT_USD; 0 disables the in-code guard.
const LIMIT_USD = Number(process.env.AI_BUDGET_LIMIT_USD ?? 110);

export const BUDGET_MESSAGE =
  'The assistant has used its monthly budget — it will be back at the start of next month. Everything else still works.';

/** True when this month's estimated spend has hit the cap. Never throws —
 *  if Blobs is unreachable the guard stands aside rather than blocking AI. */
export async function budgetExceeded(): Promise<boolean> {
  if (!(LIMIT_USD > 0)) return false;
  try {
    const raw = await getStore('ai-budget').get(monthKey());
    if (!raw) return false;
    return (JSON.parse(raw).estimatedUsd ?? 0) >= LIMIT_USD;
  } catch {
    return false;
  }
}

/** Add one call's actual token usage to the month's running total. */
export async function recordUsage(model: string, inputTokens: number, outputTokens: number) {
  try {
    const store = getStore('ai-budget');
    const key = monthKey();
    const raw = await store.get(key);
    const current = raw ? Number(JSON.parse(raw).estimatedUsd) || 0 : 0;
    await store.set(
      key,
      JSON.stringify({ estimatedUsd: current + costUsd(model, inputTokens, outputTokens) })
    );
  } catch {
    // Accounting must never break the feature it accounts for.
  }
}
