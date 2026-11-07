/**
 * Push notifications ("your reply is ready"): VAPID keys, per-device subscriptions and
 * sending. Owned by Claude (outbound requests, keys, per-user isolation).
 *
 * Privacy: the payload carries only the kind of event, the chat id and the UI language,
 * encrypted to the device; the push service sees ciphertext and timing. Logs carry the push
 * host and HTTP status only (endpoints are capability URLs and are never logged).
 */
import { randomUUID } from 'node:crypto';
import type { PushPayload, PushSubscribeRequest } from '@hemmia/shared';
import type { DB } from '../db/database.ts';
import type { RelayClient } from '../relay/client.ts';
import type { PushRefs } from './pushref.ts';
import {
  encryptPayload,
  generateVapidKeys,
  isAllowedPushEndpoint,
  vapidAuthorization,
  type VapidKeys,
} from './webpush.ts';

/** Devices per user; the oldest subscription is dropped beyond this. */
const MAX_SUBSCRIPTIONS = 10;
const SEND_TIMEOUT_MS = 10_000;
/** Undelivered notifications are dropped after a day (the reply is in the chat anyway). */
const TTL_SECONDS = 24 * 3600;

export class PushRejectedError extends Error {
  override name = 'PushRejectedError';
  constructor() {
    super('push subscription rejected');
  }
}

export interface PushLog {
  info: (obj: object, msg: string) => void;
  warn: (obj: object, msg: string) => void;
}

/** Native app push through the relay (P4.4). */
export interface NativePush {
  /** The relay client while remote access is on, else null (native push then pauses). */
  client: () => Pick<RelayClient, 'pushHandle' | 'deletePushHandle' | 'pushSend'> | null;
  refs: PushRefs;
  /** The app id the relay accepts (the bundle id). */
  appId: string;
}

export interface PushOptions {
  db: DB;
  native?: NativePush;
  /** VAPID contact (https URL of this kchat). */
  subject: string;
  log: PushLog;
  now?: () => number;
  fetch?: typeof fetch;
}

