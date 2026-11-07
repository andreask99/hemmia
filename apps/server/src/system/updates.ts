/**
 * Update check for packaged builds (SECURITY.md §6.5, P6.7): once a day the signed update
 * manifest from the relay's API host. The request carries only this hub's version, platform
 * and channel (the relay counts them per day, without the IP address). Nothing is used before
 * the Ed25519 signature checks out against the key built into the hub; an older manifest than
 * the last one seen is ignored. Admins see a notice with the release notes link, and a warning
 * when this version is below the minimum safe one. Nothing is downloaded or run here (P6.6).
 */
import {
  type Manifest,
  type ManifestChannel,
  type ManifestPlatform,
  verifyManifest,
} from '@hemmia/relay-protocol';

const MAX_BYTES = 64 * 1024;

/** The response body as text, or null once it passes `max` bytes (reading stops there). */
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

export interface UpdateInfo {
  /** A newer release, or null. */
  version: string | null;
  url: string | null;
  major: boolean;
  /** This version is below the minimum safe one: update soon. */
  belowMinimum: boolean;
}

/** [major, minor, patch] of "v1.2.3" / "1.2.3", or null. */
export function parseSemver(v: string): [number, number, number] | null {
  const m = /^v?(\d{1,6})\.(\d{1,6})\.(\d{1,6})$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function isNewer(candidate: string, current: string): boolean {
  const a = parseSemver(candidate);
  const b = parseSemver(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

/** What a verified manifest means for this hub, or null when there is nothing to show. */
export function updateInfo(m: Manifest, current: string): UpdateInfo | null {
  const newer = isNewer(m.latest.version, current);
  const belowMinimum = m.minimum !== null && isNewer(m.minimum, current);
  if (!newer && !belowMinimum) return null;
  return {
    version: newer ? m.latest.version : null,
    url: newer ? m.latest.notesUrl : null,
    major: newer && m.latest.major,
    belowMinimum,
  };
}

export function createUpdateCheck(o: {
  /** The relay's domain; the manifest is at https://api.<domain>/v1/manifest. */
  relayDomain: string | null;
  currentVersion: string;
  platform: ManifestPlatform;
  channel?: ManifestChannel;
  fetch?: typeof fetch;
  intervalMs?: number;
  /** Tests: another signing key. */
  publicKey?: string;
}) {
  const doFetch = o.fetch ?? fetch;
  let latest: UpdateInfo | null = null;
  let signedAt = 0;
  let timer: NodeJS.Timeout | null = null;

  async function check(): Promise<UpdateInfo | null> {
    if (!o.relayDomain) return null;
    const q = new URLSearchParams({
      v: o.currentVersion,
      p: o.platform,
      c: o.channel ?? 'stable',
    });
    try {
      const res = await doFetch(`https://api.${o.relayDomain}/v1/manifest?${q.toString()}`, {
        headers: { 'user-agent': 'hemmia-hub' },
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        return latest;
      }
      const text = await readCapped(res, MAX_BYTES);
      if (text === null) return latest;
      const manifest = verifyManifest(JSON.parse(text), o.publicKey);
      // Unsigned, tampered or replayed (older than the last one): keep what we knew.
      if (!manifest || manifest.signedAt < signedAt) return latest;
      signedAt = manifest.signedAt;
      latest = updateInfo(manifest, o.currentVersion);
    } catch {
      // Offline or the relay down: keep what we knew.
    }
    return latest;
  }

  return {
    check,
    latest: () => latest,
    start(): void {
      if (timer) return;
      void check();
      timer = setInterval(() => void check(), o.intervalMs ?? 24 * 60 * 60_000);
      timer.unref();
    },
    stop(): void {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
