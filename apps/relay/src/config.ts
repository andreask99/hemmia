/**
 * Relay configuration from the environment (RELAY.md §11). Missing push or store settings turn
 * off only that feature; the tunnel never depends on them. Error messages name variables, never
 * values.
 */
import { readFileSync } from 'node:fs';
import { z } from 'zod';

const Domain = z
  .string()
  .regex(
    /^(?=.{1,200}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/,
  );

const Env = z.object({
  RELAY_DOMAIN: Domain,
  RELAY_DATA_DIR: z.string().startsWith('/').default('/data'),
  RELAY_PORT: z.coerce.number().int().min(1).max(65535).default(443),
  /** Interface to listen on; 0.0.0.0 in the container, 127.0.0.1 for local development. */
  RELAY_HOST: z.string().default('0.0.0.0'),
  RELAY_ACME_DIRECTORY: z.url().default('https://acme-staging-v02.api.letsencrypt.org/directory'),
  RELAY_ACME_EMAIL: z.email().optional(),
  /** Which DNS provider sets the ACME TXT records (P2.5): 'cloudflare' or 'fake' (development). */
  RELAY_DNS_PROVIDER: z.enum(['cloudflare', 'fake']).default('cloudflare'),
  CLOUDFLARE_API_TOKEN: z.string().min(20).optional(),
  CLOUDFLARE_ZONE_ID: z
    .string()
    .regex(/^[0-9a-f]{32}$/)
    .optional(),
  RELAY_DATA_KEY: z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .optional(),
  RELAY_MONTHLY_GIB: z.coerce.number().positive().default(20),
  APNS_KEY_FILE: z.string().optional(),
  APNS_KEY_ID: z
    .string()
    .regex(/^[A-Z0-9]{10}$/)
    .optional(),
  APNS_TEAM_ID: z
    .string()
    .regex(/^[A-Z0-9]{10}$/)
    .optional(),
  APP_ID: z
    .string()
    .regex(/^[A-Za-z0-9.-]{3,200}$/)
    .optional(),
  FCM_SERVICE_ACCOUNT_FILE: z.string().optional(),
  FCM_PROJECT_ID: z
    .string()
    .regex(/^[a-z0-9-]{4,40}$/)
    .optional(),
  ANDROID_CERT_SHA256: z
    .string()
    .regex(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/)
    .optional(),
  APP_STORE_URL: z.url().optional(),
  PLAY_STORE_URL: z.url().optional(),
  RELAY_LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  /** Development: own certificate from files instead of ACME. */
  RELAY_DEV: z.enum(['0', '1']).default('0'),
  RELAY_DEV_CERT: z.string().optional(),
  RELAY_DEV_KEY: z.string().optional(),
});

export interface RelayConfig {
  domain: string;
  dataDir: string;
  port: number;
  host: string;
  acme: { directory: string; email: string | null };
  dns:
    | { provider: 'cloudflare'; token: string; zoneId: string }
    | { provider: 'fake' }
    | { provider: 'none' };
  dataKey: Buffer | null;
  monthlyLimitBytes: number;
  apns: { keyFile: string; keyId: string; teamId: string } | null;
  fcm: { serviceAccountFile: string; projectId: string } | null;
  appId: string | null;
  join: {
    androidCertSha256: string | null;
    appStoreUrl: string | null;
    playStoreUrl: string | null;
    teamId: string | null;
  };
  logLevel: z.infer<typeof Env>['RELAY_LOG_LEVEL'];
  dev: { cert: string; key: string } | null;
  /** Feature switches that are off, for one warning line each at startup. */
  disabled: string[];
}

export class RelayConfigError extends Error {
  override name = 'RelayConfigError';
}

export function loadRelayConfig(env: Record<string, string | undefined>): RelayConfig {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((i) => i.path.join('.')))];
    throw new RelayConfigError(`Invalid relay environment: ${names.join(', ')}`);
  }
  const e = parsed.data;
  const disabled: string[] = [];
  const dev = e.RELAY_DEV === '1';
  let devFiles: RelayConfig['dev'] = null;
  if (dev) {
    if (!e.RELAY_DEV_CERT || !e.RELAY_DEV_KEY) {
      throw new RelayConfigError('RELAY_DEV=1 needs RELAY_DEV_CERT and RELAY_DEV_KEY');
    }
    try {
      devFiles = {
        cert: readFileSync(e.RELAY_DEV_CERT, 'utf8'),
        key: readFileSync(e.RELAY_DEV_KEY, 'utf8'),
      };
    } catch {
      throw new RelayConfigError('Cannot read RELAY_DEV_CERT or RELAY_DEV_KEY');
    }
  }
  let dns: RelayConfig['dns'];
  if (e.RELAY_DNS_PROVIDER === 'fake') {
    dns = { provider: 'fake' };
  } else if (e.CLOUDFLARE_API_TOKEN && e.CLOUDFLARE_ZONE_ID) {
    dns = { provider: 'cloudflare', token: e.CLOUDFLARE_API_TOKEN, zoneId: e.CLOUDFLARE_ZONE_ID };
  } else {
    dns = { provider: 'none' };
    disabled.push('hub certificates (no DNS provider credentials)');
  }
  if (!dev && dns.provider === 'none') {
    throw new RelayConfigError('Production needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID');
  }
  const apns =
    e.APNS_KEY_FILE && e.APNS_KEY_ID && e.APNS_TEAM_ID && e.APP_ID
      ? { keyFile: e.APNS_KEY_FILE, keyId: e.APNS_KEY_ID, teamId: e.APNS_TEAM_ID }
      : null;
  if (!apns) disabled.push('iOS push (APNS_* or APP_ID missing)');
  const fcm =
    e.FCM_SERVICE_ACCOUNT_FILE && e.FCM_PROJECT_ID && e.APP_ID
      ? { serviceAccountFile: e.FCM_SERVICE_ACCOUNT_FILE, projectId: e.FCM_PROJECT_ID }
      : null;
  if (!fcm) disabled.push('Android push (FCM_* or APP_ID missing)');
  const dataKey = e.RELAY_DATA_KEY ? Buffer.from(e.RELAY_DATA_KEY, 'base64url') : null;
  if (!dataKey) disabled.push('push handles (RELAY_DATA_KEY missing)');
  return {
    domain: e.RELAY_DOMAIN,
    dataDir: e.RELAY_DATA_DIR,
    port: e.RELAY_PORT,
    host: e.RELAY_HOST,
    acme: { directory: e.RELAY_ACME_DIRECTORY, email: e.RELAY_ACME_EMAIL ?? null },
    dns,
    dataKey,
    monthlyLimitBytes: Math.round(e.RELAY_MONTHLY_GIB * 1024 ** 3),
    apns,
    fcm,
    appId: e.APP_ID ?? null,
    join: {
      androidCertSha256: e.ANDROID_CERT_SHA256 ?? null,
      appStoreUrl: e.APP_STORE_URL ?? null,
      playStoreUrl: e.PLAY_STORE_URL ?? null,
      teamId: e.APNS_TEAM_ID ?? null,
    },
    logLevel: e.RELAY_LOG_LEVEL,
    dev: devFiles,
    disabled,
  };
}
