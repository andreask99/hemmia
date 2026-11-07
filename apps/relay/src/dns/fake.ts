/** In-memory DNS for tests and the local development stack. */
import { randomUUID } from 'node:crypto';
import type { DnsProvider, TxtWaiter } from './provider.ts';

export function createFakeDns(o: { failSet?: boolean } = {}) {
  const records = new Map<string, { name: string; value: string }>();
  const provider: DnsProvider = {
    setTxt(name, value) {
      if (o.failSet) return Promise.reject(new Error('dns provider down'));
      const id = randomUUID();
      records.set(id, { name: name.toLowerCase(), value });
      return Promise.resolve(id);
    },
    deleteTxt(id) {
      records.delete(id);
      return Promise.resolve();
    },
  };
  const lookup = (name: string): string[] =>
    [...records.values()].filter((r) => r.name === name.toLowerCase()).map((r) => r.value);
  const wait: TxtWaiter = (name, value) =>
    lookup(name).includes(value) ? Promise.resolve() : Promise.reject(new Error('TXT not visible'));
  return { provider, lookup, wait, count: () => records.size };
}
export type FakeDns = ReturnType<typeof createFakeDns>;
