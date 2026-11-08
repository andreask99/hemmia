/**
 * Pictures set up by Hemmia (installer plan, owner 2026-11-08): on a Mac with Apple silicon and
 * enough memory, an admin can turn pictures on. Hemmia then
 *   1. downloads `uv` at a pinned version (SHA-256 checked),
 *   2. builds the picture engine's Python environment in the data folder with
 *      `uv sync --frozen` (every package pinned with its hash in services/imagegen/uv.lock; uv
 *      checks the Python it downloads), packages copied, not linked to the program folder,
 *   3. downloads the ready-made 4-bit FLUX.2 Klein model from mflux-community at a pinned
 *      revision, every file checked against the SHA-256 below.
 * Whether pictures are set up is read from the files (a marker written last), so nothing else
 * has to be stored. After an update that changes the lock file, the environment is rebuilt by
 * itself. Owned by Claude (downloads and runs programs).
 */
import { createHash, randomUUID } from 'node:crypto';
import { access, constants, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import type { PicturesSetupStatus } from '@hemmia/shared';
import { downloadFile, type OllamaLog } from './ollama.ts';
import { ChecksumError, ensureUv as ensureSharedUv, runQuiet, uvPath } from './uv.ts';

export { UV_SHA256, UV_VERSION } from './uv.ts';

/** The picture model ("Pictures"): FLUX.2 Klein 4B, 4-bit, made with mflux (Apache-2.0). */
export const PICTURE_MODEL = 'flux2-klein-4b';
const MODEL_REPO = 'mflux-community/flux2-klein-4b-mflux-q4';
const MODEL_REVISION = '794cd159538149ad9830848508c31f0ea7088e58';
/** [path in the repository, SHA-256, size in bytes]. */
export const MODEL_FILES: readonly (readonly [string, string, number])[] = [
  [
    'text_encoder/0.safetensors',
    'e59ed2b6825cb8ae3d0ba1e8a43575a565d465ce4518b7d79d28020b19b639cd',
    2135435237,
  ],
  [
    'text_encoder/1.safetensors',
    'edbdea3187bc4a0ad0e1ecb7152da8e6b344669413d9e45be5e7a2244f398ee3',
    127582075,
  ],
  [
    'text_encoder/model.safetensors.index.json',
    '7dc8598806b8bbdb0b87b9dc445ac7cf49d7acc42ae333bd0bc0252e46081ed9',
    51332,
  ],
  [
    'tokenizer/chat_template.jinja',
    'a55ee1b1660128b7098723e0abcd92caa0788061051c62d51cbe87d9cf1974d8',
    4168,
  ],
  [
    'tokenizer/tokenizer_config.json',
    '779410a34a98fb2c6c925a1be6f24d632f1723473161b037f6676eb6c04886c6',
    376,
  ],
  [
    'tokenizer/tokenizer.json',
    'be75606093db2094d7cd20f3c2f385c212750648bd6ea4fb2bf507a6a4c55506',
    11422650,
  ],
  [
    'transformer/0.safetensors',
    '36796395e3946496f3e118f26fe22594b1d7d871342a59dd7824349d91c08266',
    2145323769,
  ],
  [
    'transformer/1.safetensors',
    '9730ae148ca4f5ffc62860748b849a70987f0b7301588248bd98a2af9bc15070',
    34727728,
  ],
  [
    'transformer/model.safetensors.index.json',
    'dbdecbf3a957b37d15bd943b956dbb25aa648a01df363e7dd5ebbe5ce941358d',
    26908,
  ],
  [
    'vae/0.safetensors',
    '688ae0c3d2e93573ce8a6d3561d793cf6de5a4207b2e128cad6cd0d71e43b10f',
    165107888,
  ],
  [
    'vae/model.safetensors.index.json',
    'e13e551dabf8c088c8b3c6f52fca3f9e64ead5c42dd592586c7a1f868607afa4',
    17547,
  ],
];
const MODEL_BYTES = MODEL_FILES.reduce((n, [, , size]) => n + size, 0);

/** Loading the 4-bit model peaks at about 14–20 GiB (PROTOCOL.md): below this, it swaps. */
export const MIN_MEMORY_GIB = 24;

type Phase = 'tool' | 'engine' | 'model';
type Failure = 'download' | 'checksum' | 'engine';

/** The side effects, injectable for tests. */
export interface PicturesDeps {
  download: (
    url: string,
    dest: string,
    onBytes: (received: number, total: number | null) => void,
  ) => Promise<string>;
  extract: (archive: string, dir: string) => Promise<void>;
  /** Runs a program to the end; rejects on a non-zero exit. */
  run: (file: string, args: string[], env: NodeJS.ProcessEnv) => Promise<void>;
}

export interface PicturesManagerOptions {
  dataDir: string;
  /** services/imagegen (pyproject.toml and uv.lock). */
  projectDir: string;
  platform: NodeJS.Platform;
  arch: string;
  container: boolean;
  memoryGiB: () => number;
  log: OllamaLog;
  deps?: Partial<PicturesDeps>;
}

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

const defaultDeps: PicturesDeps = {
  download: (url, dest, onBytes) => downloadFile(url, dest, onBytes, 3 * 1024 ** 3),
  extract: async (archive, dir) => {
    await promisify(execFile)('/usr/bin/tar', ['-xzf', archive, '-C', dir], {
      timeout: 5 * 60_000,
    });
  },
  run: runQuiet,
};

export function createPicturesManager(o: PicturesManagerOptions) {
  const deps: PicturesDeps = { ...defaultDeps, ...o.deps };
  const root = join(o.dataDir, 'runtime');
  const uv = uvPath(root);
  const engineDir = join(root, 'imagegen');
  const venv = join(engineDir, 'venv');
  const python = join(venv, 'bin', 'python');
  const marker = join(engineDir, 'ready.json');
  const modelsDir = join(root, 'image-models');
  const modelDir = join(modelsDir, PICTURE_MODEL);

  let installing: { phase: Phase; received: number; total: number | null } | null = null;
  let failed: Failure | null = null;
  /** The marker's contents, read at start and after an install. */
  let ready: { lock: string } | null = null;

  const supportedHere = () => o.platform === 'darwin' && o.arch === 'arm64' && !o.container;
  const enoughMemory = () => o.memoryGiB() >= MIN_MEMORY_GIB;

  async function exists(p: string): Promise<boolean> {
    try {
      await access(p, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async function lockHash(): Promise<string> {
    return sha256(await readFile(join(o.projectDir, 'uv.lock'), 'utf8'));
  }

  async function readMarker(): Promise<{ lock: string } | null> {
    try {
      const value: unknown = JSON.parse(await readFile(marker, 'utf8'));
      if (typeof value === 'object' && value !== null && 'lock' in value) {
        const lock = value.lock;
        if (typeof lock === 'string') return { lock };
      }
    } catch {
      // not set up
    }
    return null;
  }

  async function ensureUv(): Promise<void> {
    installing = { phase: 'tool', received: 0, total: null };
    try {
      await ensureSharedUv(root, deps, (received, total) => {
        installing = { phase: 'tool', received, total };
      });
    } catch (err) {
      if (err instanceof ChecksumError) throw new SetupError('checksum');
      throw err;
    }
  }

  /** The Python environment, from the lock file only (`--frozen`), in the data folder. */
  async function syncEngine(): Promise<void> {
    installing = { phase: 'engine', received: 0, total: null };
    const cache = join(engineDir, 'cache');
    await mkdir(engineDir, { recursive: true, mode: 0o700 });
    try {
      await deps.run(
        uv,
        ['sync', '--frozen', '--no-dev', '--no-editable', '--project', o.projectDir],
        {
          HOME: homedir(),
          PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
          UV_PROJECT_ENVIRONMENT: venv,
          UV_PYTHON_INSTALL_DIR: join(engineDir, 'python'),
          UV_CACHE_DIR: cache,
          UV_PYTHON_PREFERENCE: 'only-managed',
          UV_NO_CONFIG: '1',
        },
      );
    } catch {
      throw new SetupError('engine');
    } finally {
      // The cache is only needed while installing (several hundred MB).
      await rm(cache, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async function modelComplete(): Promise<boolean> {
    for (const [file] of MODEL_FILES) if (!(await exists(join(modelDir, file)))) return false;
    return true;
  }

  async function downloadModel(): Promise<void> {
    if (await modelComplete()) return;
    const tmp = join(modelsDir, `.${PICTURE_MODEL}-${randomUUID()}`);
    let done = 0;
    installing = { phase: 'model', received: 0, total: MODEL_BYTES };
    try {
      for (const [file, expected, size] of MODEL_FILES) {
        const dest = join(tmp, file);
        await mkdir(dirname(dest), { recursive: true, mode: 0o700 });
        const url = `https://huggingface.co/${MODEL_REPO}/resolve/${MODEL_REVISION}/${file}`;
        const sha = await deps.download(url, dest, (received) => {
          installing = { phase: 'model', received: done + received, total: MODEL_BYTES };
        });
        if (sha !== expected) throw new SetupError('checksum');
        done += size;
      }
      await rm(modelDir, { recursive: true, force: true });
      await rename(tmp, modelDir);
    } finally {
      await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async function writeMarker(): Promise<void> {
    const value = { lock: await lockHash() };
    await writeFile(marker, JSON.stringify(value), { mode: 0o600 });
    ready = value;
  }

  async function runInstall(steps: () => Promise<void>): Promise<void> {
    failed = null;
    try {
      await steps();
      o.log.info({}, 'pictures: set up');
    } catch (err) {
      failed = err instanceof SetupError ? err.code : 'download';
      o.log.warn({ reason: failed }, 'pictures: setup failed');
    } finally {
      installing = null;
    }
  }

  return {
    /** On hub start: read the marker; rebuild the environment after an update changed the lock. */
    async start(): Promise<void> {
      ready = await readMarker();
      if (!ready || !supportedHere()) return;
      if (ready.lock !== (await lockHash().catch(() => ready?.lock))) {
        ready = null;
        installing = { phase: 'engine', received: 0, total: null };
        void runInstall(async () => {
          await ensureUv();
          await syncEngine();
          await writeMarker();
        });
      }
    },

    async status(): Promise<PicturesSetupStatus> {
      if (installing) return { state: 'installing', ...installing };
      if (ready) return { state: 'ready' };
      if (!supportedHere()) return { state: 'unsupported', reason: 'platform' };
      if (!enoughMemory()) return { state: 'unsupported', reason: 'memory' };
      if (failed) return { state: 'failed', error: failed };
      return { state: 'off', downloadBytes: MODEL_BYTES };
    },

    /** Starts the setup in the background (admin only, checked by the route). */
    beginInstall(): boolean {
      if (!supportedHere() || !enoughMemory() || installing || ready) return false;
      installing = { phase: 'tool', received: 0, total: null };
      void runInstall(async () => {
        await mkdir(root, { recursive: true, mode: 0o700 });
        await ensureUv();
        await syncEngine();
        await mkdir(modelsDir, { recursive: true, mode: 0o700 });
        await downloadModel();
        await writeMarker();
      });
      return true;
    },

    /** True once pictures are set up by Hemmia (the engine can be started from the data folder). */
    managed: (): boolean => ready !== null,

    /**
     * How to start the picture engine when Hemmia set it up: the environment's Python, the
     * model folder. Null when pictures come from a developer setup (`uv run` in the project).
     */
    worker(): { command: readonly [string, ...string[]]; env: Record<string, string> } | null {
      if (!ready) return null;
      return {
        command: [python, '-m', 'kchat_imagegen'],
        env: { HEMMIA_IMAGEGEN_MODEL_DIR: modelsDir },
      };
    },
  };
}
export type PicturesManager = ReturnType<typeof createPicturesManager>;

class SetupError extends Error {
  override name = 'SetupError';
  readonly code: Failure;
  constructor(code: Failure) {
    super(code);
    this.code = code;
  }
}
