/**
 * The signed-in user's account (sessions, preferences) and admin endpoints.
 * Owned by Claude: sessions and admin access.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  AdminAddModelRequest,
  AdminPause,
  AdminWebSearch,
  AdminCloud,
  type AdminModelsResponse,
  AdminUpdateModelsRequest,
  AdminUpdateUserRequest,
  type AdminInviteListResponse,
  type AdminUserListResponse,
  CreateInviteRequest,
  type CreateInviteResponse,
  type MeResponse,
  type SessionListResponse,
  UpdateMeRequest,
} from '@hemmia/shared';
import type { ModelsFile } from '../config/schema.ts';
import { LlmError } from '../llm/types.ts';
import type { OverrideStore } from '../models/overrides.ts';
import type { ModelRegistry } from '../models/types.ts';
import type { Admin } from '../security/admin.ts';
import type { Auth } from '../security/auth.ts';
import { currentUser, HttpError, requireAdmin, requireUser } from '../security/http.ts';
import { createRateLimiter } from '../security/rate-limit.ts';
import { toMe } from './auth.ts';

export interface AccountRouteDeps {
  auth: Auth;
  admin: Admin;
  /** Optional: validates defaultModelId against the models this user may use. */
  registry?: ModelRegistry;
  /** Base URL for invite links, e.g. https://kchat.tail1234.ts.net */
  inviteBaseUrl: string;
  /** Share and direct links for an invite code (P3.6). */
  inviteLinks?: (code: string) => { shareLink: string | null; directLink: string | null };
  /** Admin model settings; the routes are registered when both are present. */
  models?: { file: ModelsFile; overrides: OverrideStore };
  /** Frees kchat's models right away after a pause (otherwise the periodic sweep does). */
  freeMemory?: () => Promise<void>;
  /** Loads an Ollama model once before it's offered (LlmClient.check). */
  checkModel?: (model: string, signal: AbortSignal) => Promise<void>;
  now?: () => number;
}

const FRESH_SESSION_MS = 15 * 60_000;

/** Loading a large model from disk can take a while; past this, the model is offered anyway. */
const CHECK_TIMEOUT_MS = 180_000;

const SessionParams = z.object({ sessionId: z.string().regex(/^[A-Za-z0-9-]{1,64}$/) });
const UserParams = z.object({ userId: z.string().regex(/^[A-Za-z0-9-]{1,64}$/) });
const InviteParams = z.object({ inviteId: z.string().regex(/^[A-Za-z0-9-]{1,64}$/) });

