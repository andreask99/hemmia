/**
 * join.<relay-domain> (RELAY.md §8): the static join page and the app-link files. No cookies,
 * no analytics, no logging of paths (fragments never reach the server anyway).
 */
import { readFileSync } from 'node:fs';
import type http from 'node:http';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('../../static/join/', import.meta.url));
const HEADERS = {
  'content-security-policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'strict-transport-security': 'max-age=63072000',
  'cache-control': 'public, max-age=300',
};

export interface JoinConfig {
  relayDomain: string;
  appId: string | null;
  teamId: string | null;
  androidCertSha256: string | null;
  appStoreUrl: string | null;
  playStoreUrl: string | null;
}

const attr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function createJoinHandler(c: JoinConfig) {
  const files: Record<string, { type: string; body: string }> = {
    '/join.js': {
      type: 'text/javascript; charset=utf-8',
      body: readFileSync(`${DIR}join.js`, 'utf8'),
    },
    '/parse.js': {
      type: 'text/javascript; charset=utf-8',
      body: readFileSync(`${DIR}parse.js`, 'utf8'),
    },
    '/join.css': { type: 'text/css; charset=utf-8', body: readFileSync(`${DIR}join.css`, 'utf8') },
    '/icon.svg': { type: 'image/svg+xml', body: readFileSync(`${DIR}icon.svg`, 'utf8') },
  };
  const page = readFileSync(`${DIR}join.html`, 'utf8')
    .replace('%RELAY_DOMAIN%', attr(c.relayDomain))
    .replace('%APP_STORE_URL%', attr(c.appStoreUrl ?? ''))
    .replace('%PLAY_STORE_URL%', attr(c.playStoreUrl ?? ''));
  files['/'] = { type: 'text/html; charset=utf-8', body: page };
  files['/j'] = files['/'];
  if (c.appId && c.teamId) {
    files['/.well-known/apple-app-site-association'] = {
      type: 'application/json',
      body: JSON.stringify({
        applinks: {
          details: [{ appIDs: [`${c.teamId}.${c.appId}`], components: [{ '/': '/j*' }] }],
        },
      }),
    };
  }
  if (c.appId && c.androidCertSha256) {
    files['/.well-known/assetlinks.json'] = {
      type: 'application/json',
      body: JSON.stringify([
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: c.appId,
            sha256_cert_fingerprints: [c.androidCertSha256],
          },
        },
      ]),
    };
  }
  return (req: http.IncomingMessage, res: http.ServerResponse): void => {
    const path = (req.url ?? '/').split('?')[0] ?? '/';
    const f = files[path];
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !f) {
      res.writeHead(404, { ...HEADERS, 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    res.writeHead(200, {
      ...HEADERS,
      'content-type': f.type,
      'content-length': Buffer.byteLength(f.body),
    });
    res.end(req.method === 'HEAD' ? undefined : f.body);
  };
}
