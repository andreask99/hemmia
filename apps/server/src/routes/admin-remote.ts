/**
 * Settings → System → Remote access (P2.12, mockup M9): kchat Connect on, off, forget. Admin
 * only; changes are audited. Owned by Claude.
 */
import type { FastifyInstance } from 'fastify';
import { RemoteRequest, type RemoteStatus } from '@hemmia/shared';
import type { DB } from '../db/database.ts';
import type { RemoteAccess } from '../relay/remote.ts';
import { currentUser, HttpError, requireAdmin } from '../security/http.ts';

export function registerAdminRemoteRoutes(
  app: FastifyInstance,
  deps: { remote: RemoteAccess | null; db: DB; now?: () => number; waitMs?: number },
): void {
  const now = deps.now ?? Date.now;
  const audit = (event: string, userId: string) => {
    deps.db
      .prepare('INSERT INTO audit_log (user_id, event, created_at) VALUES (?, ?, ?)')
      .run(userId, event, now());
  };
  const off: RemoteStatus = {
    relayConfigured: false,
    connect: false,
    hostname: null,
    state: 'off',
    since: 0,
    lastError: null,
    certificate: null,
    quota: null,
  };

  app.get('/api/admin/remote', { preHandler: requireAdmin }, async (): Promise<RemoteStatus> =>
    deps.remote ? deps.remote.status() : off,
  );

  app.post(
    '/api/admin/remote',
    { preHandler: requireAdmin },
    async (req): Promise<RemoteStatus> => {
      const { connect } = RemoteRequest.parse(req.body);
      const remote = deps.remote;
      if (!remote) throw new HttpError(409, 'relay_not_configured');
      const user = currentUser(req);
      if (connect) {
        const s = await remote.enable(deps.waitMs);
        audit('remote_enabled', user.userId);
        return s;
      }
      const s = await remote.disable();
      audit('remote_disabled', user.userId);
      return s;
    },
  );

  app.delete(
    '/api/admin/remote',
    { preHandler: requireAdmin },
    async (req): Promise<RemoteStatus> => {
      const remote = deps.remote;
      if (!remote) throw new HttpError(409, 'relay_not_configured');
      const s = await remote.forget();
      audit('remote_forgotten', currentUser(req).userId);
      return s;
    },
  );
}
