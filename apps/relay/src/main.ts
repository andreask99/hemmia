import { createPrivateKey, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { accountUrlFor, createAcmeClient } from './acme/client.ts';
import { loadRelayConfig, type RelayConfig, RelayConfigError } from './config.ts';
import { createAuthoritativeWaiter } from './dns/authoritative.ts';
import { createCloudflareDns } from './dns/cloudflare.ts';
import { createLogger } from './logger.ts';
import { startRelay } from './relay.ts';
import { createOwnCertificate } from './tls/certificate.ts';
import { createApnsSender } from './push/apns.ts';
import { createFcmSender, ServiceAccount } from './push/fcm.ts';
import { routeSenders } from './push/index.ts';

let config: RelayConfig;
try {
  config = loadRelayConfig(process.env);
} catch (err) {
  process.stderr.write(
    `${err instanceof RelayConfigError ? err.message : 'Failed to load config'}\n`,
  );
  process.exit(1);
}
const log = createLogger(config.logLevel);

/** The ACME account key and URL live in <dataDir>/acme/ (created on first start). */
function acmeAccount(dataDir: string) {
  const dir = join(dataDir, 'acme');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  const keyFile = join(dir, 'account.pem');
  const urlFile = join(dir, 'account-url.txt');
  if (!existsSync(keyFile)) {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    try {
      // 'wx': never replace a key another start wrote in the meantime.
      writeFileSync(keyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }), {
        mode: 0o600,
        flag: 'wx',
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
  return {
    key: createPrivateKey(readFileSync(keyFile, 'utf8')),
    url: existsSync(urlFile) ? readFileSync(urlFile, 'utf8').trim() : null,
    saveUrl: (u: string) => {
      writeFileSync(urlFile, u, { mode: 0o600 });
    },
  };
}

let issuer: Parameters<typeof startRelay>[1]['issuer'];
if (config.dns.provider === 'cloudflare') {
  const account = acmeAccount(config.dataDir);
  issuer = createAcmeClient({
    directoryUrl: config.acme.directory,
    accountKey: account.key,
    email: config.acme.email,
    dns: createCloudflareDns({ token: config.dns.token, zoneId: config.dns.zoneId }),
    waitForTxt: createAuthoritativeWaiter({ zone: config.domain }),
    accountUrl: accountUrlFor(account.url, config.acme.directory),
    onAccountUrl: account.saveUrl,
  });
}

let tls: { cert: string; key: string };
let own: ReturnType<typeof createOwnCertificate> | null = null;
if (config.dev) {
  tls = config.dev;
} else {
  if (!issuer) {
    log.fatal('production needs a DNS provider for ACME');
    process.exit(1);
  }
  own = createOwnCertificate({
    dataDir: config.dataDir,
    domain: config.domain,
    issuer,
    log,
    onChange: (cert, key) => {
      relay.ownTls.setCertificate(cert, key);
    },
  });
  tls = await own.ensure();
}
// Push: APNs for iOS, FCM for Android, each only when its credentials are configured.
let pushSender: ReturnType<typeof routeSenders> = null;
try {
  pushSender = routeSenders({
    ios:
      config.apns && config.appId
        ? createApnsSender({
            keyPem: readFileSync(config.apns.keyFile, 'utf8'),
            keyId: config.apns.keyId,
            teamId: config.apns.teamId,
            topic: config.appId,
          })
        : null,
    android: config.fcm
      ? createFcmSender({
          serviceAccount: ServiceAccount.parse(
            JSON.parse(readFileSync(config.fcm.serviceAccountFile, 'utf8')),
          ),
          projectId: config.fcm.projectId,
        })
      : null,
  });
} catch {
  log.error('push credentials could not be read; push stays off');
}
const relay = await startRelay(config, {
  log,
  tls,
  ...(issuer ? { issuer } : {}),
  ...(pushSender ? { pushSender } : {}),
});
own?.start();

let closing = false;
async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  own?.stop();
  await relay.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
