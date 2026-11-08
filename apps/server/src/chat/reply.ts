/**
 * Sending a message and streaming the model's reply. Owned by Claude (per-user isolation,
 * key lifetime, scheduler integration).
 *
 * Order matters:
 * 1. reserve the user's scheduler slot (BusyError before anything is written),
 * 2. save the user's message,
 * 3. the route opens the event stream and calls start(); events raised earlier (queue
 *    position) are buffered until then,
 * 4. the job runs when the GPU lane is free, streams tokens, and saves the reply
 *    (done, cancelled or error).
 * The job keeps its own copy of the user's data key and wipes it when it ends.
 */
import type { ChatCompletionsRequest } from '@hemmia/providers';
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import type {
  AttachmentRef,
  Message,
  NotedRef,
  StreamEvent,
  WebPage,
  WebSearch,
} from '@hemmia/shared';
import type { ImageModelConfig } from '../config/schema.ts';
import type { ImageEngine } from '../imagegen/types.ts';
import type { AttachmentStore } from '../security/attachments.ts';
import type { ChatRepo, UserKey } from '../db/chats.ts';
import type { Scheduler } from '../jobs/scheduler.ts';
import {
  type ChatChunk,
  type CloudClient,
  type CloudProvider,
  LlmError,
  type LlmClient,
  type ToolSpec,
} from '../llm/types.ts';
import { isCloud, type ResolvedChatModel } from '../models/types.ts';
import { costMicros } from '../db/cloud.ts';
import { MemoryUnavailableError } from '../jobs/memory.ts';
import { wipe } from '../security/crypto.ts';
import { findLinks } from '../security/links.ts';
import { readLinkedPage } from '../tools/readpage.ts';
import { runWebSearch, WEB_SEARCH_TOOL, WebSearchArgs } from '../tools/websearch.ts';
import { findPhotos, SHOW_PHOTOS_TOOL, ShowPhotosArgs } from '../tools/webphotos.ts';
import { MAX_NOTES_PER_REPLY, REMEMBER_TOOL, RememberArgs } from '../tools/profile.ts';
import type { ProfileRepo, ProfileScope } from '../db/profile.ts';
import {
  ADD_GOAL_TOOL,
  AddGoalArgs,
  goalsText,
  LIST_GOALS_TOOL,
  LIST_PLANS_TOOL,
  ListGoalsArgs,
  ListPlansArgs,
  matchGoal,
  plansText,
  SAVE_PLAN_TOOL,
  SavePlanArgs,
  UPDATE_GOAL_TOOL,
  UpdateGoalArgs,
  SET_DAY_TOOL,
  SetDayArgs,
  UPDATE_TASK_TOOL,
  UpdateTaskArgs,
  matchTask,
  tasksText,
  daysWon,
} from '../tools/plans.ts';
import { addDays, type DailyRepo, localDateTime, weekStart } from '../db/daily.ts';
import { buildContext } from './context.ts';
import { expectedLoadMs, recordLoad } from './loadTimes.ts';
import { dailyPrompt, eveningPrompt, isWeekend, systemPrompt, weekPrompt } from './prompt.ts';

const PLANNER_TOOLS = [
  SAVE_PLAN_TOOL,
  LIST_PLANS_TOOL,
  SET_DAY_TOOL,
  UPDATE_TASK_TOOL,
  ADD_GOAL_TOOL,
  UPDATE_GOAL_TOOL,
  LIST_GOALS_TOOL,
];
const PLANNER_TOOL_NAMES = new Set(PLANNER_TOOLS.map((t) => t.name));
const PLANNER_READ_TOOLS = new Set([LIST_PLANS_TOOL.name, LIST_GOALS_TOOL.name]);

export const CHAT_TIMEOUT_MS = 5 * 60_000;
/** Slowest measured reading speed on this Mac (Qwen3.8 / gemma4 at long context: ~200 tok/s). */
const READ_TOKENS_PER_SECOND = 120;
const MAX_CHAT_TIMEOUT_MS = 30 * 60_000;
/** Above this many prompt tokens the app says it is reading a long text. */
const LONG_PROMPT_TOKENS = 6000;

/** Time a reply may take: 5 minutes plus time to read a long message (dense text estimate). */
export function chatTimeoutMs(contentChars: number): number {
  const tokens = contentChars / 2.5;
  return Math.min(
    MAX_CHAT_TIMEOUT_MS,
    CHAT_TIMEOUT_MS + Math.ceil(tokens / READ_TOKENS_PER_SECOND) * 1000,
  );
}
export const MAX_OUTPUT_TOKENS = 4096;
/** Cloud models: room for reasoning (it counts as output) and a long answer. */
export const CLOUD_MAX_OUTPUT_TOKENS = 32_000;
/** Cloud replies: long reasoning and several searches, but no reading on the Mac. */
export const CLOUD_TIMEOUT_MS = 15 * 60_000;
/** Keep-alive for models that may stay loaded between messages (Ollama's default). */
export const KEEP_ALIVE_SECONDS = 300;
const HISTORY_LIMIT = 200;

/** The tool that lets the chat model make or change pictures. */
export const CREATE_IMAGE_TOOL: ToolSpec = {
  name: 'create_image',
  description:
    'Create a picture, or change a photo the user sent. Call this whenever the user asks for an image, drawing, ' +
    'illustration, picture or photo, or asks to change, edit or restyle their photo. Do not describe the picture ' +
    'in text instead of calling this. To show what a real thing, place, animal or plant looks like, use ' +
    'show_photos instead when it is available.',
  parameters: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description:
          'A detailed visual description in English: subject, setting, style, colours, light. For edits, describe the ' +
          'change and what should stay the same.',
      },
      edit: {
        type: 'boolean',
        description: "True to change the user's most recent photo instead of drawing from scratch.",
      },
      text: {
        type: 'boolean',
        description: 'True if the picture must contain readable words (card, sign, poster).',
      },
    },
    required: ['prompt'],
  },
};

