/** An in-process relay for the hub's tests: test CA, fake ACME and DNS, on 127.0.0.1. */
import { generateKeyPairSync } from 'node:crypto';
import { pino } from 'pino';
import {
  createAcmeClient,
  createFakeDns,
  createTestCa,
  loadRelayConfig,
  openDb,
  type Relay,
  startFakeAcme,
  startRelay,
  type TestCa,
} from '@hemmia/relay/testing';
import type { RelayEndpoint } from './client.ts';

export const TEST_RELAY_DOMAIN = 'relay.test';

type Timings = NonNullable<Parameters<typeof startRelay>[1]['timings']>;

export interface TestRelay {
  relay: Relay;
  ca: TestCa;
  endpoint: RelayEndpoint & { address: { host: string; port: number } };
  /** Stops the relay (tunnels see GOAWAY), keeping its state for restart(). */
  stop(): Promise<void>;
  /** Starts it again on the same port. */
  restart(): Promise<void>;
  /** Stops everything and removes temp files. */
  dispose(): Promise<void>;
}

export async function startTestRelay(
  o: { monthlyGiB?: string; timings?: Timings; dataDir?: string } = {},
): Promise<TestRelay> {
  const ca = createTestCa();
  const dns = createFakeDns();
  const acme = await startFakeAcme({
    lookupTxt: dns.lookup,
    signCsr: (d) => ca.signCsr(d),
    chainPem: ca.certPem,
  });
  const issuer = createAcmeClient({
    directoryUrl: acme.directoryUrl,
    accountKey: generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey,
    email: null,
    dns: dns.provider,
    waitForTxt: dns.wait,
    pollMs: 5,
  });
  const db = openDb(o.dataDir ?? ':memory:');
  const own = ca.issue(['api', 'tunnel', 'join'].map((h) => `${h}.${TEST_RELAY_DOMAIN}`));
  const config = {
    ...loadRelayConfig({
      RELAY_DOMAIN: TEST_RELAY_DOMAIN,
      RELAY_DNS_PROVIDER: 'fake',
      RELAY_ACME_EMAIL: 'relay@example.test',
      RELAY_MONTHLY_GIB: o.monthlyGiB ?? '50',
    }),
    host: '127.0.0.1',
    dev: null,
  };
  const log = pino({ level: 'silent' });
  const start = (port: number) =>
    startRelay(
      { ...config, port },
      { db, log, tls: own, issuer, ...(o.timings ? { timings: o.timings } : {}) },
    );
  let relay = await start(0);
  let running = true;
  const endpoint = {
    domain: TEST_RELAY_DOMAIN,
    address: { host: '127.0.0.1', port: relay.port },
    ca: ca.certPem,
  };
  return {
    get relay() {
      return relay;
    },
    ca,
    endpoint,
    async stop() {
      if (!running) return;
      running = false;
      await relay.close();
    },
    async restart() {
      relay = await start(endpoint.address.port);
      running = true;
    },
    async dispose() {
      if (running) await relay.close();
      running = false;
      await acme.close();
      ca.dispose();
      db.close();
    },
  };
}
