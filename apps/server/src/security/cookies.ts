import type { FastifyReply } from 'fastify';

/** Adds a Set-Cookie header without dropping ones already set for this response. */
export function appendSetCookie(reply: FastifyReply, value: string): void {
  const existing = reply.getHeader('set-cookie');
  const list =
    existing === undefined
      ? []
      : Array.isArray(existing)
        ? existing.map(String)
        : [String(existing)];
  reply.header('set-cookie', [...list, value]);
}
