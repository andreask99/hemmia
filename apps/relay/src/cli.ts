import { openDb, type RelayDb } from './db.ts';
import {
  listHubs,
  blockHub,
  unblockHub,
  stats,
  getMinHubVersion,
  setMinHubVersion,
} from './admin.ts';
import { isVersion } from '@hemmia/relay-protocol';
import { installStats } from './api/manifest.ts';
import { loadRelayConfig } from './config.ts';

export function run(
  argv: string[],
  io: { out(line: string): void; err(line: string): void },
  db: RelayDb,
): number {
  if (argv.length === 0) {
    io.err(
      'usage: node src/cli.ts list-hubs [--blocked] | block-hub <id> <reason...> | unblock-hub <id> | stats | min-hub-version [<x.y.z> | none] | install-stats [days]',
    );
    return 2;
  }

  const command = argv[0];

  switch (command) {
    case 'list-hubs': {
      const blockedOnly = argv.length > 1 && argv[1] === '--blocked';
      const hubs = listHubs(db, { blocked: blockedOnly });

      if (hubs.length === 0) {
        io.out('no hubs');
        return 0;
      }

      for (const hub of hubs) {
        const createdDate = new Date(hub.createdAt).toISOString().slice(0, 10);
        const lastConnectedDate = hub.lastConnectedAt
          ? new Date(hub.lastConnectedAt).toISOString().slice(0, 10)
          : 'never';

        let line = `${hub.id}  created ${createdDate}  last ${lastConnectedDate}`;

        if (hub.blockedAt) {
          line += `  blocked: ${hub.blockedReason}`;
        }

        io.out(line);
      }

      return 0;
    }

    case 'block-hub': {
      if (argv.length < 3) {
        io.err(
          'usage: node src/cli.ts list-hubs [--blocked] | block-hub <id> <reason...> | unblock-hub <id> | stats | min-hub-version [<x.y.z> | none] | install-stats [days]',
        );
        return 2;
      }

      const id = argv[1] ?? '';
      const reason = argv.slice(2).join(' ');

      if (blockHub(db, id, reason)) {
        io.out(`blocked ${id}`);
        return 0;
      } else {
        io.err('unknown hub');
        return 1;
      }
    }

    case 'unblock-hub': {
      if (argv.length < 2) {
        io.err(
          'usage: node src/cli.ts list-hubs [--blocked] | block-hub <id> <reason...> | unblock-hub <id> | stats | min-hub-version [<x.y.z> | none] | install-stats [days]',
        );
        return 2;
      }

      const id = argv[1] ?? '';

      if (unblockHub(db, id)) {
        io.out(`unblocked ${id}`);
        return 0;
      } else {
        io.err('unknown hub');
        return 1;
      }
    }

    case 'min-hub-version': {
      const value = argv[1];
      if (value === undefined) {
        io.out(getMinHubVersion(db) ?? 'none');
        return 0;
      }
      if (value === 'none') {
        setMinHubVersion(db, null);
        io.out('min-hub-version: none');
        return 0;
      }
      if (!isVersion(value)) {
        io.err('min-hub-version needs x.y.z or none');
        return 2;
      }
      setMinHubVersion(db, value);
      io.out(`min-hub-version: ${value} (hubs below it can't connect; they keep working at home)`);
      return 0;
    }

    case 'install-stats': {
      const days = Number(argv[1] ?? '30');
      if (!Number.isInteger(days) || days < 1 || days > 400) {
        io.err('install-stats [days], 1 to 400');
        return 2;
      }
      const rows = installStats(db, days);
      if (rows.length === 0) io.out('no update checks yet');
      for (const r of rows) {
        io.out(
          `${r.day}  ${r.version.padEnd(10)} ${r.platform.padEnd(7)} ${r.channel.padEnd(7)} ${String(r.count)}`,
        );
      }
      return 0;
    }

    case 'stats': {
      const statsResult = stats(db);
      for (const [key, value] of Object.entries(statsResult)) {
        io.out(`${key}: ${value}`);
      }
      return 0;
    }

    default: {
      io.err(
        'usage: node src/cli.ts list-hubs [--blocked] | block-hub <id> <reason...> | unblock-hub <id> | stats | min-hub-version [<x.y.z> | none] | install-stats [days]',
      );
      return 2;
    }
  }
}

if (import.meta.main) {
  const config = loadRelayConfig(process.env);
  const db = openDb(config.dataDir);
  const code = run(
    process.argv.slice(2),
    {
      out: (l) => {
        process.stdout.write(`${l}\n`);
      },
      err: (l) => {
        process.stderr.write(`${l}\n`);
      },
    },
    db,
  );
  db.close();
  process.exitCode = code;
}
