/**
 * Sending a message (streamed reply) and cancelling a job. Owned by Claude.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  type ActiveJobResponse,
  BRIEFING_PROMPTS,
  GenerateImageRequest,
  Id,
  maxMessageChars,
  OpenBriefingRequest,
  type PrepareBriefingResponse,
  type PushPayload,
  SendMessageRequest,
  type StreamEvent,
} from '@hemmia/shared';
import type { Briefings } from '../chat/briefings.ts';
import { startImage } from '../chat/image.ts';
import { startReply, type ReplyDeps } from '../chat/reply.ts';
import { openSse } from '../chat/sse.ts';
import type { AgentRepo } from '../db/agents.ts';
import { profileScopeFor } from '../db/profile.ts';
import { NotFoundError, type UserKey } from '../db/chats.ts';
import { BusyError } from '../jobs/scheduler.ts';
import type { ImageEngine } from '../imagegen/types.ts';
import { isCloud, type ModelRegistry, type ResolvedChatModel } from '../models/types.ts';
import type { AttachmentStore } from '../security/attachments.ts';
import { currentUser, HttpError, requireUser } from '../security/http.ts';
import { createRateLimiter } from '../security/rate-limit.ts';

export interface MessageRouteDeps extends ReplyDeps {
  registry: ModelRegistry;
  /** Image generation; the route is only registered when present. */
  images?: {
    engine: ImageEngine;
    attachments: AttachmentStore;
    /** The family default image model right now (admin settings apply), or null if off. */
    defaultModelId: () => string | null;
  };
  /**
   * True while an admin has paused kchat: sending to a local model is refused before
   * anything is saved (cloud models don't need the Mac).
   */
  paused?: () => boolean;
  /** True when the user's monthly cloud spending cap is reached. */
  overBudget?: (userId: string) => boolean;
  /** Notifies the user's devices; called when a job finishes after the app went away. */
  notify?: (userId: string, payload: PushPayload) => Promise<void>;
  /** Agents (the chat's role); without it chats run without one. */
  agents?: AgentRepo;
  /** Whether these attachments need a model that can see (photos, scanned documents). */
  needsVision?: (user: UserKey, attachmentIds: readonly string[]) => boolean;
  /** Planner chats; without it POST /api/briefings/prepare is not registered. */
  briefings?: Briefings;
}

const ChatParams = z.object({ chatId: Id });
const JobParams = z.object({ jobId: Id });

