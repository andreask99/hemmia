/**
 * Planner chats (morning snapshot, weekly planning, evening check-in): one hidden chat per
 * kind and day, kept a week. Used by the planner shortcuts and by the phone's service worker,
 * which starts the chat when the notification arrives.
 */
import type { BriefingKind, OpenBriefingResponse } from '@hemmia/shared';
import type { ChatRepo, UserKey } from '../db/chats.ts';
import { addDays, localDateTime } from '../db/daily.ts';
import type { ModelRegistry, ModelViewer } from '../models/types.ts';

/** Planner chats are kept this many days, then deleted. */
const BRIEFING_DAYS = 7;

/** The model planner chats use: the user's own default if they may use it, else the family's. */
export async function briefingModelId(
  registry: ModelRegistry,
  viewer: ModelViewer & { defaultModelId: string | null },
): Promise<string | null> {
  const own =
    viewer.defaultModelId !== null && (await registry.chatModel(viewer.defaultModelId, viewer))
      ? viewer.defaultModelId
      : null;
  const modelId = own ?? registry.defaultChatModelId();
  if (modelId === null) return null;
  return (await registry.chatModel(modelId, viewer)) ? modelId : null;
}

export function createBriefings(deps: {
  repo: ChatRepo;
  registry: ModelRegistry;
  deleteBlobs: (attachmentIds: string[]) => Promise<void>;
  now?: () => number;
}) {
  const { repo, registry, deleteBlobs } = deps;
  return {
    /**
     * Today's chat of this kind if it has messages, else a new one (`created`: it still
     * needs its first message). Deletes planner chats older than a week. Null when no model
     * is available to this user.
     */
    async open(
      user: UserKey & ModelViewer & { defaultModelId: string | null },
      kind: BriefingKind,
    ): Promise<OpenBriefingResponse | null> {
      const today = localDateTime((deps.now ?? Date.now)()).date;
      for (const id of repo.oldBriefings(user, addDays(today, -BRIEFING_DAYS))) {
        const blobs = repo.deleteChat(user, id);
        if (blobs) await deleteBlobs(blobs);
      }
      const existing = repo.findBriefing(user, kind, today);
      if (existing) return { chat: existing, created: false };
      const modelId = await briefingModelId(registry, user);
      if (!modelId) return null;
      return {
        chat: repo.createChat(user, modelId, { briefing: { kind, on: today } }),
        created: true,
      };
    },
  };
}

export type Briefings = ReturnType<typeof createBriefings>;
