/**
 * Remote access settings (ARCHITECTURE.md §5): `settings.remote` =
 * { connect, hubId, registeredAt, relayDomain }. No secrets (keys are files, SECURITY.md §6.2).
 */
import { z } from 'zod';
import type { DB } from '../db/database.ts';

export const RemoteSettings = z.object({
  connect: z.boolean().default(false),
  hubId: z.string().nullable().default(null),
  registeredAt: z.number().int().nullable().default(null),
  relayDomain: z.string().nullable().default(null),
});
export type RemoteSettings = z.infer<typeof RemoteSettings>;

const KEY = 'remote';

export function createRemoteSettings(db: DB, now: () => number = Date.now) {
  return {
    get(): RemoteSettings {
      const row = db
        .prepare<[string], { value: string }>('SELECT value FROM settings WHERE key = ?')
        .get(KEY);
      if (!row) return RemoteSettings.parse({});
      const parsed = RemoteSettings.safeParse(JSON.parse(row.value));
      return parsed.success ? parsed.data : RemoteSettings.parse({});
    },
    set(value: RemoteSettings): void {
      db.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ).run(KEY, JSON.stringify(RemoteSettings.parse(value)), now());
    },
  };
}
export type RemoteSettingsStore = ReturnType<typeof createRemoteSettings>;
