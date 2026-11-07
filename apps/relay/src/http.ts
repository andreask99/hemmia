/**
 * A small HTTP layer for the relay's control API and join page (node:http, no framework).
 * Bodies are read with a hard limit; every response has `Cache-Control: no-store` and the
 * error shape `{ error: { code } }`.
 */
import type http from 'node:http';
import type { ApiErrorCode } from '@hemmia/relay-protocol';

export class ApiHttpError extends Error {
  override name = 'ApiHttpError';
  readonly status: number;
  readonly code: ApiErrorCode;
  constructor(status: number, code: ApiErrorCode) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export function readBody(req: http.IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] ?? '0');
    if (declared > limit) {
      reject(new ApiHttpError(413, 'bad_request'));
      req.resume();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new ApiHttpError(413, 'bad_request'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });
}

export function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const text = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-length': Buffer.byteLength(text),
  });
  res.end(text);
}

export function sendError(res: http.ServerResponse, status: number, code: ApiErrorCode): void {
  sendJson(res, status, { error: { code } });
}
