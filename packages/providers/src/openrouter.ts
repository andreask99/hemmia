/**
 * OpenRouter models through its Chat Completions API (streaming), with the user's own key.
 * Owned by Claude: it sends chat content out of the house. Never logs content, keys or error
 * bodies.
 *
 * - No identifying headers (no HTTP-Referer, no X-Title): OpenRouter learns nothing about
 *   the hub beyond the key.
 * - `provider.data_collection: 'deny'`: only providers that don't keep or train on prompts.
 * - The chat's "think harder" switch sets the reasoning effort for models that reason.
 */
import { chatCompletions } from './chatcompletions.ts';
import { CLOUD_ORIGINS, cloudFetch, effortOf, type FetchLike, statusError } from './cloudhttp.ts';
import type { ChatChunk, CloudChatRequest, CloudClient } from './types.ts';

export const OPENROUTER_BASE = `${CLOUD_ORIGINS.openrouter}/api/v1`;

export function createOpenRouterClient(options: { fetch?: FetchLike } = {}): CloudClient {
  const fetchImpl: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
  return {
    provider: 'openrouter',

    chat(req: CloudChatRequest): AsyncIterable<ChatChunk> {
      return chatCompletions(
        {
          baseUrl: OPENROUTER_BASE,
          apiKey: req.apiKey,
          fetch: fetchImpl,
          extraBody: (r) => ({
            provider: { data_collection: 'deny' },
            ...(r.think !== false ? { reasoning: { effort: effortOf(r.think) } } : {}),
          }),
        },
        req,
      );
    },

    async checkKey(apiKey, signal) {
      const res = await cloudFetch(fetchImpl, 'openrouter', '/api/v1/key', {
        method: 'GET',
        headers: { authorization: `Bearer ${apiKey}` },
        signal,
      });
      await res.body?.cancel().catch(() => undefined);
      if (res.ok) return true;
      if (res.status === 401 || res.status === 403) return false;
      throw statusError(res);
    },
  };
}
