/**
 * Opaque push refs (RELAY.md §7.2): the chat id a notification opens, encrypted with the hub's
 * push key, so Apple, Google and the relay see only noise. Owned by Claude.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { DB } from '../db/database.ts';

const AAD = Buffer.from('kchat-pushref-v1', 'utf8');
const Setting = z.object({ key: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });

export function createPushRefs(db: DB, now: () => number = Date.now) {
  let cached: Buffer | null = null;
  function key(): Buffer {
    if (cached) return cached;
    const row = db
      .prepare<[], { value: string }>("SELECT value FROM settings WHERE key = 'pushKey'")
      .get();
    const parsed = row ? Setting.safeParse(JSON.parse(row.value)) : null;
    if (parsed?.success) {
      cached = Buffer.from(parsed.data.key, 'base64url');
      return cached;
    }
    const k = randomBytes(32);
    db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('pushKey', ?, ?)").run(
      JSON.stringify({ key: k.toString('base64url') }),
      now(),
    );
    cached = k;
    return k;
  }
  return {
    encryptRef(chatId: string): string {
      const iv = randomBytes(12);
      const c = createCipheriv('aes-256-gcm', key(), iv);
      c.setAAD(AAD);
      const body = Buffer.concat([c.update(chatId, 'utf8'), c.final()]);
      return Buffer.concat([iv, body, c.getAuthTag()]).toString('base64url');
    },
    /** The chat id in a ref, or null when it isn't one of ours. */
    decryptRef(ref: string): string | null {
      if (!/^[A-Za-z0-9_-]{38,200}$/.test(ref)) return null;
      const raw = Buffer.from(ref, 'base64url');
      if (raw.length < 28) return null;
      try {
        const d = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
        d.setAAD(AAD);
        d.setAuthTag(raw.subarray(raw.length - 16));
        return Buffer.concat([d.update(raw.subarray(12, raw.length - 16)), d.final()]).toString(
          'utf8',
        );
      } catch {
        return null;
      }
    },
  };
}
export type PushRefs = ReturnType<typeof createPushRefs>;
