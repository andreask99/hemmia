import { afterEach, describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { signCatalog, verifyCatalog } from '@hemmia/relay-protocol';
import { openDb } from '../db.ts';
import { apiRequest, DOMAIN, silent } from '../../test/helpers.ts';
import { catalogRoutes } from './catalog.ts';
import { createApiHandler } from './server.ts';

const dirs: string[] = [];
const servers: http.Server[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'catalog-'));
  dirs.push(dir);
  const server = http.createServer(
    createApiHandler({
      db: openDb(':memory:'),
      relayDomain: DOMAIN,
      log: silent,
      routes: catalogRoutes({ dataDir: dir }),
    }),
  );
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return { dir, get: () => apiRequest(port, 'GET', '/v1/catalog') };
}

describe('catalogue endpoint', () => {
  it('404 until published, then serves the envelope unchanged', async () => {
    const s = await setup();
    expect((await s.get()).status).toBe(404);
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const env = signCatalog(
      { v: 1, signedAt: 1, entries: [] },
      privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    );
    writeFileSync(join(s.dir, 'catalog.json'), JSON.stringify(env));
    const res = await s.get();
    expect(res.status).toBe(200);
    expect(res.body).toEqual(env);
    expect(verifyCatalog(res.body, publicKey.export({ format: 'jwk' }).x ?? '')).not.toBeNull();
  });

  it('serves nothing for a malformed file', async () => {
    const s = await setup();
    writeFileSync(join(s.dir, 'catalog.json'), '{"payload":1}');
    expect((await s.get()).status).toBe(404);
  });
});
