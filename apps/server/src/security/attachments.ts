/**
 * Photos in and images out: validation, re-encoding, encryption at rest, and owner-only
 * access. Owned by Claude (upload validation and attachment access control).
 *
 * Every upload is decoded and re-encoded by sharp, so what we store is a fresh image with
 * no metadata (no GPS), not the bytes the client sent: polyglots and trailing payloads
 * don't survive. Files are AES-GCM envelopes bound to user and attachment id.
 */
import { randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import type { AttachmentRef, WebSource } from '@hemmia/shared';
import type { UserKey } from '../db/chats.ts';
import type { DB } from '../db/database.ts';
import { aadBlob, aadColumn, decrypt, encrypt, encryptString } from './crypto.ts';
import {
  DOCUMENT_MIME,
  DocumentRejectedError,
  extractText,
  MAX_DOCUMENT_BYTES,
  sniffDocument,
  MAX_SCAN_PAGES,
} from './documents.ts';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Longest side after re-encoding (the client already scales to this). */
export const MAX_SIDE = 2048;
/** Longest side of a photo from the web (shown in the chat, not edited). */
export const WEB_PHOTO_SIDE = 1600;
/** Decoder guard against decompression bombs: 50 megapixels. */
const MAX_INPUT_PIXELS = 50_000_000;
const ID = /^[A-Za-z0-9-]{1,70}$/;

export class ImageRejectedError extends Error {
  override name = 'ImageRejectedError';
  constructor() {
    super('image rejected');
  }
}

type Mime = AttachmentRef['mime'];
type ImageMime = 'image/jpeg' | 'image/png';

/** The format by magic bytes, or null. HEIC isn't accepted (the web app converts to JPEG). */
export function sniffImage(buf: Uint8Array): 'jpeg' | 'png' | 'webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (
    buf.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => buf[i] === b)
  ) {
    return 'png';
  }
  if (
    buf.length >= 12 &&
    Buffer.from(buf.subarray(0, 4)).toString('latin1') === 'RIFF' &&
    Buffer.from(buf.subarray(8, 12)).toString('latin1') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

export interface CleanImage {
  bytes: Buffer;
  mime: ImageMime;
  width: number;
  height: number;
}

/**
 * Validates and re-encodes an uploaded image: JPEG out (PNG if it has transparency),
 * EXIF orientation applied, at most `maxSide` px, all metadata dropped.
 */
export async function cleanImage(input: Buffer, maxSide = MAX_SIDE): Promise<CleanImage> {
  if (input.length === 0 || input.length > MAX_UPLOAD_BYTES) throw new ImageRejectedError();
  if (sniffImage(input) === null) throw new ImageRejectedError();
  try {
    const decoder = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });
    const meta = await decoder.metadata();
    if (!meta.width || !meta.height || !['jpeg', 'png', 'webp'].includes(meta.format)) {
      throw new ImageRejectedError();
    }
    const pipeline = decoder
      .rotate()
      .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true });
    const alpha = meta.hasAlpha;
    const { data, info } = await (
      alpha ? pipeline.png({ compressionLevel: 9 }) : pipeline.jpeg({ quality: 85 })
    ).toBuffer({ resolveWithObject: true });
    return {
      bytes: data,
      mime: alpha ? 'image/png' : 'image/jpeg',
      width: info.width,
      height: info.height,
    };
  } catch (err) {
    if (err instanceof ImageRejectedError) throw err;
    throw new ImageRejectedError();
  }
}

interface AttachmentRow {
  id: string;
  kind: AttachmentRef['kind'];
  mime: Mime;
  width: number;
  height: number;
}

/** Safe display name: no paths, no control characters, at most 200 characters. */
export function cleanFileName(name: string | undefined): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return Array.from(cleaned).slice(0, 200).join('') || 'document';
}

export interface AttachmentStoreOptions {
  db: DB;
  /** Data directory; blobs live in <dataDir>/blobs. ':memory:' keeps them in memory (tests). */
  dataDir: string;
  now?: () => number;
}

