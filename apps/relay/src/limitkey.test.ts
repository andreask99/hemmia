import { describe, expect, it } from 'vitest';
import { limitKey } from './router.ts';

describe('limitKey', () => {
  it('keeps IPv4 addresses and groups IPv6 by /64', () => {
    expect(limitKey('203.0.113.7')).toBe('203.0.113.7');
    expect(limitKey('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64');
    expect(limitKey('2001:0db8:0001:0002:ffff:ffff:ffff:ffff')).toBe('2001:db8:1:2::/64');
    expect(limitKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(limitKey('::1')).toBe('0:0:0:0::/64');
  });
});
