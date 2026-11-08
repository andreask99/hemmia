/**
 * The demo's stand-in for a hub: answers the web app's /api requests inside the page, from
 * the made-up family in data.ts, kept in memory (gone when the demo is left). Replies are
 * prepared (replies.ts) and streamed like a model's. Anything that would need a real hub
 * (invites, keys, passwords, model downloads, remote access) is refused, and the page shows
 * a note. Nothing here ever leaves the device.
 */
import type {
  Agent,
  AgentDraft,
  AdminModelsResponse,
  AdminUserListResponse,
  AttachmentRef,
  BriefingKind,
  CatalogResponse,
  ChatSummary,
  CloudSettingsResponse,
  DailySettings,
  DayTask,
  DeviceList,
  ErrorCode,
  Goal,
  Language,
  MeResponse,
  Message,
  ModelsResponse,
  Plan,
  ProfileNote,
  RemoteStatus,
  SessionListResponse,
  StreamEvent,
  SystemCapabilities,
  SystemStatus,
  WebSearchMode,
} from '@hemmia/shared';
import type { z } from 'zod';
import {
  CreateChatRequest,
  CreateGoalRequest,
  CreateTaskRequest,
  MAX_ALSO_PER_DAY,
  MAX_GOALS_PER_AREA,
  PinAgentRequest,
  SaveAgentRequest,
  SaveProfileRequest,
  SendMessageRequest,
  UpdateChatRequest,
  UpdateGoalRequest,
  UpdateMeRequest,
  UpdateTaskRequest,
  AdminUpdateModelsRequest,
  AgentDraftRequest,
  DailySettings as DailySettingsSchema,
  OpenBriefingRequest,
  SetCloudCapRequest,
  AdminPause,
  AdminWebSearch,
  AdminCloud,
} from '@hemmia/shared';
import {
  CHAT_MODELS,
  DAILY,
  DEFAULT_MODEL,
  MEDIA,
  addDays,
  agentTemplates,
  isoDay,
  mediaRef,
  seedAgents,
  seedChats,
  seedPlanner,
  seedProfile,
  weekStart,
} from './data.ts';
import { briefingReply, scriptedReply } from './replies.ts';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const GIB = 1024 ** 3;

interface DemoChat {
  summary: ChatSummary;
  messages: Message[];
  briefing: { kind: BriefingKind; day: string } | null;
}

interface Upload {
  url: string;
  ref: AttachmentRef;
}

interface State {
  lang: Language;
  me: MeResponse;
  chats: Map<string, DemoChat>;
  agents: Agent[];
  goals: Goal[];
  tasks: DayTask[];
  plans: Plan[];
  daily: DailySettings;
  notes: ProfileNote[];
  profileUpdatedAt: number | null;
  paused: boolean;
  webSearch: WebSearchMode;
  cloud: WebSearchMode;
  capCents: number | null;
  disabled: string[];
  defaultChat: string;
  defaultImage: string | null;
}

export interface DemoServerOptions {
  /** Something that needs a real hub was tried. */
  onRefused: () => void;
  /** Sign out: leave the demo. */
  onLeave: () => void;
  /** The language changed and the family's content was rebuilt in it. */
  onReset: () => void;
}

export interface DemoServer {
  handle: (method: string, url: URL, body: unknown, signal: AbortSignal | null) => Response;
  upload: (blob: Blob, fileName: string) => Promise<AttachmentRef>;
  attachmentUrl: (id: string) => string | null;
}

