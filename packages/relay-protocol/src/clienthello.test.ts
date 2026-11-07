import { describe, expect, it } from 'vitest';
import { parseClientHelloSni } from './clienthello.ts';
import { NODE_HELLO_HEX, OPENSSL_HELLO_HEX } from './fixtures.test-data.ts';

const node = Buffer.from(NODE_HELLO_HEX, 'hex');
const openssl = Buffer.from(OPENSSL_HELLO_HEX, 'hex');

/** Splits one record's handshake payload into several records of at most `size` bytes. */
function fragment(hello: Buffer, size: number): Buffer {
  const payload = hello.subarray(5, 5 + hello.readUInt16BE(3));
  const out: Buffer[] = [];
  for (let i = 0; i < payload.length; i += size) {
    const part = payload.subarray(i, i + size);
    const header = Buffer.from([0x16, 0x03, 0x01, 0, 0]);
    header.writeUInt16BE(part.length, 3);
    out.push(header, part);
  }
  return Buffer.concat(out);
}

/** A minimal ClientHello with the given extensions block. */
function hello(extensions: Buffer, opts: { session?: number } = {}): Buffer {
  const session = opts.session ?? 0;
  const body = Buffer.concat([
    Buffer.from([0x03, 0x03]),
    Buffer.alloc(32),
    Buffer.from([session]),
    Buffer.alloc(Math.min(session, 32)),
    Buffer.from([0x00, 0x02, 0x13, 0x01]),
    Buffer.from([0x01, 0x00]),
    Buffer.from([extensions.length >> 8, extensions.length & 255]),
    extensions,
  ]);
  const hs = Buffer.concat([Buffer.from([0x01, 0, body.length >> 8, body.length & 255]), body]);
  return Buffer.concat([Buffer.from([0x16, 0x03, 0x01, hs.length >> 8, hs.length & 255]), hs]);
}

function sniExt(name: string, nameType = 0): Buffer {
  const n = Buffer.from(name, 'latin1');
  const entry = Buffer.concat([Buffer.from([nameType, n.length >> 8, n.length & 255]), n]);
  const list = Buffer.concat([Buffer.from([entry.length >> 8, entry.length & 255]), entry]);
  return Buffer.concat([Buffer.from([0, 0, list.length >> 8, list.length & 255]), list]);
}

describe('parseClientHelloSni', () => {
  it('reads real ClientHellos from Node and OpenSSL', () => {
    expect(parseClientHelloSni(node)).toEqual({ sni: 'abcdefghjkmn.h.relay.test' });
    expect(parseClientHelloSni(openssl)).toEqual({ sni: 'join.relay.test' });
  });

  it('asks for more bytes while incomplete, at every cut', () => {
    for (let cut = 0; cut < node.length; cut++) {
      const r = parseClientHelloSni(node.subarray(0, cut));
      expect('need' in r).toBe(true);
      if ('need' in r) expect(r.need).toBeGreaterThan(0);
    }
  });

  it('reads hellos fragmented over several records', () => {
    for (const size of [1, 7, 100, 512]) {
      expect(parseClientHelloSni(fragment(node, size))).toEqual({
        sni: 'abcdefghjkmn.h.relay.test',
      });
    }
  });

  it.each([
    ['alert record', Buffer.from([0x15, 3, 1, 0, 2, 2, 40])],
    ['bad record version', Buffer.from([0x16, 2, 0, 0, 4, 1, 0, 0, 0])],
    ['empty record', Buffer.from([0x16, 3, 1, 0, 0])],
    ['huge record', Buffer.from([0x16, 3, 1, 0x40, 0x01])],
    ['not a ClientHello', Buffer.from([0x16, 3, 1, 0, 4, 2, 0, 0, 40])],
    ['bad hello length', Buffer.from([0x16, 3, 1, 0, 4, 1, 0, 0, 2])],
    ['no extensions', hello(Buffer.alloc(0)).subarray(0, -2)],
    ['no server_name', hello(Buffer.from([0, 10, 0, 2, 0, 29]))],
    ['bad host name', hello(sniExt('bad_name.test'))],
    ['host name with high byte', hello(sniExt('café.test'))],
    ['IP literal ok but trailing dot', hello(sniExt('example.test.'))],
    ['non-host-name entry only', hello(sniExt('x.test', 1))],
    ['session id too long', hello(sniExt('x.test'), { session: 33 })],
  ])('rejects %s', (_name, buf) => {
    const r = parseClientHelloSni(buf);
    expect('error' in r || 'need' in r).toBe(true);
    expect('sni' in r).toBe(false);
  });

  it('lower-cases and accepts the first host name', () => {
    expect(parseClientHelloSni(hello(sniExt('API.Relay.Test')))).toEqual({ sni: 'api.relay.test' });
  });

  it('never throws on random or truncated input', () => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed;
    };
    for (let i = 0; i < 10_000; i++) {
      let buf: Buffer;
      if (i % 3 === 0) {
        // Real hello with random bytes flipped.
        buf = Buffer.from(node);
        for (let k = 0; k < 4; k++) buf[rand() % buf.length] = rand() & 0xff;
      } else if (i % 3 === 1) {
        buf = node.subarray(0, rand() % node.length);
      } else {
        buf = Buffer.alloc(rand() % 300);
        for (let j = 0; j < buf.length; j++) buf[j] = rand() & 0xff;
        if (buf.length > 5) {
          buf[0] = 0x16;
          buf[1] = 3;
          buf[2] = 1;
        }
      }
      const r = parseClientHelloSni(buf);
      expect('sni' in r || 'need' in r || 'error' in r).toBe(true);
    }
  });
});
