/**
 * The only way the web app talks to the server. JSON in, zod-validated JSON out; errors
 * become ApiError with a server error code the UI translates (see i18n keys `error.*`).
 * Same-origin requests carry the session cookie and the Origin header automatically.
 */
import type { z } from 'zod';
import { type ErrorCode, ErrorResponse } from '@hemmia/shared';

export class ApiError extends Error {
  override name = 'ApiError';
  readonly status: number;
  readonly code: ErrorCode | 'network';
  readonly retryAfterSeconds: number | undefined;
  constructor(status: number, code: ErrorCode | 'network', retryAfterSeconds?: number) {
    super(code);
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Schema of a successful response body; omit for 204 responses. */
  schema?: z.ZodType<T>;
  signal?: AbortSignal;
}

export async function api<T = undefined>(
  path: string,
  options: RequestOptions<T> = {},
): Promise<T> {
  const { method = 'GET', body, schema, signal } = options;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'network');
  }

  if (!res.ok) {
    const parsed = ErrorResponse.safeParse(await res.json().catch(() => null));
    if (parsed.success) {
      throw new ApiError(res.status, parsed.data.error.code, parsed.data.error.retryAfterSeconds);
    }
    throw new ApiError(res.status, res.status >= 500 ? 'internal' : 'bad_request');
  }

  if (!schema) return undefined as T;
  const data: unknown = await res.json();
  return schema.parse(data);
}
