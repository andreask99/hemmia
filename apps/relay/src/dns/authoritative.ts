/**
 * Waits until the zone's authoritative name servers all return a TXT value (RELAY.md §6):
 * polled every 2 s for at most 90 s, so Let's Encrypt finds the record on its first try.
 */
import { Resolver } from 'node:dns/promises';
import type { TxtWaiter } from './provider.ts';

export function createAuthoritativeWaiter(o: {
  zone: string;
  pollMs?: number;
  timeoutMs?: number;
}): TxtWaiter {
  let servers: Promise<string[]> | null = null;
  const nameServers = async (): Promise<string[]> => {
    const r = new Resolver();
    const ns = await r.resolveNs(o.zone);
    const addresses = (await Promise.all(ns.map((n) => r.resolve4(n).catch(() => [])))).flat();
    if (addresses.length === 0) throw new Error('no authoritative name servers');
    return addresses;
  };
  return async (name, value, signal) => {
    servers ??= nameServers().catch((err: unknown) => {
      servers = null;
      throw err;
    });
    const addresses = await servers;
    const deadline = Date.now() + (o.timeoutMs ?? 90_000);
    for (;;) {
      const seen = await Promise.all(
        addresses.map(async (a) => {
          const r = new Resolver({ timeout: 3000, tries: 1 });
          r.setServers([a]);
          const txt = await r.resolveTxt(name).catch(() => []);
          return txt.some((parts) => parts.join('') === value);
        }),
      );
      if (seen.every(Boolean)) return;
      if (Date.now() > deadline || signal.aborted) throw new Error('TXT record not visible');
      await new Promise((resolve) => setTimeout(resolve, o.pollMs ?? 2000));
    }
  };
}
