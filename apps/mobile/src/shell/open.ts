/**
 * Opening a hub from the list or from a link (PLAN.md P5.4): check it answers, save it, then
 * let the native HubLauncher restart the app on it.
 */
import { HealthResponse } from '@hemmia/shared';
import { LINK_KINDS, parseLink } from '@hemmia/relay-protocol/links';
import type { HubLauncher, LaunchInfo } from '../native/hubLauncher.ts';
import { type HostRules, hubUrl, isHubHost } from './hosts.ts';
import type { HubStore, StoredHub } from './hubs.ts';
import { MIN_HUB_BRIDGE, SHELL_LEVEL } from './version.ts';

export interface LinkTarget {
  hubHost: string;
  path: string;
}

/** A scanned or pasted share/direct link, if it points to a hub this build may open. */
export function linkTarget(raw: string, rules: HostRules): LinkTarget | null {
  const link = parseLink(raw.trim(), {
    relayDomains: [rules.relayDomain],
    allowLocal: rules.devHosts.includes('localhost'),
  });
  if (!link || !LINK_KINDS.includes(link.kind) || !isHubHost(link.hubHost, rules)) return null;
  return { hubHost: link.hubHost, path: `/join#${link.kind}~${link.code}` };
}

/** An opened app URL: hemmia://join#<payload> (from the join page) or the https share link. */
export function incomingLinkTarget(url: string, rules: HostRules): LinkTarget | null {
  const m = /^hemmia:\/\/join\/?#(.+)$/.exec(url);
  return linkTarget(m?.[1] ? `https://join.${rules.relayDomain}/j#${m[1]}` : url, rules);
}

/**
 * Whether the hub answers within 8 s. The request is cross-origin from the shell, so it is
 * sent without CORS: an opaque answer still proves the hub is reachable.
 */
export async function isReachable(
  hubHost: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    await fetchImpl(`${hubUrl(hubHost)}/api/health`, {
      mode: 'no-cors',
      cache: 'no-store',
      credentials: 'omit',
      signal: AbortSignal.timeout(8000),
    });
    return true;
  } catch {
    return false;
  }
}

/** Whether a hub answers and whether this app and that hub work together (P5.11). */
export type HubCheck = 'ok' | 'offline' | 'appTooOld' | 'hubTooOld';

/** A GET without CORS limits (native HTTP in the app); `data` is parsed JSON or text. */
export type NativeGet = (url: string) => Promise<{ status: number; data: unknown }>;

/** The handshake from a health answer: which side is too old, if either. */
export function compatibility(health: HealthResponse): Exclude<HubCheck, 'offline'> {
  if (SHELL_LEVEL < health.minShell) return 'appTooOld';
  if (health.bridge < MIN_HUB_BRIDGE) return 'hubTooOld';
  return 'ok';
}

/**
 * Reads the hub's health answer with native HTTP (the shell's origin can't read it with
 * fetch). An answer without the handshake fields comes from a hub older than this app
 * supports. When native HTTP isn't available (a browser during development), only
 * reachability is checked.
 */
export async function checkHub(
  hubHost: string,
  get: NativeGet | null,
  fetchImpl: typeof fetch = fetch,
): Promise<HubCheck> {
  if (!get) return (await isReachable(hubHost, fetchImpl)) ? 'ok' : 'offline';
  let res: { status: number; data: unknown };
  try {
    res = await get(`${hubUrl(hubHost)}/api/health`);
  } catch {
    return 'offline';
  }
  if (res.status !== 200) return 'offline';
  let data = res.data;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data) as unknown;
    } catch {
      return 'offline';
    }
  }
  const health = HealthResponse.safeParse(data);
  if (health.success) return compatibility(health.data);
  const status = (data as { status?: unknown } | null)?.status;
  return status === 'ok' ? 'hubTooOld' : 'offline';
}

export interface OpenDeps {
  store: HubStore;
  rules: HostRules;
  launcher: Pick<HubLauncher, 'open'>;
  check: (hubHost: string) => Promise<HubCheck>;
  now: () => number;
  /** Name for a hub saved for the first time (the user can't rename yet). */
  defaultName: string;
}

/**
 * 'opened' (the app restarts on the hub), 'offline', 'refused' (not a hub host), or which
 * side needs an update. A hub that needs an update is still saved (it answered).
 */
export async function openHub(
  deps: OpenDeps,
  target: LinkTarget,
): Promise<'opened' | 'refused' | Exclude<HubCheck, 'ok'>> {
  if (!isHubHost(target.hubHost, deps.rules)) return 'refused';
  const check = await deps.check(target.hubHost);
  if (check === 'offline') return 'offline';
  const known = (await deps.store.list()).find((h) => h.hubHost === target.hubHost);
  await deps.store.save({
    hubHost: target.hubHost,
    name: known?.name ?? deps.defaultName,
    lastReachedAt: deps.now(),
  });
  if (check !== 'ok') return check;
  await deps.launcher.open(target);
  return 'opened';
}

/** What the shell shows first, from why it was started and the saved hubs. */
export type StartAction =
  | { kind: 'open'; target: LinkTarget }
  | { kind: 'offline'; hubHost: string }
  | { kind: 'screen'; screen: 'welcome' | 'hubs' | 'phone' };

export function startAction(
  info: LaunchInfo,
  hubs: readonly StoredHub[],
  launchUrl: string | null,
  rules: HostRules,
  /** Phone mode is set up (an API key is stored). */
  phoneReady = false,
): StartAction {
  const saved = (h: string | null) => h !== null && hubs.some((x) => x.hubHost === h);
  if (info.reason === 'push' && info.push && saved(info.push.hubHost)) {
    return {
      kind: 'open',
      target: { hubHost: info.push.hubHost, path: `/push-open#${info.push.ref}` },
    };
  }
  const link = info.reason === 'link' ? info.link : info.reason === 'start' ? launchUrl : null;
  const fromLink = link ? incomingLinkTarget(link, rules) : null;
  if (fromLink) return { kind: 'open', target: fromLink };
  if (info.reason === 'offline' && saved(info.hubHost) && info.hubHost)
    return { kind: 'offline', hubHost: info.hubHost };
  // PHONE-MODE.md §3: one hub and no phone mode → that hub; phone mode only → its chats;
  // both, or several hubs → the list (phone mode first); nothing → welcome.
  if (info.reason === 'start' && hubs.length === 1 && hubs[0] && !phoneReady) {
    return { kind: 'open', target: { hubHost: hubs[0].hubHost, path: '/' } };
  }
  if (hubs.length === 0) return { kind: 'screen', screen: phoneReady ? 'phone' : 'welcome' };
  return { kind: 'screen', screen: 'hubs' };
}
