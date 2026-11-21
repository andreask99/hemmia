import { afterEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { openDb } from '../db.ts';
import { pruneRelay } from '../retention.ts';
import { run } from '../cli.ts';
import { apiRequest, DOMAIN, silent } from '../../test/helpers.ts';
import { feedbackRoutes, feedbackSince } from './feedback.ts';
import { createApiHandler } from './server.ts';

const servers: http.Server[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

async function setup() {
  const db = openDb(':memory:');
  let t = Date.UTC(2026, 10, 8, 12);
  const now = () => t;
  const server = http.createServer(
    createApiHandler({
      db,
      relayDomain: DOMAIN,
      log: silent,
      routes: feedbackRoutes({ db, relayDomain: DOMAIN, now }),
      now,
    }),
  );
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return {
    db,
    later: (ms: number) => {
      t += ms;
    },
    post: (body: unknown, headers: Record<string, string> = {}) =>
      apiRequest(port, 'POST', '/v1/feedback', {
        // The website sends text/plain (no CORS preflight).
        headers: { 'content-type': 'text/plain', ...headers },
        body: JSON.stringify(body),
      }),
  };
}

const MSG = {
  message: 'Ollama install stops at 40 %',
  source: 'site',
  lang: 'en',
  page: '/guides/mac/',
};

describe('feedback endpoint', () => {
  it('stores a message from the website, answers its origin, and keeps no address', async () => {
    const s = await setup();
    const res = await s.post({ ...MSG, email: 'a@example.com' }, { origin: `https://${DOMAIN}` });
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(`https://${DOMAIN}`);
    const rows = feedbackSince(s.db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      message: MSG.message,
      email: 'a@example.com',
      page: '/guides/mac/',
    });
    const columns = s.db.prepare('SELECT * FROM feedback').get() as Record<string, unknown>;
    expect(Object.keys(columns)).not.toContain('ip');
    expect(JSON.stringify(columns)).not.toContain('127.0.0.1');
  });

  it('accepts a hub (no Origin) but refuses other websites and bad input', async () => {
    const s = await setup();
    expect((await s.post({ ...MSG, source: 'hub', version: '0.1.0' })).status).toBe(204);
    expect((await s.post(MSG, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await s.post({ ...MSG, message: '' })).status).toBe(400);
    expect((await s.post({ ...MSG, message: 'x'.repeat(4001) })).status).toBe(400);
    expect((await s.post({ ...MSG, email: 'not an email' })).status).toBe(400);
    expect((await s.post({ ...MSG, page: '/a?token=1' })).status).toBe(400);
    expect(feedbackSince(s.db)).toHaveLength(1);
  });

  it('pretends to accept what bots fill in, and limits one address', async () => {
    const s = await setup();
    expect((await s.post({ ...MSG, website: 'spam.example' })).status).toBe(204);
    expect(feedbackSince(s.db)).toHaveLength(0);
    for (let i = 0; i < 4; i++) expect((await s.post(MSG)).status).toBe(204);
    expect((await s.post(MSG)).status).toBe(429);
    s.later(60 * 60_000 + 1);
    expect((await s.post(MSG)).status).toBe(204);
  });

  it('is deleted after 12 months and listed for the digest after an id', async () => {
    const s = await setup();
    await s.post(MSG);
    await s.post({ ...MSG, message: 'second' });
    const out: string[] = [];
    expect(
      run(['feedback', '--after', '1'], { out: (l) => out.push(l), err: () => undefined }, s.db),
    ).toBe(0);
    expect(out.map((l) => (JSON.parse(l) as { message: string }).message)).toEqual(['second']);
    pruneRelay(s.db, Date.UTC(2027, 10, 9));
    expect(feedbackSince(s.db)).toHaveLength(0);
  });
});
