// Shared streaming helper for the AI functions. Mirrors the inline streamer in
// netlify/functions/interpret.mts (Markdown out, token usage read off the
// stream and charged to the monthly budget, optional Blobs cache) so the
// police-database and research-review functions don't each re-implement it.

import { recordUsage } from './ai-budget';

export function streamMarkdown(
  aiStream: any,
  opts: {
    store?: any;
    key?: string | null;
    model: string;
    modelLabel: string;
    dataMonth?: string;
    extraHeaders?: Record<string, string>;
    /** Emitted immediately, before the model produces anything — see below. */
    preamble?: string;
    /** Extra gate on caching the finished text (e.g. "has citations"). */
    shouldCache?: (full: string) => boolean;
  }
): Response {
  const enc = new TextEncoder();
  let full = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let stopReason: string | null = null;
  const { store, key, model, modelLabel, dataMonth = '', extraHeaders = {}, preamble, shouldCache } = opts;

  const body = new ReadableStream({
    async start(controller) {
      // Enqueue tolerantly: once the client disconnects the controller is
      // dead, but the loop should still finish cleanly (usage accounting).
      const send = (text: string) => {
        try {
          controller.enqueue(enc.encode(text));
        } catch {}
      };
      try {
        // An immediate first byte, before the model has produced anything.
        // A thinking model can sit silent for tens of seconds before its first
        // text token; this keeps time-to-first-byte inside any platform limit.
        // Cosmetic only — not part of the cached text (clients trim it).
        if (preamble) send(preamble);
        for await (const event of aiStream) {
          if (event.type === 'message_start') {
            inputTokens = event.message?.usage?.input_tokens ?? 0;
          } else if (event.type === 'message_delta') {
            if (event.usage) outputTokens = event.usage.output_tokens ?? outputTokens;
            stopReason = event.delta?.stop_reason ?? stopReason;
          } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            full += event.delta.text;
            send(event.delta.text);
          }
        }
        // Cache only a usable, complete text: a max_tokens truncation would
        // otherwise be replayed as if it were the finished article, forever.
        // The caller's shouldCache adds a content check on top (e.g. the
        // research review requires citations + its confidence line).
        const complete = stopReason !== 'max_tokens';
        if (store && key && full.trim() && complete && (!shouldCache || shouldCache(full))) {
          await store.set(key, full);
        }
      } catch {
        send('\n\n_Interrupted — please try again._');
      } finally {
        await recordUsage(model, inputTokens, outputTokens);
        try {
          controller.close();
        } catch {}
      }
    },
    cancel() {
      // The client went away (tab closed, run superseded): stop the model
      // call rather than paying for tokens nobody will read.
      try {
        aiStream.abort?.();
      } catch {}
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