export function createAttachmentStore(options: AttachmentStoreOptions) {
  const { db } = options;
  const now = options.now ?? Date.now;
  const memory = new Map<string, Buffer>();
  const blobDir = options.dataDir === ':memory:' ? null : join(options.dataDir, 'blobs');
  if (blobDir) {
    if (!existsSync(blobDir)) mkdirSync(blobDir, { recursive: true, mode: 0o700 });
    chmodSync(blobDir, 0o700);
  }

  function pathOf(id: string): string {
    if (!ID.test(id) || !blobDir) throw new Error('bad blob id');
    return join(blobDir, `${id}.bin`);
  }

  async function writeBlob(id: string, envelope: Buffer): Promise<void> {
    if (!blobDir) {
      memory.set(id, envelope);
      return;
    }
    await writeFile(pathOf(id), envelope, { mode: 0o600, flag: 'wx' });
  }

  async function readBlob(id: string): Promise<Buffer> {
    if (!blobDir) {
      const b = memory.get(id);
      if (!b) throw new Error('missing blob');
      return b;
    }
    return readFile(pathOf(id));
  }

  async function store(
    user: UserKey,
    image: CleanImage,
    kind: 'upload' | 'generated' | 'web',
    messageId: string | null,
    source: WebSource | null = null,
  ): Promise<AttachmentRef> {
    const id = randomUUID();
    await writeBlob(id, encrypt(user.dek, image.bytes, aadBlob(user.userId, id)));
    try {
      db.prepare(
        `INSERT INTO attachments (id, user_id, message_id, kind, mime, width, height, bytes, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        user.userId,
        messageId,
        kind,
        image.mime,
        image.width,
        image.height,
        image.bytes.length,
        source
          ? encryptString(
              user.dek,
              JSON.stringify(source),
              aadColumn(user.userId, 'attachments', id, 'source'),
            )
          : null,
        now(),
      );
    } catch (err) {
      await deleteBlobs([id]);
      throw err;
    }
    return {
      id,
      kind,
      mime: image.mime,
      width: image.width,
      height: image.height,
      name: null,
      pages: null,
      scanPages: 0,
      source,
    };
  }

  /** Blob id of a document's extracted text. */
  const textBlob = (id: string) => `${id}-text`;
  /** Blob id of a scanned PDF page image (n from 1). */
  const scanBlob = (id: string, n: number) => `${id}-p${String(n)}`;

  async function deleteBlobs(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      const scans = Array.from({ length: MAX_SCAN_PAGES }, (_, i) => scanBlob(id, i + 1));
      for (const blob of [id, textBlob(id), ...scans]) {
        if (!blobDir) memory.delete(blob);
        else await rm(pathOf(blob), { force: true });
      }
    }
  }

  return {
    /** Validates, re-encodes, encrypts and stores a photo upload (not yet linked to a message). */
    async saveUpload(user: UserKey, input: Buffer): Promise<AttachmentRef> {
      return store(user, await cleanImage(input), 'upload', null);
    },

    /**
     * Validates a document by content, extracts its text in an isolated worker, and stores
     * the original, the text and the file name encrypted (not yet linked to a message).
     */
    async saveDocument(
      user: UserKey,
      input: Buffer,
      fileName: string | undefined,
    ): Promise<AttachmentRef> {
      if (input.length === 0 || input.length > MAX_DOCUMENT_BYTES)
        throw new DocumentRejectedError();
      const kind = sniffDocument(input);
      if (!kind) throw new DocumentRejectedError();
      const { text, pages, scans } = await extractText(kind, input);
      // The worker parsed untrusted input: check its page images before storing them.
      for (const scan of scans) {
        const meta = await sharp(scan).metadata();
        if (meta.format !== 'jpeg' || !meta.width || !meta.height)
          throw new DocumentRejectedError();
        if (Math.max(meta.width, meta.height) > 1600) throw new DocumentRejectedError();
      }
      const id = randomUUID();
      const name = cleanFileName(fileName);
      const mime = DOCUMENT_MIME[kind] as Mime;
      await writeBlob(id, encrypt(user.dek, input, aadBlob(user.userId, id)));
      await writeBlob(
        textBlob(id),
        encrypt(user.dek, Buffer.from(text, 'utf8'), aadBlob(user.userId, textBlob(id))),
      );
      for (const [i, scan] of scans.entries()) {
        const blob = scanBlob(id, i + 1);
        await writeBlob(blob, encrypt(user.dek, scan, aadBlob(user.userId, blob)));
      }
      try {
        db.prepare(
          `INSERT INTO attachments (id, user_id, message_id, kind, mime, width, height, bytes, name, pages, text_chars, scan_pages, created_at)
           VALUES (?, ?, NULL, 'document', ?, 0, 0, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          user.userId,
          mime,
          input.length,
          encryptString(user.dek, name, aadColumn(user.userId, 'attachments', id, 'name')),
          pages,
          text.length,
          scans.length,
          now(),
        );
      } catch (err) {
        await deleteBlobs([id]);
        throw err;
      }
      return {
        id,
        kind: 'document',
        mime,
        width: 0,
        height: 0,
        name,
        pages,
        scanPages: scans.length,
        source: null,
      };
    },

    /** The scanned page images (JPEG) of the user's own document; empty if none or not theirs. */
    async readScans(user: UserKey, id: string): Promise<Buffer[]> {
      if (!ID.test(id)) return [];
      const row = db
        .prepare<[string, string], { scan_pages: number }>(
          "SELECT scan_pages FROM attachments WHERE id = ? AND user_id = ? AND kind = 'document'",
        )
        .get(id, user.userId);
      if (!row) return [];
      const pages: Buffer[] = [];
      for (let n = 1; n <= Math.min(row.scan_pages, MAX_SCAN_PAGES); n++) {
        const blob = scanBlob(id, n);
        pages.push(decrypt(user.dek, await readBlob(blob), aadBlob(user.userId, blob)));
      }
      return pages;
    },

    /**
     * True if any of the user's unsent attachments needs a model that can see: photos and
     * scanned documents. Unknown ids count as not needing it (sending rejects them anyway).
     */
    needsVision(user: UserKey, ids: readonly string[]): boolean {
      const row = db
        .prepare<string[], { n: number }>(
          `SELECT COUNT(*) AS n FROM attachments
           WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',') || "''"})
             AND (kind != 'document' OR scan_pages > 0)`,
        )
        .get(user.userId, ...ids);
      return (row?.n ?? 0) > 0;
    },

    /** The extracted text of the user's own document, or null. */
    async readText(user: UserKey, id: string): Promise<string | null> {
      if (!ID.test(id)) return null;
      const row = db
        .prepare<[string, string], { id: string }>(
          "SELECT id FROM attachments WHERE id = ? AND user_id = ? AND kind = 'document'",
        )
        .get(id, user.userId);
      if (!row) return null;
      const envelope = await readBlob(textBlob(id));
      return decrypt(user.dek, envelope, aadBlob(user.userId, textBlob(id))).toString('utf8');
    },

    /** Stores a generated PNG for an existing message (the server's own output). */
    async saveGenerated(user: UserKey, png: Buffer, messageId: string): Promise<AttachmentRef> {
      const meta = await sharp(png).metadata();
      if (meta.format !== 'png' || !meta.width || !meta.height) throw new ImageRejectedError();
      return store(
        user,
        { bytes: png, mime: 'image/png', width: meta.width, height: meta.height },
        'generated',
        messageId,
      );
    },

    /**
     * Stores a photo the server fetched from the web for a reply (image search). Untrusted
     * bytes: validated and re-encoded like an upload (no metadata, no trailing payloads).
     * Unlinked until the reply is saved (addMessage links it; orphans are cleaned up).
     */
    async saveWebPhoto(user: UserKey, input: Buffer, source: WebSource): Promise<AttachmentRef> {
      return store(user, await cleanImage(input, WEB_PHOTO_SIDE), 'web', null, source);
    },

    /** Decrypted bytes of the user's own attachment, or null (missing or someone else's). */
    async read(
      user: UserKey,
      id: string,
    ): Promise<{ bytes: Buffer; mime: Mime; name: string | null } | null> {
      if (!ID.test(id)) return null;
      const row = db
        .prepare<[string, string], AttachmentRow & { name: Buffer | null }>(
          'SELECT id, kind, mime, width, height, name FROM attachments WHERE id = ? AND user_id = ?',
        )
        .get(id, user.userId);
      if (!row) return null;
      const envelope = await readBlob(id);
      return {
        bytes: decrypt(user.dek, envelope, aadBlob(user.userId, id)),
        mime: row.mime,
        name: row.name
          ? decrypt(user.dek, row.name, aadColumn(user.userId, 'attachments', id, 'name')).toString(
              'utf8',
            )
          : null,
      };
    },

    deleteBlobs,

    /** Removes uploads never attached to a message, older than `maxAgeMs`. Returns how many. */
    async cleanupOrphans(maxAgeMs: number): Promise<number> {
      const ids = db
        .prepare<[number], { id: string }>(
          'SELECT id FROM attachments WHERE message_id IS NULL AND created_at < ?',
        )
        .all(now() - maxAgeMs)
        .map((r) => r.id);
      if (ids.length === 0) return 0;
      db.prepare(`DELETE FROM attachments WHERE id IN (${ids.map(() => '?').join(',')})`).run(
        ...ids,
      );
      await deleteBlobs(ids);
      return ids.length;
    },
  };
}

export type AttachmentStore = ReturnType<typeof createAttachmentStore>;
