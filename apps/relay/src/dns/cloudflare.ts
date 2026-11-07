/**
 * Cloudflare DNS for the ACME TXT records (RELAY.md §6). The token is scoped to DNS edit of the
 * relay zone only; it is never logged. Owned by Claude.
 */
import { z } from 'zod';
import type { DnsProvider } from './provider.ts';

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

const Created = z.object({
  success: z.literal(true),
  result: z.object({ id: z.string().regex(/^[0-9a-f]{32}$/) }),
});

export function createCloudflareDns(o: {
  token: string;
  zoneId: string;
  fetch?: FetchLike;
}): DnsProvider {
  const fetchImpl: FetchLike = o.fetch ?? ((url, init) => fetch(url, init));
  const base = `https://api.cloudflare.com/client/v4/zones/${o.zoneId}/dns_records`;
  const headers = { authorization: `Bearer ${o.token}`, 'content-type': 'application/json' };
  return {
    async setTxt(name, value) {
      const res = await fetchImpl(base, {
        method: 'POST',
        headers,
        body: JSON.stringify({ type: 'TXT', name, content: value, ttl: 60 }),
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
      const body: unknown = await res.json().catch(() => null);
      const parsed = Created.safeParse(body);
      if (!res.ok || !parsed.success)
        throw new Error(`cloudflare: create failed (${String(res.status)})`);
      return parsed.data.result.id;
    },
    async deleteTxt(id) {
      if (!/^[0-9a-f]{32}$/.test(id)) throw new Error('cloudflare: bad record id');
      const res = await fetchImpl(`${base}/${id}`, {
        method: 'DELETE',
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
      await res.body?.cancel().catch(() => undefined);
      if (!res.ok && res.status !== 404)
        throw new Error(`cloudflare: delete failed (${String(res.status)})`);
    },
  };
}
