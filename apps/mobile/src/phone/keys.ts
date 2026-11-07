/**
 * API keys and the data key (PHONE-MODE.md §5). Keys are read from SecureStore for each
 * request and never kept in React state, files or logs; the UI shows them only masked.
 */
import type { SecretName, SecureStore } from '../native/secureStore.ts';
import { fromBase64, importDataKey, newDataKeyBytes, toBase64 } from './crypto.ts';

export type Provider = 'anthropic' | 'openai';

const keyName = (p: Provider): SecretName =>
  p === 'anthropic' ? 'apiKey.anthropic' : 'apiKey.openai';

/** "sk-…" plus the last 4 characters; nothing else of the key. */
export function maskKey(key: string): string {
  const k = key.trim();
  return k.length <= 8 ? '…' : `${k.startsWith('sk-') ? 'sk-' : ''}…${k.slice(-4)}`;
}

export function createKeys(store: SecureStore) {
  // One load at a time: two parallel first uses must not create two data keys.
  let dataKey: Promise<CryptoKey> | null = null;
  return {
    async apiKey(p: Provider): Promise<string | null> {
      return (await store.get({ name: keyName(p) })).value;
    },
    async setApiKey(p: Provider, key: string): Promise<void> {
      const k = key.trim();
      if (k === '' || k.length > 4096 || /\s/.test(k)) throw new Error('bad key');
      await store.set({ name: keyName(p), value: k });
    },
    removeApiKey(p: Provider): Promise<void> {
      return store.remove({ name: keyName(p) });
    },
    /** The data key for the encrypted store, created on first use. */
    dataKey(): Promise<CryptoKey> {
      dataKey ??= (async () => {
        // A failed read rejects: a new key is created only when none is stored.
        const stored = (await store.get({ name: 'dataKey' })).value;
        if (stored !== null) return importDataKey(fromBase64(stored));
        const raw = newDataKeyBytes();
        await store.set({ name: 'dataKey', value: toBase64(raw) });
        return importDataKey(raw);
      })().catch((e: unknown) => {
        dataKey = null;
        throw e;
      });
      return dataKey;
    },
    async removeDataKey(): Promise<void> {
      dataKey = null;
      await store.remove({ name: 'dataKey' });
    },
  };
}
export type Keys = ReturnType<typeof createKeys>;
