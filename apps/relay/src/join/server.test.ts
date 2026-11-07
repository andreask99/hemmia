import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { runInNewContext } from 'node:vm';
import { parseSharePayload } from '@hemmia/relay-protocol';
import { DOMAIN } from '../../test/helpers.ts';
import { createJoinHandler } from './server.ts';

const CODE = 'A'.repeat(42) + 'z';
const HUB = `zt0jr4qknd6e.h.${DOMAIN}`;

/** The join page's parser, loaded the way a browser would. */
function pageParser(): (payload: string, relayDomain: string) => unknown {
  const sandbox: { kchatParseShare?: (p: string, d: string) => unknown } = {};
  runInNewContext(readFileSync(new URL('../../static/join/parse.js', import.meta.url), 'utf8'), {
    window: sandbox,
  });
  if (!sandbox.kchatParseShare) throw new Error('parser missing');
  return sandbox.kchatParseShare;
}

describe('join page parser', () => {
  it('agrees with relay-protocol on every vector', () => {
    const parse = pageParser();
    const vectors = [
      `1~${HUB}~i~${CODE}`,
      `1~${HUB.toUpperCase()}~l~${CODE}`,
      `1~homehub.tail1234.ts.net~d~${CODE}`,
      `1~${HUB}~x~${CODE}`,
      `2~${HUB}~i~${CODE}`,
      `1~${HUB}~i~short`,
      `1~evil.example~i~${CODE}`,
      `1~zt0jr4qknd6u.h.${DOMAIN}~i~${CODE}`,
      `1~${HUB}:8443~i~${CODE}`,
      `1~${HUB}~i~${CODE}~more`,
      '',
      `1~~i~${CODE}`,
      `1~a..b.ts.net~i~${CODE}`,
    ];
    for (const v of vectors) {
      const ours = parse(v, DOMAIN);
      const theirs = parseSharePayload(v, { relayDomains: [DOMAIN] });
      expect([v, JSON.parse(JSON.stringify(ours)) as unknown]).toEqual([v, theirs]);
    }
  });
});

describe('join server', () => {
  let server: http.Server;
  let port = 0;
  beforeAll(async () => {
    server = http.createServer(
      createJoinHandler({
        relayDomain: DOMAIN,
        appId: 'app.hemmia.ios',
        teamId: 'TEAM123456',
        androidCertSha256: null,
        appStoreUrl: 'https://apps.apple.com/app/id1',
        playStoreUrl: null,
      }),
    );
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
  const get = (path: string) => fetch(`http://127.0.0.1:${String(port)}${path}`);

  it('serves the page with strict headers and the build settings', async () => {
    const res = await get('/j');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('set-cookie')).toBeNull();
    const html = await res.text();
    expect(html).toContain(`data-relay="${DOMAIN}"`);
    expect(html).toContain('data-app-store="https://apps.apple.com/app/id1"');
    expect(html).not.toContain('<script>');
  });

  it('serves the app-link files that are configured', async () => {
    const aasa = await get('/.well-known/apple-app-site-association');
    expect(await aasa.json()).toEqual({
      applinks: {
        details: [{ appIDs: ['TEAM123456.app.hemmia.ios'], components: [{ '/': '/j*' }] }],
      },
    });
    expect((await get('/.well-known/assetlinks.json')).status).toBe(404);
    expect((await get('/nothing')).status).toBe(404);
  });
});
