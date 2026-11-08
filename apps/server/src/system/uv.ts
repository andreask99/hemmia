/**
 * The pinned `uv` that Hemmia uses to build Python environments in its data folder (pictures,
 * web search on a Mac). Downloaded once from Astral's GitHub releases, SHA-256 checked before it
 * is unpacked. Owned by Claude.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, constants, mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';

export const UV_VERSION = '0.13.7';
export const UV_SHA256 = '81b811b57e4624df7ed3aac148e0359100d9962f3d9dce00aec533dc2e086731';
export const UV_URL = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-aarch64-apple-darwin.tar.gz`;

export interface UvDeps {
  download: (
    url: string,
    dest: string,
    onBytes: (received: number, total: number | null) => void,
  ) => Promise<string>;
  extract: (archive: string, dir: string) => Promise<void>;
}

export class ChecksumError extends Error {
  override name = 'ChecksumError';
}

/** `<runtime>/uv-<version>/…/uv`. */
export function uvPath(runtime: string): string {
  return join(runtime, `uv-${UV_VERSION}`, 'uv-aarch64-apple-darwin', 'uv');
}

/** Installs the pinned uv under `runtime` unless it is there; returns its path. */
export async function ensureUv(
  runtime: string,
  deps: UvDeps,
  onBytes: (received: number, total: number | null) => void = () => undefined,
): Promise<string> {
  const uv = uvPath(runtime);
  try {
    await access(uv, constants.X_OK);
    return uv;
  } catch {
    // not installed yet
  }
  const dir = join(runtime, `uv-${UV_VERSION}`);
  const tmp = join(runtime, `.uv-${randomUUID()}`);
  try {
    await mkdir(tmp, { recursive: true, mode: 0o700 });
    const archive = join(tmp, 'uv.tar.gz');
    if ((await deps.download(UV_URL, archive, onBytes)) !== UV_SHA256) throw new ChecksumError();
    const unpacked = join(tmp, 'uv');
    await mkdir(unpacked, { mode: 0o700 });
    await deps.extract(archive, unpacked);
    await rm(dir, { recursive: true, force: true });
    await rename(unpacked, dir);
    return uv;
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Runs a program to the end with only `env`; rejects on a non-zero exit. Output is dropped. */
export function runQuiet(file: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(file, args, { env, stdio: ['ignore', 'ignore', 'ignore'] });
    const timer = setTimeout(() => proc.kill('SIGTERM'), 60 * 60_000);
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`exit ${String(code)}`));
    });
  });
}
