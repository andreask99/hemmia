/**
 * Reads the server name (SNI) from a TLS ClientHello without terminating TLS (RELAY.md §3).
 * Works on a growing buffer: answers how many more bytes it needs. Every length is checked
 * against what is there. Owned by Claude.
 */

export type ClientHelloResult = { sni: string } | { need: number } | { error: string };

/** The most bytes the router buffers for a ClientHello. */
export const MAX_CLIENT_HELLO_BYTES = 16 * 1024;
const MAX_RECORD = 16384;
const NAME = /^[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})*$/;

/**
 * Collects the handshake bytes from TLS records. Returns the handshake data so far, the bytes
 * still needed for the current record, or an error.
 */
function handshakeBytes(
  buf: Uint8Array,
  wanted: number,
): { data: Uint8Array } | { need: number } | { error: string } {
  const parts: Uint8Array[] = [];
  let have = 0;
  let pos = 0;
  while (have < wanted) {
    if (buf.length - pos < 5) return { need: 5 - (buf.length - pos) };
    const type = buf[pos];
    const major = buf[pos + 1];
    const minor = buf[pos + 2] ?? 0;
    const length = ((buf[pos + 3] ?? 0) << 8) | (buf[pos + 4] ?? 0);
    if (type !== 0x16) return { error: 'not a handshake record' };
    if (major !== 0x03 || minor < 0x01 || minor > 0x04) return { error: 'bad record version' };
    if (length === 0 || length > MAX_RECORD) return { error: 'bad record length' };
    if (buf.length - pos - 5 < length) return { need: length - (buf.length - pos - 5) };
    parts.push(buf.subarray(pos + 5, pos + 5 + length));
    have += length;
    pos += 5 + length;
  }
  const data = new Uint8Array(have);
  let o = 0;
  for (const p of parts) {
    data.set(p, o);
    o += p.length;
  }
  return { data };
}

class Reader {
  pos = 0;
  readonly b: Uint8Array;
  readonly end: number;
  constructor(b: Uint8Array, end: number) {
    this.b = b;
    this.end = end;
  }
  u8(): number | null {
    if (this.pos + 1 > this.end) return null;
    return this.b[this.pos++] ?? null;
  }
  u16(): number | null {
    if (this.pos + 2 > this.end) return null;
    const v = ((this.b[this.pos] ?? 0) << 8) | (this.b[this.pos + 1] ?? 0);
    this.pos += 2;
    return v;
  }
  skip(n: number): boolean {
    if (this.pos + n > this.end) return false;
    this.pos += n;
    return true;
  }
}

export function parseClientHelloSni(buf: Uint8Array): ClientHelloResult {
  if (buf.length > MAX_CLIENT_HELLO_BYTES + 5 * 4) return { error: 'too large' };
  // First the 4-byte handshake header to learn the message length.
  const head = handshakeBytes(buf, 4);
  if (!('data' in head)) return head;
  const h = head.data;
  if (h[0] !== 0x01) return { error: 'not a ClientHello' };
  const msgLength = ((h[1] ?? 0) << 16) | ((h[2] ?? 0) << 8) | (h[3] ?? 0);
  if (msgLength < 38 || msgLength + 4 > MAX_CLIENT_HELLO_BYTES)
    return { error: 'bad hello length' };
  const whole = handshakeBytes(buf, msgLength + 4);
  if (!('data' in whole)) {
    if ('need' in whole && buf.length + whole.need > MAX_CLIENT_HELLO_BYTES + 5 * 4) {
      return { error: 'too large' };
    }
    return whole;
  }
  const r = new Reader(whole.data, msgLength + 4);
  r.pos = 4;
  if (!r.skip(2 + 32)) return { error: 'truncated' };
  const sessionLen = r.u8();
  if (sessionLen === null || sessionLen > 32 || !r.skip(sessionLen))
    return { error: 'bad session id' };
  const suitesLen = r.u16();
  if (suitesLen === null || suitesLen % 2 !== 0 || !r.skip(suitesLen))
    return { error: 'bad cipher suites' };
  const compLen = r.u8();
  if (compLen === null || !r.skip(compLen)) return { error: 'bad compression methods' };
  const extLen = r.u16();
  if (extLen === null) return { error: 'no extensions' };
  const extEnd = r.pos + extLen;
  if (extEnd > r.end) return { error: 'bad extensions length' };
  while (r.pos + 4 <= extEnd) {
    const type = r.u16();
    const len = r.u16();
    if (type === null || len === null || r.pos + len > extEnd) return { error: 'bad extension' };
    if (type !== 0) {
      r.pos += len;
      continue;
    }
    const sni = new Reader(r.b, r.pos + len);
    sni.pos = r.pos;
    const listLen = sni.u16();
    if (listLen === null || sni.pos + listLen !== sni.end) return { error: 'bad server_name list' };
    while (sni.pos < sni.end) {
      const nameType = sni.u8();
      const nameLen = sni.u16();
      if (nameType === null || nameLen === null || sni.pos + nameLen > sni.end) {
        return { error: 'bad server_name entry' };
      }
      if (nameType === 0) {
        let name = '';
        for (let i = 0; i < nameLen; i++) {
          const c = r.b[sni.pos + i] ?? 0;
          if (c > 0x7e || c < 0x21) return { error: 'bad host name' };
          name += String.fromCharCode(c);
        }
        name = name.toLowerCase();
        if (name.length > 253 || !NAME.test(name)) return { error: 'bad host name' };
        return { sni: name };
      }
      sni.pos += nameLen;
    }
    return { error: 'no host name' };
  }
  return { error: 'no server_name' };
}
