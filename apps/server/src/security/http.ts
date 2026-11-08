/**
 * HTTP security for every request: Host and Origin checks, JSON-only bodies, security
 * headers, session cookie, request user context, and an error handler that never echoes
 * input. Owned by Claude; see docs/SECURITY.md "Transport and browser security".
 */
import { type Gate, TooManyDevicesError } from './gate.ts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import type { ErrorCode } from '@hemmia/shared';
import type { Config } from '../config/schema.ts';
import {
  type Auth,
  AuthError,
  type AuthErrorCode,
  SESSION_IDLE_MS,
  type SessionUser,
} from './auth.ts';
import { appendSetCookie } from './cookies.ts';
import { wipe } from './crypto.ts';
import { isViaRelay } from './viarelay.ts';

declare module 'fastify' {
  interface FastifyRequest {
    /** The signed-in user for this request, or null. Resolved from the session cookie. */
    user: SessionUser | null;
  }
}

export class HttpError extends Error {
  override name = 'HttpError';
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly retryAfterSeconds: number | undefined;
  constructor(statusCode: number, code: ErrorCode, retryAfterSeconds?: number) {
    super(code);
    this.statusCode = statusCode;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const AUTH_STATUS: Record<AuthErrorCode, number> = {
  invalid_credentials: 401,
  invite_invalid: 400,
  username_taken: 409,
  weak_password: 400,
  forbidden: 403,
};

export const CSP = [
  "default-src 'self'",
  "img-src 'self' blob: data:",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

export const SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy': CSP,
  'strict-transport-security': 'max-age=31536000',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
};

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Hostname from a Host header value, lower-cased, without port. Null if malformed. */
export function hostnameOf(hostHeader: string | undefined): string | null {
  if (!hostHeader) return null;
  const h = hostHeader.trim().toLowerCase();
  const m = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::\d{1,5})?$/.exec(h);
  return m?.[1] ?? null;
}

/** True if an Origin header names one of our hosts (https, or http for localhost only). */
export function isAllowedOrigin(origin: string, allowedHosts: readonly string[]): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (!allowedHosts.includes(host)) return false;
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && LOCAL_HOSTS.has(host);
}

export interface CookieSettings {
  name: string;
  /** The name before the rename to Hemmia (P8.2): still read, then moved to `name`. */
  legacyName: string;
  secure: boolean;
}

export function cookieSettings(config: Pick<Config, 'env'>): CookieSettings {
  // In production the app is reached over HTTPS (Tailscale serve, the relay): use the __Host-
  // prefix, which forces Secure, Path=/ and no Domain. Local development runs over http.
  return config.env === 'production' ? SECURE_COOKIE : LOCAL_COOKIE;
}

const SECURE_COOKIE: CookieSettings = {
  name: '__Host-hemmia_session',
  legacyName: '__Host-kchat_session',
  secure: true,
};
const LOCAL_COOKIE: CookieSettings = {
  name: 'hemmia_session',
  legacyName: 'kchat_session',
  secure: false,
};

/**
 * True for a request to this computer by its local name (http://localhost, where the installer
 * opens setup). That is plain http, and Safari drops Secure cookies there, so these requests get
 * cookies without Secure; nothing travels over a network, and the cookie can't reach the https
 * names of the hub (cookies are per host).
 */
export function isLocalRequest(req: FastifyRequest): boolean {
  const host = hostnameOf(req.headers.host);
  return host !== null && LOCAL_HOSTS.has(host) && !isViaRelay(req.socket);
}

/** The cookie settings for this request: `c`, except plain ones for local requests. */
export function cookieFor(c: CookieSettings, req: FastifyRequest): CookieSettings {
  return c.secure && isLocalRequest(req) ? LOCAL_COOKIE : c;
}

export function readCookie(req: FastifyRequest, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

export function setSessionCookie(
  reply: FastifyReply,
  settings: CookieSettings,
  token: string,
): void {
  const c = cookieFor(settings, reply.request);
  const maxAge = Math.floor(SESSION_IDLE_MS / 1000);
  reply.header(
    'set-cookie',
    `${c.name}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${c.secure ? '; Secure' : ''}`,
  );
}

export function clearSessionCookie(reply: FastifyReply, settings: CookieSettings): void {
  const c = cookieFor(settings, reply.request);
  const attrs = `Path=/; HttpOnly; SameSite=Strict; Max-Age=0${c.secure ? '; Secure' : ''}`;
  reply.header('set-cookie', [`${c.name}=; ${attrs}`, `${c.legacyName}=; ${attrs}`]);
}

function sendError(reply: FastifyReply, err: HttpError): void {
  if (err.retryAfterSeconds !== undefined) {
    reply.header('retry-after', String(err.retryAfterSeconds));
  }
  void reply.code(err.statusCode).send({
    error: {
      code: err.code,
      ...(err.retryAfterSeconds !== undefined ? { retryAfterSeconds: err.retryAfterSeconds } : {}),
    },
  });
}

/** Maps any thrown value to a safe HttpError. Unknown errors become 500 internal. */
export function toHttpError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;
  if (err instanceof AuthError) return new HttpError(AUTH_STATUS[err.code], err.code);
  if (err instanceof ZodError) return new HttpError(400, 'bad_request');
  if (err instanceof TooManyDevicesError) return new HttpError(409, 'too_many_devices');
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = err.code;
    const status = (err as { statusCode?: unknown }).statusCode;
    if (code === 'FST_ERR_CTP_BODY_TOO_LARGE') return new HttpError(413, 'payload_too_large');
    if (code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') return new HttpError(415, 'bad_request');
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return new HttpError(
        status === 404 ? 404 : 400,
        status === 404 ? 'not_found' : 'bad_request',
      );
    }
  }
  // JSON body parse errors (SyntaxError with statusCode 400) fall under the case above.
  return new HttpError(500, 'internal');
}

