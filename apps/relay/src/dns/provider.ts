/** Sets and removes the ACME TXT records (RELAY.md §6). Implementations: Cloudflare, fake. */
export interface DnsProvider {
  /** Creates a TXT record (TTL 60); returns its id for deleteTxt. */
  setTxt(name: string, value: string): Promise<string>;
  deleteTxt(id: string): Promise<void>;
}

/** Resolves when every authoritative server returns the TXT value; throws after the timeout. */
export type TxtWaiter = (name: string, value: string, signal: AbortSignal) => Promise<void>;
