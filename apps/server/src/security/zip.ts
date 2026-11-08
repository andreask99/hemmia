/**
 * Checks an Office file (a ZIP archive) before a parser unpacks it (security review 2026-11-07,
 * H3): a few kilobytes can inflate to gigabytes, and parsers keep inflated data outside the
 * worker's heap limit. Every entry is inflated here with a hard output limit, so what the
 * central directory declares is verified, not trusted. Owned by Claude (upload validation).
 */
import { inflateRawSync } from 'node:zlib';

export interface ZipLimits {
  /** Entries in the archive. */
  maxEntries: number;
  /** Sum of all inflated entries, bytes. */
  maxTotalBytes: number;
}

export const OFFICE_ZIP_LIMITS: ZipLimits = { maxEntries: 5000, maxTotalBytes: 256 * 1024 * 1024 };

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** Whether the archive is well-formed and inflates within the limits. Never throws. */
export function zipWithinLimits(buf: Buffer, limits: ZipLimits = OFFICE_ZIP_LIMITS): boolean {
  try {
    return check(buf, limits);
  } catch {
    return false;
  }
}

function check(buf: Buffer, limits: ZipLimits): boolean {
  // The end-of-central-directory record is in the last 22 bytes plus at most a 64 KiB comment.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return false;
  const entries = buf.readUInt16LE(eocd + 10);
  const dirSize = buf.readUInt32LE(eocd + 12);
  const dirOffset = buf.readUInt32LE(eocd + 16);
  // 0xffff / 0xffffffff mean ZIP64, which no Office file of an accepted size needs.
  if (entries === 0xffff || dirSize === 0xffffffff || dirOffset === 0xffffffff) return false;
  if (entries > limits.maxEntries || dirOffset + dirSize > eocd) return false;

  let total = 0;
  let p = dirOffset;
  for (let n = 0; n < entries; n++) {
    if (buf.readUInt32LE(p) !== CENTRAL) return false;
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    p += 46 + nameLen + extraLen + commentLen;
    if (flags & 0x1) return false; // encrypted
    if (compressed === 0xffffffff || size === 0xffffffff || local === 0xffffffff) return false;
    total += size;
    if (total > limits.maxTotalBytes) return false;

    if (buf.readUInt32LE(local) !== LOCAL) return false;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    if (start + compressed > buf.length) return false;
    const data = buf.subarray(start, start + compressed);
    if (method === 0) {
      if (compressed !== size) return false;
    } else if (method === 8) {
      // Inflating more than declared throws (maxOutputLength); less is a corrupt archive.
      const out = inflateRawSync(data, { maxOutputLength: Math.max(size, 1) });
      if (out.length !== size) return false;
    } else {
      return false;
    }
  }
  return true;
}