export function createPush(options: PushOptions) {
  const { db, log } = options;
  const now = options.now ?? Date.now;
  const doFetch = options.fetch ?? fetch;
  let keys: VapidKeys | null = null;

  function vapid(): VapidKeys {
    if (keys) return keys;
    const row = db
      .prepare<[], { value: string }>("SELECT value FROM settings WHERE key = 'vapid'")
      .get();
    if (row) {
      keys = JSON.parse(row.value) as VapidKeys;
    } else {
      keys = generateVapidKeys();
      db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('vapid', ?, ?)").run(
        JSON.stringify(keys),
        now(),
      );
    }
    return keys;
  }

  async function sendOne(
    sub: { id: string; endpoint: string; p256dh: Buffer; auth: Buffer },
    payload: PushPayload,
  ): Promise<void> {
    const host = new URL(sub.endpoint).hostname;
    try {
      const body = encryptPayload(
        { p256dh: sub.p256dh, auth: sub.auth },
        Buffer.from(JSON.stringify(payload)),
      );
      const res = await doFetch(sub.endpoint, {
        method: 'POST',
        headers: {
          authorization: vapidAuthorization(sub.endpoint, vapid(), options.subject, now()),
          'content-encoding': 'aes128gcm',
          'content-type': 'application/octet-stream',
          ttl: String(TTL_SECONDS),
          urgency: 'normal',
        },
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      await res.body?.cancel();
      if (res.status === 404 || res.status === 410) {
        // The browser dropped this subscription (app removed, permission revoked).
        db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
        log.info({ host, status: res.status }, 'push subscription expired');
      } else if (!res.ok) {
        log.warn({ host, status: res.status }, 'push rejected');
      } else {
        // Only the push service and its answer: enough to tell "sent" from "never arrived".
        log.info({ host, status: res.status, kind: payload.kind }, 'push sent');
      }
    } catch (err) {
      log.warn({ host, error: err instanceof Error ? err.name : 'unknown' }, 'push failed');
    }
  }

  /** One content-free notification to a native app through the relay. Never throws. */
  async function sendNative(
    id: string,
    handle: string | null,
    payload: PushPayload,
  ): Promise<void> {
    const native = options.native;
    const client = native?.client();
    // Native push goes through the relay, which is what a 'connect' notice may be about.
    if (!native || !client || !handle || payload.kind === 'connect') return;
    const kind =
      payload.kind === 'maintenance'
        ? payload.ok === false
          ? 'maintenance_failed'
          : 'maintenance_ok'
        : payload.kind;
    try {
      const r = await client.pushSend({
        handle,
        kind,
        ref: native.refs.encryptRef(payload.chatId),
      });
      if (r === 'gone') {
        db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(id);
        log.info({ kind }, 'native push token gone');
      } else {
        log.info({ kind }, 'native push sent');
      }
    } catch (err) {
      log.warn({ error: err instanceof Error ? err.name : 'unknown' }, 'native push failed');
    }
  }

  return {
    publicKey(): string {
      return vapid().publicKey;
    },

    /** Registers (or moves) a device's subscription to this user and session. */
    subscribe(user: { userId: string; sessionId: string }, sub: PushSubscribeRequest): void {
      if (!isAllowedPushEndpoint(sub.endpoint)) throw new PushRejectedError();
      const p256dh = Buffer.from(sub.keys.p256dh, 'base64url');
      const auth = Buffer.from(sub.keys.auth, 'base64url');
      if (p256dh.length !== 65 || p256dh[0] !== 0x04 || auth.length !== 16) {
        throw new PushRejectedError();
      }
      db.transaction(() => {
        // The endpoint belongs to whichever account signed in on that device last.
        db.prepare(
          `INSERT INTO push_subscriptions (id, user_id, session_id, endpoint, p256dh, auth, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id,
             session_id = excluded.session_id, p256dh = excluded.p256dh, auth = excluded.auth,
             created_at = excluded.created_at`,
        ).run(randomUUID(), user.userId, user.sessionId, sub.endpoint, p256dh, auth, now());
        db.prepare(
          `DELETE FROM push_subscriptions WHERE user_id = ? AND id NOT IN (
             SELECT id FROM push_subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?)`,
        ).run(user.userId, user.userId, MAX_SUBSCRIPTIONS);
      })();
    },

    /** Removes the user's own subscription for this endpoint (other users' stay). */
    unsubscribe(userId: string, endpoint: string): void {
      db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?').run(
        userId,
        endpoint,
      );
    },

    /**
     * A native app's device token for this session and device, registered at the relay as an
     * opaque handle. Throws PushRejectedError without remote access.
     */
    async subscribeNative(
      user: { userId: string; sessionId: string },
      body: { platform: 'ios' | 'android'; token: string; env?: 'production' | 'sandbox' },
    ): Promise<void> {
      const native = options.native;
      const client = native?.client();
      if (!native || !client) throw new PushRejectedError();
      const handle = await client.pushHandle(
        body.platform === 'ios'
          ? {
              platform: 'ios',
              token: body.token,
              env: body.env ?? 'production',
              appId: native.appId,
            }
          : { platform: 'android', token: body.token, appId: native.appId },
      );
      const old = db
        .prepare<[string], { relay_handle: string | null }>(
          "SELECT relay_handle FROM push_subscriptions WHERE session_id = ? AND kind = 'native'",
        )
        .all(user.sessionId);
      db.transaction(() => {
        db.prepare("DELETE FROM push_subscriptions WHERE session_id = ? AND kind = 'native'").run(
          user.sessionId,
        );
        db.prepare(
          `INSERT INTO push_subscriptions (id, user_id, session_id, endpoint, p256dh, auth, created_at, kind, relay_handle)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'native', ?)`,
        ).run(
          randomUUID(),
          user.userId,
          user.sessionId,
          `native:${randomUUID()}`,
          Buffer.alloc(0),
          Buffer.alloc(0),
          now(),
          handle,
        );
        db.prepare(
          `DELETE FROM push_subscriptions WHERE user_id = ? AND id NOT IN (
             SELECT id FROM push_subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?)`,
        ).run(user.userId, user.userId, MAX_SUBSCRIPTIONS);
      })();
      for (const o of old) {
        if (o.relay_handle) await client.deletePushHandle(o.relay_handle).catch(() => undefined);
      }
    },

    /** Removes this session's native subscription (and its handle at the relay). */
    async unsubscribeNative(sessionId: string): Promise<void> {
      const rows = db
        .prepare<[string], { relay_handle: string | null }>(
          "SELECT relay_handle FROM push_subscriptions WHERE session_id = ? AND kind = 'native'",
        )
        .all(sessionId);
      db.prepare("DELETE FROM push_subscriptions WHERE session_id = ? AND kind = 'native'").run(
        sessionId,
      );
      const client = options.native?.client();
      for (const r of rows) {
        if (client && r.relay_handle)
          await client.deletePushHandle(r.relay_handle).catch(() => undefined);
      }
    },

    /** Sends to all of the user's devices with a live session. Never throws. */
    async notify(userId: string, payload: PushPayload): Promise<void> {
      const subs = db
        .prepare<
          [string, number, number],
          {
            id: string;
            endpoint: string;
            p256dh: Buffer;
            auth: Buffer;
            kind: 'web' | 'native';
            relay_handle: string | null;
          }
        >(
          `SELECT p.id, p.endpoint, p.p256dh, p.auth, p.kind, p.relay_handle FROM push_subscriptions p
           JOIN sessions s ON s.id = p.session_id
           WHERE p.user_id = ? AND s.expires_at > ? AND s.absolute_expires_at > ?`,
        )
        .all(userId, now(), now());
      await Promise.all(
        subs.map((s) =>
          s.kind === 'native' ? sendNative(s.id, s.relay_handle, payload) : sendOne(s, payload),
        ),
      );
    },
  };
}

export type Push = ReturnType<typeof createPush>;
