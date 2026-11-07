/**
 * The admin "System" view: memory, models in memory, what runs, services, disk and
 * 24-hour counts. Counts and sizes only; no content, titles or user names. The commands
 * run here are fixed (no user input).
 */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir, loadavg, cpus, freemem, totalmem } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { SystemStatus } from '@hemmia/shared';
import type { DB } from '../db/database.ts';

const run = promisify(execFile);
const GiB = 1024 ** 3;
const DISK_CACHE_MS = 10 * 60_000;

export interface SystemDeps {
  db: DB;
  ollamaUrl: string;
  searxngUrl: string;
  dataDir: string;
  /** Configured sizes win over Ollama's reports (it under-reports gemma4). */
  configuredGiB: (model: string) => number;
  owns: (engine: string, model: string) => boolean;
  snapshot: () => { running: SystemStatus['activity']['running']; queued: number };
  paused: () => boolean;
  /** Models the image worker holds now. */
  imageModels: () => Promise<{ model: string }[]>;
  now?: () => number;
  /** Tests: replace commands and HTTP. */
  exec?: (cmd: string, args: string[]) => Promise<string>;
  fetch?: typeof fetch;
}

const Maintenance = z.object({
  at: z.number(),
  ok: z.boolean(),
  outcome: z.string(),
  steps: z.array(z.object({ component: z.string(), from: z.string(), to: z.string() })),
  held: z.string().nullable().default(null),
});

const PsResponse = z.object({
  models: z.array(
    z.object({ name: z.string(), size: z.number(), expires_at: z.string().optional() }),
  ),
});

/** "System-wide memory free percentage: 26%" -> 26. */
export function parseFreePercent(out: string): number | null {
  const m = /free percentage:\s*(\d+)%/.exec(out);
  return m?.[1] ? Number(m[1]) : null;
}

/** "total = 3072.00M  used = 1476.69M  free = …" -> bytes. */
export function parseSwap(out: string): { total: number; used: number } {
  const num = (key: string) => {
    const m = new RegExp(`${key} = ([\\d.]+)([KMG])`).exec(out);
    if (!m?.[1] || !m[2]) return 0;
    return Number(m[1]) * { K: 1024, M: 1024 ** 2, G: GiB }[m[2] as 'K' | 'M' | 'G'];
  };
  return { total: num('total'), used: num('used') };
}

export function createSystemStatus(deps: SystemDeps) {
  const now = deps.now ?? Date.now;
  const exec =
    deps.exec ??
    (async (cmd: string, args: string[]) => (await run(cmd, args, { timeout: 20_000 })).stdout);
  const doFetch = deps.fetch ?? fetch;
  const home = homedir();
  const diskPaths = {
    data: deps.dataDir,
    imageModels: join(home, '.local', 'share', 'kchat', 'models'),
    chatModels: join(home, '.ollama', 'models'),
  };
  let disk: SystemStatus['disk'] = { data: null, imageModels: null, chatModels: null };
  let diskAt = 0;
  let measuring = false;

  /** Measures disk use in the background; the view shows null until the first result. */
  function refreshDisk(): void {
    if (measuring || now() - diskAt < DISK_CACHE_MS) return;
    measuring = true;
    void Promise.all(
      Object.entries(diskPaths).map(async ([key, path]) => {
        try {
          const kb = Number((await exec('du', ['-sk', path])).split(/\s/)[0]);
          return [key, Number.isFinite(kb) ? kb * 1024 : null] as const;
        } catch {
          return [key, null] as const;
        }
      }),
    ).then((entries) => {
      disk = Object.fromEntries(entries) as SystemStatus['disk'];
      diskAt = now();
      measuring = false;
    });
  }

  async function memory(): Promise<SystemStatus['mac']> {
    const total = totalmem();
    const cores = cpus().length;
    let used = total - freemem();
    let swap = { total: 0, used: 0 };
    try {
      const free = parseFreePercent(await exec('memory_pressure', ['-Q']));
      if (free !== null) used = total * (1 - free / 100);
    } catch {
      // not macOS: free memory as the OS reports it
    }
    try {
      swap = parseSwap(await exec('sysctl', ['-n', 'vm.swapusage']));
    } catch {
      // no swap information
    }
    return {
      totalBytes: total,
      usedBytes: Math.round(used),
      swapUsedBytes: Math.round(swap.used),
      swapTotalBytes: Math.round(swap.total),
      cpuLoad: Math.round(((loadavg()[0] ?? 0) / Math.max(1, cores)) * 100) / 100,
      cpus: cores,
    };
  }

  async function ollamaModels(): Promise<{ ok: boolean; models: SystemStatus['models'] }> {
    try {
      const res = await doFetch(`${deps.ollamaUrl}/api/ps`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return { ok: false, models: [] };
      const ps = PsResponse.parse(await res.json());
      return {
        ok: true,
        models: ps.models.map((m) => ({
          engine: 'ollama' as const,
          model: m.name,
          memoryBytes: Math.max(m.size, deps.configuredGiB(m.name) * GiB),
          kchat: deps.owns('ollama', m.name),
          unloadsAt: m.expires_at ? Date.parse(m.expires_at) || null : null,
        })),
      };
    } catch {
      return { ok: false, models: [] };
    }
  }

  async function searxngUp(): Promise<boolean> {
    try {
      const res = await doFetch(`${deps.searxngUrl}/healthz`, {
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Written by scripts/maintenance.ts next to the database. */
  async function lastMaintenance(): Promise<SystemStatus['maintenance']> {
    try {
      const text = await readFile(join(deps.dataDir, 'maintenance.json'), 'utf8');
      return Maintenance.parse(JSON.parse(text) as unknown);
    } catch {
      return null;
    }
  }

  function last24h(): SystemStatus['last24h'] {
    const since = now() - 24 * 3600_000;
    const count = (sql: string) => deps.db.prepare<[number], { n: number }>(sql).get(since)?.n ?? 0;
    return {
      replies: count(
        "SELECT COUNT(*) AS n FROM messages WHERE role = 'assistant' AND created_at > ?",
      ),
      pictures: count(
        "SELECT COUNT(*) AS n FROM attachments WHERE kind = 'generated' AND created_at > ?",
      ),
      searches: count(
        'SELECT COUNT(*) AS n FROM messages WHERE searches IS NOT NULL AND created_at > ?',
      ),
      activeUsers: count(
        "SELECT COUNT(DISTINCT user_id) AS n FROM messages WHERE role = 'user' AND created_at > ?",
      ),
    };
  }

  return {
    async get(): Promise<SystemStatus> {
      refreshDisk();
      const [mac, ollama, searxng, images] = await Promise.all([
        memory(),
        ollamaModels(),
        searxngUp(),
        deps.imageModels().catch(() => []),
      ]);
      const imageModels = images.map((m) => ({
        engine: 'imagegen' as const,
        model: m.model,
        memoryBytes: deps.configuredGiB(m.model) * GiB,
        kchat: true,
        unloadsAt: null,
      }));
      const snap = deps.snapshot();
      return {
        at: now(),
        keepAwake: false,
        update: null,
        mac,
        models: [...ollama.models, ...imageModels],
        activity: { running: snap.running, queued: snap.queued, paused: deps.paused() },
        services: { ollama: ollama.ok, searxng, imageWorker: images.length > 0 ? 'busy' : 'idle' },
        disk,
        maintenance: await lastMaintenance(),
        last24h: last24h(),
      };
    },
  };
}

export type SystemStatusSource = ReturnType<typeof createSystemStatus>;
