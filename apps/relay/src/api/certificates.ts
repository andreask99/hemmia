/**
 * Certificate orders for hubs (RELAY.md §5.3). The relay doesn't parse the CSR: it orders
 * exactly `<hub-id>.h.<relay-domain>`, and the CA refuses a CSR with other names. Owned by
 * Claude.
 */
import { randomUUID } from 'node:crypto';
import { CertificateRequest, type CertificateStatus, hubHostname } from '@hemmia/relay-protocol';
import type { OrderQueue } from '../acme/queue.ts';
import type { RelayDb } from '../db.ts';
import { ApiHttpError } from '../http.ts';
import type { Route } from './server.ts';

const WEEK = 7 * 24 * 60 * 60_000;
const THREE_HOURS = 3 * 60 * 60_000;

export function certificateRoutes(o: {
  db: RelayDb;
  relayDomain: string;
  queue: OrderQueue | null;
  now?: () => number;
}): Route[] {
  const now = o.now ?? Date.now;
  const pending = o.db.prepare<[string], { n: number }>(
    "SELECT COUNT(*) AS n FROM cert_orders WHERE hub_id = ? AND status = 'pending'",
  );
  const hubRecent = o.db.prepare<[string, number], { n: number }>(
    'SELECT COUNT(*) AS n FROM cert_orders WHERE hub_id = ? AND created_at > ?',
  );
  const allRecent = o.db.prepare<[number], { n: number }>(
    'SELECT COUNT(*) AS n FROM cert_orders WHERE created_at > ?',
  );
  const insert = o.db.prepare(
    "INSERT INTO cert_orders (id, hub_id, status, csr, created_at) VALUES (?, ?, 'pending', ?, ?)",
  );
  const get = o.db.prepare<
    [string, string],
    { status: 'pending' | 'ready' | 'failed'; chain_pem: string | null; failure: string | null }
  >('SELECT status, chain_pem, failure FROM cert_orders WHERE id = ? AND hub_id = ?');
  const prune = o.db.prepare('DELETE FROM cert_orders WHERE created_at < ?');

  return [
    {
      method: 'POST',
      path: /^\/v1\/hubs\/self\/certificate$/,
      signed: true,
      handle(ctx) {
        if (!o.queue) throw new ApiHttpError(503, 'unavailable');
        const { csr } = CertificateRequest.parse(ctx.json());
        const der = Buffer.from(csr, 'base64url');
        if (der.length > 4096) throw new ApiHttpError(400, 'bad_request');
        prune.run(now() - WEEK);
        if ((pending.get(ctx.hubId)?.n ?? 0) > 0) throw new ApiHttpError(409, 'order_pending');
        if ((hubRecent.get(ctx.hubId, now() - WEEK)?.n ?? 0) >= 5)
          throw new ApiHttpError(429, 'rate_limited');
        if ((allRecent.get(now() - THREE_HOURS)?.n ?? 0) >= 300)
          throw new ApiHttpError(429, 'rate_limited');
        const orderId = randomUUID();
        insert.run(orderId, ctx.hubId, der, now());
        o.queue.add(orderId, ctx.hubId, hubHostname(ctx.hubId, o.relayDomain), der);
        return { status: 202, body: { orderId } };
      },
    },
    {
      method: 'GET',
      path: /^\/v1\/hubs\/self\/certificate\/([0-9a-f-]{36})$/,
      signed: true,
      handle(ctx): { status: number; body: CertificateStatus } {
        const row = get.get(ctx.params[0] ?? '', ctx.hubId);
        if (!row) throw new ApiHttpError(404, 'not_found');
        if (row.status === 'ready' && row.chain_pem) {
          return { status: 200, body: { status: 'ready', chainPem: row.chain_pem } };
        }
        if (row.status === 'failed') {
          const code =
            row.failure === 'csr_rejected' ||
            row.failure === 'dns_failed' ||
            row.failure === 'timeout'
              ? row.failure
              : 'acme_failed';
          return { status: 200, body: { status: 'failed', code } };
        }
        return { status: 200, body: { status: 'pending' } };
      },
    },
  ];
}