let counter = 0;
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${String(++counter)}`;

function seed(lang: Language, now: number): State {
  const today = isoDay(new Date(now));
  const chats = new Map<string, DemoChat>();
  for (const c of seedChats(lang)) {
    const end = now - c.minutesAgo * MINUTE;
    const start = end - (c.messages.length - 1) * MINUTE;
    const messages: Message[] = c.messages.map((m, i) => ({
      id: `${c.id}-m${String(i)}`,
      chatId: c.id,
      role: m.role,
      content: m.content,
      modelId: m.role === 'assistant' ? DEFAULT_MODEL : null,
      status: 'done',
      attachments: (m.media ?? []).map((x) => mediaRef(x.id, x.kind)),
      searches: m.searches ?? [],
      pages: [],
      notes: [],
      createdAt: start + i * MINUTE,
    }));
    chats.set(c.id, {
      summary: {
        id: c.id,
        title: c.title,
        modelId: DEFAULT_MODEL,
        think: c.think,
        agentId: c.agentId,
        useProfile: true,
        createdAt: start,
        updatedAt: end,
      },
      messages,
      briefing: null,
    });
  }
  const planner = seedPlanner(lang, today);
  return {
    lang,
    me: {
      id: 'demo-anna',
      username: 'anna',
      role: 'admin',
      restricted: false,
      language: lang,
      defaultModelId: null,
    },
    chats,
    agents: seedAgents(lang, now),
    ...planner,
    daily: { ...DAILY },
    notes: seedProfile(lang).map((text, i) => ({
      id: `demo-note-${String(i)}`,
      text,
      createdAt: now - (20 - i) * DAY,
    })),
    profileUpdatedAt: now - 3 * DAY,
    paused: false,
    webSearch: 'all',
    cloud: 'adults',
    capCents: 2000,
    disabled: [],
    defaultChat: DEFAULT_MODEL,
    defaultImage: 'image',
  };
}

// ---------------------------------------------------------------------------
// Responses

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const empty = () => new Response(null, { status: 204 });
const error = (code: ErrorCode, status: number) => json({ error: { code } }, status);
const notFound = () => error('not_found', 404);
const badRequest = () => error('bad_request', 400);

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** A server-sent event stream fed by `run`. Aborting the request ends the stream (the job
 *  itself goes on and saves its reply, as on a hub). */
function eventStream(
  run: (emit: (e: StreamEvent) => void) => Promise<void>,
  signal: AbortSignal | null,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const onAbort = () => {
        if (closed) return;
        closed = true;
        controller.error(new DOMException('Aborted', 'AbortError'));
      };
      signal?.addEventListener('abort', onAbort);
      const emit = (e: StreamEvent) => {
        if (!closed)
          controller.enqueue(encoder.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));
      };
      void run(emit).finally(() => {
        signal?.removeEventListener('abort', onAbort);
        if (!closed) {
          closed = true;
          controller.close();
        }
      });
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

/** The words of the API's paths; any other segment is an id. */
const WORDS = new Set([
  'accept',
  'account',
  'admin',
  'agents',
  'attachments',
  'auth',
  'briefings',
  'cancel',
  'cap',
  'capabilities',
  'catalog',
  'chats',
  'cloud',
  'custom',
  'daily',
  'devices',
  'draft',
  'engines',
  'events',
  'extra',
  'goals',
  'import',
  'invite',
  'invites',
  'job',
  'jobs',
  'key',
  'keys',
  'links',
  'login',
  'logout',
  'logout-all',
  'me',
  'messages',
  'models',
  'native',
  'notes',
  'password',
  'pause',
  'phone',
  'pin',
  'plans',
  'prepare',
  'profile',
  'pulls',
  'push',
  'recover',
  'redeem',
  'remote',
  'resolve',
  'sessions',
  'setup',
  'state',
  'subscription',
  'system',
  'tasks',
  'users',
  'web-search',
  'week',
]);

const BRIEFING_TITLES: Record<Language, Record<BriefingKind, string>> = {
  en: { day: 'Your day', week: 'Planning the week', evening: 'Evening check-in' },
  de: { day: 'Dein Tag', week: 'Wochenplanung', evening: 'Rückblick am Abend' },
};

// ---------------------------------------------------------------------------

export function createDemoServer(lang: Language, options: DemoServerOptions): DemoServer {
  let state = seed(lang, Date.now());
  const uploads = new Map<string, Upload>();
  const jobs = new Map<string, { cancelled: boolean }>();

  const today = () => isoDay(new Date());
  const refused = (code: ErrorCode = 'forbidden') => {
    options.onRefused();
    return error(code, 403);
  };
  const chatList = () =>
    [...state.chats.values()]
      .filter((c) => c.briefing === null)
      .map((c) => c.summary)
      .sort((a, b) => b.updatedAt - a.updatedAt);

  const models = (): ModelsResponse => ({
    chatModels: CHAT_MODELS.filter((m) => !state.disabled.includes(m.id)),
    imageModels: state.defaultImage
      ? [{ id: 'image', label: { en: 'Pictures', de: 'Bilder' } }]
      : [],
    defaultChatModel: state.defaultChat,
    defaultImageModel: state.defaultImage,
    paused: state.paused,
    loaded: [state.defaultChat],
    cloudAllowed: state.cloud !== 'off',
  });

  const adminModels = (): AdminModelsResponse => ({
    models: [
      ...CHAT_MODELS.map((m) => ({
        id: m.id,
        label: m.label,
        kind: 'chat' as const,
        available: true,
        enabled: !state.disabled.includes(m.id),
        installed: true,
        custom: false,
        cloud: false,
      })),
      {
        id: 'image',
        label: { en: 'Pictures', de: 'Bilder' },
        kind: 'image' as const,
        available: true,
        enabled: state.defaultImage !== null,
        installed: true,
        custom: false,
        cloud: false,
      },
    ],
    installedNotOffered: [],
    defaultChatModel: state.defaultChat,
    defaultImageModel: state.defaultImage,
    webSearch: state.webSearch,
    cloud: state.cloud,
  });

  const cloud = (): CloudSettingsResponse => ({
    allowed: state.cloud !== 'off',
    keys: [],
    capCents: state.capCents,
    month: { costCents: 0, inputTokens: 0, outputTokens: 0 },
  });

  const newChat = (body: CreateChatRequest, briefing: DemoChat['briefing']): DemoChat => {
    const now = Date.now();
    const agent = state.agents.find((a) => a.id === body.agentId);
    const modelId = body.modelId ?? agent?.modelId ?? state.me.defaultModelId ?? state.defaultChat;
    const chat: DemoChat = {
      summary: {
        id: newId('c'),
        title: briefing ? BRIEFING_TITLES[state.lang][briefing.kind] : null,
        modelId,
        think: agent?.think ?? false,
        agentId: agent?.id ?? null,
        useProfile: body.useProfile ?? true,
        createdAt: now,
        updatedAt: now,
      },
      messages: [],
      briefing,
    };
    if (agent) agent.lastUsedAt = now;
    state.chats.set(chat.summary.id, chat);
    return chat;
  };

  /** Streams the prepared reply to a message, saving both like a hub does. */
  const reply = (chat: DemoChat, req: SendMessageRequest, signal: AbortSignal | null) => {
    const attachments = req.attachmentIds
      .map((id) => uploads.get(id)?.ref)
      .filter((a): a is AttachmentRef => a !== undefined);
    if (req.modelId) chat.summary.modelId = req.modelId;
    const user: Message = {
      id: newId('m'),
      chatId: chat.summary.id,
      role: 'user',
      content: req.content,
      modelId: null,
      status: 'done',
      attachments,
      searches: [],
      pages: [],
      notes: [],
      createdAt: Date.now(),
    };
    chat.messages.push(user);
    chat.summary.updatedAt = user.createdAt;
    const jobId = newId('j');
    const job = { cancelled: false };
    jobs.set(jobId, job);
    const briefing = req.briefing ?? (req.daily ? 'day' : undefined);

    return eventStream(async (emit) => {
      emit({ type: 'started', jobId, userMessageId: user.id });
      const script = briefing
        ? {
            text: briefingReply(briefing, state.lang, today(), state),
            title: BRIEFING_TITLES[state.lang][briefing],
          }
        : scriptedReply({
            text: req.content,
            photos: attachments.filter((a) => a.mime.startsWith('image/')).length,
            documents: attachments.filter((a) => !a.mime.startsWith('image/')).length,
            lang: state.lang,
          });
      const model = CHAT_MODELS.find((m) => m.id === chat.summary.modelId);
      if (briefing || (chat.summary.think && model?.thinking)) {
        emit({ type: 'thinking', active: true });
        await sleep(1200);
        emit({ type: 'thinking', active: false });
      } else {
        await sleep(350);
      }
      const searches = [];
      const images: AttachmentRef[] = [];
      if ('search' in script && script.search) {
        emit({ type: 'search', query: script.search.query });
        await sleep(900);
        emit({ type: 'sources', search: script.search });
        searches.push(script.search);
      }
      if ('image' in script && script.image) {
        for (let step = 1; step <= 4 && !job.cancelled; step++) {
          emit({ type: 'progress', step, steps: 4 });
          await sleep(600);
        }
        if (!job.cancelled) {
          const image = mediaRef(script.image, 'generated');
          emit({ type: 'image', attachment: image });
          images.push(image);
        }
      }
      let text = '';
      const words = script.text.match(/\S+\s*/g) ?? [];
      for (let i = 0; i < words.length && !job.cancelled; i += 2) {
        const chunk = words.slice(i, i + 2).join('');
        text += chunk;
        emit({ type: 'token', text: chunk });
        await sleep(28);
      }
      const message: Message = {
        id: newId('m'),
        chatId: chat.summary.id,
        role: 'assistant',
        content: text,
        modelId: chat.summary.modelId,
        status: job.cancelled ? 'cancelled' : 'done',
        attachments: images,
        searches,
        pages: [],
        notes: [],
        createdAt: Date.now(),
      };
      chat.messages.push(message);
      chat.summary.updatedAt = message.createdAt;
      if (chat.summary.title === null) chat.summary.title = script.title;
      jobs.delete(jobId);
      emit({ type: 'done', message });
    }, signal);
  };

  const week = (start: string) => {
    const end = addDays(start, 7);
    return {
      week: start,
      today: today(),
      goals: state.goals.filter((g) => g.week === start),
      plans: state.plans.filter((p) => p.date >= start && p.date < end),
      tasks: state.tasks.filter((t) => t.date >= start && t.date < end),
    };
  };

  const system = (): SystemStatus => {
    const now = Date.now();
    return {
      at: now,
      mac: {
        totalBytes: 32 * GIB,
        usedBytes: 22.4 * GIB,
        swapUsedBytes: 0,
        swapTotalBytes: 2 * GIB,
        cpuLoad: 0.08,
        cpus: 10,
      },
      models: [
        {
          engine: 'ollama',
          model: 'gemma4:26b',
          memoryBytes: 19 * GIB,
          kchat: true,
          unloadsAt: now + 22 * MINUTE,
        },
      ],
      activity: { running: null, queued: 0, paused: state.paused },
      services: { ollama: true, searxng: true, imageWorker: 'idle' },
      disk: { data: 1.3 * GIB, imageModels: 12 * GIB, chatModels: 58 * GIB },
      keepAwake: true,
      update: null,
      maintenance: null,
      last24h: { replies: 41, pictures: 5, searches: 7, activeUsers: 3 },
    };
  };

  const parse = <T>(schema: z.ZodType<T>, body: unknown): T | null => {
    const r = schema.safeParse(body);
    return r.success ? r.data : null;
  };

  // -------------------------------------------------------------------------

  function handle(method: string, url: URL, body: unknown, signal: AbortSignal | null): Response {
    const path = url.pathname.replace(/^\/api/, '');
    const seg = path.split('/').filter(Boolean).map(decodeURIComponent);
    // "PATCH /chats/:id": every path segment that isn't one of the API's words is an id.
    const route = `${method} /${seg.map((s, i) => (i > 0 && !WORDS.has(s) ? ':id' : s)).join('/')}`;
    const id = seg[1] ?? '';
    const now = Date.now();

    switch (route) {
      // --- account
      case 'GET /me':
        return json(state.me);
      case 'PATCH /me': {
        const r = parse(UpdateMeRequest, body);
        if (!r) return badRequest();
        if (r.defaultModelId !== undefined) state.me.defaultModelId = r.defaultModelId;
        if (r.language && r.language !== state.lang) {
          // The family's content in the new language (same ids, so the open page stays);
          // chats the visitor started are kept.
          const next = { ...seed(r.language, now), me: { ...state.me, language: r.language } };
          for (const [chatId, chat] of state.chats) {
            if (!chatId.startsWith('demo-')) next.chats.set(chatId, chat);
          }
          state = next;
          setTimeout(options.onReset, 0);
        }
        return json(state.me);
      }
      case 'POST /auth/logout':
        setTimeout(options.onLeave, 0);
        return empty();
      case 'GET /me/sessions':
        return json({
          sessions: [
            {
              id: 'demo-s1',
              deviceLabel: 'iPhone · Hemmia',
              createdAt: now - 30 * DAY,
              lastSeenAt: now,
              current: true,
            },
            {
              id: 'demo-s2',
              deviceLabel: 'Mac · Safari',
              createdAt: now - 60 * DAY,
              lastSeenAt: now - 2 * DAY,
              current: false,
            },
          ],
        } satisfies SessionListResponse);
      case 'GET /devices':
      case 'GET /admin/users/:id/devices':
        return json({
          devices: [
            {
              id: 'demo-d1',
              label: 'iPhone',
              createdAt: now - 30 * DAY,
              lastSeenAt: now,
              current: true,
            },
            {
              id: 'demo-d2',
              label: 'iPad',
              createdAt: now - 45 * DAY,
              lastSeenAt: now - 5 * DAY,
              current: false,
            },
          ],
        } satisfies DeviceList);

      // --- chats
      case 'GET /models':
        return json(models());
      case 'GET /chats':
        return json({ chats: chatList() });
      case 'POST /chats': {
        const r = parse(CreateChatRequest, body ?? {});
        if (!r) return badRequest();
        return json(newChat(r, null).summary, 201);
      }
      case 'GET /chats/:id': {
        const chat = state.chats.get(id);
        return chat ? json(chat.summary) : notFound();
      }
      case 'PATCH /chats/:id': {
        const chat = state.chats.get(id);
        const r = parse(UpdateChatRequest, body);
        if (!chat) return notFound();
        if (!r) return badRequest();
        if (r.title !== undefined) chat.summary.title = r.title;
        if (r.modelId !== undefined) chat.summary.modelId = r.modelId;
        if (r.think !== undefined) chat.summary.think = r.think;
        if (r.agentId !== undefined) chat.summary.agentId = r.agentId;
        if (r.useProfile !== undefined) chat.summary.useProfile = r.useProfile;
        return json(chat.summary);
      }
      case 'DELETE /chats/:id':
        state.chats.delete(id);
        return empty();
      case 'GET /chats/:id/messages': {
        const chat = state.chats.get(id);
        if (!chat) return notFound();
        return json({ messages: [...chat.messages].reverse(), nextCursor: null });
      }
      case 'POST /chats/:id/messages': {
        const chat = state.chats.get(id);
        const r = parse(SendMessageRequest, body);
        if (!chat) return notFound();
        if (!r) return badRequest();
        if (state.paused) return error('paused', 409);
        return reply(chat, r, signal);
      }
      case 'GET /chats/:id/job':
        return json({ jobId: null });
      case 'POST /jobs/:id/cancel': {
        const job = jobs.get(id);
        if (job) job.cancelled = true;
        return empty();
      }
      case 'POST /briefings': {
        const r = parse(OpenBriefingRequest, body);
        if (!r) return badRequest();
        const day = today();
        const existing = [...state.chats.values()].find(
          (c) => c.briefing?.kind === r.kind && c.briefing.day === day,
        );
        if (existing) return json({ chat: existing.summary, created: false });
        return json({ chat: newChat({}, { kind: r.kind, day }).summary, created: true });
      }
      case 'POST /briefings/prepare':
        return json({ started: false });

      // --- agents
      case 'GET /agents':
        return json({ agents: state.agents, templates: agentTemplates(state.lang) });
      case 'POST /agents':
      case 'PUT /agents/:id': {
        const r = parse(SaveAgentRequest, body);
        if (!r) return badRequest();
        const { family, ...fields } = r;
        const old = state.agents.find((a) => a.id === id);
        const agent: Agent = {
          ...fields,
          id: old?.id ?? newId('a'),
          scope: family ? 'family' : 'personal',
          editable: true,
          pinned: old?.pinned ?? true,
          pinOrder: old?.pinOrder ?? state.agents.length,
          lastUsedAt: old?.lastUsedAt ?? null,
          updatedAt: now,
        };
        state.agents = old
          ? state.agents.map((a) => (a.id === agent.id ? agent : a))
          : [...state.agents, agent];
        return json(agent, old ? 200 : 201);
      }
      case 'DELETE /agents/:id':
        state.agents = state.agents.filter((a) => a.id !== id);
        return empty();
      case 'PUT /agents/:id/pin': {
        const r = parse(PinAgentRequest, body);
        const agent = state.agents.find((a) => a.id === id);
        if (!agent) return notFound();
        if (!r) return badRequest();
        agent.pinned = r.pinned;
        agent.pinOrder = r.pinned ? (r.order ?? agent.pinOrder ?? 0) : null;
        return json(agent);
      }
      case 'POST /agents/draft': {
        const r = parse(AgentDraftRequest, body);
        if (!r) return badRequest();
        const words = r.description.split(/\s+/).slice(0, 3).join(' ');
        return json({
          name: (words.charAt(0).toUpperCase() + words.slice(1)).slice(0, 40),
          emoji: '✨',
          description: r.description.slice(0, 120),
          instructions: r.description.slice(0, 1000),
          examples: [],
        } satisfies AgentDraft);
      }

      // --- planner
      case 'GET /daily':
        return json(state.daily);
      case 'PUT /daily': {
        const r = parse(DailySettingsSchema, body);
        if (!r) return badRequest();
        state.daily = r;
        return json(r);
      }
      case 'GET /week': {
        const w = url.searchParams.get('week');
        return json(week(w && /^\d{4}-\d{2}-\d{2}$/.test(w) ? weekStart(w) : weekStart(today())));
      }
      case 'GET /plans':
        return json({ plans: state.plans.filter((p) => p.date >= today()) });
      case 'DELETE /plans/:id':
        state.plans = state.plans.filter((p) => p.id !== id);
        return empty();
      case 'POST /goals': {
        const r = parse(CreateGoalRequest, body);
        if (!r) return badRequest();
        const open = state.goals.filter((g) => g.week === r.week && g.area === r.area);
        if (open.length >= MAX_GOALS_PER_AREA) return error('too_many_goals', 409);
        const goal: Goal = {
          id: newId('g'),
          week: r.week,
          area: r.area,
          text: r.text,
          status: 'open',
          day: r.day ?? null,
          doneOn: null,
        };
        state.goals.push(goal);
        return json(goal, 201);
      }
      case 'PATCH /goals/:id': {
        const r = parse(UpdateGoalRequest, body);
        const goal = state.goals.find((g) => g.id === id);
        if (!goal) return notFound();
        if (!r) return badRequest();
        Object.assign(goal, r);
        if (r.status) goal.doneOn = r.status === 'done' ? today() : null;
        return json(goal);
      }
      case 'DELETE /goals/:id':
        state.goals = state.goals.filter((g) => g.id !== id);
        state.tasks = state.tasks.map((t) => (t.goalId === id ? { ...t, goalId: null } : t));
        return empty();
      case 'POST /tasks': {
        const r = parse(CreateTaskRequest, body);
        if (!r) return badRequest();
        if (
          r.kind === 'also' &&
          state.tasks.filter((t) => t.date === r.date && t.kind === 'also').length >=
            MAX_ALSO_PER_DAY
        ) {
          return error('day_full', 409);
        }
        const task: DayTask = {
          id: newId('t'),
          date: r.date,
          kind: r.kind,
          text: r.text,
          goalId: r.goalId ?? null,
          status: 'open',
        };
        state.tasks.push(task);
        return json(task, 201);
      }
      case 'PATCH /tasks/:id': {
        const r = parse(UpdateTaskRequest, body);
        const task = state.tasks.find((t) => t.id === id);
        if (!task) return notFound();
        if (!r) return badRequest();
        Object.assign(task, r);
        return json(task);
      }
      case 'DELETE /tasks/:id':
        state.tasks = state.tasks.filter((t) => t.id !== id);
        return empty();

      // --- profile
      case 'GET /profile':
        return json({ available: true, notes: state.notes, updatedAt: state.profileUpdatedAt });
      case 'PUT /profile': {
        const r = parse(SaveProfileRequest, body);
        if (!r) return badRequest();
        state.notes = r.notes.map((text, i) => ({
          id: state.notes.find((n) => n.text === text)?.id ?? newId(`n${String(i)}`),
          text,
          createdAt: state.notes.find((n) => n.text === text)?.createdAt ?? now,
        }));
        state.profileUpdatedAt = now;
        return json({ available: true, notes: state.notes, updatedAt: now });
      }
      case 'DELETE /profile':
        state.notes = [];
        state.profileUpdatedAt = now;
        return empty();
      case 'DELETE /profile/notes/:id':
        state.notes = state.notes.filter((n) => n.id !== id);
        return empty();

      // --- cloud models (each person's own key)
      case 'GET /cloud':
        return json(cloud());
      case 'PUT /cloud/cap': {
        const r = parse(SetCloudCapRequest, body);
        if (!r) return badRequest();
        state.capCents = r.capCents;
        return json(cloud());
      }

      // --- admin
      case 'GET /admin/ollama':
        return json({ state: 'external', version: null });
      case 'GET /admin/invites':
        return json({ invites: [] });
      case 'GET /admin/users':
        return json({
          users: [
            {
              id: 'demo-anna',
              username: 'anna',
              role: 'admin',
              restricted: false,
              createdAt: now - 90 * DAY,
              disabledAt: null,
              lastSeenAt: now,
              sessions: 2,
            },
            {
              id: 'demo-ben',
              username: 'ben',
              role: 'member',
              restricted: false,
              createdAt: now - 89 * DAY,
              disabledAt: null,
              lastSeenAt: now - 3 * 60 * MINUTE,
              sessions: 2,
            },
            {
              id: 'demo-mila',
              username: 'mila',
              role: 'member',
              restricted: true,
              createdAt: now - 80 * DAY,
              disabledAt: null,
              lastSeenAt: now - DAY,
              sessions: 1,
            },
          ],
        } satisfies AdminUserListResponse);
      case 'GET /capabilities':
        return json({
          platform: 'darwin',
          arch: 'arm64',
          memoryGiB: 32,
          diskFreeGiB: 312,
          ollama: { reachable: true, version: '0.40.5' },
          images: true,
          webSearch: true,
        } satisfies SystemCapabilities);
      case 'GET /admin/models':
        return json(adminModels());
      case 'PUT /admin/models': {
        const r = parse(AdminUpdateModelsRequest, body);
        if (!r) return badRequest();
        state.disabled = r.disabled;
        if (r.defaultChatModel) state.defaultChat = r.defaultChatModel;
        state.defaultImage = r.defaultImageModel;
        return json(adminModels());
      }
      case 'PUT /admin/pause': {
        const r = parse(AdminPause, body);
        if (!r) return badRequest();
        state.paused = r.paused;
        return json({ paused: state.paused });
      }
      case 'PUT /admin/web-search': {
        const r = parse(AdminWebSearch, body);
        if (!r) return badRequest();
        state.webSearch = r.mode;
        return json({ mode: r.mode });
      }
      case 'PUT /admin/cloud': {
        const r = parse(AdminCloud, body);
        if (!r) return badRequest();
        state.cloud = r.mode;
        return json({ mode: r.mode });
      }
      case 'GET /admin/system':
        return json(system());
      case 'GET /admin/engines':
        return json({
          ollama: { url: 'http://127.0.0.1:11434', reachable: true, version: '0.40.5' },
          custom: [],
        });
      case 'GET /admin/catalog':
        return json({
          memoryGiB: 32,
          entries: CHAT_MODELS.map((m) => ({
            ollamaModel: m.engineModel,
            label: m.label,
            description: m.description ?? { en: '', de: '' },
            downloadGiB: m.id === 'gemma4-12b' ? 8 : 18,
            memoryGiB: m.id === 'gemma4-12b' ? 9 : 19,
            minTotalMemoryGiB: m.id === 'gemma4-12b' ? 16 : 32,
            vision: m.vision,
            tools: true,
            fits: true,
            recommended: m.id === DEFAULT_MODEL,
            installed: true,
          })),
        } satisfies CatalogResponse);
      case 'GET /admin/remote':
        return json({
          relayConfigured: true,
          connect: true,
          hostname: 'demo.h.hemmia.app',
          state: 'connected',
          since: now - 6 * DAY,
          lastError: null,
          certificate: { notAfter: now + 61 * DAY },
          quota: { bytes: Math.round(1.4 * GIB), limitBytes: 20 * GIB },
        } satisfies RemoteStatus);

      // --- notifications: nothing to register in the demo (quietly)
      case 'GET /push/key':
      case 'POST /push/subscription':
      case 'DELETE /push/subscription':
      case 'POST /push/native':
      case 'DELETE /push/native':
        return error('forbidden', 403);
    }

    // Everything else changes the real family or needs a real hub.
    if (method !== 'GET') return refused();
    return notFound();
  }

  async function upload(blob: Blob, fileName: string): Promise<AttachmentRef> {
    const image = blob.type.startsWith('image/');
    let width = 0;
    let height = 0;
    if (image) {
      try {
        const bitmap = await createImageBitmap(blob);
        width = bitmap.width;
        height = bitmap.height;
        bitmap.close();
      } catch {
        // size unknown: shown anyway
      }
    }
    const lower = fileName.toLowerCase();
    const mime: AttachmentRef['mime'] = image
      ? blob.type === 'image/png'
        ? 'image/png'
        : 'image/jpeg'
      : lower.endsWith('.xlsx')
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : lower.endsWith('.docx')
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/pdf';
    const ref: AttachmentRef = {
      id: newId('u'),
      kind: image ? 'upload' : 'document',
      mime,
      width,
      height,
      name: image ? null : fileName,
      pages: image ? null : 1,
      scanPages: 0,
      source: null,
    };
    uploads.set(ref.id, { url: URL.createObjectURL(blob), ref });
    return ref;
  }

  return {
    handle,
    upload,
    attachmentUrl: (id) => MEDIA[id]?.url ?? uploads.get(id)?.url ?? null,
  };
}
