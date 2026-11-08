/**
 * Web search set up by Hemmia on a Mac (installer plan, owner 2026-11-08). When no SearXNG
 * answers, an admin can turn web search on. Hemmia then
 *   1. uses the pinned `uv` (uv.ts),
 *   2. downloads SearXNG's source at a pinned commit (the one the Docker image is built from),
 *      SHA-256 checked before it is unpacked,
 *   3. builds its Python environment from services/searxng/uv.lock (every package with its
 *      hash) in the data folder,
 *   4. writes its settings with a fresh secret (the hub's template, loopback only, no limiter)
 *      and runs `python -m searx.webapp` as a child of the hub, restarted if it stops.
 * A SearXNG that already answers (Docker, the family hub's LaunchAgent) is used as it is.
 * Owned by Claude (downloads and runs programs).
 */
import { type ChildProcess, execFile, spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { access, constants, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { SearchSetupStatus } from '@hemmia/shared';
import { downloadFile, type OllamaLog } from './ollama.ts';
import { ChecksumError, ensureUv, runQuiet } from './uv.ts';

export const SEARXNG_COMMIT = 'e652ca7d2920e92accb7daae623754746bc3e00d';
export const SEARXNG_SHA256 = 'c366dd935cdef51cfd7954d9fc96f3cadd35e425fb6cdc4a3f71d36d398bc55c';
const SEARXNG_URL = `https://github.com/searxng/searxng/archive/${SEARXNG_COMMIT}.tar.gz`;
const RESTART_MAX_MS = 60_000;
const STABLE_MS = 5 * 60_000;

type Failure = 'download' | 'checksum' | 'engine';

export interface SearchDeps {
  download: (
    url: string,
    dest: string,
    onBytes: (received: number, total: number | null) => void,
  ) => Promise<string>;
  extract: (archive: string, dir: string) => Promise<void>;
  run: (file: string, args: string[], env: NodeJS.ProcessEnv) => Promise<void>;
  start: (python: string, env: NodeJS.ProcessEnv, cwd: string) => ChildProcess;
  reachable: () => Promise<boolean>;
}

export interface SearchManagerOptions {
  dataDir: string;
  /** services/searxng: pyproject.toml, uv.lock, settings.yml (template). */
  projectDir: string;
  searxngUrl: string;
  platform: NodeJS.Platform;
  arch: string;
  container: boolean;
  log: OllamaLog;
  deps?: Partial<SearchDeps>;
}

/** The port of a loopback SearXNG address, or null (Hemmia only runs one on loopback). */
export function loopbackPort(url: string): number | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' || (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost')) {
    return null;
  }
  const port = Number(u.port || '80');
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
}