const ToolArgs = z.object({
  prompt: z.string().trim().min(1).max(1000),
  edit: z.boolean().optional(),
  text: z.boolean().optional(),
});

export interface ImageToolDeps {
  engine: ImageEngine;
  attachments: AttachmentStore;
  /** Image models this user may use now: the default, and one that renders text (or null). */
  models: (viewer: { restricted: boolean }) => {
    plain: ImageModelConfig | null;
    text: ImageModelConfig | null;
  };
}

export interface WebSearchDeps {
  searxngUrl: string;
  safeSearch: 0 | 1 | 2;
  /** Tests: replaces the real search. */
  run?: typeof runWebSearch;
}

/** Photos from an image search (same permission as web search); without it no show_photos. */
export interface WebPhotoDeps {
  attachments: AttachmentStore;
  /** Tests: replaces the real image search. */
  run?: typeof findPhotos;
}

/** Pages the user links are read for the model whenever web search is allowed for them. */
export interface WebPageDeps {
  /** Tests: replaces reading a page. */
  read?: typeof readLinkedPage;
}

/** Searches per reply; after that the model must answer. */
export const MAX_SEARCHES = 3;

/** End of a reasoning block some models write into the reply when thinking is off. */
const THINK_END = '</think>';

/**
 * The answer in a round's text that contains "</think>". With thinking off, qwen3.8 sometimes
 * writes a draft, "</think>", then the answer again; or the answer and a stray "</think>"
 * with a short line after it. The last part counts if it is at least half as long as the
 * longest part (a full answer), else the longest part.
 */
export function pickAnswer(text: string): string {
  const parts = text.split(THINK_END).map((p) => p.trim());
  const longest = Math.max(...parts.map((p) => p.length));
  const last = parts.at(-1) ?? '';
  return last.length * 2 >= longest ? last : (parts.find((p) => p.length === longest) ?? '');
}

/**
 * True if a round's text writes one of the tools out instead of calling it: with thinking off,
 * qwen3.8 sometimes ends a reply with "[web_search call …]", a <tool_call> block or the
 * call's JSON, and nothing runs.
 */
export function writesToolCall(text: string, toolNames: string[]): boolean {
  if (text.includes('<tool_call>')) return true;
  return toolNames.some((name) =>
    new RegExp(`\\[\\s*${name}\\b[^\\]\\n]*\\]|"name"\\s*:\\s*"${name}"`).test(text),
  );
}

/** Tool result for a search over the reply's limit (dropping the tool makes qwen3.8 go silent). */
const SEARCH_LIMIT_REACHED =
  'Not searched: the search limit for this reply is reached. Do not search again; write the answer now from the results you have.';

/**
 * Cloud models (each user's own API key). Without it, or without a client for the model's
 * provider, a cloud model's reply ends with 'cloud_unavailable'.
 */
export interface CloudDeps {
  clients: Partial<Record<CloudProvider, CloudClient>>;
  /** The user's key for a provider (decrypted with their data key), or null. */
  key: (user: UserKey, provider: CloudProvider) => string | null;
  /** Adds one model call's tokens and estimated cost (millionths of a dollar) to this month. */
  record: (
    userId: string,
    provider: CloudProvider,
    model: string,
    inputTokens: number,
    outputTokens: number,
    costMicros: number,
  ) => void;
}

/**
 * Admin-added local servers (P1.7, Chat Completions protocol). Without it, a custom model's
 * reply fails like an unreachable engine.
 */
export interface LocalEngineDeps {
  chat: (engineId: string, request: ChatCompletionsRequest) => AsyncIterable<ChatChunk>;
  /** Whether the server has unloaded its model (llama.cpp sleep); false when unknown. */
  sleeping?: (engineId: string) => Promise<boolean>;
}

/** How often, and how long at most, a waking local server is asked whether it's awake. */
const WAKE_POLL_MS = 500;
const WAKE_POLL_MAX_MS = 180_000;

/** The stream error a failed cloud call ends with (expected failures, not bugs). */
function cloudErrorCode(err: unknown): 'cloud_key' | 'cloud_unavailable' | 'refused' | null {
  if (!(err instanceof LlmError)) return null;
  switch (err.code) {
    case 'auth':
      return 'cloud_key';
    case 'refused':
      return 'refused';
    case 'rate_limited':
    case 'overloaded':
    case 'unavailable':
    case 'model_not_found':
      return 'cloud_unavailable';
    default:
      return null;
  }
}

/** Thrown inside a cloud reply when the user has no key for the provider (any more). */
class NoCloudKeyError extends Error {
  override name = 'NoCloudKeyError';
}

export interface ReplyDeps {
  repo: ChatRepo;
  llm: LlmClient;
  scheduler: Scheduler;
  /** Cloud models; without it they can't answer. */
  cloud?: CloudDeps;
  /** Reads a user's attachment as base64 (M3); without it, photos aren't sent. */
  loadImage?: (user: UserKey, attachmentId: string) => Promise<string>;
  /** Reads a user's document text; without it, documents aren't sent. */
  loadDocument?: (user: UserKey, attachmentId: string) => Promise<string | null>;
  /** Reads a user's scanned document pages as base64 JPEGs; without it, scans aren't sent. */
  loadScans?: (user: UserKey, attachmentId: string) => Promise<string[]>;
  /** Pictures from the chat; without it the model gets no image tool. */
  imageTool?: ImageToolDeps;
  /** Planner settings, plans and goals; without it no planner tools and no briefings. */
  daily?: DailyRepo;
  /** Profiles (notes about the user); without it no profile context and no remember tool. */
  profiles?: ProfileRepo;
  /** Web search; without it (or when it returns null for this user) no search tool. */
  webSearch?: (viewer: { restricted: boolean }) => WebSearchDeps | null;
  /** Photos from the web, offered whenever web search is (show_photos). */
  webPhotos?: WebPhotoDeps;
  /** Pages linked in the user's message; read when web search is allowed (any model). */
  webPages?: WebPageDeps;
  /** Admin-added local servers (P1.7). */
  localEngines?: LocalEngineDeps;
  now?: () => number;
}

