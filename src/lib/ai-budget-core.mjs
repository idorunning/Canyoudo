// Pure cost arithmetic for the monthly AI budget guard — shared by the
// Netlify functions (netlify/functions/lib/ai-budget.mts) and the unit tests.
// Prices are USD per million tokens. Thinking tokens are billed as output and
// arrive inside the API's reported output_tokens, so no separate entry needed.

export const MODEL_PRICES_USD_PER_MTOK = {
  'claude-opus-4-8': { input: 15, output: 75 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

// Unknown model ids (e.g. a future env override) are priced as Sonnet — a
// middle guess beats silently not counting them.
const FALLBACK = MODEL_PRICES_USD_PER_MTOK['claude-sonnet-4-6'];

/** Estimated USD cost of one call, from the API's actual usage counts. */
export function costUsd(model, inputTokens, outputTokens) {
  const price = MODEL_PRICES_USD_PER_MTOK[model] ?? FALLBACK;
  const inTok = Number(inputTokens) || 0;
  const outTok = Number(outputTokens) || 0;
  return (inTok * price.input + outTok * price.output) / 1e6;
}

/** The calendar-month bucket a spend belongs to, e.g. "2026-06". */
export function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}
