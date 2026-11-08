/**
 * Ollama managed by Hemmia (installer plan, owner 2026-11-08): on a Mac without Ollama, an admin
 * can let Hemmia install it. Hemmia downloads Ollama's own command-line build at a pinned
 * version, checks its SHA-256 and Ollama's Developer ID signature, unpacks it into the data
 * folder and runs `ollama serve` on the loopback address as a child process, restarting it if it
 * stops. An Ollama that already answers (the Ollama app, Homebrew, Docker) is used as it is and
 * nothing is installed. Owned by Claude (downloads and runs a program).
 */
import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { access, constants, mkdir, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import type { OllamaSetupStatus } from '@hemmia/shared';
import type { DB } from '../db/database.ts';

/** Updated with Hemmia releases: version, archive checksum (from Ollama's release page). */
export const OLLAMA_VERSION = '0.40.15';
export const OLLAMA_SHA256 = '607c79d5d6315ef9d896db83adde736a4c0057196329843544e79b95afb260a8';
/** Ollama's Apple Developer ID team (Infra Technologies, Inc). */
export const OLLAMA_TEAM_ID = '3MU9H2V9Y9';
const ARCHIVE_URL = `https://github.com/ollama/ollama/releases/download/v${OLLAMA_VERSION}/ollama-darwin.tgz`;
/** The archive is about 186 MB; anything far larger is not what we pinned. */
const MAX_ARCHIVE_BYTES = 400 * 1024 * 1024;
const SETTING = 'ollama.managed';
const RESTART_MAX_MS = 60_000;
const STABLE_MS = 5 * 60_000;

export interface OllamaLog {
  info: (obj: object, msg: string) => void;
  warn: (obj: object, msg: string) => void;
}

/** The side effects, injectable for tests. */
export interface OllamaDeps {
  /** Downloads `url` to `dest`, reporting bytes; returns the SHA-256 (hex) of what was written. */
  download: (
    url: string,
    dest: string,
    onBytes: (received: number, total: number | null) => void,
  ) => Promise<string>;
  /** Unpacks a .tgz into an empty directory. */
  extract: (archive: string, dir: string) => Promise<void>;
  /** True when the binary carries Ollama's valid Developer ID signature. */
  verifySignature: (binary: string) => Promise<boolean>;
  /** Starts `ollama serve`. */
  start: (binary: string, env: NodeJS.ProcessEnv) => ChildProcess;
  /** Whether an Ollama answers at the configured address. */
  reachable: () => Promise<boolean>;
}

export interface OllamaManagerOptions {
  db: DB;
  dataDir: string;
  ollamaUrl: string;
  platform: NodeJS.Platform;
  container: boolean;
  log: OllamaLog;
  deps?: Partial<OllamaDeps>;
}

/** host:port for OLLAMA_HOST, only for a loopback address (Hemmia never serves Ollama wider). */
export function loopbackHost(ollamaUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(ollamaUrl);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:') return null;
  if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') return null;
  return `127.0.0.1:${u.port || '11434'}`;
}

async function defaultDownload(
  url: string,
  dest: string,
  onBytes: (received: number, total: number | null) => void,
): Promise<string> {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(30 * 60_000) });
  if (!res.ok || !res.body) throw new Error(`download failed: ${String(res.status)}`);
  const header = Number(res.headers.get('content-length'));
  const total = Number.isFinite(header) && header > 0 ? header : null;
  if (total !== null && total > MAX_ARCHIVE_BYTES) throw new Error('download too large');
  const hash = createHash('sha256');
  let received = 0;
  const counted = Readable.fromWeb(res.body).map((chunk: Buffer) => {
    received += chunk.length;
    if (received > MAX_ARCHIVE_BYTES) throw new Error('download too large');
    hash.update(chunk);
    onBytes(received, total);
    return chunk;
  });
  await pipeline(counted, createWriteStream(dest, { mode: 0o600 }));
  return hash.digest('hex');
}

async function run(file: string, args: string[]): Promise<void> {
  await promisify(execFile)(file, args, { timeout: 5 * 60_000 });
}