export function registerAccountRoutes(app: FastifyInstance, deps: AccountRouteDeps): void {
  const { auth, admin } = deps;
  const now = deps.now ?? Date.now;
  const passwordTries = createRateLimiter({
    max: 5,
    windowMs: 15 * 60_000,
    backoff: true,
    ...(deps.now ? { now: deps.now } : {}),
  });

  app.get(
    '/api/me/sessions',
    { preHandler: requireUser },
    async (req): Promise<SessionListResponse> => {
      const user = currentUser(req);
      return {
        sessions: auth
          .listSessions(user.userId)
          .map((s) => ({ ...s, current: s.id === user.sessionId })),
      };
    },
  );

  app.delete('/api/me/sessions/:sessionId', { preHandler: requireUser }, async (req, reply) => {
    const user = currentUser(req);
    const { sessionId } = SessionParams.parse(req.params);
    if (!auth.endSession(user.userId, sessionId)) throw new HttpError(404, 'not_found');
    return reply.code(204).send();
  });

  app.patch('/api/me', { preHandler: requireUser }, async (req): Promise<MeResponse> => {
    const user = currentUser(req);
    const body = UpdateMeRequest.parse(req.body);
    if (typeof body.defaultModelId === 'string' && deps.registry) {
      if (!(await deps.registry.chatModel(body.defaultModelId, user))) {
        throw new HttpError(400, 'bad_request');
      }
    }
    auth.updatePreferences(user.userId, {
      ...(body.language !== undefined ? { language: body.language } : {}),
      ...(body.defaultModelId !== undefined ? { defaultModelId: body.defaultModelId } : {}),
    });
    return toMe({
      ...user,
      ...(body.language !== undefined ? { language: body.language } : {}),
      ...(body.defaultModelId !== undefined ? { defaultModelId: body.defaultModelId } : {}),
    });
  });

  // ---- admin: account metadata only ----

  app.post(
    '/api/admin/invites',
    { preHandler: requireAdmin },
    async (req, reply): Promise<CreateInviteResponse> => {
      const user = currentUser(req);
      const body = CreateInviteRequest.parse(req.body ?? {});
      // A new admin account outlives the session that made it, so an admin invite needs the
      // passphrase: from a session it started less than 15 minutes ago, or typed again. A session
      // from a sign-in link never counts (security review 2026-11-08).
      if (body.role === 'admin') {
        const started = auth.sessionPasswordAt(user.sessionId) ?? 0;
        if (now() - started > FRESH_SESSION_MS) {
          // Asking without a passphrase (to learn whether one is needed) costs no try.
          if (!body.password) throw new HttpError(401, 'invalid_credentials');
          const key = `invite-password:${user.userId}`;
          const r = passwordTries.hit(key);
          if (!r.allowed) {
            throw new HttpError(429, 'rate_limited', Math.max(1, Math.ceil(r.retryAfterMs / 1000)));
          }
          if (!(await auth.verifyPassword(user.userId, body.password))) {
            throw new HttpError(401, 'invalid_credentials');
          }
          passwordTries.reset(key);
        }
      }
      const invite = auth.createInvite({
        role: body.role,
        restricted: body.restricted,
        createdBy: user.userId,
      });
      void reply.code(201);
      return {
        link: `${deps.inviteBaseUrl}/invite#${invite.code}`,
        expiresAt: invite.expiresAt,
        ...(deps.inviteLinks?.(invite.code) ?? { shareLink: null, directLink: null }),
      };
    },
  );

  // Open invites can be withdrawn (security review 2026-11-07: a leaked or stale admin invite).
  app.get(
    '/api/admin/invites',
    { preHandler: requireAdmin },
    async (): Promise<AdminInviteListResponse> => {
      return { invites: admin.listInvites() };
    },
  );

  app.delete('/api/admin/invites/:inviteId', { preHandler: requireAdmin }, async (req, reply) => {
    const { inviteId } = InviteParams.parse(req.params);
    if (!admin.revokeInvite(inviteId, currentUser(req).userId)) {
      throw new HttpError(404, 'not_found');
    }
    return reply.code(204).send();
  });

  app.get(
    '/api/admin/users',
    { preHandler: requireAdmin },
    async (): Promise<AdminUserListResponse> => {
      return { users: admin.listUsers() };
    },
  );

  app.patch('/api/admin/users/:userId', { preHandler: requireAdmin }, async (req, reply) => {
    const user = currentUser(req);
    const { userId } = UserParams.parse(req.params);
    const body = AdminUpdateUserRequest.parse(req.body);
    const target = admin.listUsers().find((u) => u.id === userId);
    if (!target) throw new HttpError(404, 'not_found');
    // An admin can't lock themselves out.
    if (body.disabled === true && userId === user.userId) throw new HttpError(400, 'bad_request');
    if (body.disabled === true) admin.disableUser(target.username);
    if (body.disabled === false) admin.enableUser(target.username);
    if (body.restricted !== undefined) admin.setRestricted(target.username, body.restricted);
    return reply.code(204).send();
  });

  const models = deps.models;
  const registry = deps.registry;
  if (models && registry?.adminList) {
    const adminList = registry.adminList.bind(registry);
    app.get(
      '/api/admin/models',
      { preHandler: requireAdmin },
      async (): Promise<AdminModelsResponse> => {
        return adminList();
      },
    );

    app.put(
      '/api/admin/models',
      { preHandler: requireAdmin },
      async (req): Promise<AdminModelsResponse> => {
        const body = AdminUpdateModelsRequest.parse(req.body);
        const extra = models.overrides.get().extraModels.map((m) => ({ id: m.id, enabled: true }));
        const all = [
          ...models.file.chatModels,
          ...extra,
          ...models.file.cloudModels,
          ...models.file.imageModels,
        ];
        const known = new Set(all.map((m) => m.id));
        if (body.disabled.some((id) => !known.has(id))) throw new HttpError(400, 'bad_request');
        const disabled = new Set(body.disabled);
        // Defaults must be models that are allowed by the config and not switched off.
        const isOn = (id: string, list: readonly { id: string; enabled: boolean }[]) =>
          list.some((m) => m.id === id && m.enabled && !disabled.has(id));
        const localChat = [...models.file.chatModels, ...extra];
        if (
          body.defaultChatModel === null
            ? localChat.some((m) => m.enabled && !disabled.has(m.id))
            : !isOn(body.defaultChatModel, localChat)
        ) {
          throw new HttpError(400, 'bad_request');
        }
        if (
          body.defaultImageModel !== null &&
          !isOn(body.defaultImageModel, models.file.imageModels)
        ) {
          throw new HttpError(400, 'bad_request');
        }
        models.overrides.set({
          ...models.overrides.get(),
          disabled: body.disabled,
          defaultChatModel: body.defaultChatModel,
          defaultImageModel: body.defaultImageModel,
          imagesOff: body.defaultImageModel === null,
        });
        return adminList();
      },
    );

    // Pause: no model loads, kchat's models are freed, so the Mac is free for other work.
    app.put('/api/admin/pause', { preHandler: requireAdmin }, async (req): Promise<AdminPause> => {
      const { paused } = AdminPause.parse(req.body);
      models.overrides.set({ ...models.overrides.get(), paused });
      if (paused) await deps.freeMemory?.();
      return { paused };
    });

    // Web search: off, adults only, or everyone (teens get strict safe search).
    app.put(
      '/api/admin/web-search',
      { preHandler: requireAdmin },
      async (req): Promise<AdminWebSearch> => {
        const { mode } = AdminWebSearch.parse(req.body);
        models.overrides.set({ ...models.overrides.get(), webSearch: mode });
        return { mode };
      },
    );

    // Cloud models (each person's own API key): off, adults only, or everyone.
    app.put('/api/admin/cloud', { preHandler: requireAdmin }, async (req): Promise<AdminCloud> => {
      const { mode } = AdminCloud.parse(req.body);
      models.overrides.set({ ...models.overrides.get(), cloud: mode });
      return { mode };
    });

    // Offer a model that's installed in Ollama but not in config/models.json.
    app.post(
      '/api/admin/models/extra',
      { preHandler: requireAdmin },
      async (req): Promise<AdminModelsResponse> => {
        const body = AdminAddModelRequest.parse(req.body);
        const found = (await adminList()).installedNotOffered.find(
          (m) => m.engineModel === body.engineModel && m.engine === body.engine,
        );
        if (!found) throw new HttpError(400, 'bad_request');
        const custom = body.engine.startsWith('custom:');
        // A model Ollama can't load would only fail later with "did not answer"; other
        // failures (busy, slow disk) don't block offering it. Paused: nothing may load.
        if (!custom && deps.checkModel && !models.overrides.get().paused) {
          try {
            await deps.checkModel(body.engineModel, AbortSignal.timeout(CHECK_TIMEOUT_MS));
          } catch (err) {
            if (err instanceof LlmError && err.code === 'model_unsupported') {
              throw new HttpError(409, 'model_unsupported');
            }
          }
        }
        const current = models.overrides.get();
        const slug = body.engineModel
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        const id = (
          custom ? `c-${body.engine.slice('custom:'.length)}-${slug}` : `x-${slug}`
        ).slice(0, 32);
        models.overrides.set({
          ...current,
          extraModels: [
            ...current.extraModels.filter((m) => m.id !== id),
            // Resident size ≈ download size plus context and runtime overhead.
            {
              id,
              engineModel: body.engineModel,
              label: body.label,
              memoryGiB: custom ? 0 : Math.ceil(found.sizeGiB * 1.15 + 1),
              engine: body.engine,
              vision: custom && body.vision,
              tools: custom && body.tools,
            },
          ],
        });
        return adminList();
      },
    );

    app.delete(
      '/api/admin/models/extra/:id',
      { preHandler: requireAdmin },
      async (req): Promise<AdminModelsResponse> => {
        const { id } = z.object({ id: z.string().max(40) }).parse(req.params);
        const current = models.overrides.get();
        if (!current.extraModels.some((m) => m.id === id)) throw new HttpError(404, 'not_found');
        models.overrides.set({
          ...current,
          extraModels: current.extraModels.filter((m) => m.id !== id),
          disabled: current.disabled.filter((d) => d !== id),
          defaultChatModel: current.defaultChatModel === id ? null : current.defaultChatModel,
        });
        return adminList();
      },
    );
  }
}
