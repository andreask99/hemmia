import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { tinyXlsx } from './document-fixtures.ts';
import { zipWithinLimits } from './zip.ts';

/** A ZIP with deflated entries; `declare` overrides the inflated size written to the headers. */
function zip(entries: { name: string; data: Buffer; declare?: number }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name);
    const body = deflateRawSync(e.data);
    const size = e.declare ?? e.data.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, body);
    centrals.push(central, name);
    offset += 30 + name.length + body.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

describe('zipWithinLimits', () => {
  it('accepts a real Office file and a small archive', async () => {
    expect(zipWithinLimits(await tinyXlsx())).toBe(true);
    expect(zipWithinLimits(zip([{ name: 'a.xml', data: Buffer.from('<a/>') }]))).toBe(true);
  });

  it('refuses an entry that inflates to more than it declares (a bomb)', () => {
    const bomb = zip([{ name: 'xl/media/x.png', data: Buffer.alloc(20_000_000), declare: 100 }]);
    expect(bomb.length).toBeLessThan(100_000);
    expect(zipWithinLimits(bomb)).toBe(false);
  });

  it('refuses archives over the total size or entry count', () => {
    const big = zip([
      { name: 'a', data: Buffer.alloc(600_000) },
      { name: 'b', data: Buffer.alloc(600_000) },
    ]);
    expect(zipWithinLimits(big, { maxEntries: 10, maxTotalBytes: 1_000_000 })).toBe(false);
    const many = zip(
      Array.from({ length: 11 }, (_, i) => ({ name: `f${String(i)}`, data: Buffer.from('x') })),
    );
    expect(zipWithinLimits(many, { maxEntries: 10, maxTotalBytes: 1_000_000 })).toBe(false);
  });

  it('refuses garbage without throwing', () => {
    expect(zipWithinLimits(Buffer.from('PK\u0003\u0004garbage'))).toBe(false);
    expect(zipWithinLimits(Buffer.alloc(0))).toBe(false);
  });
});
