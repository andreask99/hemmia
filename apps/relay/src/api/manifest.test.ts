import { afterEach, describe, expect, it } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { signManifest, verifyManifest } from '@hemmia/relay-protocol';
import { openDb } from '../db.ts';
import { apiRequest, DOMAIN, silent } from '../../test/helpers.ts';
import { installStats, manifestRoutes } from './manifest.ts';
import { createApiHandler } from './server.ts';

const dirs: string[] = [];
const servers: http.Server[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'manifest-'));
  dirs.push(dir);
  const db = openDb(':memory:');
  const t = Date.UTC(2026, 10, 7, 12);
  const server = http.createServer(
    createApiHandler({
      db,
      relayDomain: DOMAIN,
      log: silent,
      routes: manifestRoutes({ db, dataDir: dir, now: () => t }),
      now: () => t,
    }),
  );
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return { db, dir, t, get: (q: string) => apiRequest(port, 'GET', `/v1/manifest${q}`) };
}

describe('update manifest endpoint', () => {
  it('serves the published manifest unchanged and counts the check without the address', async () => {
    const s = await setup();
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const env = signManifest(
      {
        v: 1,
        channel: 'stable',
        signedAt: 1,
        latest: {
          version: '0.2.0',
          date: '2026-11-07',
          major: false,
          notesUrl: 'https://hemmia.app/releases/0.2.0',
          files: {},
        },
        minimum: null,
      },
      privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    );
    writeFileSync(join(s.dir, 'manifest-stable.json'), JSON.stringify(env));
    const res = await s.get('?v=0.1.0&p=mac&c=stable');
    expect(res.status).toBe(200);
    expect(verifyManifest(res.body, publicKey.export({ format: 'jwk' }).x)).not.toBeNull();
    expect(installStats(s.db, 30, s.t)).toEqual([
      { day: '2026-11-07', version: '0.1.0', platform: 'mac', channel: 'stable', count: 1 },
    ]);
    const columns = s.db.prepare('PRAGMA table_info(manifest_checks)').all() as { name: string }[];
    expect(columns.map((c) => c.name)).toEqual(['day', 'version', 'platform', 'channel', 'count']);
  });

  it('counts one address at most three times a day', async () => {
    const s = await setup();
    for (let i = 0; i < 5; i++) await s.get('?v=0.1.0&p=docker');
    expect(installStats(s.db, 30, s.t)[0]?.count).toBe(3);
  });

  it('refuses bad parameters and says when nothing is published', async () => {
    const s = await setup();
    expect((await s.get('?v=1.2&p=mac')).status).toBe(400);
    expect((await s.get('?v=0.1.0&p=windows')).status).toBe(400);
    expect((await s.get('?v=0.1.0&p=mac&c=nightly')).status).toBe(400);
    expect((await s.get('?v=0.1.0&p=mac')).status).toBe(404);
    writeFileSync(join(s.dir, 'manifest-stable.json'), '{"not":"an envelope"}');
    expect((await s.get('?v=0.1.0&p=mac')).status).toBe(404);
  });
});
