/**
 * What this computer can do (docs/public/ARCHITECTURE.md §3.1, P1.4): Ollama, the picture
 * engine and web search are optional on a public hub. Detected at start and every 10 minutes;
 * the UI and the tools hide what isn't there.
 */
import { constants } from 'node:fs';
import { access, statfs } from 'node:fs/promises';
import os from 'node:os';
import { delimiter, join } from 'node:path';
import type { SystemCapabilities } from '@hemmia/shared';

export interface CapabilityProbes {
  platform: NodeJS.Platform;
  arch: string;
  totalMemBytes: () => number;
  /** Free bytes on the data dir's volume, or null when unknown. */
  diskFreeBytes: () => Promise<number | null>;
  /** Ollama's version, or null when it doesn't answer. */
  ollamaVersion: () => Promise<string | null>;
  /** True when SearXNG answers its health check. */
  searxngHealthy: () => Promise<boolean>;
  /** True when an executable `uv` is on PATH. */
  hasUv: () => Promise<boolean>;
  /**
   * True when the image worker's project (services/imagegen) is present and writable, so
   * `uv run` can create its environment there (a developer setup or the family hub; not the
   * installed package, whose program folder belongs to the system).
   */
  hasImageProject: () => Promise<boolean>;
  /** True when Hemmia set up pictures itself (system/pictures.ts). */
  managedImages?: () => boolean;
}

const GIB = 1024 ** 3;
const round1 = (n: number) => Math.round(n * 10) / 10;

export async function detectCapabilities(p: CapabilityProbes): Promise<SystemCapabilities> {
  const appleSilicon = p.platform === 'darwin' && p.arch === 'arm64';
  const [disk, version, searx, uv, project] = await Promise.all([
    p.diskFreeBytes().catch(() => null),
    p.ollamaVersion().catch(() => null),
    p.searxngHealthy().catch(() => false),
    appleSilicon ? p.hasUv().catch(() => false) : Promise.resolve(false),
    appleSilicon ? p.hasImageProject().catch(() => false) : Promise.resolve(false),
  ]);
  return {
    platform: p.platform,
    arch: p.arch,
    memoryGiB: round1(p.totalMemBytes() / GIB),
    diskFreeGiB: disk === null ? null : round1(disk / GIB),
    ollama: { reachable: version !== null, version },
    images: appleSilicon && ((uv && project) || (p.managedImages?.() ?? false)),
    webSearch: searx,
  };
}

/** Assumed until the first detection finishes: what the family Mac has. */
export function optimisticCapabilities(
  platform: NodeJS.Platform,
  arch: string,
): SystemCapabilities {
  return {
    platform,
    arch,
    memoryGiB: round1(os.totalmem() / GIB),
    diskFreeGiB: null,
    ollama: { reachable: true, version: null },
    images: platform === 'darwin' && arch === 'arm64',
    webSearch: true,
  };
}

async function getOk(
  fetchFn: typeof fetch,
  url: string,
  timeoutMs: number,
): Promise<Response | null> {
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function defaultProbes(o: {
  ollamaUrl: string;
  searxngUrl: string;
  dataDir: string;
  imageProjectDir: string;
  managedImages?: () => boolean;
  fetch?: typeof fetch;
  pathEnv?: string;
}): CapabilityProbes {
  const fetchFn = o.fetch ?? fetch;
  return {
    ...(o.managedImages ? { managedImages: o.managedImages } : {}),
    platform: process.platform,
    arch: process.arch,
    totalMemBytes: () => os.totalmem(),
    diskFreeBytes: async () => {
      const s = await statfs(o.dataDir);
      return s.bavail * s.bsize;
    },
    ollamaVersion: async () => {
      const res = await getOk(fetchFn, new URL('/api/version', o.ollamaUrl).href, 2000);
      if (!res) return null;
      const body: unknown = await res.json().catch(() => null);
      const v =
        typeof body === 'object' && body !== null && 'version' in body ? body.version : null;
      return typeof v === 'string' && v.length <= 40 ? v : '';
    },
    searxngHealthy: async () =>
      (await getOk(fetchFn, new URL('/healthz', o.searxngUrl).href, 2000)) !== null,
    hasUv: async () => {
      const dirs = (o.pathEnv ?? process.env['PATH'] ?? '').split(delimiter).filter(Boolean);
      for (const d of dirs) if (await isExecutable(join(d, 'uv'))) return true;
      return false;
    },
    hasImageProject: async () => {
      try {
        await access(join(o.imageProjectDir, 'pyproject.toml'), constants.R_OK);
        await access(o.imageProjectDir, constants.W_OK);
        return true;
      } catch {
        return false;
      }
    },
  };
}

export interface Capabilities {
  current(): SystemCapabilities;
  /** Detects again now; resolves with the new value. */
  refresh(): Promise<SystemCapabilities>;
  /** Detects now and then every intervalMs, until stop(). */
  start(): void;
  stop(): void;
}

export function createCapabilities(
  probes: CapabilityProbes,
  options: { intervalMs?: number; initial?: SystemCapabilities } = {},
): Capabilities {
  let value = options.initial ?? optimisticCapabilities(probes.platform, probes.arch);
  let timer: NodeJS.Timeout | null = null;
  const refresh = async () => {
    value = await detectCapabilities(probes);
    return value;
  };
  return {
    current: () => value,
    refresh,
    start() {
      if (timer) return;
      void refresh();
      timer = setInterval(() => void refresh(), options.intervalMs ?? 10 * 60_000);
      timer.unref();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}

/** Fixed capabilities (tests, or when detection is not wanted). */
export function staticCapabilities(value: SystemCapabilities): Capabilities {
  return {
    current: () => value,
    refresh: () => Promise.resolve(value),
    start: () => undefined,
    stop: () => undefined,
  };
}
