/**
 * Builds the macOS hub package (PLAN.md P6.1, ARCHITECTURE.md §3.5):
 *   node scripts/package/macos.ts [outDir]        (default: dist-package/macos)
 *
 * Bundles a pinned Node 22 (checked against nodejs.org's SHA-256), the server with its
 * production dependencies installed by that Node, the built web app and the configs, then runs
 * pkgbuild and productbuild. With a "Developer ID Installer" identity in the keychain the
 * package is signed, and with HEMMIA_NOTARY_PROFILE (a notarytool keychain profile) notarized
 * and stapled; otherwise it stays unsigned for local tests. HEMMIA_RELAY_DOMAIN goes into the
 * LaunchAgent when set.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  chmodSync,
  readdirSync,
  statSync,
  lstatSync,
  openSync,
  readSync,
  closeSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const NODE_VERSION = '22.23.3';
export const NODE_SHA256 = '23b25245dcfb9af7262f8ff142e9e2e0af025368117329e7a7458a51e5922f53';
const NODE_TARBALL = `node-v${NODE_VERSION}-darwin-arm64.tar.gz`;
const IDENTIFIER = 'app.hemmia.hub';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** The workspaces and folders the hub needs at runtime; everything else is left out. */
export const RUNTIME_PATHS = [
  'package.json',
  'package-lock.json',
  '.npmrc',
  'apps/server',
  'packages/shared',
  'packages/providers',
  'packages/relay-protocol',
  'config',
  'services/imagegen',
  'services/searxng',
];

/** Files that never go into the package: tests, fixtures, caches. */
export function isShipped(path: string): boolean {
  return !/(\.test\.tsx?$|\/tests?\/|\/__pycache__\/|\/\.venv\/|\/\.pytest_cache\/|\/node_modules\/)/.test(
    path,
  );
}

/** Mach-O magic numbers (thin 32/64-bit, both byte orders, and universal). */
const MACHO = new Set(['feedface', 'feedfacf', 'cefaedfe', 'cffaedfe', 'cafebabe', 'bebafeca']);

/** True for a Mach-O executable or library (by its first bytes). */
export function isMachO(head: Buffer): boolean {
  if (head.length < 8 || !MACHO.has(head.subarray(0, 4).toString('hex'))) return false;
  // 0xcafebabe is also a Java class file; a universal binary has a handful of architectures.
  if (head.subarray(0, 4).toString('hex') === 'cafebabe') return head.readUInt32BE(4) < 20;
  return true;
}

/**
 * Notarization needs every program in the package signed with a Developer ID, hardened runtime
 * and a timestamp. Binaries that already are (Node's own) keep their signature; the rest
 * (native modules from npm, mostly unsigned or ad hoc) are signed with ours.
 */
function signBinaries(payload: string, identity: string): number {
  let signed = 0;
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const st = lstatSync(p);
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        walk(p);
        continue;
      }
      if (!st.isFile() || st.size < 4096) continue;
      const fd = openSync(p, 'r');
      const head = Buffer.alloc(8);
      readSync(fd, head, 0, 8, 0);
      closeSync(fd);
      if (!isMachO(head)) continue;
      // codesign -d writes its details to stderr.
      const details = spawnSync('codesign', ['-dvv', p], { encoding: 'utf8' }).stderr;
      if (/Authority=Developer ID Application/.test(details) && /flags=.*runtime/.test(details)) {
        continue;
      }
      run('codesign', ['--force', '--options', 'runtime', '--timestamp', '--sign', identity, p]);
      signed++;
    }
  };
  walk(payload);
  return signed;
}

export function fillTemplate(text: string, values: Record<string, string>): string {
  return text.replace(/__([A-Z_]+)__/g, (m, name: string) => values[name] ?? m);
}