export interface SecurityDeps {
  config: Config;
  auth: Auth;
  /** Hosts allowed besides the configured ones right now (the hub host while Connect is on). */
  extraHosts?: () => readonly string[];
  /** The device gate for requests through the relay (SECURITY.md §3). */
  gate?: Gate;
}

/**
 * Registers all request-level security. Call before any routes.
 */
export function registerSecurity(app: FastifyInstance, deps: SecurityDeps): void {
  const { config, auth } = deps;
  const cookies = cookieSettings(config);

  // Only JSON bodies (multipart is added per route for uploads). Removing the text/plain
  // parser means cross-site "simple" form posts can't reach any handler.
  app.removeContentTypeParser('text/plain');

  app.decorateRequest('user', null);
  app.decorateRequest('device', null);

  app.addHook('onRequest', async (req, reply) => {
    // Only origin-form request targets: the router would route an absolute-form one
    // ("GET https://hub/api/x") to /api/x while the device gate reads its full text.
    if (!req.url.startsWith('/')) throw new HttpError(400, 'bad_request');
    const extra = deps.extraHosts?.() ?? [];
    const allowed = extra.length > 0 ? [...config.allowedHosts, ...extra] : config.allowedHosts;
    const host = hostnameOf(req.headers.host);
    if (host === null || !allowed.includes(host)) {
      throw new HttpError(421, 'bad_request');
    }

    if (UNSAFE_METHODS.has(req.method)) {
      const origin = req.headers.origin;
      if (!origin || !isAllowedOrigin(origin, allowed)) {
        throw new HttpError(403, 'forbidden');
      }
      const site = req.headers['sec-fetch-site'];
      if (site !== undefined && site !== 'same-origin' && site !== 'none') {
        throw new HttpError(403, 'forbidden');
      }
    }

    const cookie = cookieFor(cookies, req);
    const token = readCookie(req, cookie.name);
    if (token) req.user = auth.resolveSession(token);
    else {
      // A session from before the rename: accept it and move it to the new cookie name.
      const old = readCookie(req, cookie.legacyName);
      if (old) {
        req.user = auth.resolveSession(old);
        if (req.user) {
          const flags = `Path=/; HttpOnly; SameSite=Strict${cookie.secure ? '; Secure' : ''}`;
          appendSetCookie(
            reply,
            `${cookie.name}=${old}; ${flags}; Max-Age=${String(Math.floor(SESSION_IDLE_MS / 1000))}`,
          );
          appendSetCookie(reply, `${cookie.legacyName}=; ${flags}; Max-Age=0`);
        }
      }
    }
    if (deps.gate && deps.gate.check(req, reply) === 'device_required') {
      if (req.user) wipe(req.user.dek);
      req.user = null;
      throw new HttpError(403, 'device_required');
    }
  });

  app.addHook('onSend', async (req, reply, payload) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) reply.header(name, value);
    if (req.url.startsWith('/api/')) reply.header('cache-control', 'no-store');
    return payload;
  });

  // The DEK lives only for the request.
  app.addHook('onResponse', async (req) => {
    if (req.user) wipe(req.user.dek);
  });

  app.setErrorHandler((err, req, reply) => {
    const httpErr = toHttpError(err);
    if (httpErr.statusCode >= 500) {
      // Our own errors never carry content; log the error for debugging.
      req.log.error({ err }, 'request failed');
    } else {
      // Client errors: code only. Parser errors can quote the request body.
      req.log.info({ error: httpErr.code, status: httpErr.statusCode }, 'request rejected');
    }
    sendError(reply, httpErr);
  });

  app.setNotFoundHandler((_req, reply) => {
    sendError(reply, new HttpError(404, 'not_found'));
  });
}

/** preHandler: requires a signed-in user. */
export async function requireUser(req: FastifyRequest): Promise<void> {
  if (!req.user) throw new HttpError(401, 'unauthenticated');
}

/** preHandler: requires an admin. */
export async function requireAdmin(req: FastifyRequest): Promise<void> {
  if (!req.user) throw new HttpError(401, 'unauthenticated');
  if (req.user.role !== 'admin') throw new HttpError(403, 'forbidden');
}

/** The signed-in user; only call after requireUser. */
export function currentUser(req: FastifyRequest): SessionUser {
  if (!req.user) throw new HttpError(401, 'unauthenticated');
  return req.user;
}
