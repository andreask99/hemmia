/**
 * Checks an API key by listing the provider's models (PHONE-MODE.md §5): a request that sends
 * no content. 200 → ok; 401/403 → refused; anything else → busy; no network → offline.
 */
import { ANTHROPIC_VERSION, BROWSER_ACCESS_HEADER } from './anthropic.ts';
import { CLOUD_ORIGINS, type FetchLike } from './cloudhttp.ts';

export type KeyCheck = 'ok' | 'refused' | 'busy' | 'offline';

export async function listModels(
  provider: 'anthropic' | 'openai',
  apiKey: string,
  fetchImpl: FetchLike,
  signal: AbortSignal,
): Promise<KeyCheck> {
  const headers: Record<string, string> =
    provider === 'anthropic'
      ? {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          [BROWSER_ACCESS_HEADER]: 'true',
        }
      : { authorization: `Bearer ${apiKey}` };
  let res: Response;
  try {
    res = await fetchImpl(`${CLOUD_ORIGINS[provider]}/v1/models`, {
      method: 'GET',
      headers,
      redirect: 'error',
      credentials: 'omit',
      signal,
    });
  } catch {
    return 'offline';
  }
  await res.body?.cancel().catch(() => undefined);
  if (res.ok) return 'ok';
  if (res.status === 401 || res.status === 403) return 'refused';
  return 'busy';
}
