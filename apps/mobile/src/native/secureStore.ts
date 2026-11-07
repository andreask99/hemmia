/** The app's own Keychain/Keystore plugin (SecureStorePlugin.swift / .java, PHONE-MODE.md §5). */
import { registerPlugin } from '@capacitor/core';

export type SecretName = 'apiKey.anthropic' | 'apiKey.openai' | 'dataKey';

export interface SecureStore {
  get: (o: { name: SecretName }) => Promise<{ value: string | null }>;
  set: (o: { name: SecretName; value: string }) => Promise<void>;
  remove: (o: { name: SecretName }) => Promise<void>;
}

export const secureStore = registerPlugin<SecureStore>('SecureStore');
