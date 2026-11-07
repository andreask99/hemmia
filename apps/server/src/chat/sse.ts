/**
 * Server-sent events over a hijacked Fastify reply. Hijacked replies skip Fastify's
 * onSend hooks, so the security headers are written here explicitly.
 */
import type { FastifyReply } from 'fastify';
import type { StreamEvent } from '@hemmia/shared';
import { SECURITY_HEADERS } from '../security/http.ts';

export interface SseStream<E extends { type: string } = StreamEvent> {
  send: (event: E) => void;
  end: () => void;
  /** True once the client has gone away. */
  closed: () => boolean;
  onClose: (fn: () => void) => void;
}

export function openSse<E extends { type: string } = StreamEvent>(
  reply: FastifyReply,
): SseStream<E> {
  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  let isClosed = false;
  const closeHandlers: (() => void)[] = [];
  res.on('close', () => {
    isClosed = true;
    for (const fn of closeHandlers) fn();
  });
  // Keep proxies from timing out long queue waits.
  const ping = setInterval(() => {
    if (!isClosed) res.write(': ping\n\n');
  }, 15_000);
  res.on('close', () => {
    clearInterval(ping);
  });

  return {
    send: (event) => {
      if (isClosed) return;
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    },
    end: () => {
      clearInterval(ping);
      if (!isClosed) res.end();
    },
    closed: () => isClosed,
    onClose: (fn) => {
      if (isClosed) fn();
      else closeHandlers.push(fn);
    },
  };
}
