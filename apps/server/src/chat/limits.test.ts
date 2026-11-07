import { describe, expect, it } from 'vitest';
import { maxMessageChars } from '@hemmia/shared';
import { chatTimeoutMs } from './reply.ts';

describe('long text limits', () => {
  it('scale the message limit with the context window', () => {
    expect(maxMessageChars(131_072)).toBe(311_190);
    expect(maxMessageChars(65_536)).toBe(147_350);
    expect(maxMessageChars(32_768)).toBe(65_430);
    expect(maxMessageChars(4096)).toBe(1000);
  });

  it('give long texts more time, within 30 minutes', () => {
    expect(chatTimeoutMs(100)).toBe(5 * 60_000 + 1000);
    // ~147k characters (Qwen3.8's limit) ≈ 59k tokens ≈ 8 min of reading at the slowest speed.
    expect(chatTimeoutMs(147_350)).toBe(5 * 60_000 + 492_000);
    expect(chatTimeoutMs(320_000)).toBe(5 * 60_000 + 1_067_000);
    expect(chatTimeoutMs(10_000_000)).toBe(30 * 60_000);
  });
});