export function registerMessageRoutes(app: FastifyInstance, deps: MessageRouteDeps): void {
  const { repo, registry, scheduler } = deps;

  /** Pause stops local models only; the cloud spending cap stops cloud models. */
  function checkAvailable(userId: string, model: ResolvedChatModel): void {
    if (isCloud(model)) {
      if (deps.overBudget?.(userId)) throw new HttpError(409, 'over_budget');
    } else if (deps.paused?.()) {
      throw new HttpError(409, 'paused');
    }
  }

  /**
   * Streams a job's events. The job keeps running when the client goes away (a phone that
   * locks drops the connection); if it then finishes, the user's devices are notified.
   * Stopping is explicit (POST /api/jobs/:id/cancel).
   */
  /**
   * Replies running now, so a client whose connection dropped (iOS ends long fetch streams
   * when the screen locks or the app is switched) can attach again. Only the owner may.
   */
  const running = new Map<
    string,
    {
      userId: string;
      userMessageId: string;
      attach: (sink: (event: StreamEvent) => void) => (() => void) | null;
      finished: Promise<void>;
      /** Clients attached through /events right now. */
      watchers: number;
    }
  >();

  async function follow(
    reply: Parameters<typeof openSse>[0],
    user: { userId: string; language: 'en' | 'de' },
    chatId: string,
    started: {
      jobId: string;
      userMessage: { id: string };
      start: (sink: (event: StreamEvent) => void) => void;
      attach?: (sink: (event: StreamEvent) => void) => (() => void) | null;
      finished: Promise<void>;
    },
  ): Promise<void> {
    const sse = openSse(reply);
    const entry = started.attach
      ? {
          userId: user.userId,
          userMessageId: started.userMessage.id,
          attach: started.attach,
          finished: started.finished,
          watchers: 0,
        }
      : null;
    if (entry) running.set(started.jobId, entry);
    let gone = false;
    const result: { done: Extract<StreamEvent, { type: 'done' }>['message'] | null } = {
      done: null,
    };
    sse.send({ type: 'started', jobId: started.jobId, userMessageId: started.userMessage.id });
    sse.onClose(() => {
      gone = true;
    });
    // Set in a callback: read through a function so the check below isn't narrowed away.
    const isGone = (): boolean => gone;
    started.start((event) => {
      if (event.type === 'done') result.done = event.message;
      if (!isGone()) sse.send(event);
    });
    await started.finished;
    running.delete(started.jobId);
    sse.end();
    const message = result.done;
    // Notify only when nobody saw the reply finish (neither this stream nor a re-attached one).
    const watched = (entry?.watchers ?? 0) > 0;
    if (isGone() && !watched && message?.status === 'done' && deps.notify) {
      const kind = message.attachments.some((a) => a.kind === 'generated') ? 'image' : 'reply';
      await deps.notify(user.userId, { kind, chatId, lang: user.language });
    }
  }

  app.get(
    '/api/chats/:chatId/job',
    { preHandler: requireUser },
    async (req): Promise<ActiveJobResponse> => {
      const user = currentUser(req);
      const { chatId } = ChatParams.parse(req.params);
      if (!repo.getChat(user, chatId)) throw new HttpError(404, 'not_found');
      return { jobId: scheduler.activeJobIn(user.userId, chatId) };
    },
  );

  // Long texts (logs, error messages) are allowed up to the model's limit: up to ~1 MB of JSON.
  app.post(
    '/api/chats/:chatId/messages',
    { preHandler: requireUser, bodyLimit: 2 * 1024 * 1024 },
    async (req, reply) => {
      const user = currentUser(req);
      const { chatId } = ChatParams.parse(req.params);
      const body = SendMessageRequest.parse(req.body);

      const chat = repo.getChat(user, chatId);
      if (!chat) throw new HttpError(404, 'not_found');
      let model = await registry.chatModel(body.modelId ?? chat.modelId, user);
      if (!model && body.modelId === undefined) {
        // The chat's model was removed or switched off (or its cloud key was): continue with
        // the user's or the family default, but only on this Mac. Cloud is never chosen for
        // the user here.
        const own = user.defaultModelId
          ? await registry.chatModel(user.defaultModelId, user)
          : null;
        const fallback = registry.defaultChatModelId();
        if (!(own && !isCloud(own)) && fallback === null) throw new HttpError(409, 'no_model');
        model =
          own && !isCloud(own)
            ? own
            : fallback === null
              ? null
              : await registry.chatModel(fallback, user);
      }
      if (!model) throw new HttpError(400, 'bad_request');
      checkAvailable(user.userId, model);
      if (body.content.length > maxMessageChars(model.contextTokens)) {
        throw new HttpError(400, 'too_long');
      }
      // Photos and scanned pages need a model that can see; text documents work with any model.
      const needsVision =
        body.attachmentIds.length > 0 && (deps.needsVision?.(user, body.attachmentIds) ?? true);
      if (needsVision && !model.vision) throw new HttpError(400, 'bad_request');
      if (model.id !== chat.modelId) repo.updateChat(user, chatId, { modelId: model.id });

      const agent = chat.agentId ? (deps.agents?.get(user, chat.agentId) ?? null) : null;

      let started: ReturnType<typeof startReply>;
      try {
        started = startReply(deps, {
          user,
          chatId,
          model,
          agent,
          profile: profileScopeFor(chat),
          ...(body.briefing || body.daily ? { briefing: body.briefing ?? ('day' as const) } : {}),
          ...(() => {
            const kind = repo.briefingOf(user, chatId);
            return kind ? { planningChat: kind } : {};
          })(),
          think: chat.think && model.thinking,
          content: body.content,
          attachmentIds: body.attachmentIds,
        });
      } catch (err) {
        if (err instanceof BusyError) throw new HttpError(409, 'busy');
        if (err instanceof NotFoundError) throw new HttpError(404, 'not_found');
        throw err;
      }

      await follow(reply, user, chatId, started);
    },
  );

  /**
   * The service worker calls this when a planner notification arrives: it starts today's
   * planner chat in the background (as if the app had opened it), so the answer is ready
   * when the user taps the notification. Nothing happens if the chat already has messages.
   * A start that ends without an answer (Mac busy, model error) removes the chat again, so
   * opening it later starts over.
   */
  const briefings = deps.briefings;
  if (briefings) {
    app.post(
      '/api/briefings/prepare',
      { preHandler: requireUser },
      async (req, reply): Promise<PrepareBriefingResponse> => {
        const user = currentUser(req);
        const { kind } = OpenBriefingRequest.parse(req.body);
        reply.code(202);
        if (scheduler.activeJobOf(user.userId)) return { started: false };
        const opened = await briefings.open(user, kind);
        if (!opened?.created) return { started: false };
        const chatId = opened.chat.id;
        const model = await registry.chatModel(opened.chat.modelId, user);
        const available = (() => {
          try {
            if (model) checkAvailable(user.userId, model);
            return model !== null;
          } catch {
            return false;
          }
        })();
        if (!model || !available) {
          // Opening it later starts over (as when the start ends without an answer).
          repo.deleteChat({ userId: user.userId, dek: Buffer.alloc(0) }, chatId);
          return { started: false };
        }
        let started: ReturnType<typeof startReply>;
        try {
          started = startReply(deps, {
            user,
            chatId,
            model,
            agent: null,
            profile: profileScopeFor(opened.chat),
            briefing: kind,
            planningChat: kind,
            think: opened.chat.think && model.thinking,
            content: BRIEFING_PROMPTS[user.language][kind],
            attachmentIds: [],
          });
        } catch (err) {
          if (err instanceof BusyError) return { started: false };
          throw err;
        }
        let answered = false;
        started.start((event) => {
          if (event.type === 'done') answered = true;
        });
        // Only the user id is needed to delete (the request's key is wiped by then).
        const owner = { userId: user.userId, dek: Buffer.alloc(0) };
        void started.finished.then(() => {
          if (!answered) repo.deleteChat(owner, chatId);
        });
        return { started: true };
      },
    );
  }

  const images = deps.images;
  // Image jobs hold the GPU for seconds to minutes; cap them per user.
  const imageLimit = createRateLimiter({
    max: 40,
    windowMs: 60 * 60_000,
    ...(deps.now ? { now: deps.now } : {}),
  });
  if (images) {
    app.post('/api/chats/:chatId/images', { preHandler: requireUser }, async (req, reply) => {
      const user = currentUser(req);
      const { chatId } = ChatParams.parse(req.params);
      const body = GenerateImageRequest.parse(req.body);
      if (deps.paused?.()) throw new HttpError(409, 'paused');
      if (!repo.getChat(user, chatId)) throw new HttpError(404, 'not_found');
      const modelId = body.modelId ?? images.defaultModelId();
      // Restricted accounts get no image models from the registry (policy pending).
      const model = modelId === null ? null : registry.imageModel(modelId, user);
      if (!model) throw new HttpError(403, 'forbidden');
      const limit = imageLimit.hit(user.userId);
      if (!limit.allowed) {
        throw new HttpError(429, 'rate_limited', Math.ceil(limit.retryAfterMs / 1000));
      }

      let started: ReturnType<typeof startImage>;
      try {
        started = startImage(
          { repo, scheduler, engine: images.engine, attachments: images.attachments },
          { user, chatId, model, prompt: body.prompt },
        );
      } catch (err) {
        if (err instanceof BusyError) throw new HttpError(409, 'busy');
        throw err;
      }
      await follow(reply, user, chatId, started);
    });
  }

  // Attach to a running reply again: the reply so far, then the live events (SSE).
  app.get('/api/jobs/:jobId/events', { preHandler: requireUser }, async (req, reply) => {
    const user = currentUser(req);
    const { jobId } = JobParams.parse(req.params);
    const job = running.get(jobId);
    if (!job || job.userId !== user.userId) throw new HttpError(404, 'not_found');
    const sse = openSse(reply);
    sse.send({ type: 'started', jobId, userMessageId: job.userMessageId });
    const detach = job.attach((event) => {
      sse.send(event);
    });
    if (detach) {
      job.watchers++;
      sse.onClose(() => {
        detach();
        job.watchers--;
      });
      await job.finished;
    }
    sse.end();
  });

  app.post('/api/jobs/:jobId/cancel', { preHandler: requireUser }, async (req, reply) => {
    const user = currentUser(req);
    const { jobId } = JobParams.parse(req.params);
    if (!scheduler.cancel(jobId, user.userId)) throw new HttpError(404, 'not_found');
    return reply.code(204).send();
  });
}
