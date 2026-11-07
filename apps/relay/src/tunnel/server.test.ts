import { afterEach, beforeAll, afterAll, describe, expect, it } from 'vitest';
import net from 'node:net';
import tls from 'node:tls';
import { StreamResetError, type TunnelStream } from '@hemmia/relay-protocol';
import { monthUtc, openDb, type RelayDb } from '../db.ts';
import { getMinHubVersion, setMinHubVersion } from '../admin.ts';
import { startRelay, type Relay } from '../relay.ts';
import { createTestCa, hasOpenssl, type TestCa } from '../../test/ca.ts';
import { connectFakeHub, newHubKey, registerInDb } from '../../test/fakehub.ts';
import { DOMAIN, silent, testConfig } from '../../test/helpers.ts';

const run = hasOpenssl() ? describe : describe.skip;

run('relay tunnels', () => {
  let ca: TestCa;
  let relay: Relay;
  let db: RelayDb;
  const hubs: { socket: tls.TLSSocket }[] = [];

  beforeAll(() => {
    ca = createTestCa();
  });
  afterAll(() => {
    ca.dispose();
  });

  async function start(
    timings: Parameters<typeof startRelay>[1]['timings'] = {},
    monthlyGiB = '50',
  ) {
    db = openDb(':memory:');
    relay = await startRelay(testConfig({ RELAY_MONTHLY_GIB: monthlyGiB }), {
      db,
      log: silent,
      tls: ca.issue([`api.${DOMAIN}`, `tunnel.${DOMAIN}`, `join.${DOMAIN}`]),
      timings,
    });
  }
  afterEach(async () => {
    for (const h of hubs.splice(0)) h.socket.destroy();
    await relay.close();
  });

  /** A hub that terminates client TLS with a test certificate and answers with `answer`. */
  function serveTls(stream: TunnelStream, host: string, answer: (s: tls.TLSSocket) => void) {
    const cert = ca.issue([host]);
    const t = new tls.TLSSocket(stream, { isServer: true, cert: cert.cert, key: cert.key });
    t.on('error', () => undefined);
    t.on('secure', () => {
      answer(t);
    });
  }

  function client(host: string): Promise<tls.TLSSocket> {
    return new Promise((resolve, reject) => {
      const s = tls.connect({
        host: '127.0.0.1',
        port: relay.port,
        servername: host,
        ca: ca.certPem,
      });
      s.once('secureConnect', () => {
        resolve(s);
      });
      s.once('error', reject);
      s.once('close', () => {
        reject(new Error('closed'));
      });
    });
  }

  it('authenticates a registered hub and carries a TLS client through it', async () => {
    await start();
    const h = newHubKey();
    registerInDb(db, h);
    const hub = connectFakeHub(relay.port, ca.certPem, h);
    hubs.push(hub);
    expect(await hub.ready).toEqual({ hostname: `${h.hubId}.h.${DOMAIN}` });
    expect(relay.tunnels.isConnected(h.hubId)).toBe(true);
    const host = `${h.hubId}.h.${DOMAIN}`;
    hub.onOpen((stream) => {
      serveTls(stream, host, (t) => {
        t.on('data', (c: Buffer) => t.write(`echo:${c.toString()}`));
      });
    });
    const c = await client(host);
    const answer = await new Promise<string>((resolve) => {
      c.once('data', (d: Buffer) => {
        resolve(d.toString());
      });
      c.write('hello');
    });
    expect(answer).toBe('echo:hello');
    expect(hub.opened[0]).toMatchObject({ clientIp: '127.0.0.1', sni: host });
    c.destroy();
  });

  it.each([
    ['unknown_hub', { register: false }],
    ['bad_signature', { register: true, wrongKey: true }],
    ['bad_version', { register: true, version: 2 }],
    ['blocked', { register: true, blocked: true }],
  ])(
    'refuses with ERROR %s',
    async (
      code,
      o: { register: boolean; wrongKey?: boolean; version?: number; blocked?: boolean },
    ) => {
      await start();
      const h = newHubKey();
      if (o.register) registerInDb(db, h);
      if (o.blocked) db.prepare('UPDATE hubs SET blocked_at = 1 WHERE id = ?').run(h.hubId);
      const hub = connectFakeHub(relay.port, ca.certPem, h, {
        ...(o.version ? { version: o.version } : {}),
        ...(o.wrongKey ? { signWith: newHubKey().key } : {}),
      });
      hubs.push(hub);
      expect(await hub.ready).toEqual({ error: code });
      await hub.closed;
      expect(relay.tunnels.isConnected(h.hubId)).toBe(false);
    },
  );

  it('refuses hubs below the minimum version, and lets them in once it is lowered', async () => {
    await start();
    const h = newHubKey();
    registerInDb(db, h);
    setMinHubVersion(db, '0.2.0');
    const old = connectFakeHub(relay.port, ca.certPem, h, { agent: 'hemmia-hub/0.1.9' });
    hubs.push(old);
    expect(await old.ready).toEqual({ error: 'outdated' });
    const unversioned = connectFakeHub(relay.port, ca.certPem, h);
    hubs.push(unversioned);
    expect(await unversioned.ready).toEqual({ error: 'outdated' });
    const current = connectFakeHub(relay.port, ca.certPem, h, { agent: 'hemmia-hub/0.2.0' });
    hubs.push(current);
    expect(await current.ready).toEqual({ hostname: `${h.hubId}.h.${DOMAIN}` });
    setMinHubVersion(db, null);
    expect(getMinHubVersion(db)).toBeNull();
  });

  it('times out a hub that does not authenticate', async () => {
    await start({ authMs: 50 });
    const socket = tls.connect({
      host: '127.0.0.1',
      port: relay.port,
      servername: `tunnel.${DOMAIN}`,
      ca: ca.certPem,
      ALPNProtocols: ['kchat-tunnel/1'],
    });
    hubs.push({ socket });
    socket.resume();
    await new Promise<void>((r) =>
      socket.on('close', () => {
        r();
      }),
    );
  });

  it('replaces an older tunnel of the same hub', async () => {
    await start();
    const h = newHubKey();
    registerInDb(db, h);
    const first = connectFakeHub(relay.port, ca.certPem, h);
    hubs.push(first);
    await first.ready;
    const second = connectFakeHub(relay.port, ca.certPem, h);
    hubs.push(second);
    await second.ready;
    expect(await first.goaway).toBe('replaced');
    expect(relay.tunnels.count()).toBe(1);
    expect(relay.tunnels.isConnected(h.hubId)).toBe(true);
  });

  it('drops clients of hubs without a tunnel or over the monthly quota', async () => {
    await start({}, '0.000001'); // ~1 KiB a month
    const h = newHubKey();
    registerInDb(db, h);
    await expect(client(`${h.hubId}.h.${DOMAIN}`)).rejects.toThrow();
    const hub = connectFakeHub(relay.port, ca.certPem, h);
    hubs.push(hub);
    await hub.ready;
    db.prepare('INSERT INTO usage (hub_id, month, bytes) VALUES (?, ?, ?)').run(
      h.hubId,
      monthUtc(Date.now()),
      10_000,
    );
    await expect(client(`${h.hubId}.h.${DOMAIN}`)).rejects.toThrow();
    expect(hub.opened).toEqual([]);
  });

  it('maps a hub RESET to closing the client and counts bytes', async () => {
    await start();
    const h = newHubKey();
    registerInDb(db, h);
    const hub = connectFakeHub(relay.port, ca.certPem, h);
    hubs.push(hub);
    await hub.ready;
    const closed = new Promise<void>((resolve) => {
      hub.onOpen((stream) => {
        stream.once('data', () => {
          stream.destroy(new StreamResetError('refused'));
        });
        stream.on('error', () => undefined);
      });
      const raw = net.connect(relay.port, '127.0.0.1', () => {
        // A real ClientHello for this hub host from Node's TLS client, written raw.
        const t = tls.connect({ socket: raw, servername: `${h.hubId}.h.${DOMAIN}` });
        t.on('error', () => undefined);
      });
      raw.on('close', () => {
        resolve();
      });
      raw.on('error', () => undefined);
    });
    await closed;
    relay.tunnels.quota.flush();
    const row = db.prepare('SELECT bytes FROM usage WHERE hub_id = ?').get(h.hubId) as
      { bytes: number } | undefined;
    expect(row?.bytes ?? 0).toBeGreaterThan(200);
  });

  it('resets idle streams and closes silent tunnels', async () => {
    await start({ idleStreamMs: 50, pingMs: 30, deadMs: 120 });
    const h = newHubKey();
    registerInDb(db, h);
    const hub = connectFakeHub(relay.port, ca.certPem, h, { answerPings: false });
    hubs.push(hub);
    await hub.ready;
    const reset = new Promise<unknown>((resolve) => {
      hub.onOpen((stream) => {
        stream.on('error', resolve);
      });
    });
    const raw = net.connect(relay.port, '127.0.0.1', () => {
      tls
        .connect({ socket: raw, servername: `${h.hubId}.h.${DOMAIN}` })
        .on('error', () => undefined);
    });
    raw.on('error', () => undefined);
    expect(((await reset) as StreamResetError).code).toBe('timeout');
    // The fake hub sends no frames after READY: the relay gives up on it.
    await hub.closed;
    expect(relay.tunnels.isConnected(h.hubId)).toBe(false);
  });

  it('sends GOAWAY shutdown when the relay stops', async () => {
    await start();
    const h = newHubKey();
    registerInDb(db, h);
    const hub = connectFakeHub(relay.port, ca.certPem, h);
    hubs.push(hub);
    await hub.ready;
    const reason = hub.goaway;
    await relay.close();
    expect(await reason).toBe('shutdown');
    await start(); // afterEach closes this one
  });
});
