import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  HubSelfResponse,
  RegisterResponse,
  signRegistration,
  signRequest,
} from '@hemmia/relay-protocol';
import { openDb, type RelayDb } from '../db.ts';
import { apiRequest, DOMAIN, silent } from '../../test/helpers.ts';
import { hubRoutes } from './hubs.ts';
import { createApiHandler } from './server.ts';

let db: RelayDb;
let server: http.Server;
let port = 0;
let clock = 1_792_330_000_000;
const closed: string[] = [];

beforeEach(async () => {
  db = openDb(':memory:');
  closed.length = 0;
  const now = () => clock;
  const routes = hubRoutes({
    db,
    relayDomain: DOMAIN,
    monthlyLimitBytes: 1000,
    log: silent,
    isConnected: (id) => id.startsWith('z'),
    closeTunnel: (id) => closed.push(id),
    now,
  });
  server = http.createServer(
    createApiHandler({ db, relayDomain: DOMAIN, log: silent, routes, now }),
  );
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
});
afterEach(async () => {
  await new Promise<void>((r) =>
    server.close(() => {
      r();
    }),
  );
});

const register = (key: KeyObject, time = Math.floor(clock / 1000)) =>
  apiRequest(port, 'POST', '/v1/hubs', { body: JSON.stringify(signRegistration(key, time)) });

function signed(key: KeyObject, hubId: string, method: string, path: string, body = '') {
  return apiRequest(port, method, path, {
    headers: signRequest({
      privateKey: key,
      hubId,
      method,
      pathWithQuery: path,
      relayDomain: DOMAIN,
      time: Math.floor(clock / 1000),
      body: Buffer.from(body),
    }),
    ...(body !== '' ? { body } : {}),
  });
}

describe('hub registration', () => {
  it('registers a new hub, then answers 200 for the same key', async () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const first = await register(privateKey);
    expect(first.status).toBe(201);
    const info = RegisterResponse.parse(first.body);
    expect(info.hostname).toBe(`${info.hubId}.h.${DOMAIN}`);
    expect(info.tunnelHost).toBe(`tunnel.${DOMAIN}`);
    const again = await register(privateKey, Math.floor(clock / 1000) + 5);
    expect(again.status).toBe(200);
    expect(RegisterResponse.parse(again.body).hubId).toBe(info.hubId);
    const row = db.prepare('SELECT created_ip FROM hubs').get() as { created_ip: string };
    expect(row.created_ip).toBe('127.0.0.0/24');
  });

  it('refuses a bad proof, skewed time, blocked hubs and malformed bodies', async () => {
    const { privateKey } = generateKeyPairSync('ed25519');
    const body = signRegistration(privateKey, Math.floor(clock / 1000));
    const tampered = await apiRequest(port, 'POST', '/v1/hubs', {
      body: JSON.stringify({ ...body, time: body.time + 1 }),
    });
    expect(tampered).toMatchObject({ status: 401, body: { error: { code: 'bad_signature' } } });
    expect((await register(privateKey, Math.floor(clock / 1000) - 400)).status).toBe(400);
    expect((await apiRequest(port, 'POST', '/v1/hubs', { body: '{"publicKey":1}' })).status).toBe(
      400,
    );
    expect((await apiRequest(port, 'POST', '/v1/hubs', { body: 'not json' })).status).toBe(400);
    const info = RegisterResponse.parse((await register(privateKey)).body);
    db.prepare('UPDATE hubs SET blocked_at = 1, blocked_reason = ? WHERE id = ?').run(
      'spam',
      info.hubId,
    );
    expect(await register(privateKey)).toMatchObject({
      status: 403,
      body: { error: { code: 'blocked' } },
    });
  });

  it('limits new registrations per address to 5 a day', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await register(generateKeyPairSync('ed25519').privateKey)).status).toBe(201);
    }
    const sixth = await register(generateKeyPairSync('ed25519').privateKey);
    expect(sixth).toMatchObject({ status: 429, body: { error: { code: 'rate_limited' } } });
    clock += 24 * 60 * 60_000 + 1;
    expect((await register(generateKeyPairSync('ed25519').privateKey)).status).toBe(201);
  });

  it('answers 404 for unknown routes and other hosts', async () => {
    expect((await apiRequest(port, 'GET', '/v2/nothing')).status).toBe(404);
    expect((await apiRequest(port, 'GET', '/v1/hubs/self', { host: 'evil.example' })).status).toBe(
      404,
    );
  });
});

describe('signed requests', () => {
  async function hub() {
    const { privateKey } = generateKeyPairSync('ed25519');
    const info = RegisterResponse.parse((await register(privateKey)).body);
    return { key: privateKey, id: info.hubId };
  }

  it('serves /v1/hubs/self to the hub itself', async () => {
    const h = await hub();
    db.prepare('INSERT INTO usage (hub_id, month, bytes) VALUES (?, ?, ?)').run(
      h.id,
      '2026-10',
      42,
    );
    const res = await signed(h.key, h.id, 'GET', '/v1/hubs/self');
    expect(res.status).toBe(200);
    expect(HubSelfResponse.parse(res.body)).toMatchObject({
      hubId: h.id,
      quota: { month: '2026-10', bytes: 42, limitBytes: 1000 },
      blocked: false,
    });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('refuses the wrong key, skewed time, replays and blocked hubs', async () => {
    const h = await hub();
    const other = generateKeyPairSync('ed25519').privateKey;
    expect((await signed(other, h.id, 'GET', '/v1/hubs/self')).status).toBe(401);
    const headers = signRequest({
      privateKey: h.key,
      hubId: h.id,
      method: 'GET',
      pathWithQuery: '/v1/hubs/self',
      relayDomain: DOMAIN,
      time: Math.floor(clock / 1000) - 301,
      body: Buffer.alloc(0),
    });
    expect((await apiRequest(port, 'GET', '/v1/hubs/self', { headers })).status).toBe(401);
    const fresh = signRequest({
      privateKey: h.key,
      hubId: h.id,
      method: 'GET',
      pathWithQuery: '/v1/hubs/self',
      relayDomain: DOMAIN,
      time: Math.floor(clock / 1000),
      body: Buffer.alloc(0),
    });
    expect((await apiRequest(port, 'GET', '/v1/hubs/self', { headers: fresh })).status).toBe(200);
    expect(await apiRequest(port, 'GET', '/v1/hubs/self', { headers: fresh })).toMatchObject({
      status: 401,
      body: { error: { code: 'bad_signature' } },
    });
    expect((await apiRequest(port, 'GET', '/v1/hubs/self')).status).toBe(401);
    db.prepare('UPDATE hubs SET blocked_at = 1 WHERE id = ?').run(h.id);
    clock += 1000; // a new signature (Ed25519 signs deterministically)
    expect(await signed(h.key, h.id, 'GET', '/v1/hubs/self')).toMatchObject({
      status: 403,
      body: { error: { code: 'blocked' } },
    });
  });

  it('deletes the hub and closes its tunnel', async () => {
    const h = await hub();
    const res = await signed(h.key, h.id, 'DELETE', '/v1/hubs/self');
    expect(res.status).toBe(204);
    expect(closed).toEqual([h.id]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM hubs').get()).toEqual({ n: 0 });
    expect((await signed(h.key, h.id, 'GET', '/v1/hubs/self')).status).toBe(401);
  });
});