export interface ReplyInput {
  user: UserKey & { restricted: boolean; language: 'en' | 'de' };
  chatId: string;
  model: ResolvedChatModel;
  /** The chat's "think harder" switch (only honoured for models that can think). */
  think: boolean;
  /** Planner: answer with the morning snapshot, weekly planning or evening check-in. */
  briefing?: 'day' | 'week' | 'evening';
  /** The chat is a planner chat of this kind (follow-ups get its saving rules). */
  planningChat?: 'day' | 'week' | 'evening';
  /** The profile this chat reads and adds to (see profileScopeFor), or null when off. */
  profile?: ProfileScope | null;
  /** The chat's agent, if any: its role and which tools it allows. */
  agent?: { name: string; instructions: string; webSearch: boolean; images: boolean } | null;
  content: string;
  attachmentIds: readonly string[];
}

export interface StartedReply {
  jobId: string;
  userMessage: Message;
  /** Connects the event sink (flushing buffered events) and lets the job run. */
  start: (sink: (event: StreamEvent) => void) => void;
  /**
   * Connects another sink to the running reply (a client whose connection dropped, or that
   * opened the chat later): it gets the reply so far, then the live events. Returns a
   * function that disconnects it, or null when the reply has already ended.
   */
  attach: (sink: (event: StreamEvent) => void) => (() => void) | null;
  /** Cancels the job (client went away). */
  cancel: () => void;
  /** Settles when the job has ended and the key copy is wiped. Never rejects. */
  finished: Promise<void>;
}