const defaultDeps = (searxngUrl: string): SearchDeps => ({
  download: (url, dest, onBytes) => downloadFile(url, dest, onBytes, 100 * 1024 ** 2),
  extract: async (archive, dir) => {
    await promisify(execFile)('/usr/bin/tar', ['-xzf', archive, '-C', dir], {
      timeout: 5 * 60_000,
    });
  },
  run: runQuiet,
  start: (python, env, cwd) => spawn(python, ['-m', 'searx.webapp'], { env, cwd, stdio: 'ignore' }),
  reachable: async () => {
    try {
      const res = await fetch(new URL('/healthz', searxngUrl), {
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  },
});

export function createSearchManager(o: SearchManagerOptions) {
  const deps: SearchDeps = { ...defaultDeps(o.searxngUrl), ...o.deps };
  const port = loopbackPort(o.searxngUrl);
  const runtime = join(o.dataDir, 'runtime');
  const dir = join(runtime, 'searxng');
  const src = join(dir, 'src');
  const venv = join(dir, 'venv');
  const python = join(venv, 'bin', 'python');
  const settings = join(dir, 'settings.yml');
  const marker = join(dir, 'ready.json');

  let installing: { phase: 'tool' | 'engine' } | null = null;
  let failed: Failure | null = null;
  let ready: { lock: string; commit: string } | null = null;
  let child: ChildProcess | null = null;
  let closing = false;
  let restartMs = 1000;
  let restartTimer: ReturnType<typeof setTimeout> | undefined;

  const supported = o.platform === 'darwin' && o.arch === 'arm64' && !o.container && port !== null;

  const lockHash = async () =>
    createHash('sha256')
      .update(await readFile(join(o.projectDir, 'uv.lock'), 'utf8'))
      .digest('hex');

  async function readMarker(): Promise<{ lock: string; commit: string } | null> {
    try {
      const v: unknown = JSON.parse(await readFile(marker, 'utf8'));
      if (typeof v === 'object' && v !== null && 'lock' in v && 'commit' in v) {
        const { lock, commit } = v;
        if (typeof lock === 'string' && typeof commit === 'string') return { lock, commit };
      }
    } catch {
      // not set up
    }
    return null;
  }

  function launch(): void {
    if (closing || child || port === null) return;
    const started = Date.now();
    const proc = deps.start(
      python,
      {
        HOME: homedir(),
        PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
        PYTHONPATH: src,
        SEARXNG_SETTINGS_PATH: settings,
      },
      src,
    );
    child = proc;
    o.log.info({}, 'search: started');
    proc.on('error', (err) => {
      o.log.warn({ err: err.message }, 'search: could not start');
    });
    proc.on('exit', (code, signal) => {
      child = null;
      if (closing) return;
      restartMs = Date.now() - started > STABLE_MS ? 1000 : Math.min(restartMs * 2, RESTART_MAX_MS);
      o.log.warn({ code, signal, restartInMs: restartMs }, 'search: stopped, restarting');
      restartTimer = setTimeout(launch, restartMs);
      restartTimer.unref();
    });
  }

  async function downloadSource(): Promise<void> {
    const tmp = join(dir, `.src-${randomUUID()}`);
    try {
      await mkdir(tmp, { recursive: true, mode: 0o700 });
      const archive = join(tmp, 'searxng.tar.gz');
      if ((await deps.download(SEARXNG_URL, archive, () => undefined)) !== SEARXNG_SHA256) {
        throw new SetupError('checksum');
      }
      await deps.extract(archive, tmp);
      await rm(src, { recursive: true, force: true });
      await rename(join(tmp, `searxng-${SEARXNG_COMMIT}`), src);
    } finally {
      await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async function syncEngine(uv: string): Promise<void> {
    const cache = join(dir, 'cache');
    try {
      await deps.run(uv, ['sync', '--frozen', '--no-dev', '--project', o.projectDir], {
        HOME: homedir(),
        PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
        UV_PROJECT_ENVIRONMENT: venv,
        UV_PYTHON_INSTALL_DIR: join(dir, 'python'),
        UV_CACHE_DIR: cache,
        UV_PYTHON_PREFERENCE: 'only-managed',
        UV_NO_CONFIG: '1',
      });
    } catch {
      throw new SetupError('engine');
    } finally {
      await rm(cache, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** The hub's template with a fresh secret and the configured port; kept across updates. */
  async function writeSettings(): Promise<void> {
    let secret = '';
    try {
      secret = /secret_key: '([0-9a-f]{64})'/.exec(await readFile(settings, 'utf8'))?.[1] ?? '';
    } catch {
      // first install
    }
    if (secret === '') secret = randomBytes(32).toString('hex');
    const text = (await readFile(join(o.projectDir, 'settings.yml'), 'utf8'))
      .replace('__SECRET__', secret)
      .replace(/^(\s*)port: \d+/m, `$1port: ${String(port)}`);
    await writeFile(settings, text, { mode: 0o600 });
  }

  async function install(): Promise<void> {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    installing = { phase: 'tool' };
    let uv: string;
    try {
      uv = await ensureUv(runtime, deps);
    } catch (err) {
      if (err instanceof ChecksumError) throw new SetupError('checksum');
      throw err;
    }
    installing = { phase: 'engine' };
    if (!ready || ready.commit !== SEARXNG_COMMIT) await downloadSource();
    await syncEngine(uv);
    await writeSettings();
    const value = { lock: await lockHash(), commit: SEARXNG_COMMIT };
    await writeFile(marker, JSON.stringify(value), { mode: 0o600 });
    ready = value;
    o.log.info({}, 'search: set up');
  }

  function runInstall(): void {
    failed = null;
    void install()
      .then(() => {
        if (child)
          child.kill('SIGTERM'); // restarts with the new environment
        else launch();
      })
      .catch((err: unknown) => {
        failed = err instanceof SetupError ? err.code : 'download';
        o.log.warn({ reason: failed }, 'search: setup failed');
      })
      .finally(() => {
        installing = null;
      });
  }

  async function installed(): Promise<boolean> {
    try {
      await access(python, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }

  return {
    /** On hub start: run Hemmia's SearXNG unless one already answers; rebuild after an update. */
    async start(): Promise<void> {
      ready = await readMarker();
      if (!ready || !supported || !(await installed())) {
        ready = null;
        return;
      }
      if (ready.lock !== (await lockHash()) || ready.commit !== SEARXNG_COMMIT) {
        installing = { phase: 'engine' };
        runInstall();
        return;
      }
      if (!(await deps.reachable())) launch();
    },

    async status(): Promise<SearchSetupStatus> {
      if (installing) return { state: 'installing', phase: installing.phase };
      const answering = await deps.reachable();
      if (ready) return { state: answering ? 'ready' : 'starting' };
      if (answering) return { state: 'ready' };
      if (!supported) return { state: 'unsupported' };
      if (failed) return { state: 'failed', error: failed };
      return { state: 'off' };
    },

    async beginInstall(): Promise<boolean> {
      if (!supported || installing || ready) return false;
      if (await deps.reachable()) return false;
      installing = { phase: 'tool' };
      runInstall();
      return true;
    },

    close(): void {
      closing = true;
      clearTimeout(restartTimer);
      child?.kill('SIGTERM');
    },
  };
}
export type SearchManager = ReturnType<typeof createSearchManager>;

class SetupError extends Error {
  override name = 'SetupError';
  readonly code: Failure;
  constructor(code: Failure) {
    super(code);
    this.code = code;
  }
}
