import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import type { UserKey } from '../db/chats.ts';
import { type DB, openDatabase } from '../db/database.ts';
import {
  type AttachmentStore,
  cleanImage,
  createAttachmentStore,
  ImageRejectedError,
  sniffImage,
} from './attachments.ts';
import { randomKey } from './crypto.ts';
import { scanJpeg, scannedPdf, tinyPdf } from './document-fixtures.ts';

async function jpeg(width = 800, height = 600, exif = false): Promise<Buffer> {
  let img = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 50, b: 50 } } });
  if (exif) {
    img = img.withExif({ IFD0: { Copyright: 'SECRET-EXIF-MARKER', Make: 'SecretPhone' } });
  }
  return img.jpeg().toBuffer();
}

let db: DB;
let anna: UserKey;
let ben: UserKey;

function insertUser(id: string): void {
  const b = Buffer.alloc(1);
  db.prepare(
    `INSERT INTO users (id, username, role, auth_hash, kdf_salt, kdf_params, wrapped_dek_pw,
       recovery_salt, recovery_kdf_params, wrapped_dek_recovery, created_at, password_changed_at)
     VALUES (?, ?, 'member', ?, ?, '{}', ?, ?, '{}', ?, 0, 0)`,
  ).run(id, id, b, b, b, b, b);
}

beforeEach(() => {
  db = openDatabase(':memory:');
  insertUser('u-anna');
  insertUser('u-ben');
  anna = { userId: 'u-anna', dek: randomKey() };
  ben = { userId: 'u-ben', dek: randomKey() };
});

describe('sniffImage', () => {
  it('recognises JPEG, PNG, WebP by magic bytes only', async () => {
    expect(sniffImage(await jpeg())).toBe('jpeg');
    expect(
      sniffImage(
        await sharp(await jpeg())
          .png()
          .toBuffer(),
      ),
    ).toBe('png');
    expect(
      sniffImage(
        await sharp(await jpeg())
          .webp()
          .toBuffer(),
      ),
    ).toBe('webp');
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffImage(Buffer.from('GIF89a......'))).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
  });
});

