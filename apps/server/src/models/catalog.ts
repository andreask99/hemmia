/**
 * The model catalogue the admin downloads from (P11.4): the signed catalogue from the relay,
 * fetched once a day, merged with the bundled config/catalog.json (whose hand-written texts and
 * recommendations win for the same model). Only verified catalogues are stored; an older one
 * than what we have is ignored. The request carries nothing about this hub. Owned by Claude.
 */
import {
  type CatalogModel,
  type CatalogPayload,
  CatalogModel as CatalogModelSchema,
  verifyCatalog,
} from '@hemmia/relay-protocol';
import { z } from 'zod';
import type { CatalogEntry } from '../config/schema.ts';
import type { DB } from '../db/database.ts';

const KEY = 'model-catalog';
const MAX_BYTES = 256 * 1024 * 2;

const Stored = z.object({
  signedAt: z.number(),
  entries: z.array(CatalogModelSchema),
});

export function createCatalogStore(db: DB, now: () => number = Date.now) {
  return {
    get(): CatalogPayload | null {
      const row = db
        .prepare<[string], { value: string }>('SELECT value FROM settings WHERE key = ?')
        .get(KEY);
      if (!row) return null;
      try {
        const parsed = Stored.safeParse(JSON.parse(row.value));
        return parsed.success ? { v: 1, ...parsed.data } : null;
      } catch {
        return null;
      }
    },
    set(c: CatalogPayload): void {
      db.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ).run(KEY, JSON.stringify({ signedAt: c.signedAt, entries: c.entries }), now());
    },
  };
}
export type CatalogStore = ReturnType<typeof createCatalogStore>;

/** A remote catalogue entry in the bundled catalogue's shape. */
export function fromRemote(m: CatalogModel): CatalogEntry {
  return {
    ollamaModel: m.ollamaModel,
    label: { en: m.name, de: m.name, fr: m.name, it: m.name },
    description: { en: m.description, de: '', fr: '', it: '' },
    downloadGiB: Math.max(0.1, Math.round((m.downloadBytes / 1024 ** 3) * 10) / 10),
    memoryGiB: m.memoryGiB,
    minTotalMemoryGiB: m.minTotalMemoryGiB,
    vision: m.vision,
    tools: m.tools,
    think: m.think,
    contextTokens: Math.min(262_144, Math.max(2048, m.contextTokens)),
    remote: {
      pulls: m.pulls,
      releasedAt: m.releasedAt,
      addedAt: m.addedAt,
      digest: m.digest,
      tested: m.tested,
      family: m.family,
      version: m.version,
      supersedes: m.supersedes,
    },
  };
}

/**
 * Bundled entries first (their texts and recommendations), each completed with the remote
 * facts for the same model; then every remote entry the bundle doesn't have.
 */
export function mergeCatalog(
  bundled: readonly CatalogEntry[],
  remote: readonly CatalogModel[] | null,
): CatalogEntry[] {
  const byModel = new Map((remote ?? []).map((m) => [m.ollamaModel, fromRemote(m)]));
  const out: CatalogEntry[] = bundled.map((b) => {
    const r = byModel.get(b.ollamaModel);
    byModel.delete(b.ollamaModel);
    return r?.remote ? { ...b, remote: r.remote } : b;
  });
  return [...out, ...byModel.values()];
}

/** Reads the HTTP body as text, or null once it passes `max` bytes. */
async function readCapped(res: Response, max: number): Promise<string | null> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    const value: unknown = chunk.value;
    if (!(value instanceof Uint8Array)) return null;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function createCatalogSync(o: {
  /** The relay's domain; the catalogue is at https://api.<domain>/v1/catalog. */
  relayDomain: string | null;
  store: CatalogStore;
  /** The admin's switch "Look for new models". */
  enabled: () => boolean;
  /** Called after a newer catalogue was stored. */
  onChange?: (c: CatalogPayload) => void | Promise<void>;
  fetch?: typeof fetch;
  intervalMs?: number;
  /** Tests: another signing key. */
  publicKey?: string;
}) {
  const doFetch = o.fetch ?? fetch;
  let timer: NodeJS.Timeout | null = null;
  let first: NodeJS.Timeout | null = null;

  /** Fetches once; true when a newer catalogue was stored. */
  async function sync(): Promise<boolean> {
    if (!o.relayDomain || !o.enabled()) return false;
    try {
      const res = await doFetch(`https://api.${o.relayDomain}/v1/catalog`, {
        headers: { 'user-agent': 'hemmia-hub' },
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        return false;
      }
      const text = await readCapped(res, MAX_BYTES);
      if (text === null) return false;
      const catalog = verifyCatalog(JSON.parse(text), o.publicKey);
      // Unsigned, tampered or not newer than what we have: keep ours.
      if (!catalog) return false;
      if (catalog.signedAt <= (o.store.get()?.signedAt ?? 0)) return false;
      o.store.set(catalog);
      await o.onChange?.(catalog);
      return true;
    } catch {
      // Offline or the relay down: keep what we have.
      return false;
    }
  }

  return {
    sync,
    start(): void {
      if (timer) return;
      first = setTimeout(() => void sync(), 60_000);
      first.unref();
      timer = setInterval(() => void sync(), o.intervalMs ?? 24 * 60 * 60_000);
      timer.unref();
    },
    stop(): void {
      if (timer) clearInterval(timer);
      if (first) clearTimeout(first);
      timer = null;
      first = null;
    },
  };
}
