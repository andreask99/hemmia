import { describe, expect, it } from 'vitest';
import { expectedLoadMs, recordLoad } from './loadTimes.ts';

describe('load times', () => {
  it('estimates from memory size until a real load was seen', () => {
    expect(expectedLoadMs('probe-a:1b', 19)).toBe(11_400);
    expect(expectedLoadMs('probe-b:1b', 1)).toBe(3_000);
    recordLoad('probe-a:1b', 7_800);
    expect(expectedLoadMs('probe-a:1b', 19)).toBe(7_800);
    // A model that was already in memory reports a tiny load time: ignored.
    recordLoad('probe-a:1b', 40);
    expect(expectedLoadMs('probe-a:1b', 19)).toBe(7_800);
  });
});
