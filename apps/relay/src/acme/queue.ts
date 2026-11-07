/**
 * Certificate orders for hubs (RELAY.md §5.3, §6): at most 3 run at once, the rest wait in
 * order; each has 5 minutes. Results are written to `cert_orders`. Owned by Claude.
 */
import type { Logger } from 'pino';
import type { RelayDb } from '../db.ts';
import { AcmeOrderError } from './client.ts';

export interface Issuer {
  issue(names: readonly string[], csrDer: Buffer, signal: AbortSignal): Promise<string>;
}

export function createOrderQueue(o: {
  db: RelayDb;
  issuer: Issuer;
  log: Logger;
  concurrency?: number;
  timeoutMs?: number;
  now?: () => number;
}) {
  const now = o.now ?? Date.now;
  const waiting: { orderId: string; hubId: string; name: string; csr: Buffer }[] = [];
  let running = 0;
  const finish = o.db.prepare(
    'UPDATE cert_orders SET status = ?, chain_pem = ?, failure = ?, finished_at = ? WHERE id = ?',
  );
  const idle: (() => void)[] = [];

  function pump(): void {
    while (running < (o.concurrency ?? 3)) {
      const job = waiting.shift();
      if (!job) break;
      running++;
      const signal = AbortSignal.timeout(o.timeoutMs ?? 5 * 60_000);
      o.issuer
        .issue([job.name], job.csr, signal)
        .then((chain) => {
          finish.run('ready', chain, null, now(), job.orderId);
          o.log.info({ hubId: job.hubId, outcome: 'ready' }, 'certificate order');
        })
        .catch((err: unknown) => {
          const code = signal.aborted
            ? 'timeout'
            : err instanceof AcmeOrderError
              ? err.code
              : 'acme_failed';
          finish.run('failed', null, code, now(), job.orderId);
          o.log.info({ hubId: job.hubId, outcome: code }, 'certificate order');
        })
        .finally(() => {
          running--;
          pump();
          if (running === 0 && waiting.length === 0) for (const f of idle.splice(0)) f();
        });
    }
  }

  return {
    add(orderId: string, hubId: string, name: string, csr: Buffer): void {
      waiting.push({ orderId, hubId, name, csr });
      pump();
    },
    /** Resolves when nothing runs or waits (tests). */
    idle: () =>
      running === 0 && waiting.length === 0
        ? Promise.resolve()
        : new Promise<void>((r) => idle.push(r)),
    stats: () => ({ running, waiting: waiting.length }),
  };
}
export type OrderQueue = ReturnType<typeof createOrderQueue>;
