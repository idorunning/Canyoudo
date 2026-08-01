// Pure cost arithmetic for the monthly AI budget guard — shared by the
// Netlify functions (netlify/functions/lib/ai-budget.mts) and the unit tests.
// Prices are USD per million tokens. Thinking tokens are billed as output and
// arrive inside the API's reported output_tokens, so no separate entry needed.

export const MODEL_PRICES_USD_PER_MTOK = {
  'claude-opus-4-8': { input: 15, output: 75 },
  // Sonnet 5 lists at the same $3/$15 as Sonnet 4.6 (intro $2/$10 through
  // 2026-08-31). Priced explicitly so the estimate doesn't silently lean on
  // the Sonnet-4.6 FALLBACK below — the review can run on either.
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  // The research tools' engine (src/lib/openai-core.mjs). Reasoning tokens are
  // billed as output and arrive inside output_tokens, exactly as Anthropic's
  // thinking tokens do — including pro mode, which bills the extra model work
  // it does at these same rates, so no separate pro entry is needed. List
  // prices; cached input is cheaper and very long inputs cost more, neither of
  // which applies at the sizes these calls run at.
  'gpt-5.6-sol': { input: 5, output: 30 },
  'gpt-5.6-terra': { input: 2, output: 12 },
  'gpt-5.6-luna': { input: 0.2, output: 1.2 },
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
