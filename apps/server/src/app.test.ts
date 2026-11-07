import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { HealthResponse, HUB_BRIDGE_LEVEL, MIN_SHELL_LEVEL } from '@hemmia/shared';
import { buildApp } from './app.ts';
import { loadConfig } from './config/load.ts';
import { openDatabase } from './db/database.ts';

describe('GET /api/health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const config = loadConfig({ NODE_ENV: 'test', HEMMIA_DATA_DIR: '/nonexistent' });
    ({ app } = await buildApp(config, { db: openDatabase(':memory:') }));
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns ok and the handshake levels, but no version', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(HealthResponse.parse(res.json())).toEqual({
      status: 'ok',
      bridge: HUB_BRIDGE_LEVEL,
      minShell: MIN_SHELL_LEVEL,
    });
    expect(res.body).not.toContain('version');
  });
});
