/**
 * Admin command line (testable core). Entry point: admin-main.ts (`npm run admin -- <command>`).
 */
import type { OverrideStore } from '../models/overrides.ts';
import type { Admin } from '../security/admin.ts';
import type { Auth } from '../security/auth.ts';

export interface AdminCliDeps {
  auth: Pick<Auth, 'createInvite'>;
  admin: Admin;
  /** Admin settings (pause). */
  overrides: Pick<OverrideStore, 'get' | 'set'>;
  /** e.g. 'https://hub.tail1234.ts.net' */
  baseUrl: string;
  out: (line: string) => void;
  err: (line: string) => void;
  formatTime: (ms: number) => string;
}

export const USAGE = [
  'Usage: npm run admin -- <command>',
  '  create-invite [--admin] [--restricted]   Create a single-use invite link (valid 7 days)',
  '  list-users                               List accounts',
  '  disable-user <username>                  Disable an account and sign it out everywhere',
  '  enable-user <username>                   Re-enable an account',
  '  restrict <username>                      Turn on teen-account restrictions',
  '  unrestrict <username>                    Turn them off',
  '  pause                                    Pause Hemmia and free its models (e.g. for coding)',
  '  resume                                   Resume Hemmia',
  '  status                                   Show whether Hemmia is paused',
];

function table(rows: string[][]): string[] {
  const widths = rows[0]?.map((_, i) => Math.max(...rows.map((r) => (r[i] ?? '').length))) ?? [];
  return rows.map((r) =>
    r
      .map((cell, i) => cell.padEnd(widths[i] ?? 0))
      .join('  ')
      .trimEnd(),
  );
}

export function runAdmin(argv: readonly string[], deps: AdminCliDeps): number {
  const { admin, out, err } = deps;
  const [command, ...args] = argv;
  const usage = (print: (l: string) => void) => {
    for (const line of USAGE) print(line);
  };

  switch (command) {
    case undefined:
    case 'help':
    case '--help':
      usage(out);
      return 0;

    case 'create-invite': {
      if (args.some((a) => a !== '--admin' && a !== '--restricted')) {
        usage(err);
        return 1;
      }
      const isAdmin = args.includes('--admin');
      const restricted = args.includes('--restricted');
      const invite = deps.auth.createInvite({
        role: isAdmin ? 'admin' : 'member',
        restricted,
        createdBy: null,
      });
      out(
        `Invite for a new ${isAdmin ? 'admin' : 'member'}${restricted ? ', restricted' : ''} account, valid until ${deps.formatTime(invite.expiresAt)}:`,
      );
      out(`${deps.baseUrl}/invite#${invite.code}`);
      out('Send this link privately. It works once.');
      return 0;
    }

    case 'list-users': {
      const users = admin.listUsers();
      if (users.length === 0) {
        out('No users yet.');
        return 0;
      }
      const rows = [
        ['USERNAME', 'ROLE', 'RESTRICTED', 'SESSIONS', 'LAST SEEN', 'STATUS'],
        ...users.map((u) => [
          u.username,
          u.role,
          u.restricted ? 'yes' : 'no',
          String(u.sessions),
          u.lastSeenAt === null ? 'never' : deps.formatTime(u.lastSeenAt),
          u.disabledAt === null ? 'active' : 'disabled',
        ]),
      ];
      for (const line of table(rows)) out(line);
      return 0;
    }

    case 'disable-user':
    case 'enable-user':
    case 'restrict':
    case 'unrestrict': {
      const username = args[0];
      if (!username || args.length > 1) {
        usage(err);
        return 1;
      }
      const ok =
        command === 'disable-user'
          ? admin.disableUser(username)
          : command === 'enable-user'
            ? admin.enableUser(username)
            : admin.setRestricted(username, command === 'restrict');
      if (!ok) {
        err(`No user named ${username}.`);
        return 1;
      }
      const verb = {
        'disable-user': 'Disabled',
        'enable-user': 'Enabled',
        restrict: 'Restricted',
        unrestrict: 'Unrestricted',
      }[command];
      out(`${verb} ${username}.`);
      return 0;
    }

    case 'pause':
    case 'resume': {
      if (args.length > 0) {
        usage(err);
        return 1;
      }
      const paused = command === 'pause';
      deps.overrides.set({ ...deps.overrides.get(), paused });
      out(
        paused
          ? 'Hemmia is paused. Its models are freed within about 20 seconds (after a running reply finishes).'
          : 'Hemmia is running again.',
      );
      return 0;
    }

    case 'status':
      out(deps.overrides.get().paused ? 'Hemmia is paused.' : 'Hemmia is running.');
      return 0;

    default:
      err(`Unknown command: ${command}`);
      usage(err);
      return 1;
  }
}