function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): string {
  return execFileSync(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    env: opts.env ?? process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/** Downloads (once) and verifies the pinned Node, then unpacks it into `dest`. */
function bundleNode(dest: string): void {
  const cache = join(homedir(), '.cache', 'hemmia', 'node');
  mkdirSync(cache, { recursive: true });
  const tarball = join(cache, NODE_TARBALL);
  if (!existsSync(tarball)) {
    run('curl', [
      '-fsSL',
      '-o',
      tarball,
      `https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TARBALL}`,
    ]);
  }
  if (sha256(tarball) !== NODE_SHA256) {
    rmSync(tarball);
    throw new Error(`${NODE_TARBALL}: checksum mismatch (download removed)`);
  }
  mkdirSync(dest, { recursive: true });
  run('tar', ['-xzf', tarball, '-C', dest, '--strip-components', '1']);
}

function copyTracked(stage: string): void {
  const files = run('git', ['ls-files', '-z', '--', ...RUNTIME_PATHS])
    .split('\0')
    .filter(Boolean);
  for (const f of files) {
    if (!isShipped(f) || !existsSync(join(ROOT, f))) continue;
    mkdirSync(join(stage, f, '..'), { recursive: true });
    cpSync(join(ROOT, f), join(stage, f));
  }
}

/** npm needs every workspace of the lock file; the staged root lists only the ones shipped. */
function stageRootPackage(stage: string): void {
  const pkg = JSON.parse(readFileSync(join(stage, 'package.json'), 'utf8')) as Record<
    string,
    unknown
  >;
  pkg['workspaces'] = [
    'apps/server',
    'packages/shared',
    'packages/providers',
    'packages/relay-protocol',
  ];
  delete pkg['devDependencies'];
  delete pkg['scripts'];
  writeFileSync(join(stage, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
}

function dirSize(dir: string): number {
  let n = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    n += s.isDirectory() ? dirSize(p) : s.size;
  }
  return n;
}

/** The root package.json version; the install path and pkg version depend on it. */
export function rootVersion(text = readFileSync(join(ROOT, 'package.json'), 'utf8')): string {
  const v = (JSON.parse(text) as { version?: unknown }).version;
  if (typeof v !== 'string' || !/^\d+\.\d+\.\d+$/.test(v))
    throw new Error('package.json needs a version like 1.2.3');
  return v;
}

function main(argv: string[]): void {
  if (process.platform !== 'darwin') throw new Error('macOS only (pkgbuild)');
  const out = resolve(argv[0] ?? join(ROOT, 'dist-package', 'macos'));
  const version = rootVersion();
  const relayDomain = process.env['HEMMIA_RELAY_DOMAIN'] ?? '';
  if (relayDomain !== '' && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(relayDomain))
    throw new Error('bad HEMMIA_RELAY_DOMAIN');

  rmSync(out, { recursive: true, force: true });
  const payload = join(out, 'payload');
  const app = join(payload, 'app');
  const node = join(payload, 'node');
  const scripts = join(out, 'scripts');
  mkdirSync(app, { recursive: true });
  mkdirSync(scripts, { recursive: true });

  process.stdout.write(`Hemmia hub ${version}: Node ${NODE_VERSION}\n`);
  bundleNode(node);

  process.stdout.write('building the web app\n');
  run('npm', ['run', 'build', '-w', '@hemmia/web']);

  process.stdout.write('staging the server\n');
  copyTracked(app);
  cpSync(join(ROOT, 'apps', 'web', 'dist'), join(app, 'apps', 'web', 'dist'), { recursive: true });
  stageRootPackage(app);
  // Production dependencies, installed by the bundled Node so native modules match its ABI.
  const env = {
    ...process.env,
    PATH: `${join(node, 'bin')}:/usr/bin:/bin`,
    npm_config_cache: join(homedir(), '.cache', 'npm'),
  };
  run(
    join(node, 'bin', 'npm'),
    ['install', '--omit=dev', '--no-audit', '--no-fund', '--ignore-scripts=false'],
    { cwd: app, env },
  );
  rmSync(join(app, 'package-lock.json'), { force: true });
  // The runtime needs only node itself, not npm and its headers.
  for (const p of ['lib/node_modules', 'include', 'share', 'bin/npm', 'bin/npx', 'bin/corepack']) {
    rmSync(join(node, p), { recursive: true, force: true });
  }

  mkdirSync(join(payload, 'packaging'), { recursive: true });
  for (const f of ['uninstall.sh', 'tailscale.sh', 'app.hemmia.hub.plist.template']) {
    cpSync(join(ROOT, 'packaging', 'macos', f), join(payload, 'packaging', f));
  }
  chmodSync(join(payload, 'packaging', 'uninstall.sh'), 0o755);
  chmodSync(join(payload, 'packaging', 'tailscale.sh'), 0o755);
  for (const f of ['preinstall', 'postinstall']) {
    const text = fillTemplate(readFileSync(join(ROOT, 'packaging', 'macos', f), 'utf8'), {
      VERSION: version,
      RELAY_DOMAIN: relayDomain,
    });
    writeFileSync(join(scripts, f), text, { mode: 0o755 });
  }
  writeFileSync(
    join(out, 'distribution.xml'),
    fillTemplate(readFileSync(join(ROOT, 'packaging', 'macos', 'distribution.xml'), 'utf8'), {
      VERSION: version,
    }),
  );

  const identities = run('security', ['find-identity', '-v', '-p', 'basic']);
  const application = /"(Developer ID Application: [^"]+)"/.exec(identities)?.[1];
  if (application) {
    process.stdout.write(`signed ${String(signBinaries(payload, application))} binaries\n`);
  }

  process.stdout.write(`payload ${String(Math.round(dirSize(payload) / 1e6))} MB\n`);
  const component = join(out, 'hub.pkg');
  run('pkgbuild', [
    '--root',
    payload,
    '--install-location',
    `/Library/Application Support/Hemmia/${version}`,
    '--scripts',
    scripts,
    '--identifier',
    IDENTIFIER,
    '--version',
    version,
    '--ownership',
    'recommended',
    component,
  ]);
  const unsigned = join(out, `hemmia-hub-${version}-unsigned.pkg`);
  run('productbuild', [
    '--distribution',
    join(out, 'distribution.xml'),
    '--package-path',
    out,
    unsigned,
  ]);

  const installer = /"(Developer ID Installer: [^"]+)"/.exec(identities)?.[1];
  if (!installer) {
    process.stdout.write(`unsigned package (no Developer ID Installer identity): ${unsigned}\n`);
    return;
  }
  const signed = join(out, `hemmia-hub-${version}.pkg`);
  run('productsign', ['--sign', installer, unsigned, signed]);
  rmSync(unsigned);
  // Notarization: a notarytool keychain profile, or an App Store Connect API key file (works
  // when the keychain can't be read, e.g. a locked screen).
  const profile = process.env['HEMMIA_NOTARY_PROFILE'];
  const key = process.env['HEMMIA_NOTARY_KEY'];
  const keyId = process.env['HEMMIA_NOTARY_KEY_ID'];
  const issuer = process.env['HEMMIA_NOTARY_ISSUER'];
  const auth = profile
    ? ['--keychain-profile', profile]
    : key && keyId && issuer
      ? ['--key', key, '--key-id', keyId, '--issuer', issuer]
      : null;
  if (auth) {
    run('xcrun', ['notarytool', 'submit', signed, ...auth, '--wait']);
    run('xcrun', ['stapler', 'staple', signed]);
    process.stdout.write(`signed and notarized: ${signed}\n`);
  } else {
    process.stdout.write(
      `signed, not notarized (set HEMMIA_NOTARY_PROFILE or HEMMIA_NOTARY_KEY/_KEY_ID/_ISSUER): ${signed}\n`,
    );
  }
}

if (import.meta.main) main(process.argv.slice(2));
