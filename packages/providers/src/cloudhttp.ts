/**
 * HTTPS to the cloud providers' APIs, shared by llm/anthropic.ts, llm/openai.ts and
 * llm/openrouter.ts (whose streaming goes through llm/chatcompletions.ts). Owned by
 * Claude: this is the only way chat content leaves the house.
 *
 * Requests go only to the fixed API origins below (no configurable URL, no redirects), carry
 * the user's own key, and are bounded by the job's abort signal. Response bodies of failed
 * requests are discarded unread: they can quote the prompt. Errors carry codes only.
 */
import { LlmError, type CloudProvider } from './types.ts';

/** The only hosts kchat sends chat content to. */
export const CLOUD_ORIGINS: Readonly<Record<CloudProvider, string>> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com',
  openrouter: 'https://openrouter.ai',
};

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** A request to a provider's API. Throws LlmError('aborted' | 'unavailable') on network failure. */
export async function cloudFetch(
  fetchImpl: FetchLike,
  provider: CloudProvider,
  path: `/${string}`,
  init: {
    method: 'GET' | 'POST';
    headers: Record<string, string>;
    body?: string;
    signal: AbortSignal;
  },
): Promise<Response> {
  try {
    return await fetchImpl(`${CLOUD_ORIGINS[provider]}${path}`, {
      method: init.method,
      headers: init.headers,
      ...(init.body !== undefined ? { body: init.body } : {}),
      signal: init.signal,
      redirect: 'error',
      credentials: 'omit',
    });
  } catch {
    throw new LlmError(init.signal.aborted ? 'aborted' : 'unavailable');
  }
}

/** The error for a failed HTTP status. Drops the body unread. */
export function statusError(res: Response): LlmError {
  res.body?.cancel().catch(() => undefined);
  const s = res.status;
  if (s === 401 || s === 403) return new LlmError('auth');
  if (s === 404) return new LlmError('model_not_found');
  // 402: billing (no credit left on the key's account); 429: rate limit or quota.
  if (s === 402 || s === 429) return new LlmError('rate_limited');
  if (s >= 500) return new LlmError('overloaded');
  return new LlmError('bad_response');
}

export interface SseEvent {
  event: string;
  data: string;
}

/**
 * Server-sent events from a response body: `event:` and `data:` lines, blank line between
 * events. Throws LlmError('aborted' | 'unavailable') when the stream breaks.
 */
export async function* sseEvents(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event = '';
  let data: string[] = [];

  function* line(raw: string): Generator<SseEvent> {
    const l = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (l === '') {
      if (data.length > 0) yield { event: event || 'message', data: data.join('\n') };
      event = '';
      data = [];
      return;
    }
    if (l.startsWith(':')) return;
    const colon = l.indexOf(':');
    const field = colon < 0 ? l : l.slice(0, colon);
    let value = colon < 0 ? '' : l.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }

  try {
    for (;;) {
      let chunk: Awaited<ReturnType<typeof reader.read>>;
      try {
        chunk = await reader.read();
      } catch {
        throw new LlmError(signal.aborted ? 'aborted' : 'unavailable');
      }
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        yield* line(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
      }
    }
    buffer += decoder.decode();
    if (buffer !== '') yield* line(buffer);
    yield* line('');
  } finally {
    reader.cancel().catch(() => undefined);
  }
}

/** Parses an event's JSON data. Throws LlmError('bad_response'). */
export function parseData(data: string): unknown {
  try {
    return JSON.parse(data) as unknown;
  } catch {
    throw new LlmError('bad_response');
  }
}

/** The media type of a base64 image (JPEG or PNG from kchat; WebP just in case). */
export function imageMediaType(base64: string): 'image/jpeg' | 'image/png' | 'image/webp' {
  if (base64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (base64.startsWith('UklGR')) return 'image/webp';
  return 'image/jpeg';
}

/** Reasoning effort for the chat's "think harder" switch (off: low, on: high). */
export function effortOf(think: boolean | 'low' | 'medium' | 'high'): 'low' | 'medium' | 'high' {
  if (think === false) return 'low';
  if (think === true) return 'high';
  return think;
}

/** Tool result for a call kchat didn't run (the APIs need one result per call). */
export const TOOL_NOT_RUN = 'Not run: this tool is not available now.';
