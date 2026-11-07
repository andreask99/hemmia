import { describe, expect, it } from 'vitest';
import { HealthResponse } from './health.ts';

describe('HealthResponse', () => {
  it('accepts a valid response', () => {
    const ok = { status: 'ok', bridge: 1, minShell: 1 };
    expect(HealthResponse.parse(ok)).toEqual(ok);
  });

  it('rejects an unknown status and a response without the handshake', () => {
    expect(HealthResponse.safeParse({ status: 'down', bridge: 1, minShell: 1 }).success).toBe(
      false,
    );
    expect(HealthResponse.safeParse({ status: 'ok', version: '0.0.0' }).success).toBe(false);
  });
});
