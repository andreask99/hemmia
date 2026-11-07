import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rate-limit.ts';

const MIN = 60_000;

describe('rate limiter', () => {
  it('allows max attempts per window, then blocks until the window moves', () => {
    let t = 0;
    const rl = createRateLimiter({ max: 3, windowMs: 10 * MIN, now: () => t });
    expect(rl.hit('k').allowed).toBe(true);
    t += MIN;
    expect(rl.hit('k').allowed).toBe(true);
    expect(rl.hit('k').allowed).toBe(true);
    const blocked = rl.hit('k');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(9 * MIN);
    t = 10 * MIN; // first hit left the window
    expect(rl.hit('k').allowed).toBe(true);
    expect(rl.hit('k').allowed).toBe(false);
  });

  it('keeps keys separate', () => {
    const rl = createRateLimiter({ max: 1, windowMs: MIN, now: () => 0 });
    expect(rl.hit('a').allowed).toBe(true);
    expect(rl.hit('b').allowed).toBe(true);
    expect(rl.check('a').allowed).toBe(false);
  });

  it('check does not record', () => {
    const rl = createRateLimiter({ max: 1, windowMs: MIN, now: () => 0 });
    for (let i = 0; i < 5; i++) expect(rl.check('k').allowed).toBe(true);
    expect(rl.hit('k').allowed).toBe(true);
  });

  it('backs off exponentially and resets after a quiet period', () => {
    let t = 0;
    const rl = createRateLimiter({
      max: 5,
      windowMs: 15 * MIN,
      backoff: true,
      maxBlockMs: 24 * 60 * MIN,
      now: () => t,
    });
    const fail5 = () => {
      for (let i = 0; i < 5; i++) expect(rl.hit('u').allowed).toBe(true);
    };
    fail5();
    expect(rl.check('u').retryAfterMs).toBe(15 * MIN);
    t += 15 * MIN;
    fail5();
    expect(rl.check('u').retryAfterMs).toBe(30 * MIN);
    t += 30 * MIN;
    fail5();
    expect(rl.check('u').retryAfterMs).toBe(60 * MIN);
    // A day of quiet resets the escalation.
    t += 60 * MIN + 24 * 60 * MIN;
    fail5();
    expect(rl.check('u').retryAfterMs).toBe(15 * MIN);
  });

  it('reset clears a key', () => {
    const rl = createRateLimiter({ max: 1, windowMs: MIN, backoff: true, now: () => 0 });
    rl.hit('k');
    expect(rl.check('k').allowed).toBe(false);
    rl.reset('k');
    expect(rl.check('k').allowed).toBe(true);
  });

  it('forgets idle keys', () => {
    let t = 0;
    const rl = createRateLimiter({ max: 5, windowMs: MIN, now: () => t });
    for (let i = 0; i < 100; i++) rl.hit(`k${String(i)}`);
    t += 2 * MIN;
    rl.check('x');
    expect(rl.size()).toBeLessThanOrEqual(1);
  });
});
