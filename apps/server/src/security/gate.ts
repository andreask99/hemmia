/**
 * The device gate (SECURITY.md §3): requests that come through the relay need a paired device
 * (a device cookie), except for the app shell and the few routes that pair a device. Requests
 * over Tailscale or from this computer are not gated. Owned by Claude.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { DB } from '../db/database.ts';
import { wipe } from './crypto.ts';
import { appendSetCookie } from './cookies.ts';
import { isLocalRequest } from './http.ts';
import { isViaRelay } from './viarelay.ts';

declare module 'fastify' {
  interface FastifyRequest {
    /** The paired device of this request (via its device cookie), or null. */
    device: string | null;
  }
}

export const MAX_DEVICES_PER_USER = 20;
const COOKIE_MAX_AGE_S = 400 * 24 * 60 * 60;
const TOUCH_MS = 60 * 60_000;
const UNBOUND_TTL_MS = 24 * 60 * 60_000;

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest();

/**
 * Exactly the routes SECURITY.md §3 allows without a device (method + path). The path is judged
 * after percent-decoding, as the router sees it: `/%61pi/me` is an API path too.
 */
export function allowedWithoutDevice(method: string, url: string): boolean {
  let path: string;
  try {
    path = decodeURIComponent(url.split('?')[0] ?? '');
  } catch {
    return false;
  }
  if (method === 'GET' || method === 'HEAD') {
    // The app shell: static files and SPA routes (everything outside /api/).
    if (!path.startsWith('/api/') && path !== '/api') return true;
    return path === '/api/health' || path === '/api/gate' || path === '/api/setup/state';
  }
  if (method === 'POST') return path === '/api/links/redeem' || path === '/api/setup/account';
  return false;
}

export interface DeviceRow {
  id: string;
  user_id: string | null;
  label: string;
  created_at: number;
  last_seen_at: number;
}

export class TooManyDevicesError extends Error {
  override name = 'TooManyDevicesError';
}

