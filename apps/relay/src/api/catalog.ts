/**
 * GET /v1/catalog (P11.2): serves the signed model catalogue that the owner's weekly job
 * published into <dataDir>/catalog.json. Reads no query parameters and counts nothing; hubs
 * verify the signature themselves. Owned by Claude.
 */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CatalogEnvelope } from '@hemmia/relay-protocol';
import type { Route } from './server.ts';

export function catalogRoutes(deps: { dataDir: string }): Route[] {
  const file = join(deps.dataDir, 'catalog.json');
  let cache: { mtimeMs: number; body: CatalogEnvelope | null } | null = null;

  /** The published envelope, re-read when the file changes; null if none or malformed. */
  function published(): CatalogEnvelope | null {
    let mtimeMs: number;
    try {
      mtimeMs = statSync(file).mtimeMs;
    } catch {
      return null;
    }
    if (cache?.mtimeMs === mtimeMs) return cache.body;
    let body: CatalogEnvelope | null;
    try {
      const parsed = CatalogEnvelope.safeParse(JSON.parse(readFileSync(file, 'utf8')));
      body = parsed.success ? parsed.data : null;
    } catch {
      body = null;
    }
    cache = { mtimeMs, body };
    return body;
  }

  return [
    {
      method: 'GET',
      path: /^\/v1\/catalog$/,
      signed: false,
      handle() {
        const body = published();
        return body
          ? { status: 200, body }
          : { status: 404, body: { error: { code: 'not_found' } } };
      },
    },
  ];
}
