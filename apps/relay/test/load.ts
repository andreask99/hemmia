/**
 * Relay load test (docs/public/PLAN.md P7.3). Simulated hubs keep a tunnel each, and simulated
 * phones hold long streams through them with SSE-like traffic (a small event every
 * `--interval` ms, timestamped by the hub). The relay runs in a child process, so its CPU and
 * memory are measured apart from the simulators.
 *
 *   node apps/relay/test/load.ts [--hubs 100] [--streams 1000] [--minutes 10] [--interval 250]
 *
 * Local only for now: relay, hubs and phones on this machine, over loopback. Against staging
 * (P2.15) the relay part is replaced by the real address; the simulators stay the same.
 */
import { fork } from 'node:child_process';
import tls from 'node:tls';
import { parseArgs } from 'node:util';
import type { TunnelStream } from '@hemmia/relay-protocol';
import { openDb } from '../src/db.ts';
import { startRelay } from '../src/relay.ts';
import { createTestCa } from './ca.ts';
import { connectFakeHub, type FakeHub, newHubKey } from './fakehub.ts';
import { DOMAIN, silent, testConfig } from './helpers.ts';

interface RelayStats {
  cpuMs: number;
  rssMb: number;
  heapMb: number;
}

type ToChild =
  | { kind: 'start'; cert: string; key: string; hubs: { hubId: string; raw: number[] }[] }
  | { kind: 'stats' }
  | { kind: 'stop' };
type ToParent = { kind: 'ready'; port: number } | ({ kind: 'stats' } & RelayStats);

// ---- child: the relay ----
async function child(): Promise<void> {
  const send = (m: ToParent) => process.send?.(m);
  let relay: Awaited<ReturnType<typeof startRelay>> | null = null;
  process.on('message', (m: ToChild) => {
    void (async () => {
      if (m.kind === 'start') {
        const db = openDb(':memory:');
        const insert = db.prepare(
          'INSERT INTO hubs (id, public_key, created_at, created_ip) VALUES (?, ?, 0, ?)',
        );
        for (const h of m.hubs) insert.run(h.hubId, Buffer.from(h.raw), '127.0.0.0/24');
        relay = await startRelay(testConfig(), {
          db,
          log: silent,
          tls: { cert: m.cert, key: m.key },
          // Every simulated client comes from 127.0.0.1.
          limits: { perIpConcurrent: 1_000_000, perIpPerMinute: 1_000_000 },
        });
        send({ kind: 'ready', port: relay.port });
      } else if (m.kind === 'stats') {
        const cpu = process.cpuUsage();
        const mem = process.memoryUsage();
        send({
          kind: 'stats',
          cpuMs: (cpu.user + cpu.system) / 1000,
          rssMb: mem.rss / 1e6,
          heapMb: mem.heapUsed / 1e6,
        });
      } else {
        await relay?.close();
        process.exit(0);
      }
    })();
  });
}

// ---- parent: hubs, phones and measurements ----
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
}

