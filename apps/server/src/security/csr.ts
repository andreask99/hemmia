/**
 * The hub's certificate request (RELAY.md §5.3): ECDSA P-256, SHA-256, subject CN and SAN = the
 * hub host only. The DER builder lives in relay-protocol (shared with the relay). Owned by Claude.
 */
import type { KeyObject } from 'node:crypto';
import { buildCsr } from '@hemmia/relay-protocol';

export function buildHubCsr(key: KeyObject, hostname: string): Buffer {
  return buildCsr(key, [hostname.toLowerCase()]);
}
