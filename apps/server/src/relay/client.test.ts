import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hasOpenssl } from '@hemmia/relay/testing';
import { deleteRelayKeys, loadOrCreateIdentity } from '../security/relay-identity.ts';
import { createRelayClient, RelayApiError } from './client.ts';
import { startTestRelay, type TestRelay } from './testrelay.ts';

describe('relay identity', () => {
  it('is created once with owner-only permissions and kept', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hub-id-'));
    try {
      const a = loadOrCreateIdentity(dir);
      expect(statSync(join(dir, 'relay')).mode & 0o777).toBe(0o700);
      expect(statSync(join(dir, 'relay', 'identity.pem')).mode & 0o777).toBe(0o600);
      expect(loadOrCreateIdentity(dir).hubId).toBe(a.hubId);
      expect(a.hubId).toMatch(/^[0-9a-hjkmnp-tv-z]{12}$/);
      deleteRelayKeys(dir);
      expect(loadOrCreateIdentity(dir).hubId).not.toBe(a.hubId);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

(hasOpenssl() ? describe : describe.skip)('relay client', () => {
  let t: TestRelay;
  let dir: string;
  beforeAll(async () => {
    t = await startTestRelay();
    dir = mkdtempSync(join(tmpdir(), 'hub-client-'));
  });
  afterAll(async () => {
    await t.dispose();
    rmSync(dir, { recursive: true, force: true });
  });

  it('registers, reads itself and forgets, with signed requests', async () => {
    const identity = loadOrCreateIdentity(dir);
    const client = createRelayClient({ endpoint: t.endpoint, identity: () => identity });
    const reg = await client.register();
    expect(reg).toEqual({
      hubId: identity.hubId,
      hostname: `${identity.hubId}.h.relay.test`,
      tunnelHost: 'tunnel.relay.test',
      apiHost: 'api.relay.test',
    });
    expect((await client.register()).hubId).toBe(identity.hubId);
    const self = await client.self();
    expect(self).toMatchObject({ hubId: identity.hubId, connected: false, blocked: false });
    await client.forget();
    await expect(client.self()).rejects.toMatchObject({ status: 401, code: 'bad_signature' });
  });

  it('reports an unreachable relay and an untrusted certificate as unreachable', async () => {
    const identity = loadOrCreateIdentity(dir);
    const down = createRelayClient({
      endpoint: { ...t.endpoint, address: { host: '127.0.0.1', port: 9 } },
      identity: () => identity,
    });
    await expect(down.register()).rejects.toBeInstanceOf(RelayApiError);
    const untrusted = createRelayClient({
      endpoint: { ...t.endpoint, ca: null },
      identity: () => identity,
    });
    await expect(untrusted.register()).rejects.toMatchObject({ code: 'unreachable' });
  });
});
