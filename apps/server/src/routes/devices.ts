/**
 * Paired devices (SECURITY.md §3): own devices in Settings → Account, any user's devices for
 * admins (labels only). Removing a device ends its sessions and push subscriptions. Owned by
 * Claude.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { DeviceList, GateResponse } from '@hemmia/shared';
import type { Gate } from '../security/gate.ts';
import { currentUser, HttpError, requireAdmin, requireUser } from '../security/http.ts';

const Id = z.uuid();

export function registerDeviceRoutes(app: FastifyInstance, deps: { gate: Gate }): void {
  const list = (req: FastifyRequest, userId: string): DeviceList => ({
    devices: deps.gate.list(userId).map((d) => ({
      id: d.id,
      label: d.label,
      createdAt: d.created_at,
      lastSeenAt: d.last_seen_at,
      current: d.id === req.device,
    })),
  });

  app.get('/api/gate', async (req): Promise<GateResponse> => ({ device: req.device !== null }));

  app.get('/api/devices', { preHandler: requireUser }, async (req): Promise<DeviceList> =>
    list(req, currentUser(req).userId),
  );

  app.delete('/api/devices/:id', { preHandler: requireUser }, async (req, reply) => {
    const { id } = z.object({ id: Id }).parse(req.params);
    if (!deps.gate.remove(currentUser(req).userId, id)) throw new HttpError(404, 'not_found');
    return reply.code(204).send();
  });

  app.get(
    '/api/admin/users/:id/devices',
    { preHandler: requireAdmin },
    async (req): Promise<DeviceList> => {
      const { id } = z.object({ id: z.string().max(64) }).parse(req.params);
      return list(req, id);
    },
  );

  app.delete(
    '/api/admin/users/:id/devices/:deviceId',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const { id, deviceId } = z.object({ id: z.string().max(64), deviceId: Id }).parse(req.params);
      if (!deps.gate.remove(id, deviceId)) throw new HttpError(404, 'not_found');
      return reply.code(204).send();
    },
  );
}
