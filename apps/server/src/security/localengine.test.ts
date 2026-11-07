import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  assertResolvesLocal,
  checkEngineUrl,
  createLocalEngineFetch,
  isLocalAddress,
  LocalEngineRefusedError,
  type LookupFn,
} from './localengine.ts';

const lookupTo =
  (...addresses: string[]): LookupFn =>
  (_host, cb) => {
    cb(
      null,
      addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })),
    );
  };

describe('isLocalAddress', () => {
  it.each([
    ['127.0.0.1', true],
    ['127.8.9.10', true],
    ['::1', true],
    ['10.1.2.3', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['192.168.1.20', true],
    ['fd12:3456::1', true],
    ['::ffff:192.168.1.2', true],
    ['::ffff:7f00:1', true],
    ['8.8.8.8', false],
    ['172.32.0.1', false],
    ['100.100.1.1', false], // Tailscale CGNAT: not a private LAN address
    ['169.254.169.254', false], // link-local (cloud metadata)
    ['fe80::1', false],
    ['2001:4860:4860::8888', false],
    ['::ffff:8.8.8.8', false],
    ['0.0.0.0', false],
    ['not an ip', false],
  ])('%s → %s', (address, expected) => {
    expect(isLocalAddress(address)).toBe(expected);
  });
});

describe('checkEngineUrl', () => {
  it('normalises allowed URLs', () => {
    expect(checkEngineUrl(' http://127.0.0.1:1234/v1/ ')).toBe('http://127.0.0.1:1234/v1');
    expect(checkEngineUrl('https://gpu-box.local:8000/v1')).toBe('https://gpu-box.local:8000/v1');
    expect(checkEngineUrl('http://[::1]:8080/v1')).toBe('http://[::1]:8080/v1');
  });

  it.each([
    ['ftp://127.0.0.1/v1', 'scheme'],
    ['file:///etc/passwd', 'scheme'],
    ['http://user:pw@127.0.0.1/v1', 'credentials'],
    ['http://127.0.0.1/v1?x=1', 'bad_url'],
    ['http://127.0.0.1/v1#a', 'bad_url'],
    ['not a url', 'bad_url'],
    ['http://8.8.8.8/v1', 'address'],
    ['http://169.254.169.254/latest', 'address'],
  ])('refuses %s (%s)', (url, reason) => {
    expect(() => checkEngineUrl(url)).toThrow(LocalEngineRefusedError);
    try {
      checkEngineUrl(url);
    } catch (err) {
      expect((err as LocalEngineRefusedError).reason).toBe(reason);
    }
  });
});

describe('assertResolvesLocal', () => {
  it('accepts names that resolve only to local addresses', async () => {
    await expect(
      assertResolvesLocal('http://box.lan:1234/v1', lookupTo('192.168.1.5')),
    ).resolves.toBeUndefined();
  });

  it('refuses names that resolve to a public address, even partly', async () => {
    await expect(
      assertResolvesLocal('http://evil.example/v1', lookupTo('93.184.216.34')),
    ).rejects.toMatchObject({ reason: 'address' });
    await expect(
      assertResolvesLocal('http://mixed.example/v1', lookupTo('127.0.0.1', '93.184.216.34')),
    ).rejects.toMatchObject({ reason: 'address' });
  });
});

describe('createLocalEngineFetch', () => {
  let server: http.Server;
  let port = 0;
  const seen: { method?: string; url?: string; body: string; auth?: string }[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        seen.push({
          ...(req.method ? { method: req.method } : {}),
          ...(req.url ? { url: req.url } : {}),
          body,
          ...(req.headers.authorization ? { auth: req.headers.authorization } : {}),
        });
        if (req.url === '/redirect') {
          res.writeHead(302, { location: 'http://8.8.8.8/' });
          res.end();
          return;
        }
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write('data: one\n\n');
        setTimeout(() => res.end('data: two\n\n'), 5);
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((r) =>
      server.close(() => {
        r();
      }),
    );
  });

  it('posts to a loopback server and streams the answer', async () => {
    const f = createLocalEngineFetch();
    const res = await f(`http://127.0.0.1:${String(port)}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"model":"m"}',
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('data: one\n\ndata: two\n\n');
    expect(seen.at(-1)).toMatchObject({
      method: 'POST',
      url: '/v1/chat/completions',
      body: '{"model":"m"}',
    });
  });

  it('pins the checked address for host names', async () => {
    const f = createLocalEngineFetch({ lookup: lookupTo('127.0.0.1') });
    const res = await f(`http://my-gpu-box.lan:${String(port)}/v1/models`, { method: 'GET' });
    expect(res.status).toBe(200);
    await res.text();
  });

  it('refuses host names that resolve to a public address (rebinding)', async () => {
    const f = createLocalEngineFetch({ lookup: lookupTo('93.184.216.34') });
    await expect(
      f(`http://rebind.example:${String(port)}/v1/models`, { method: 'GET' }),
    ).rejects.toMatchObject({ reason: 'address' });
  });

  it('refuses public IP literals and redirects', async () => {
    const f = createLocalEngineFetch();
    await expect(f('http://8.8.8.8/v1/models', { method: 'GET' })).rejects.toMatchObject({
      reason: 'address',
    });
    await expect(
      f(`http://127.0.0.1:${String(port)}/redirect`, { method: 'GET' }),
    ).rejects.toMatchObject({ reason: 'redirect' });
  });
});