export function startReply(deps: ReplyDeps, input: ReplyInput): StartedReply {
  const { repo, llm, scheduler } = deps;
  const now = deps.now ?? Date.now;
  const { model } = input;
  // Where the reply is written: Ollama on this Mac, or the cloud model the user chose. Fixed
  // by the model; there is no fallback from one to the other.
  const cloud = isCloud(model) ? model.engine : null;
  // An admin-added local server: no Ollama loading, memory not managed by kchat.
  const custom = model.engine === 'custom' ? (model.customEngineId ?? null) : null;
  const key: UserKey = { userId: input.user.userId, dek: Buffer.from(input.user.dek) };

  const pending: StreamEvent[] = [];
  let sink: ((event: StreamEvent) => void) | null = null;
  const attached = new Set<(event: StreamEvent) => void>();
  let ended = false;
  /** The reply so far, for clients that attach later (see snapshot). */
  const live = {
    text: '',
    /** Events that add to the reply: pages, sources, notes, photos. */
    parts: [] as StreamEvent[],
    /** The latest status (queued, loading, thinking, searching, painting…), if still current. */
    status: null as StreamEvent | null,
  };
  const track = (event: StreamEvent): void => {
    switch (event.type) {
      case 'token':
        live.text += event.text;
        live.status = null;
        break;
      case 'replace':
        live.text = event.text;
        break;
      case 'reading_pages':
      case 'queued':
      case 'loading':
      case 'reading':
      case 'search':
      case 'progress':
        live.status = event;
        break;
      case 'thinking':
        live.status = event.active ? event : null;
        break;
      case 'page':
      case 'sources':
      case 'noted':
      case 'image':
        live.parts.push(event);
        break;
      default:
        break;
    }
  };
  const send = (event: StreamEvent): void => {
    track(event);
    if (sink) sink(event);
    else pending.push(event);
    for (const s of attached) s(event);
  };
  /** What a client attaching now needs to show the reply as it is. */
  const snapshot = (): StreamEvent[] => [
    ...live.parts,
    ...(live.text !== '' ? [{ type: 'replace' as const, text: live.text }] : []),
    ...(live.status ? [live.status] : []),
  ];

  let letRun: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    letRun = resolve;
  });

  let handle: ReturnType<Scheduler['submit']>;
  try {
    handle = scheduler.submit({
      userId: key.userId,
      chatId: input.chatId,
      kind: 'chat',
      ...(cloud
        ? {
            lane: 'cloud' as const,
            need: { engine: cloud, model: model.ollamaModel, memoryGiB: 0 },
            timeoutMs: CLOUD_TIMEOUT_MS,
          }
        : custom !== null
          ? {
              need: { engine: `custom:${custom}`, model: model.ollamaModel, memoryGiB: 0 },
              timeoutMs: chatTimeoutMs(input.content.length),
            }
          : {
              need: { engine: 'ollama', model: model.ollamaModel, memoryGiB: model.memoryGiB },
              releaseAfter: model.unloadAfterUse,
              timeoutMs: chatTimeoutMs(input.content.length),
            }),
      onQueued: (position) => {
        send({ type: 'queued', position });
      },
      onUnavailable: (code) => {
        send({ type: 'error', code });
      },
      run: async ({ signal, use }) => {
        await ready;
        await runReply(signal, use);
      },
    });
  } catch (err) {
    wipe(key.dek);
    throw err;
  }

  let userMessage: Message;
  try {
    userMessage = repo.addMessage(key, input.chatId, {
      role: 'user',
      content: input.content,
      modelId: null,
      status: 'done',
      attachmentIds: input.attachmentIds,
    });
  } catch (err) {
    scheduler.cancel(handle.id, key.userId);
    letRun();
    wipe(key.dek);
    throw err;
  }

  // Links in the user's own message are read now, while the job waits for the Mac; the
  // reply waits for them. Same permission as web search, but no tool support needed.
  const canReadLinks =
    deps.webPages !== undefined &&
    input.agent?.webSearch !== false &&
    (deps.webSearch?.(input.user) ?? null) !== null;
  const pagesAbort = new AbortController();
  const pagesRead = readPages(pagesAbort.signal);

  /** Reads and stores the pages linked in the user's message. Never rejects. */
  async function readPages(signal: AbortSignal): Promise<void> {
    const pageDeps = deps.webPages;
    const urls = canReadLinks ? findLinks(input.content) : [];
    if (!pageDeps || urls.length === 0) return;
    send({ type: 'reading_pages', urls });
    try {
      const read = pageDeps.read ?? readLinkedPage;
      const results = await Promise.all(urls.map((url) => read(url, { signal })));
      const saved: WebPage[] = repo.addPages(key, userMessage.id, results);
      for (const page of saved) send({ type: 'page', page });
    } catch {
      // Cancelled, or the chat was deleted meanwhile: the reply goes on without pages.
    }
  }

  /** Searches the model ran for this reply (saved with it, whatever the outcome). */
  const searches: WebSearch[] = [];
  /** Profile notes the model saved for this reply (saved with it, for the undo). */
  const noted: NotedRef[] = [];
  /** Photos from the web for this reply (stored unlinked, linked when the reply is saved). */
  const photos: AttachmentRef[] = [];

  function save(content: string, status: Message['status'], usage?: { p: number; o: number }) {
    return repo.addMessage(key, input.chatId, {
      role: 'assistant',
      content,
      modelId: model.id,
      status,
      searches,
      notes: noted,
      attachmentIds: photos.map((p) => p.id),
      ...(usage ? { promptTokens: usage.p, outputTokens: usage.o } : {}),
    });
  }

  async function runReply(
    signal: AbortSignal,
    use: (need: { engine: string; model: string; memoryGiB: number }) => Promise<void>,
  ): Promise<void> {
    await pagesRead;
    const history = repo.listMessages(key, input.chatId, { limit: HISTORY_LIMIT });
    const imageModels = deps.imageTool?.models(input.user) ?? { plain: null, text: null };
    const agent = input.agent ?? null;
    const canCreateImages =
      deps.imageTool !== undefined &&
      model.tools === true &&
      imageModels.plain !== null &&
      agent?.images !== false;
    const search =
      model.tools === true && agent?.webSearch !== false
        ? (deps.webSearch?.(input.user) ?? null)
        : null;
    const webPhotos = search !== null ? (deps.webPhotos ?? null) : null;
    const plans = model.tools === true && deps.daily ? deps.daily : null;
    // Teen accounts have no profile. The model may add to it only from the user's own words:
    // not in a turn with attachments, not while a document or a linked page is in the chat,
    // and not after a web search brought in page text (untrusted text could plant notes).
    const profileScope = input.profile && !input.user.restricted ? input.profile : null;
    const profiles = profileScope && deps.profiles ? deps.profiles : null;
    const profileNotes = profiles && profileScope ? profiles.get(key, profileScope).notes : [];
    const readingInChat = (history?.messages ?? []).some(
      (m) =>
        m.attachments.some((a) => a.kind === 'document') ||
        m.pages.some((p) => p.status === 'read'),
    );
    const mayRemember =
      profiles !== null &&
      model.tools === true &&
      input.attachmentIds.length === 0 &&
      !readingInChat;
    const today = localDateTime(now());
    const thisWeek = weekStart(today.date);
    const weekOf = (ref: 'last' | 'this' | 'next' | null | undefined) =>
      ref === 'next' ? addDays(thisWeek, 7) : ref === 'last' ? addDays(thisWeek, -7) : thisWeek;
    const dayOf = (ref: string | null | undefined) =>
      !ref || ref === 'today' ? today.date : ref === 'tomorrow' ? addDays(today.date, 1) : ref;
    /** Runs a planner tool for this user; returns the text the model gets back. */
    const runPlanTool = (call: { name: string; arguments: unknown }): string => {
      if (!plans) return 'The planner is not available.';
      switch (call.name) {
        case SAVE_PLAN_TOOL.name: {
          const args = SavePlanArgs.safeParse(call.arguments);
          if (!args.success)
            return 'Not saved: pass date as YYYY-MM-DD, optional time as HH:MM, and text.';
          const saved = plans.addPlan(key, {
            date: args.data.date,
            time: args.data.time ?? null,
            text: args.data.text,
          });
          return `Saved: ${plansText([saved]).slice(2)}`;
        }
        case LIST_PLANS_TOOL.name: {
          const args = ListPlansArgs.safeParse(call.arguments);
          if (!args.success) return 'Pass from and to as YYYY-MM-DD.';
          return plansText(plans.plansBetween(key, args.data.from, args.data.to));
        }
        case ADD_GOAL_TOOL.name: {
          const args = AddGoalArgs.safeParse(call.arguments);
          if (!args.success) return 'Not saved: pass area ("work" or "home") and a short text.';
          const added = plans.addGoal(key, {
            week: weekOf(args.data.week),
            area: args.data.area,
            text: args.data.text,
            day: args.data.day ?? null,
          });
          return added
            ? `Saved:\n${goalsText([added])}`
            : `Not saved: that area already has the maximum number of goals for the week.`;
        }
        case UPDATE_GOAL_TOOL.name: {
          const args = UpdateGoalArgs.safeParse(call.arguments);
          if (!args.success) return 'Pass goal (id or text) and what to change.';
          const candidates = [
            ...plans.listGoals(key, thisWeek),
            ...plans.listGoals(key, weekOf('next')),
            ...plans.listGoals(key, weekOf('last')),
          ];
          const goal = matchGoal(candidates, args.data.goal);
          if (typeof goal === 'string') return goal;
          const day = args.data.day;
          const updated = plans.updateGoal(key, goal.id, {
            ...(args.data.status ? { status: args.data.status } : {}),
            ...(args.data.week ? { week: weekOf(args.data.week) } : {}),
            ...(args.data.text ? { text: args.data.text } : {}),
            ...(day !== undefined && day !== null
              ? { day: day === 'none' || day === '' ? null : day }
              : {}),
          });
          return updated
            ? `Updated:\n${goalsText([updated])}`
            : 'Not changed: that week already has the maximum number of goals in this area.';
        }
        case SET_DAY_TOOL.name: {
          const args = SetDayArgs.safeParse(call.arguments);
          if (!args.success) return 'Not saved: pass must_win (short text), optional day and also.';
          const date = dayOf(args.data.day);
          const goals = [
            ...plans.listGoals(key, weekStart(date)),
            ...plans.listGoals(key, thisWeek),
          ];
          /** The goal a model reference (id or text) means, if it clearly means one. */
          const goalOf = (ref: string | null | undefined) => {
            if (!ref) return null;
            const g = matchGoal(goals, ref);
            return typeof g === 'string' ? null : g.id;
          };
          const saved = plans.setDay(key, date, {
            must: { text: args.data.must_win, goalId: goalOf(args.data.must_win_goal) },
            also: (args.data.also ?? []).map((a) => ({ text: a.text, goalId: goalOf(a.goal) })),
          });
          return `Saved the plan for ${date}:\n${tasksText(saved, goals)}`;
        }
        case UPDATE_TASK_TOOL.name: {
          const args = UpdateTaskArgs.safeParse(call.arguments);
          if (!args.success) return 'Pass item (id or text) and what to change.';
          const candidates = [
            ...plans.listTasks(key, today.date, today.date),
            ...plans.listTasks(key, addDays(today.date, 1), addDays(today.date, 1)),
            ...plans.listTasks(key, addDays(today.date, -1), addDays(today.date, -1)),
          ];
          const task = matchTask(candidates, args.data.item);
          if (typeof task === 'string') return task;
          const updated = plans.updateTask(key, task.id, {
            ...(args.data.status ? { status: args.data.status } : {}),
            ...(args.data.day ? { date: dayOf(args.data.day) } : {}),
          });
          return updated
            ? `Updated:\n${tasksText([updated], [])}${updated.date === task.date ? '' : ` (now on ${updated.date})`}`
            : 'Not changed: that day already has its must win or two other items.';
        }
        default: {
          const args = ListGoalsArgs.safeParse(call.arguments ?? {});
          const week = weekOf(args.success ? args.data.week : null);
          return `Week starting ${week}:\n${goalsText(plans.listGoals(key, week))}`;
        }
      }
    };
    /** The remember tool: saves one note to the chat's profile and tells the app. */
    const remember = (raw: unknown): string => {
      const args = RememberArgs.safeParse(raw);
      if (!args.success) return 'Not saved: pass "note", one short sentence.';
      if (!profiles || !profileScope || noted.length >= MAX_NOTES_PER_REPLY) {
        return 'Not saved: enough notes for this reply.';
      }
      const result = profiles.add(key, profileScope, args.data.note);
      if (result.status === 'duplicate') return 'Already in the profile.';
      if (result.status === 'full') {
        return 'Not saved: the profile is full. Tell the user in one sentence they can tidy it up under Settings → Profile.';
      }
      const ref = { id: result.note.id, text: result.note.text };
      noted.push(ref);
      send({ type: 'noted', note: ref });
      return 'Saved to the profile (the app shows it to the user; do not mention it).';
    };
    // Planner briefings: the morning snapshot, weekly planning or the evening check-in.
    let dailyBrief: string | undefined;
    let weekendNearby = 0;
    if (input.briefing && deps.daily) {
      const d = deps.daily;
      const month = 30 * 24 * 3600_000;
      d.prune(key, localDateTime(now() - month).date, addDays(thisWeek, -26 * 7));
      const todayPlans = d.plansBetween(key, today.date, today.date);
      if (input.briefing === 'week') {
        // Friday to Sunday plans the coming week.
        const target = today.weekday >= 5 || today.weekday === 0 ? 'next' : 'this';
        const week = weekOf(target);
        dailyBrief = weekPrompt({
          target,
          weekStart: week,
          lastWeek: d.listGoals(key, addDays(week, -7)),
          lastWeekDays: daysWon(
            d.listTasks(key, addDays(week, -7), addDays(week, -1)),
            addDays(week, -1),
          ),
          goals: d.listGoals(key, week),
          plans: d.plansBetween(key, week, addDays(week, 6)),
          restricted: input.user.restricted,
          language: input.user.language,
        });
      } else if (input.briefing === 'evening') {
        const tomorrow = addDays(today.date, 1);
        dailyBrief = eveningPrompt({
          goals: d.listGoals(key, thisWeek),
          tasks: d.listTasks(key, today.date, today.date),
          tomorrowTasks: d.listTasks(key, tomorrow, tomorrow),
          tomorrowPlans: d.plansBetween(key, tomorrow, tomorrow),
          plans: todayPlans,
          today: today.date,
          weekday: today.weekday,
          language: input.user.language,
        });
      } else {
        const settings = d.getSettings(key);
        if (isWeekend(today.weekday) && settings.town) weekendNearby = settings.nearby.length;
        dailyBrief = dailyPrompt({
          settings,
          plans: todayPlans,
          goals: d.listGoals(key, thisWeek),
          tasks: d.listTasks(key, today.date, today.date),
          leftovers: d
            .listTasks(key, addDays(today.date, -1), addDays(today.date, -1))
            .filter((t) => t.status === 'open'),
          days: daysWon(d.listTasks(key, thisWeek, today.date), today.date),
          today: today.date,
          restricted: input.user.restricted,
          language: input.user.language,
          weekend: isWeekend(today.weekday),
          canSearch: search !== null,
        });
      }
    }
    // The model sees this week's goals and today's and tomorrow's items (with ids) in every
    // chat, to tick them off reliably.
    const weekGoals = plans ? plans.listGoals(key, thisWeek) : [];
    const plannerContext = (() => {
      if (!plans) return '';
      const tomorrow = addDays(today.date, 1);
      const todayTasks = plans.listTasks(key, today.date, today.date);
      const tomorrowTasks = plans.listTasks(key, tomorrow, tomorrow);
      const parts = [];
      if (weekGoals.length > 0) parts.push(`Goals this week:\n${goalsText(weekGoals)}`);
      if (todayTasks.length > 0)
        parts.push(`Today's plan (${today.date}):\n${tasksText(todayTasks, weekGoals)}`);
      if (tomorrowTasks.length > 0)
        parts.push(`Tomorrow's plan (${tomorrow}):\n${tasksText(tomorrowTasks, weekGoals)}`);
      return parts.join('\n');
    })();
    // Follow-ups in the morning snapshot's chat on the weekend may search these places.
    const weekendTown =
      plans && input.planningChat === 'day' && isWeekend(today.weekday)
        ? plans.getSettings(key)
        : null;
    const loadImage = deps.loadImage;
    const loadDocument = deps.loadDocument;
    const loadScans = deps.loadScans;
    const messages = await buildContext({
      system: systemPrompt({
        language: input.user.language,
        restricted: input.user.restricted,
        now: new Date(now()),
        canCreateImages,
        canSearch: search !== null,
        canShowPhotos: webPhotos !== null,
        canPlan: plans !== null,
        canReadLinks,
        ...(profiles
          ? { profile: { notes: profileNotes.map((n) => n.text), canRemember: mayRemember } }
          : {}),
        ...(dailyBrief ? { daily: dailyBrief } : {}),
        ...(plannerContext ? { goals: plannerContext } : {}),
        ...(input.planningChat && !input.briefing ? { planningChat: input.planningChat } : {}),
        ...(weekendTown ? { town: weekendTown.town, nearby: weekendTown.nearby } : {}),
        ...(agent ? { role: { name: agent.name, instructions: agent.instructions } } : {}),
      }),
      messagesNewestFirst: history?.messages ?? [],
      budgetTokens: model.historyBudgetTokens,
      vision: model.vision,
      ...(loadImage ? { loadImage: (id: string) => loadImage(key, id) } : {}),
      ...(loadDocument ? { loadDocument: (id: string) => loadDocument(key, id) } : {}),
      ...(loadScans ? { loadScans: (id: string) => loadScans(key, id) } : {}),
      loadPage: (id: string) => repo.pageText(key, id),
    });

    const onOllama = !cloud && custom === null;
    const loaded = onOllama ? await llm.loaded().catch(() => []) : [];
    const loading = onOllama && !loaded.some((m) => m.model === model.ollamaModel);
    // A local server that put its model to sleep loads it again on this request.
    const sleepingCheck = custom !== null ? deps.localEngines?.sleeping : undefined;
    const waking = custom !== null && sleepingCheck ? await sleepingCheck(custom) : false;
    const loadKey = custom !== null ? `custom:${custom}/${model.ollamaModel}` : model.ollamaModel;
    if (loading || waking) {
      send({
        type: 'loading',
        modelId: model.id,
        expectedMs: expectedLoadMs(loadKey, model.memoryGiB),
      });
    }
    if (waking && custom !== null && sleepingCheck) {
      // The server reports no load time: measure until it says it's awake.
      const start = Date.now();
      void (async () => {
        while (!signal.aborted && Date.now() - start < WAKE_POLL_MAX_MS) {
          await new Promise((resolve) => setTimeout(resolve, WAKE_POLL_MS));
          if (!(await sleepingCheck(custom))) {
            recordLoad(loadKey, Date.now() - start);
            return;
          }
        }
      })();
    }

    // A long text takes minutes to read before the first word on the Mac: say so.
    const promptChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    if (!cloud && promptChars / 3 > LONG_PROMPT_TOKENS) {
      send({ type: 'reading', tokens: Math.round(promptChars / 3) });
    }

    /** One round of the model: Ollama, or the cloud model with the user's key. */
    const thinkOn = model.think === false ? true : model.think;
    let think = input.think ? thinkOn : false;
    const chatRound = (tools: ToolSpec[]): AsyncIterable<ChatChunk> => {
      if (custom !== null) {
        if (!deps.localEngines) throw new LlmError('unavailable');
        return deps.localEngines.chat(custom, {
          model: model.ollamaModel,
          messages,
          think,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          ...(tools.length > 0 ? { tools } : {}),
          signal,
        });
      }
      if (!cloud) {
        return llm.chat({
          model: model.ollamaModel,
          messages,
          think,
          contextTokens: model.contextTokens,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          keepAliveSeconds: model.unloadAfterUse ? 0 : KEEP_ALIVE_SECONDS,
          ...(tools.length > 0 ? { tools } : {}),
          signal,
        });
      }
      const client = deps.cloud?.clients[cloud];
      if (!client) throw new LlmError('unavailable');
      const apiKey = deps.cloud?.key(key, cloud) ?? null;
      if (apiKey === null) throw new NoCloudKeyError();
      return client.chat({
        model: model.ollamaModel,
        apiKey,
        messages,
        think,
        maxOutputTokens: CLOUD_MAX_OUTPUT_TOKENS,
        ...(model.serverFallback ? { serverFallback: true } : {}),
        ...(tools.length > 0 ? { tools } : {}),
        signal,
      });
    };

    // The weekend snapshot searches the weather, then events at home and in each town nearby.
    const maxSearches = Math.max(MAX_SEARCHES, 2 + weekendNearby);
    let content = '';
    let thinking = false;
    let usage: { p: number; o: number } | undefined;
    let toolArgs: unknown = null;
    let retriedWrittenCall = false;
    try {
      // Each round: the model answers, or calls web_search (results go back to it and it
      // continues), or create_image (handled after the loop). Searches are capped.
      for (let round = 0; ; round++) {
        const canRememberNow =
          mayRemember && searches.length === 0 && noted.length < MAX_NOTES_PER_REPLY;
        // Cloud models keep the same tools all reply (a changed tool list invalidates their
        // reasoning from earlier rounds); calls that aren't allowed any more are refused.
        const offerRemember = cloud ? mayRemember : canRememberNow;
        const tools = [
          ...(canCreateImages ? [CREATE_IMAGE_TOOL] : []),
          // Offered even when the searches are used up: extra calls get SEARCH_LIMIT_REACHED.
          ...(search !== null ? [WEB_SEARCH_TOOL] : []),
          // Also kept after its one call (later calls are refused, like searches over the cap).
          ...(webPhotos !== null ? [SHOW_PHOTOS_TOOL] : []),
          ...(plans ? PLANNER_TOOLS : []),
          ...(offerRemember ? [REMEMBER_TOOL] : []),
        ];
        let roundText = '';
        let rawRound = '';
        const roundStart = content.length;
        type Call = { id?: string; name: string; arguments: unknown };
        const searchCalls: Call[] = [];
        const planCalls: Call[] = [];
        const rememberCalls: Call[] = [];
        const photoCalls: Call[] = [];
        let roundReplay: unknown;
        for await (const chunk of chatRound(tools)) {
          if (chunk.type === 'thinking') {
            if (!thinking) {
              thinking = true;
              send({ type: 'thinking', active: true });
            }
          } else if (chunk.type === 'content') {
            if (thinking) {
              thinking = false;
              send({ type: 'thinking', active: false });
            }
            rawRound += chunk.text;
            const next = !cloud && rawRound.includes(THINK_END) ? pickAnswer(rawRound) : rawRound;
            if (next.startsWith(roundText)) {
              const added = next.slice(roundText.length);
              if (added !== '') send({ type: 'token', text: added });
            } else {
              send({ type: 'replace', text: content.slice(0, roundStart) + next });
            }
            roundText = next;
            content = content.slice(0, roundStart) + next;
          } else if (chunk.type === 'tool_call') {
            if (chunk.name === CREATE_IMAGE_TOOL.name && canCreateImages && toolArgs === null) {
              toolArgs = chunk.arguments;
            } else if (chunk.name === WEB_SEARCH_TOOL.name && search !== null) {
              searchCalls.push(chunk);
            } else if (chunk.name === SHOW_PHOTOS_TOOL.name && webPhotos !== null) {
              photoCalls.push(chunk);
            } else if (plans && PLANNER_TOOL_NAMES.has(chunk.name)) {
              planCalls.push(chunk);
            } else if (chunk.name === REMEMBER_TOOL.name && offerRemember) {
              rememberCalls.push(chunk);
            }
          } else {
            if (loading && round === 0) recordLoad(model.ollamaModel, chunk.loadMs);
            usage = {
              p: (usage?.p ?? 0) + chunk.promptTokens,
              o: (usage?.o ?? 0) + chunk.outputTokens,
            };
            roundReplay = chunk.replay;
            if (cloud && model.prices) {
              deps.cloud?.record(
                key.userId,
                cloud,
                model.ollamaModel,
                chunk.promptTokens,
                chunk.outputTokens,
                costMicros(model.prices, chunk.promptTokens, chunk.outputTokens),
              );
            }
          }
        }
        const called =
          toolArgs !== null ||
          searchCalls.length + planCalls.length + rememberCalls.length + photoCalls.length > 0;
        if (
          !cloud &&
          !called &&
          !retriedWrittenCall &&
          writesToolCall(
            roundText,
            tools.map((t) => t.name),
          )
        ) {
          // Drop the written call and run the round once more, thinking if the model can
          // (qwen3.8 then calls tools properly).
          retriedWrittenCall = true;
          if (model.thinking) think = thinkOn;
          content = content.slice(0, roundStart);
          send({ type: 'replace', text: content });
          continue;
        }
        const runSearches = search !== null && searchCalls.length > 0;
        if (
          (!runSearches &&
            planCalls.length === 0 &&
            rememberCalls.length === 0 &&
            photoCalls.length === 0) ||
          toolArgs !== null
        ) {
          break;
        }

        // Run the tools and hand the results back (searches within the remaining budget).
        const calls = runSearches ? searchCalls : [];
        // The photo search is listed with the searches but doesn't use up a web search.
        const budget = maxSearches - searches.length + (photoSearched ? 1 : 0);
        messages.push({
          role: 'assistant',
          content: roundText,
          toolCalls: [...calls, ...planCalls, ...rememberCalls, ...photoCalls],
          ...(roundReplay !== undefined ? { replay: roundReplay } : {}),
        });
        /** A tool result for a call (cloud engines match it to the call by id). */
        const result = (call: Call, content: string) => ({
          role: 'tool' as const,
          toolName: call.name,
          content,
          ...(call.id ? { toolCallId: call.id } : {}),
        });
        for (const call of planCalls) {
          // Planner entries reach later briefings: after a web search in this reply, page text
          // could plant them, so writes wait for the user's next message (security review
          // 2026-11-07, M7). Documents and linked pages the user brought in stay allowed.
          const write = !PLANNER_READ_TOOLS.has(call.name);
          messages.push(
            result(
              call,
              write && searches.length > 0
                ? 'Not saved: the planner is not changed after a web search in the same reply. Tell the user what you would save and ask them to confirm.'
                : runPlanTool(call),
            ),
          );
        }
        for (const call of rememberCalls) {
          messages.push(
            result(
              call,
              canRememberNow
                ? remember(call.arguments)
                : "Not saved: notes can only be saved from the user's own words, not after a web search. Do not mention it.",
            ),
          );
        }
        for (const [i, call] of calls.entries()) {
          if (!search) break;
          const args = WebSearchArgs.safeParse(call.arguments);
          let text: string;
          if (i >= budget) {
            text = SEARCH_LIMIT_REACHED;
          } else if (!args.success) {
            text = 'Invalid search: pass a short "query" string.';
          } else {
            send({ type: 'search', query: args.data.query });
            try {
              const found = await (search.run ?? runWebSearch)(args.data.query, {
                searxngUrl: search.searxngUrl,
                safeSearch: search.safeSearch,
                language: input.user.language,
                signal,
                // Page text may use about a quarter of the context per search.
                budgetChars: Math.min(18_000, Math.floor(model.contextTokens * 3.5 * 0.25)),
              });
              searches.push(found.search);
              send({ type: 'sources', search: found.search });
              text = found.toolResult;
            } catch (err) {
              if (signal.aborted) throw err;
              searches.push({ query: args.data.query, sources: [] });
              text =
                'The search failed (the search service is not reachable). Answer without it and say so briefly.';
            }
          }
          messages.push(result(call, text));
        }
        for (const call of photoCalls) {
          if (!search || !webPhotos) break;
          messages.push(result(call, await showPhotos(call.arguments, search, webPhotos, signal)));
        }
        // Text before a search ("let me look that up") stays in the reply; separate it.
        if (roundText.trim() !== '') {
          content += '\n\n';
          send({ type: 'token', text: '\n\n' });
        }
        if (round > maxSearches + 2) break;
      }
      const args = toolArgs === null ? null : ToolArgs.safeParse(toolArgs);
      if (args?.success && deps.imageTool && imageModels.plain) {
        await createImage(args.data, content, usage, signal, use, deps.imageTool, imageModels);
        return;
      }
      send({ type: 'done', message: save(content, 'done', usage) });
    } catch (err) {
      if (signal.aborted) {
        send({ type: 'done', message: save(content, 'cancelled') });
        return;
      }
      save(content, 'error');
      // A missing or rejected key, a busy provider, a refusal or a model this Ollama can't
      // run: tell the user, not a bug.
      const code =
        err instanceof NoCloudKeyError
          ? 'cloud_key'
          : cloud
            ? cloudErrorCode(err)
            : err instanceof LlmError &&
                (err.code === 'model_unsupported' || err.code === 'model_too_large')
              ? err.code
              : null;
      send({ type: 'error', code: code ?? 'model_error' });
      if (code) return;
      throw err;
    }
  }

  /** Whether this reply already ran its one image search. */
  let photoSearched = false;

  /** Runs the reply's one image search and stores the photos; returns the tool result. */
  async function showPhotos(
    raw: unknown,
    search: WebSearchDeps,
    webPhotos: WebPhotoDeps,
    signal: AbortSignal,
  ): Promise<string> {
    if (photoSearched) return 'Photos are already shown. Write your answer now.';
    const args = ShowPhotosArgs.safeParse(raw);
    if (!args.success) return 'Invalid call: pass a short "query" string.';
    photoSearched = true;
    send({ type: 'search', query: args.data.query });
    try {
      const found = await (webPhotos.run ?? findPhotos)(args.data.query, args.data.count, {
        searxngUrl: search.searxngUrl,
        safeSearch: search.safeSearch,
        language: input.user.language,
        signal,
        save: (bytes, source) => webPhotos.attachments.saveWebPhoto(key, bytes, source),
      });
      photos.push(...found.photos);
      searches.push(found.search);
      send({ type: 'sources', search: found.search });
      for (const attachment of found.photos) send({ type: 'image', attachment });
      return found.toolResult;
    } catch (err) {
      if (signal.aborted) throw err;
      searches.push({ query: args.data.query, sources: [] });
      return 'The photo search failed. Do not mention photos; answer without them.';
    }
  }

  /** Runs the image model for a tool call and saves the reply with the picture attached. */
  async function createImage(
    args: z.infer<typeof ToolArgs>,
    content: string,
    usage: { p: number; o: number } | undefined,
    signal: AbortSignal,
    use: (need: { engine: string; model: string; memoryGiB: number }) => Promise<void>,
    images: ImageToolDeps,
    models: { plain: ImageModelConfig | null; text: ImageModelConfig | null },
  ): Promise<void> {
    const image = (args.text === true ? models.text : null) ?? models.plain;
    if (!image) throw new Error('no image model');
    // For edits: the most recent photo in this chat (uploaded or generated).
    let source: Buffer | undefined;
    if (args.edit === true) {
      const recent = repo.listMessages(key, input.chatId, { limit: 50 })?.messages ?? [];
      const photo = recent.flatMap((m) => m.attachments).find((a) => a.kind !== 'document');
      source = photo ? (await images.attachments.read(key, photo.id))?.bytes : undefined;
    }
    send({ type: 'loading', modelId: image.id });
    try {
      await use({ engine: 'imagegen', model: image.mfluxModel, memoryGiB: image.memoryGiB });
      const png = await images.engine.generate({
        model: image.mfluxModel,
        ...(image.quantize !== undefined ? { quantize: image.quantize } : {}),
        prompt: args.prompt,
        width: image.width,
        height: image.height,
        steps: image.steps,
        seed: randomInt(0, 2 ** 31),
        ...(source ? { sourceImage: source } : {}),
        signal,
        onProgress: (step, steps) => {
          send({ type: 'progress', step, steps });
        },
      });
      const reply = save(content, 'done', usage);
      const attachment = await images.attachments.saveGenerated(key, png, reply.id);
      send({ type: 'image', attachment });
      send({
        type: 'done',
        message: { ...reply, attachments: [...reply.attachments, attachment] },
      });
    } catch (err) {
      if (signal.aborted) {
        send({ type: 'done', message: save(content, 'cancelled') });
        return;
      }
      save(content, 'error');
      // The image model couldn't be loaded (paused, or other work on the Mac): not a failure.
      if (err instanceof MemoryUnavailableError) {
        send({ type: 'error', code: err.code });
        return;
      }
      send({ type: 'error', code: 'model_error' });
      throw err;
    }
  }

  // The key is wiped only when the job has ended and the pages are stored (a job that
  // never ran must not leave reading with a wiped key).
  const finished = Promise.allSettled([handle.finished, pagesRead]).then(() => {
    ended = true;
    attached.clear();
    wipe(key.dek);
  });

  return {
    jobId: handle.id,
    userMessage,
    start: (s) => {
      sink = s;
      for (const event of pending.splice(0)) s(event);
      letRun();
    },
    attach: (s) => {
      if (ended) return null;
      for (const event of snapshot()) s(event);
      attached.add(s);
      return () => {
        attached.delete(s);
      };
    },
    cancel: () => {
      pagesAbort.abort();
      scheduler.cancel(handle.id, key.userId);
      letRun();
    },
    finished,
  };
}
