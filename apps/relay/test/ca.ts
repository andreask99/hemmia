/**
 * A throwaway certificate authority for tests, built with the `openssl` CLI in a temp dir.
 * Issues server certificates for names and signs CSRs (the fake ACME server's CA).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function hasOpenssl(): boolean {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** A P-256 key and a DER CSR for these names (subject CN = first name). */
export function makeCsr(names: string[]): { der: Buffer; key: string } {
  const dir = mkdtempSync(join(tmpdir(), 'relay-csr-'));
  try {
    const run = (args: string[]) =>
      execFileSync('openssl', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    run(['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'k.key']);
    run([
      'req',
      '-new',
      '-key',
      'k.key',
      '-subj',
      `/CN=${names[0] ?? 'x'}`,
      '-addext',
      `subjectAltName=${names.map((n) => `DNS:${n}`).join(',')}`,
      '-outform',
      'DER',
      '-out',
      'r.der',
    ]);
    return { der: readFileSync(join(dir, 'r.der')), key: readFileSync(join(dir, 'k.key'), 'utf8') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export interface TestCa {
  certPem: string;
  /** A P-256 key and certificate for these DNS names. */
  issue(names: string[]): { cert: string; key: string };
  /** Signs a PKCS#10 CSR (DER) for 90 days; returns the leaf PEM. Uses the CSR's SANs. */
  signCsr(csrDer: Buffer, days?: number): string;
  dispose(): void;
}

export function createTestCa(): TestCa {
  const dir = mkdtempSync(join(tmpdir(), 'relay-ca-'));
  const run = (args: string[]) =>
    execFileSync('openssl', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  run(['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'ca.key']);
  run([
    'req',
    '-x509',
    '-new',
    '-key',
    'ca.key',
    '-sha256',
    '-days',
    '30',
    '-subj',
    '/CN=kchat test CA',
    '-addext',
    'basicConstraints=critical,CA:TRUE',
    '-addext',
    'keyUsage=critical,keyCertSign,cRLSign',
    '-out',
    'ca.pem',
  ]);
  let serial = 1;
  const sign = (csrFile: string, ext: string, days: number) => {
    writeFileSync(join(dir, 'ext.cnf'), ext);
    const out = `leaf${String(serial)}.pem`;
    run([
      'x509',
      '-req',
      '-in',
      csrFile,
      '-CA',
      'ca.pem',
      '-CAkey',
      'ca.key',
      '-set_serial',
      String(serial++),
      '-days',
      String(days),
      '-sha256',
      '-extfile',
      'ext.cnf',
      '-out',
      out,
    ]);
    return readFileSync(join(dir, out), 'utf8');
  };
  return {
    certPem: readFileSync(join(dir, 'ca.pem'), 'utf8'),
    issue(names) {
      const n = serial;
      run(['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', `k${String(n)}.key`]);
      run([
        'req',
        '-new',
        '-key',
        `k${String(n)}.key`,
        '-subj',
        `/CN=${names[0] ?? 'x'}`,
        '-out',
        `r${String(n)}.csr`,
      ]);
      const san = names.map((x) => `DNS:${x}`).join(',');
      const cert = sign(
        `r${String(n)}.csr`,
        `subjectAltName=${san}\nextendedKeyUsage=serverAuth\n`,
        30,
      );
      return { cert, key: readFileSync(join(dir, `k${String(n)}.key`), 'utf8') };
    },
    signCsr(csrDer, days = 90) {
      const n = serial;
      writeFileSync(join(dir, `c${String(n)}.der`), csrDer);
      run(['req', '-inform', 'DER', '-in', `c${String(n)}.der`, '-out', `c${String(n)}.csr`]);
      const text = run(['req', '-in', `c${String(n)}.csr`, '-noout', '-text']).toString();
      const san = /DNS:[^\n]+/.exec(text)?.[0]?.trim() ?? '';
      if (san === '') throw new Error('CSR has no subjectAltName');
      return sign(
        `c${String(n)}.csr`,
        `subjectAltName=${san}\nextendedKeyUsage=serverAuth\n`,
        days,
      );
    },
    dispose() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
