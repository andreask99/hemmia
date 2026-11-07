/**
 * Runs the relay end-to-end test (apps/server/src/relay/e2e.test.ts): relay, fake ACME and a
 * full hub in one process. It also runs as part of `npm run check`.
 *   npm run e2e:relay
 */
import { spawnSync } from 'node:child_process';

const r = spawnSync('npx', ['vitest', 'run', '--project', 'server', 'src/relay/e2e.test.ts'], {
  stdio: 'inherit',
});
process.exit(r.status ?? 1);