async function parent(): Promise<void> {
  const { values } = parseArgs({
    options: {
      hubs: { type: 'string', default: '100' },
      streams: { type: 'string', default: '1000' },
      minutes: { type: 'string', default: '10' },
      interval: { type: 'string', default: '250' },
    },
  });
  const hubCount = Number(values.hubs);
  const streamCount = Number(values.streams);
  const durationMs = Number(values.minutes) * 60_000;
  const intervalMs = Number(values.interval);

  const ca = createTestCa();
  const relayCert = ca.issue([`api.${DOMAIN}`, `tunnel.${DOMAIN}`, `join.${DOMAIN}`]);
  const hubCert = ca.issue([`*.h.${DOMAIN}`]);
  const keys = Array.from({ length: hubCount }, () => newHubKey());

  const relayProc = fork(new URL(import.meta.url), ['--child'], { stdio: 'inherit' });
  const pending = new Map<string, (m: ToParent) => void>();
  relayProc.on('message', (m: ToParent) => {
    pending.get(m.kind)?.(m);
  });
  const ask = <K extends ToParent['kind']>(msg: ToChild, kind: K) =>
    new Promise<Extract<ToParent, { kind: K }>>((resolve) => {
      pending.set(kind, (m) => {
        resolve(m as Extract<ToParent, { kind: K }>);
      });
      relayProc.send(msg);
    });
  const { port } = await ask(
    {
      kind: 'start',
      cert: relayCert.cert,
      key: relayCert.key,
      hubs: keys.map((k) => ({ hubId: k.hubId, raw: [...k.raw] })),
    },
    'ready',
  );

  // Hubs: terminate the phone's TLS and send a timestamped event every interval.
  const hubs: FakeHub[] = [];
  for (const k of keys) {
    const hub = connectFakeHub(port, ca.certPem, k);
    hub.onOpen((stream: TunnelStream) => {
      const t = new tls.TLSSocket(stream, {
        isServer: true,
        cert: hubCert.cert,
        key: hubCert.key,
      });
      t.on('error', () => undefined);
      let timer: NodeJS.Timeout | null = null;
      t.once('data', () => {
        t.write('HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\n\r\n');
        timer = setInterval(() => {
          t.write(`data: ${String(Date.now())} ${'x'.repeat(60)}\n\n`);
        }, intervalMs);
      });
      t.on('close', () => {
        if (timer) clearInterval(timer);
      });
    });
    hubs.push(hub);
  }
  const ready = await Promise.all(hubs.map((h) => h.ready));
  const failedHubs = ready.filter((r) => !('hostname' in r)).length;

  // Phones: one long stream each, round robin over the hubs; reconnect if a stream ends.
  const latencies: number[] = [];
  let events = 0;
  let bytes = 0;
  let errors = 0;
  let connectMs: number[] = [];
  let stopping = false;
  const sockets = new Set<tls.TLSSocket>();
  function phone(i: number): void {
    if (stopping) return;
    const host = `${keys[i % hubCount]?.hubId ?? ''}.h.${DOMAIN}`;
    const started = Date.now();
    const s = tls.connect({ host: '127.0.0.1', port, servername: host, ca: ca.certPem });
    sockets.add(s);
    let buf = '';
    s.once('secureConnect', () => {
      connectMs.push(Date.now() - started);
      s.write(`GET /api/events HTTP/1.1\r\nhost: ${host}\r\n\r\n`);
    });
    s.on('data', (d: Buffer) => {
      const now = Date.now();
      bytes += d.length;
      buf += d.toString();
      for (let at = buf.indexOf('\n\n'); at >= 0; at = buf.indexOf('\n\n')) {
        const m = /data: (\d+)/.exec(buf.slice(0, at));
        if (m?.[1]) {
          latencies.push(now - Number(m[1]));
          events++;
        }
        buf = buf.slice(at + 2);
      }
    });
    s.on('error', () => {
      errors++;
    });
    s.on('close', () => {
      sockets.delete(s);
      if (!stopping)
        setTimeout(() => {
          phone(i);
        }, 500);
    });
  }
  // Ramp up over 10 s so the handshakes don't all land in the same tick.
  for (let i = 0; i < streamCount; i++)
    setTimeout(
      () => {
        phone(i);
      },
      (i / streamCount) * 10_000,
    );

  const t0 = Date.now();
  const before = await ask({ kind: 'stats' }, 'stats');
  let last = { t: t0, cpu: before.cpuMs };
  const report = setInterval(() => {
    void ask({ kind: 'stats' }, 'stats').then((st) => {
      const now = Date.now();
      const sorted = latencies.splice(0).sort((a, b) => a - b);
      const cpuPct = ((st.cpuMs - last.cpu) / (now - last.t)) * 100;
      last = { t: now, cpu: st.cpuMs };
      const row =
        `${String(Math.round((now - t0) / 1000)).padStart(4)}s  open ${String(sockets.size).padStart(5)}` +
        `  events ${String(sorted.length).padStart(6)}  p50 ${String(percentile(sorted, 50))}ms` +
        `  p95 ${String(percentile(sorted, 95))}ms  p99 ${String(percentile(sorted, 99))}ms` +
        `  relay cpu ${cpuPct.toFixed(0)}%  rss ${st.rssMb.toFixed(0)}MB  heap ${st.heapMb.toFixed(0)}MB` +
        `  errors ${String(errors)}`;
      process.stdout.write(`${row}\n`);
    });
  }, 30_000);

  await new Promise((r) => setTimeout(r, durationMs));
  clearInterval(report);
  stopping = true;
  const after = await ask({ kind: 'stats' }, 'stats');
  connectMs = connectMs.sort((a, b) => a - b);
  process.stdout.write(
    `\nhubs ${String(hubCount)} (${String(failedHubs)} failed), streams ${String(streamCount)}, ` +
      `${values.minutes} min, event every ${String(intervalMs)} ms\n` +
      `events ${String(events)}, ${(bytes / 1e6).toFixed(1)} MB to phones, errors ${String(errors)}\n` +
      `TLS connect through the relay: p50 ${String(percentile(connectMs, 50))}ms, ` +
      `p95 ${String(percentile(connectMs, 95))}ms\n` +
      `relay: average cpu ${(((after.cpuMs - before.cpuMs) / durationMs) * 100).toFixed(1)}% of one core, ` +
      `rss ${after.rssMb.toFixed(0)}MB, heap ${after.heapMb.toFixed(0)}MB\n`,
  );
  for (const s of sockets) s.destroy();
  for (const h of hubs) h.socket.destroy();
  relayProc.send({ kind: 'stop' } satisfies ToChild);
  await new Promise((r) => relayProc.once('exit', r));
  ca.dispose();
  // Reconnect and ramp-up timers may still be queued.
  process.exit(0);
}

if (process.argv.includes('--child')) await child();
else await parent();
