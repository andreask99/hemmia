import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CatalogFile, type CatalogEntry, type Config, EnvSchema, ModelsFile } from './schema.ts';

export interface LoadConfigOptions {
  /** Repo root used to find config/models.json. Default: four levels up from this file. */
  repoRoot?: string;
  /** Home directory for the default data dir. Default: os.homedir(). */
  homeDir?: string;
  /** Platform for the default data dir. Default: process.platform. */
  platform?: NodeJS.Platform;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

const HOSTNAME =
  /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'] as const;

/**
 * Variables were called KCHAT_* before the rename to Hemmia (P8.2). Existing setups (the
 * family LaunchAgent, earlier Docker files) still work: each KCHAT_X fills HEMMIA_X when that
 * isn't set; the new name wins.
 */
export function withLegacyNames(
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const out = { ...env };
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith('KCHAT_')) continue;
    const name = `HEMMIA_${key.slice('KCHAT_'.length)}`;
    if (out[name] === undefined) out[name] = value;
  }
  return out;
}

/**
 * Validates the environment and the models file into a Config. Error messages name the
 * offending variable or file but never include values, which could be secrets.
 */
export function loadConfig(
  env: Record<string, string | undefined>,
  options: LoadConfigOptions = {},
): Config {
  const repoRoot = options.repoRoot ?? fileURLToPath(new URL('../../../../', import.meta.url));
  const homeDir = options.homeDir ?? homedir();
  const platform = options.platform ?? process.platform;

  const parsed = EnvSchema.safeParse(withLegacyNames(env));
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))];
    throw new ConfigError(`Invalid environment: ${names.join(', ')}`);
  }
  const e = parsed.data;
  const container = e.HEMMIA_CONTAINER === '1';
  if (e.HEMMIA_HOST === '0.0.0.0' && !container) {
    throw new ConfigError('HEMMIA_HOST=0.0.0.0 is only allowed with HEMMIA_CONTAINER=1');
  }

  const dataDir = e.HEMMIA_DATA_DIR ?? defaultDataDir({ container, platform, homeDir, env });
  const allowedHosts: string[] = [...LOCAL_HOSTS];
  for (const raw of e.HEMMIA_PUBLIC_HOSTNAMES.split(',')) {
    const host = raw.trim().toLowerCase();
    if (host === '') continue;
    if (!HOSTNAME.test(host)) throw new ConfigError('Invalid HEMMIA_PUBLIC_HOSTNAMES entry');
    if (!allowedHosts.includes(host)) allowedHosts.push(host);
  }
  for (const host of hostsFile(dataDir)) if (!allowedHosts.includes(host)) allowedHosts.push(host);

  return {
    env: e.NODE_ENV,
    host: e.HEMMIA_HOST,
    port: e.HEMMIA_PORT,
    dataDir,
    allowedHosts,
    ollamaUrl: e.OLLAMA_URL,
    searxngUrl: e.HEMMIA_SEARXNG_URL,
    logLevel: e.HEMMIA_LOG_LEVEL ?? (e.NODE_ENV === 'test' ? 'silent' : 'info'),
    models: loadModelsFile(e.HEMMIA_MODELS_FILE ?? join(repoRoot, 'config', 'models.json')),
    catalog: loadCatalog(join(repoRoot, 'config', 'catalog.json')),
    container,
    updateCheck: e.HEMMIA_UPDATE_CHECK === '1',
    connectOnStart: e.HEMMIA_CONNECT === '1',
    relayDomain: e.HEMMIA_RELAY_DOMAIN ?? null,
    relayAddress: e.HEMMIA_RELAY_ADDRESS
      ? {
          host: e.HEMMIA_RELAY_ADDRESS.split(':')[0] ?? '',
          port: Number(e.HEMMIA_RELAY_ADDRESS.split(':')[1]),
        }
      : null,
    relayCa: e.HEMMIA_RELAY_CA ? readCa(e.HEMMIA_RELAY_CA) : null,
    appId: e.HEMMIA_APP_ID,
  };
}

/**
 * `public-hostnames.txt` in the data dir: one hostname per line, written by the macOS
 * package's tailscale.sh, which can't change the LaunchAgent's environment (postinstall
 * rewrites it). Only the hub's own user can write the data dir, and anyone who can already
 * reads every file there. Invalid lines are skipped so a bad edit can't stop the hub; read once
 * at startup.
 */
function hostsFile(dataDir: string): string[] {
  if (dataDir === ':memory:') return [];
  let text: string;
  try {
    text = readFileSync(join(dataDir, 'public-hostnames.txt'), 'utf8');
  } catch {
    return [];
  }
  return text
    .split('\n')
    .slice(0, 10)
    .map((l) => l.trim().toLowerCase().replace(/\.$/, ''))
    .filter((h) => h !== '' && !h.startsWith('#') && HOSTNAME.test(h));
}

function defaultDataDir(o: {
  container: boolean;
  platform: NodeJS.Platform;
  homeDir: string;
  env: Record<string, string | undefined>;
}): string {
  if (o.container) return '/data';
  // A hub set up before the rename to Hemmia (P8.2) keeps its folder.
  const pick = (base: string, name: string, old: string) => {
    const now = join(base, name);
    return !existsSync(now) && existsSync(join(base, old)) ? join(base, old) : now;
  };
  if (o.platform === 'darwin') {
    return pick(join(o.homeDir, 'Library', 'Application Support'), 'Hemmia', 'kchat');
  }
  if (o.platform === 'linux') {
    const xdg = o.env['XDG_DATA_HOME'];
    const base = xdg?.startsWith('/') ? xdg : join(o.homeDir, '.local', 'share');
    return pick(base, 'hemmia', 'kchat');
  }
  throw new ConfigError('Set HEMMIA_DATA_DIR: no default data directory on this platform');
}

function readCa(path: string): string {
  try {
    const pem = readFileSync(path, 'utf8');
    if (!pem.includes('-----BEGIN CERTIFICATE-----')) throw new Error('not a certificate');
    return pem;
  } catch {
    throw new ConfigError('Cannot read HEMMIA_RELAY_CA');
  }
}

function loadCatalog(path: string): CatalogEntry[] {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  const parsed = CatalogFile.safeParse(JSON.parse(text));
  if (!parsed.success) throw new ConfigError(`Invalid catalog file ${path}`);
  return parsed.data.entries;
}

function loadModelsFile(path: string): ModelsFile {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new ConfigError(`Cannot read models file: ${path}`);
  }
  const parsed = ModelsFile.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ');
    throw new ConfigError(`Invalid models file ${path}: ${issues}`);
  }
  return parsed.data;
}
