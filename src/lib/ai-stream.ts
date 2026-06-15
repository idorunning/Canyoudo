// Shared streaming helper for the DB-backed interpretation functions. Mirrors the
// inline streamer in netlify/functions/interpret.mts (Markdown out, token usage
// read off the stream and charged to the monthly budget, optional Blobs cache)
// so the new police-database functions don't each re-implement it.

import { recordUsage } from './ai-budget';

export function streamMarkdown(
  aiStream: any,
  opts: { store?: any; key?: string | null; model: string; modelLabel: string; dataMonth?: string; extraHeaders?: Record<string, string> }
): Response {
  const enc = new TextEncoder();
  let full = '';
  let inputTokens = 0;
  let outputTokens = 0;
  const { store, key, model, modelLabel, dataMonth = '', extraHeaders = {} } = opts;

  const body = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of aiStream) {
          if (event.type === 'message_start') inputTokens = event.message?.usage?.input_tokens ?? 0;
          else if (event.type === 'message_delta' && event.usage) outputTokens = event.usage.output_tokens ?? outputTokens;
          else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            full += event.delta.text;
            controller.enqueue(enc.encode(event.delta.text));
          }
        }
        if (store && key && full.trim()) await store.set(key, full);
      } catch {
        controller.enqueue(enc.encode('\n\n_Interrupted — please try again._'));
      } finally {
        await recordUsage(model, inputTokens, outputTokens);
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'x-cache': key ? 'MISS' : 'LIVE',
      'x-data-month': dataMonth,
      'x-model': modelLabel,
      ...extraHeaders,
    },
  });
}
