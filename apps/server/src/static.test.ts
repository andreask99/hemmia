import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.ts';
import { loadConfig } from './config/load.ts';
import { openDatabase } from './db/database.ts';

let dir: string;
let app: FastifyInstance;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'kchat-dist-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><div id="root"></div>');
  writeFileSync(join(dir, 'assets', 'index-abc123.js'), 'console.log(1)');
  writeFileSync(join(dir, '.env'), 'SECRET=1');
  ({ app } = await buildApp(loadConfig({ NODE_ENV: 'test' }), {
    db: openDatabase(':memory:'),
    webDistDir: dir,
  }));
});

afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('web app serving', () => {
  it('serves index.html uncached with security headers', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('id="root"');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
  });

  it('falls back to index.html for client routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/chats/abc' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('id="root"');
  });

  it('caches hashed assets for a year', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/index-abc123.js' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('answers missing files with 404, never with the app page', async () => {
    for (const url of [
      '/assets/index-old123.js',
      '/icons/gone.png',
      '/missing.css',
      '/assets/x.js?v=1',
    ]) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, url).toBe(404);
      expect(res.headers['content-type'], url).not.toContain('text/html');
    }
  });

  it('keeps unknown API paths as JSON 404s and hides dotfiles', async () => {
    const api = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(api.statusCode).toBe(404);
    expect(api.json()).toEqual({ error: { code: 'not_found' } });
    const dot = await app.inject({ method: 'GET', url: '/.env' });
    expect(dot.body).not.toContain('SECRET');
  });
});
