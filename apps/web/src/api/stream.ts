/**
 * POSTs to a streaming endpoint and yields its server-sent events, validated.
 * (EventSource can't POST, so the stream is read from fetch.)
 */
import type { z } from 'zod';
import { ErrorResponse, StreamEvent } from '@hemmia/shared';
import { ApiError } from './client.ts';

/** Parses complete SSE blocks from a buffer; returns the events and the unparsed rest. */
export function parseSse(buffer: string): { events: StreamEvent[]; rest: string } {
  return parseSseWith(buffer, StreamEvent);
}

/** parseSse for any event schema. */
export function parseSseWith<T>(
  buffer: string,
  schema: z.ZodType<T>,
): { events: T[]; rest: string } {
  const events: T[] = [];
  const blocks = buffer.split('\n\n');
  const rest = blocks.pop() ?? '';
  for (const block of blocks) {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => line.slice(6))
      .join('\n');
    if (data === '') continue; // comments / pings
    events.push(schema.parse(JSON.parse(data)));
  }
  return { events, rest };
}

/**
 * The stream broke after it had started (iOS ends long fetch streams when the screen locks,
 * the app is switched or the network changes). The job usually keeps running on the
 * server: attach again with `followEvents` instead of reporting an outage.
 */
export class StreamDroppedError extends Error {
  override name = 'StreamDroppedError';
  constructor() {
    super('stream dropped');
  }
}

/** POSTs and yields the server-sent events of the job it starts. */
export function streamEvents(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  return readEvents(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
}

/** Attaches to a running job's events again (the reply so far, then the live events). */
export function followEvents(path: string, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
  return readEvents(path, {
    method: 'GET',
    headers: { accept: 'text/event-stream' },
    ...(signal ? { signal } : {}),
  });
}

/** GETs an event stream whose events match `schema` (e.g. model download progress). */
export function followTypedEvents<T>(
  path: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
): AsyncGenerator<T> {
  return readEvents(
    path,
    { method: 'GET', headers: { accept: 'text/event-stream' }, ...(signal ? { signal } : {}) },
    schema,
  );
}

function readEvents(path: string, init: RequestInit): AsyncGenerator<StreamEvent>;
function readEvents<T>(path: string, init: RequestInit, schema: z.ZodType<T>): AsyncGenerator<T>;
async function* readEvents(
  path: string,
  init: RequestInit,
  schema: z.ZodType = StreamEvent,
): AsyncGenerator {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, credentials: 'same-origin' });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'network');
  }
  if (!res.ok || !res.body) {
    const parsed = ErrorResponse.safeParse(await res.json().catch(() => null));
    throw new ApiError(
      res.status,
      parsed.success ? parsed.data.error.code : res.status >= 500 ? 'internal' : 'bad_request',
      parsed.success ? parsed.data.error.retryAfterSeconds : undefined,
    );
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;
      const { events, rest } = parseSseWith(buffer, schema);
      buffer = rest;
      yield* events;
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new StreamDroppedError();
  } finally {
    reader.cancel().catch(() => undefined);
  }
}
