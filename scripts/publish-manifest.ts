/**
 * Signs an update manifest with the release key and publishes it on the relay (P6.7), where
 * hubs fetch it daily. Until CI signs releases (P8.4), the key lives on the owner's Mac at
 * ~/.config/hemmia/manifest-signing-key.pem (0600); HEMMIA_MANIFEST_KEY overrides the path.
 *   node scripts/publish-manifest.ts --version 0.2.0 --notes https://hemmia.app/releases/0.2.0 \
 *     [--major] [--minimum 0.1.5|none] [--channel stable|beta] [--date YYYY-MM-DD] \
 *     [--mac-url URL --mac-size BYTES --mac-sha256 HEX] [--docker-image IMG --docker-digest sha256:…] \
 *     [--dry-run]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  type Manifest,
  Manifest as ManifestSchema,
  signManifest,
  verifyManifest,
} from '@hemmia/relay-protocol';

const { values } = parseArgs({
  options: {
    version: { type: 'string' },
    notes: { type: 'string' },
    major: { type: 'boolean', default: false },
    minimum: { type: 'string', default: 'none' },
    channel: { type: 'string', default: 'stable' },
    date: { type: 'string' },
    'mac-url': { type: 'string' },
    'mac-size': { type: 'string' },
    'mac-sha256': { type: 'string' },
    'docker-image': { type: 'string' },
    'docker-digest': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

const keyFile =
  process.env['HEMMIA_MANIFEST_KEY'] ?? join(homedir(), '.config/hemmia/manifest-signing-key.pem');
const host = process.env['HEMMIA_RELAY_SSH'] ?? 'ubuntu@api.hemmia.app';
const sshKey = process.env['HEMMIA_RELAY_SSH_KEY'] ?? join(homedir(), '.ssh/hemmia-relay.key');

const manifest: Manifest = ManifestSchema.parse({
  v: 1,
  channel: values.channel,
  signedAt: Date.now(),
  latest: {
    version: values.version,
    date: values.date ?? new Date().toISOString().slice(0, 10),
    major: values.major,
    notesUrl: values.notes,
    files: {
      ...(values['mac-url']
        ? {
            mac: {
              url: values['mac-url'],
              size: Number(values['mac-size']),
              sha256: values['mac-sha256'],
            },
          }
        : {}),
      ...(values['docker-image']
        ? { docker: { image: values['docker-image'], digest: values['docker-digest'] } }
        : {}),
    },
  },
  minimum: values.minimum === 'none' ? null : values.minimum,
});

const envelope = signManifest(manifest, readFileSync(keyFile, 'utf8'));
// The key built into hubs must accept it, or hubs would silently ignore this release.
if (!verifyManifest(envelope)) throw new Error('the built-in public key does not match this key');
const json = JSON.stringify(envelope);

if (values['dry-run']) {
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
} else {
  const file = `/srv/relay/data/manifest-${manifest.channel}.json`;
  execFileSync(
    'ssh',
    [
      '-i',
      sshKey,
      '-o',
      'BatchMode=yes',
      host,
      `sudo tee ${file}.tmp >/dev/null && sudo chown 10002:10002 ${file}.tmp && sudo chmod 644 ${file}.tmp && sudo mv ${file}.tmp ${file}`,
    ],
    { input: json, stdio: ['pipe', 'inherit', 'inherit'] },
  );
  process.stdout.write(`Published ${manifest.channel} manifest: ${manifest.latest.version}\n`);
}
