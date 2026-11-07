/**
 * Watches Hemmia Connect for the admins: when it has been on but not connected for a while
 * (relay down, hub blocked, network), the admins get one notification, and another when it is
 * back. Content-free web push (the relay may be what is down, so native push is skipped).
 * Owned by Claude.
 */
import type { RemoteStatus } from '@hemmia/shared';

/** Down for this long before the admins hear of it (short blips and restarts stay quiet). */
export const CONNECT_DOWN_AFTER_MS = 10 * 60_000;

export interface ConnectWatch {
  /** Call periodically (every minute). Never throws. */
  check(): Promise<void>;
}

export function createConnectWatch(o: {
  status: () => Promise<RemoteStatus>;
  /** Tells every admin; `up` is false when Connect went down, true when it is back. */
  notify: (up: boolean) => Promise<void>;
  log: { warn(obj: object, msg: string): void; info(obj: object, msg: string): void };
  now?: () => number;
  downAfterMs?: number;
}): ConnectWatch {
  const now = o.now ?? Date.now;
  const downAfter = o.downAfterMs ?? CONNECT_DOWN_AFTER_MS;
  let downSince: number | null = null;
  let alerted = false;

  return {
    async check() {
      let s: RemoteStatus;
      try {
        s = await o.status();
      } catch {
        return;
      }
      if (!s.connect) {
        // Switched off: nothing to watch, and no "back" message later.
        downSince = null;
        alerted = false;
        return;
      }
      if (s.state === 'connected') {
        if (alerted) {
          o.log.info({}, 'connect: back');
          await o.notify(true).catch(() => undefined);
        }
        downSince = null;
        alerted = false;
        return;
      }
      downSince ??= now();
      if (!alerted && now() - downSince >= downAfter) {
        alerted = true;
        o.log.warn({ state: s.state, error: s.lastError ?? 'none' }, 'connect: down');
        await o.notify(false).catch(() => undefined);
      }
    },
  };
}
