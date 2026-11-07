import { describe, expect, it } from 'vitest';
import { formatDirectLink, formatShareLink, isAllowedHubHost, parseLink } from './links.ts';

const CODE = 'A'.repeat(42) + 'z';
const HUB = 'zt0jr4qknd6e.h.relay.test';
const opts = { relayDomains: ['relay.test'] };

describe('links', () => {
  it('round-trips share and direct links', () => {
    const share = formatShareLink('relay.test', HUB, 'i', CODE);
    expect(share).toBe(`https://join.relay.test/j#1~${HUB}~i~${CODE}`);
    expect(parseLink(share, opts)).toEqual({ hubHost: HUB, kind: 'i', code: CODE });
    const direct = formatDirectLink(HUB, 'l', CODE);
    expect(direct).toBe(`https://${HUB}/join#l~${CODE}`);
    expect(parseLink(direct, opts)).toEqual({ hubHost: HUB, kind: 'l', code: CODE });
    const tailnet = formatDirectLink('homehub.tail1234.ts.net', 'd', CODE);
    expect(parseLink(tailnet, opts)).toEqual({
      hubHost: 'homehub.tail1234.ts.net',
      kind: 'd',
      code: CODE,
    });
  });

  it.each([
    [`https://join.relay.test/j#1~evil.example~i~${CODE}`, 'share link to a foreign host'],
    [`https://join.relay.test/j#2~${HUB}~i~${CODE}`, 'unknown version'],
    [`https://join.relay.test/j#1~${HUB}~x~${CODE}`, 'unknown kind'],
    [`https://join.relay.test/j#1~${HUB}~i~short`, 'short code'],
    [`https://join.relay.test/j#1~${HUB}~i~${CODE}~extra`, 'extra part'],
    [`http://join.relay.test/j#1~${HUB}~i~${CODE}`, 'http share link'],
    [`https://join.relay.test/other#1~${HUB}~i~${CODE}`, 'other path'],
    [`https://join.other.test/j#1~${HUB}~i~${CODE}`, 'unknown relay'],
    [`https://evil.example/join#i~${CODE}`, 'direct link to a foreign host'],
    [`http://${HUB}/join#i~${CODE}`, 'http direct link'],
    [`https://${HUB}/join?x=1#i~${CODE}`, 'query'],
    [`https://user@${HUB}/join#i~${CODE}`, 'credentials'],
    [`https://${HUB}/join`, 'no payload'],
    ['not a url', 'not a URL'],
    [`https://zt0jr4qknd6e.h.relay.test:8443/join#i~${CODE}`, 'port on a hub host'],
  ])('refuses %s (%s)', (link) => {
    expect(parseLink(link, opts)).toBeNull();
  });

  it('accepts localhost hubs only in development', () => {
    const link = `http://localhost:8787/join#i~${CODE}`;
    expect(parseLink(link, opts)).toBeNull();
    expect(parseLink(link, { ...opts, allowLocal: true })).toEqual({
      hubHost: 'localhost:8787',
      kind: 'i',
      code: CODE,
    });
    expect(isAllowedHubHost('hub.localhost:8787', { ...opts, allowLocal: true })).toBe(true);
    expect(isAllowedHubHost('localhost:8787:1', { ...opts, allowLocal: true })).toBe(false);
  });
});
