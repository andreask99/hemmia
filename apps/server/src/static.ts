/**
 * Serves the built web app (apps/web/dist) in production: hashed assets cached for a year,
 * index.html never cached, and client-side routes (paths without a file extension) fall
 * back to index.html. Security headers come from the global onSend hook.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import { HttpError } from './security/http.ts';

export async function registerWebApp(app: FastifyInstance, distDir: string): Promise<boolean> {
  if (!existsSync(join(distDir, 'index.html'))) return false;
  await app.register(fastifyStatic, {
    root: distDir,
    wildcard: false,
    index: false,
    dotfiles: 'deny',
    setHeaders: (res, path) => {
      res.header(
        'cache-control',
        path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
    },
  });
  app.get('/*', async (req, reply) => {
    if (req.url.startsWith('/api/') || req.url === '/api') throw new HttpError(404, 'not_found');
    // Missing files are 404, not the app page: after an update an old cached page may ask
    // for an old script, and HTML in its place would break the app (and get cached).
    const path = req.url.split('?')[0] ?? '';
    if (/^\/(assets|icons)\//.test(path) || /\.[a-z0-9]+$/i.test(path)) {
      throw new HttpError(404, 'not_found');
    }
    return reply.header('cache-control', 'no-cache').sendFile('index.html');
  });
  return true;
}