const defaultDeps = (ollamaUrl: string): OllamaDeps => ({
  download: defaultDownload,
  // The archive is checked against the pinned SHA-256 before it is unpacked; its links all
  // point inside it (checked when the version was pinned).
  extract: (archive, dir) => run('/usr/bin/tar', ['-xzf', archive, '-C', dir]),
  verifySignature: async (binary) => {
    try {
      await run('/usr/bin/codesign', [
        '--verify',
        '--strict',
        `-R=anchor apple generic and certificate leaf[subject.OU] = "${OLLAMA_TEAM_ID}"`,
        binary,
      ]);
      return true;
    } catch {
      return false;
    }
  },
  start: (binary, env) => spawn(binary, ['serve'], { env, stdio: 'ignore' }),
  reachable: async () => {
    try {
      const res = await fetch(new URL('/api/version', ollamaUrl), {
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  },
});

export function createOllamaManager(o: OllamaManagerOptions) {
  const deps: OllamaDeps = { ...defaultDeps(o.ollamaUrl), ...o.deps };
  const host = loopbackHost(o.ollamaUrl);
  const runtimeDir = join(o.dataDir, 'runtime');
  const installDir = join(runtimeDir, `ollama-${OLLAMA_VERSION}`);
  const binary = join(installDir, 'ollama');

  let installing: { received: number; total: number | null } | null = null;
  let failed: 'download' | 'checksum' | 'signature' | null = null;
  let child: ChildProcess | null = null;
  let closing = false;
  let restartMs = 1000;
  let restartTimer: ReturnType<typeof setTimeout> | undefined;

  const managedVersion = (): string | null =>
    o.db
      .prepare<[string], { value: string }>('SELECT value FROM settings WHERE key = ?')
      .get(SETTING)?.value ?? null;

  /** Hemmia can install Ollama only on a Mac (not in Docker) with a loopback Ollama address. */
  const supported = o.platform === 'darwin' && !o.container && host !== null;

  async function installed(): Promise<boolean> {
    try {
      await access(binary, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  function launch(): void {
    if (closing || child || host === null) return;
    const started = Date.now();
    const env: NodeJS.ProcessEnv = {
      HOME: homedir(),
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
      OLLAMA_HOST: host,
    };
    const proc = deps.start(binary, env);
    child = proc;
    o.log.info({ version: OLLAMA_VERSION }, 'ollama: started');
    proc.on('error', (err) => {
      o.log.warn({ err: err.message }, 'ollama: could not start');
    });
    proc.on('exit', (code, signal) => {
      child = null;
      if (closing) return;
      // Back off while it keeps failing; a run of several minutes counts as healthy again.
      restartMs = Date.now() - started > STABLE_MS ? 1000 : Math.min(restartMs * 2, RESTART_MAX_MS);
      o.log.warn({ code, signal, restartInMs: restartMs }, 'ollama: stopped, restarting');
      restartTimer = setTimeout(launch, restartMs);
      restartTimer.unref();
    });
  }

  async function install(): Promise<void> {
    const tmp = join(runtimeDir, `.install-${randomUUID()}`);
    try {
      await mkdir(tmp, { recursive: true, mode: 0o700 });
      const archive = join(tmp, 'ollama-darwin.tgz');
      const sha = await deps.download(ARCHIVE_URL, archive, (received, total) => {
        installing = { received, total };
      });
      if (sha !== OLLAMA_SHA256) throw new InstallError('checksum');
      const unpacked = join(tmp, 'ollama');
      await mkdir(unpacked, { mode: 0o700 });
      await deps.extract(archive, unpacked);
      if (!(await deps.verifySignature(join(unpacked, 'ollama')))) {
        throw new InstallError('signature');
      }
      await rm(installDir, { recursive: true, force: true });
      await rename(unpacked, installDir);
      o.db
        .prepare(
          `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        )
        .run(SETTING, OLLAMA_VERSION, Date.now());
      o.log.info({ version: OLLAMA_VERSION }, 'ollama: installed');
      launch();
    } finally {
      await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  return {
    /** On hub start: run the managed Ollama unless another one already answers. */
    async start(): Promise<void> {
      if (!supported || managedVersion() === null || !(await installed())) return;
      if (await deps.reachable()) return;
      launch();
    },

    async status(): Promise<OllamaSetupStatus> {
      if (installing) return { state: 'installing', version: OLLAMA_VERSION, ...installing };
      const managed = managedVersion() !== null && (await installed());
      if (await deps.reachable()) {
        return { state: managed && child ? 'managed' : 'external', version: null };
      }
      if (managed) return { state: 'starting', version: OLLAMA_VERSION };
      if (failed) return { state: 'failed', version: OLLAMA_VERSION, error: failed };
      return { state: supported ? 'missing' : 'unsupported', version: null };
    },

    /**
     * Starts the installation in the background (admin only, checked by the route). Returns
     * false when there is nothing to do or it can't run here.
     */
    async beginInstall(): Promise<boolean> {
      if (!supported || installing) return false;
      if (await deps.reachable()) return false;
      installing = { received: 0, total: null };
      failed = null;
      void install()
        .catch((err: unknown) => {
          failed = err instanceof InstallError ? err.code : 'download';
          o.log.warn(
            { reason: failed, err: err instanceof Error ? err.message : 'unknown' },
            'ollama: install failed',
          );
        })
        .finally(() => {
          installing = null;
        });
      return true;
    },

    close(): void {
      closing = true;
      clearTimeout(restartTimer);
      child?.kill('SIGTERM');
    },
  };
}
export type OllamaManager = ReturnType<typeof createOllamaManager>;

class InstallError extends Error {
  override name = 'InstallError';
  readonly code: 'checksum' | 'signature';
  constructor(code: 'checksum' | 'signature') {
    super(code);
    this.code = code;
  }
}