describe('cleanImage', () => {
  it('re-encodes to JPEG, scales down and drops metadata', async () => {
    const out = await cleanImage(await jpeg(4000, 3000, true));
    expect(out.mime).toBe('image/jpeg');
    expect([out.width, out.height]).toEqual([2048, 1536]);
    const meta = await sharp(out.bytes).metadata();
    expect(meta.exif).toBeUndefined();
    expect(out.bytes.toString('latin1')).not.toContain('SECRET-EXIF-MARKER');
    expect(out.bytes.toString('latin1')).not.toContain('SecretPhone');
  });

  it('keeps small images at their size and PNG transparency as PNG', async () => {
    const small = await cleanImage(await jpeg(300, 200));
    expect([small.width, small.height]).toEqual([300, 200]);
    const png = await sharp({
      create: { width: 50, height: 50, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0.5 } },
    })
      .png()
      .toBuffer();
    expect((await cleanImage(png)).mime).toBe('image/png');
  });

  it('strips payloads appended to a valid image (polyglots)', async () => {
    const poly = Buffer.concat([
      await jpeg(),
      Buffer.from('<script>alert(1)</script>PK\u0003\u0004'),
    ]);
    const out = await cleanImage(poly);
    expect(out.bytes.toString('latin1')).not.toContain('<script>');
    expect(out.bytes.toString('latin1')).not.toContain('PK\u0003\u0004');
  });

  it('rejects non-images, fakes, truncated files and oversize input', async () => {
    const bad = [
      Buffer.from('hello world'),
      Buffer.from('<svg onload="alert(1)"></svg>'),
      Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('not really a jpeg')]),
      (await jpeg()).subarray(0, 200),
      Buffer.alloc(11 * 1024 * 1024, 0xff),
      Buffer.alloc(0),
    ];
    for (const input of bad) {
      await expect(cleanImage(input)).rejects.toBeInstanceOf(ImageRejectedError);
    }
  });

  it('rejects decompression bombs', async () => {
    const bomb = await sharp({
      create: { width: 8000, height: 8000, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(bomb.length).toBeLessThan(1024 * 1024);
    await expect(cleanImage(bomb)).rejects.toBeInstanceOf(ImageRejectedError);
  });
});

describe('attachment store', () => {
  let dir: string;
  let store: AttachmentStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kchat-att-'));
    store = createAttachmentStore({ db, dataDir: dir });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('stores encrypted, owner-only files and reads them back', async () => {
    const ref = await store.saveUpload(anna, await jpeg());
    const files = readdirSync(join(dir, 'blobs'));
    expect(files).toEqual([`${ref.id}.bin`]);
    expect(statSync(join(dir, 'blobs')).mode & 0o777).toBe(0o700);
    expect(statSync(join(dir, 'blobs', files[0] ?? '')).mode & 0o777).toBe(0o600);
    const raw = readFileSync(join(dir, 'blobs', files[0] ?? ''));
    expect(sniffImage(raw)).toBeNull(); // not a readable image on disk
    const back = await store.read(anna, ref.id);
    expect(back?.mime).toBe('image/jpeg');
    expect(sniffImage(back?.bytes ?? Buffer.alloc(0))).toBe('jpeg');
  });

  it("never returns another user's attachment", async () => {
    const ref = await store.saveUpload(anna, await jpeg());
    expect(await store.read(ben, ref.id)).toBeNull();
    expect(await store.read(anna, '../../etc/passwd')).toBeNull();
    expect(await store.read(anna, 'no-such-id')).toBeNull();
  });

  it('detects tampered or swapped blobs', async () => {
    const a = await store.saveUpload(anna, await jpeg());
    const b = await store.saveUpload(anna, await jpeg(10, 10));
    // Swap the two files on disk: each now fails its AAD check.
    const pa = join(dir, 'blobs', `${a.id}.bin`);
    const pb = join(dir, 'blobs', `${b.id}.bin`);
    const ba = readFileSync(pa);
    writeFileSync(pa, readFileSync(pb));
    writeFileSync(pb, ba);
    await expect(store.read(anna, a.id)).rejects.toThrow();
  });

  it('cleans up old unsent uploads and deletes blobs', async () => {
    let t = 1_000_000;
    const timed = createAttachmentStore({ db, dataDir: dir, now: () => t });
    await timed.saveUpload(anna, await jpeg());
    t += 25 * 60 * 60 * 1000;
    const fresh = await timed.saveUpload(anna, await jpeg());
    expect(await timed.cleanupOrphans(24 * 60 * 60 * 1000)).toBe(1);
    expect(readdirSync(join(dir, 'blobs'))).toEqual([`${fresh.id}.bin`]);
  });

  it('stores scanned PDF pages encrypted, only for their owner, and deletes them with the document', async () => {
    const page = await scanJpeg(['Abschlag 86 EUR']);
    const ref = await store.saveDocument(
      anna,
      scannedPdf([{ jpeg: page, width: 1240, height: 1754 }]),
      'Brief.pdf',
    );
    expect(ref.scanPages).toBe(1);
    const raw = readFileSync(join(dir, 'blobs', `${ref.id}-p1.bin`));
    expect(raw.includes(Buffer.from([0xff, 0xd8, 0xff]))).toBe(false); // no JPEG on disk
    const scans = await store.readScans(anna, ref.id);
    expect(scans).toHaveLength(1);
    expect((await sharp(scans[0]).metadata()).format).toBe('jpeg');
    expect(await store.readScans(ben, ref.id)).toEqual([]);
    expect(store.needsVision(anna, [ref.id])).toBe(true);
    expect(store.needsVision(ben, [ref.id])).toBe(false);

    await store.deleteBlobs([ref.id]);
    expect(readdirSync(join(dir, 'blobs'))).toEqual([]);
  });

  it('text documents do not need a model that can see; photos do', async () => {
    const doc = await store.saveDocument(anna, tinyPdf('Abschlag 86 EUR'), 'Rechnung.pdf');
    const photo = await store.saveUpload(anna, await jpeg());
    expect(doc.scanPages).toBe(0);
    expect(store.needsVision(anna, [doc.id])).toBe(false);
    expect(store.needsVision(anna, [doc.id, photo.id])).toBe(true);
    expect(store.needsVision(anna, [])).toBe(false);
  });

  it('works in memory for tests', async () => {
    const mem = createAttachmentStore({ db, dataDir: ':memory:' });
    const ref = await mem.saveUpload(anna, await jpeg());
    expect((await mem.read(anna, ref.id))?.mime).toBe('image/jpeg');
  });
});
