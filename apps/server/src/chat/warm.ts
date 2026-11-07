/**
 * Loads the planner chat model a few minutes before a planner notification is due, so the
 * reply the phone starts when the notification arrives doesn't wait for the model to load.
 * Needs no user key: only the clear notification settings and the user's default model.
 */
import type { DailyRepo } from '../db/daily.ts';
import { localDateTime } from '../db/daily.ts';
import { BusyError, type Scheduler } from '../jobs/scheduler.ts';
import type { LlmClient } from '../llm/types.ts';
import { isCloud, type ModelRegistry, type ResolvedChatModel } from '../models/types.ts';
import { briefingModelId } from './briefings.ts';

/** How long before the notification the model is loaded. */
export const WARM_AHEAD_MS = 3 * 60_000;
/** Long enough to cover the wait until the notification and the phone's request. */
const WARM_KEEP_ALIVE_SECONDS = 10 * 60;
/** The scheduler's user for warm-up jobs (one at a time, like any user). */
const WARM_JOB_USER = 'system:warm';

export function createBriefingWarmer(deps: {
  daily: Pick<DailyRepo, 'due'>;
  registry: ModelRegistry;
  llm: LlmClient;
  scheduler: Scheduler;
  paused: () => boolean;
  now?: () => number;
}) {
  /** "user:kind:date" already handled today. */
  const done = new Set<string>();

  /** Loads one model in a scheduler job (which makes room in memory first). */
  async function load(model: ResolvedChatModel): Promise<void> {
    try {
      const handle = deps.scheduler.submit({
        userId: WARM_JOB_USER,
        kind: 'chat',
        need: { engine: 'ollama', model: model.ollamaModel, memoryGiB: model.memoryGiB },
        timeoutMs: 5 * 60_000,
        run: async ({ signal }) => {
          // An empty chat loads the model and returns. Same context size as replies, or
          // Ollama would load it again for the reply.
          for await (const _ of deps.llm.chat({
            model: model.ollamaModel,
            messages: [],
            think: false,
            contextTokens: model.contextTokens,
            maxOutputTokens: 1,
            keepAliveSeconds: WARM_KEEP_ALIVE_SECONDS,
            signal,
          })) {
            // Nothing to read.
          }
        },
      });
      await handle.finished;
    } catch (err) {
      if (!(err instanceof BusyError)) throw err;
    }
  }

  return {
    /** Loads the models of notifications due within WARM_AHEAD_MS. Returns the models loaded. */
    async check(): Promise<string[]> {
      const nowMs = (deps.now ?? Date.now)();
      const today = localDateTime(nowMs).date;
      const soon = localDateTime(nowMs + WARM_AHEAD_MS);
      for (const key of done) if (!key.endsWith(today)) done.delete(key);
      // Shortly before midnight: tomorrow's notifications are too far off to matter.
      if (soon.date !== today || deps.paused()) return [];
      const models = new Map<string, ResolvedChatModel>();
      for (const due of deps.daily.due(soon.date, soon.weekday, soon.time)) {
        const key = `${due.userId}:${due.kind}:${today}`;
        if (done.has(key)) continue;
        done.add(key);
        const id = await briefingModelId(deps.registry, due);
        const model = id ? await deps.registry.chatModel(id, due) : null;
        // Only Ollama models are warmed (cloud and admin-added servers load on their own).
        if (model && !isCloud(model) && model.engine === 'ollama') {
          models.set(model.ollamaModel, model);
        }
      }
      if (models.size === 0) return [];
      const loaded = new Set((await deps.llm.loaded()).map((m) => m.model));
      const warmed: string[] = [];
      for (const model of models.values()) {
        if (loaded.has(model.ollamaModel)) continue;
        await load(model);
        warmed.push(model.ollamaModel);
      }
      return warmed;
    },
  };
}