export function createGate(o: { db: DB; secure: boolean; now?: () => number }) {
  const now = o.now ?? Date.now;
  /**
   * The device cookie for a request: __Host- and Secure in production, except for local http
   * requests (isLocalRequest). `legacy` is the name before the rename to Hemmia (P8.2): still
   * read, then moved to `name`.
   */
  function names(req: FastifyRequest): { name: string; legacy: string; secure: boolean } {
    return o.secure && !isLocalRequest(req)
      ? { name: '__Host-hemmia_device', legacy: '__Host-kchat_device', secure: true }
      : { name: 'hemmia_device', legacy: 'kchat_device', secure: false };
  }
  const byHash = o.db.prepare<[Buffer], DeviceRow & { revoked_at: number | null }>(
    'SELECT id, user_id, label, created_at, last_seen_at, revoked_at FROM devices WHERE token_hash = ?',
  );
  const touch = o.db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?');
  const sessionDevice = o.db.prepare<[string], { device_id: string | null }>(
    'SELECT device_id FROM sessions WHERE id = ?',
  );

  function readCookie(req: FastifyRequest, name: string): string | null {
    for (const part of (req.headers.cookie ?? '').split(';')) {
      const eq = part.indexOf('=');
      if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
    }
    return null;
  }

  function setCookie(reply: FastifyReply, token: string): void {
    const c = names(reply.request);
    appendSetCookie(
      reply,
      `${c.name}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${String(COOKIE_MAX_AGE_S)}${c.secure ? '; Secure' : ''}`,
    );
  }

  /** The device of a request, refreshing its last-seen time (at most hourly) and its cookie. */
  function resolve(req: FastifyRequest, reply: FastifyReply): DeviceRow | null {
    const c = names(req);
    const current = readCookie(req, c.name);
    const token = current ?? readCookie(req, c.legacy);
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const row = byHash.get(sha256(token));
    if (!row || row.revoked_at !== null) return null;
    const stale = now() - row.last_seen_at > TOUCH_MS;
    if (stale) touch.run(now(), row.id);
    if (current === null) {
      // A device from before the rename: move it to the new cookie name.
      setCookie(reply, token);
      appendSetCookie(
        reply,
        `${c.legacy}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${c.secure ? '; Secure' : ''}`,
      );
    } else if (stale) {
      setCookie(reply, token);
    }
    return row;
  }

  function sweep(): void {
    o.db
      .prepare('DELETE FROM devices WHERE user_id IS NULL AND created_at < ?')
      .run(now() - UNBOUND_TTL_MS);
  }

  return {
    /**
     * Runs after the Host/Origin checks and session lookup. Through the relay: a request without
     * a device may only reach the allow list (else 403 device_required), and a session that
     * belongs to another device doesn't count.
     */
    check(req: FastifyRequest, reply: FastifyReply): 'ok' | 'device_required' {
      const device = resolve(req, reply);
      req.device = device?.id ?? null;
      if (!isViaRelay(req.socket)) return 'ok';
      if (req.user) {
        const bound = sessionDevice.get(req.user.sessionId)?.device_id ?? null;
        if (bound === null || bound !== req.device) {
          wipe(req.user.dek);
          req.user = null;
        }
      }
      if (device) return 'ok';
      return allowedWithoutDevice(req.method, req.url) ? 'ok' : 'device_required';
    },

    /** A new device (optionally bound to a user) with its cookie set. Throws TooManyDevicesError. */
    create(reply: FastifyReply, userId: string | null, label: string): string {
      sweep();
      if (userId !== null) {
        const n =
          o.db
            .prepare<[string], { n: number }>(
              'SELECT COUNT(*) AS n FROM devices WHERE user_id = ? AND revoked_at IS NULL',
            )
            .get(userId)?.n ?? 0;
        if (n >= MAX_DEVICES_PER_USER) throw new TooManyDevicesError();
      }
      const id = randomUUID();
      const token = randomBytes(32).toString('base64url');
      o.db
        .prepare(
          'INSERT INTO devices (id, user_id, token_hash, label, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(id, userId, sha256(token), label.slice(0, 80), now(), now());
      setCookie(reply, token);
      return id;
    },

    /**
     * A session was just created on this request: tie it to the request's device and the device
     * to the user (a device belongs to whoever signed in on it last). Through the relay without a
     * device (setup), a new device is created for it.
     */
    bindSession(
      req: FastifyRequest,
      reply: FastifyReply,
      userId: string,
      sessionId: string,
      label: string,
    ): void {
      let deviceId = req.device;
      if (deviceId === null) {
        if (!isViaRelay(req.socket)) return;
        deviceId = this.create(reply, userId, label);
        req.device = deviceId;
      }
      const count =
        o.db
          .prepare<[string, string], { n: number }>(
            'SELECT COUNT(*) AS n FROM devices WHERE user_id = ? AND revoked_at IS NULL AND id != ?',
          )
          .get(userId, deviceId)?.n ?? 0;
      if (count >= MAX_DEVICES_PER_USER) throw new TooManyDevicesError();
      o.db.prepare('UPDATE devices SET user_id = ? WHERE id = ?').run(userId, deviceId);
      o.db.prepare('UPDATE sessions SET device_id = ? WHERE id = ?').run(deviceId, sessionId);
    },

    /** A device code redeemed on an already paired device: it now belongs to that user. */
    assign(deviceId: string, userId: string): void {
      o.db.prepare('UPDATE devices SET user_id = ? WHERE id = ?').run(userId, deviceId);
    },

    list(userId: string): DeviceRow[] {
      return o.db
        .prepare<[string], DeviceRow>(
          `SELECT id, user_id, label, created_at, last_seen_at FROM devices
           WHERE user_id = ? AND revoked_at IS NULL ORDER BY last_seen_at DESC`,
        )
        .all(userId);
    },

    /** Removes a device of this user; its sessions (and their push subscriptions) end with it. */
    remove(userId: string, deviceId: string): boolean {
      return (
        o.db.prepare('DELETE FROM devices WHERE id = ? AND user_id = ?').run(deviceId, userId)
          .changes === 1
      );
    },

    /** Sign out everywhere: every device of the user except `keep`. */
    removeOthers(userId: string, keep: string | null): void {
      o.db.prepare('DELETE FROM devices WHERE user_id = ? AND id IS NOT ?').run(userId, keep);
    },
    sweep,
  };
}
export type Gate = ReturnType<typeof createGate>;
