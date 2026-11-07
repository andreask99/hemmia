/**
 * The hub's relay identity (RELAY.md §2, SECURITY.md §6.2): an Ed25519 key in
 * <dataDir>/relay/identity.pem (0600, directory 0700), created once, never logged or sent. Its
 * public key gives the hub id and with it the hub's address. Owned by Claude.
 */
import { createPrivateKey, generateKeyPairSync, type KeyObject } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { hubIdFromPublicKey, publicKeyRaw } from '@hemmia/relay-protocol';

export interface RelayIdentity {
  key: KeyObject;
  hubId: string;
}

export function relayDir(dataDir: string): string {
  const dir = join(dataDir, 'relay');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  return dir;
}

/** Writes a private file atomically with mode 0600. */
export function writePrivateFile(path: string, text: string): void {
  writeFileSync(`${path}.tmp`, text, { mode: 0o600 });
  chmodSync(`${path}.tmp`, 0o600);
  renameSync(`${path}.tmp`, path);
}

export function loadOrCreateIdentity(dataDir: string): RelayIdentity {
  const file = join(relayDir(dataDir), 'identity.pem');
  let key: KeyObject;
  if (existsSync(file)) {
    key = createPrivateKey(readFileSync(file, 'utf8'));
    if (key.asymmetricKeyType !== 'ed25519')
      throw new Error('relay identity is not an Ed25519 key');
  } else {
    key = generateKeyPairSync('ed25519').privateKey;
    writePrivateFile(file, key.export({ type: 'pkcs8', format: 'pem' }).toString());
  }
  return { key, hubId: hubIdFromPublicKey(publicKeyRaw(key)) };
}

/** "Forget this address": the identity and certificate keys go; a new address comes next time. */
export function deleteRelayKeys(dataDir: string): void {
  for (const f of ['identity.pem', 'tls-key.pem', 'tls-chain.pem']) {
    rmSync(join(dataDir, 'relay', f), { force: true });
  }
}
