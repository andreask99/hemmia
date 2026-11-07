import { z } from 'zod';
import { ErrorCode, type Language } from './auth.ts';

/** Text in every UI language. */
export const LocalizedText = z.object({ en: z.string(), de: z.string() });
export type LocalizedText = z.infer<typeof LocalizedText>;

export const Id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

// ---------------------------------------------------------------------------
// Models

/** Cloud AI providers a user can add an API key for (see cloud.ts). */
export const CloudProvider = z.enum(['anthropic', 'openai', 'openrouter']);
export type CloudProvider = z.infer<typeof CloudProvider>;

export const ChatModelInfo = z.object({
  id: z.string(),
  label: LocalizedText,
  description: LocalizedText.nullable(),
  /** The engine's model name, e.g. "gemma4:26b". */
  engineModel: z.string(),
  /** Size and speed facts for the picker, e.g. "26B MoE · ~45 words/s". */
  details: LocalizedText.nullable(),
  /** Can look at photos. */
  vision: z.boolean(),
  /** Is a reasoning model (shows "Thinking…" while it thinks). */
  thinking: z.boolean(),
  /** Longest message this model can read (characters), see maxMessageChars(). */
  maxMessageChars: z.number().int().positive().default(32_000),
  /**
   * Runs at a cloud provider with the user's own API key: what the chat contains is sent
   * there. Local models (false) never send anything to the cloud.
   */
  cloud: z.boolean().default(false),
  /** The provider of a cloud model, else null. */
  provider: CloudProvider.nullable().default(null),
});
export type ChatModelInfo = z.infer<typeof ChatModelInfo>;

export const ImageModelInfo = z.object({ id: z.string(), label: LocalizedText });
export type ImageModelInfo = z.infer<typeof ImageModelInfo>;

export const ModelsResponse = z.object({
  chatModels: z.array(ChatModelInfo),
  imageModels: z.array(ImageModelInfo),
  /** Null when no chat model is usable (a new hub without models). */
  defaultChatModel: z.string().nullable(),
  /** Null when image generation is off (or not allowed for this account). */
  defaultImageModel: z.string().nullable(),
  /** An admin paused kchat: sending is off until they resume. */
  paused: z.boolean().default(false),
  /** Chat models in memory right now ("Ready": no loading wait). */
  loaded: z.array(z.string()).default([]),
  /** The admin allows cloud models for this account (they still need the user's own key). */
  cloudAllowed: z.boolean().default(false),
});
export type ModelsResponse = z.infer<typeof ModelsResponse>;

// ---------------------------------------------------------------------------
// Chats

export const ChatSummary = z.object({
  id: Id,
  /** Null until the first message gives it one. */
  title: z.string().nullable(),
  modelId: z.string(),
  /** "Think harder" for models that can reason before answering. */
  think: z.boolean(),
  /** The chat's agent (role), if any. */
  agentId: Id.nullable().default(null),
  /** The user's profile is used as context (and may be added to) in this chat. */
  useProfile: z.boolean().default(true),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type ChatSummary = z.infer<typeof ChatSummary>;

export const ChatListResponse = z.object({ chats: z.array(ChatSummary) });
export type ChatListResponse = z.infer<typeof ChatListResponse>;

export const CreateChatRequest = z.object({
  modelId: z.string().optional(),
  /** Start the chat with this agent (its preferred model and settings apply). */
  agentId: Id.optional(),
  /** False starts a fresh chat without the user's profile. */
  useProfile: z.boolean().optional(),
});
export type CreateChatRequest = z.infer<typeof CreateChatRequest>;

/** POST /api/briefings: today's planner chat of this kind (created if needed). */
export const OpenBriefingRequest = z.object({ kind: z.enum(['day', 'week', 'evening']) });
export type OpenBriefingRequest = z.infer<typeof OpenBriefingRequest>;
export const OpenBriefingResponse = z.object({
  chat: ChatSummary,
  /** False when today's chat already existed (then it has its answer already). */
  created: z.boolean(),
});
export type OpenBriefingResponse = z.infer<typeof OpenBriefingResponse>;
export type BriefingKind = OpenBriefingRequest['kind'];

/** The first message of a planner chat, as if the user had typed it. */
export const BRIEFING_PROMPTS: Record<Language, Record<BriefingKind, string>> = {
  en: {
    day: 'Good morning! What does my day look like?',
    week: "Let's plan my week.",
    evening: 'Evening check-in',
  },
  de: {
    day: 'Guten Morgen! Wie sieht mein Tag aus?',
    week: 'Lass uns meine Woche planen.',
    evening: 'Rückblick am Abend',
  },
};

/**
 * POST /api/briefings/prepare: the phone's service worker starts today's planner chat when
 * its notification arrives, so the answer is ready (or nearly) when the user opens it.
 */
export const PrepareBriefingResponse = z.object({
  /** False when today's chat already had its answer, or kchat is paused or busy. */
  started: z.boolean(),
});
export type PrepareBriefingResponse = z.infer<typeof PrepareBriefingResponse>;

export const UpdateChatRequest = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    modelId: z.string().optional(),
    think: z.boolean().optional(),
    /** Switch the agent for the following messages (null = no agent). */
    agentId: Id.nullable().optional(),
    useProfile: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.modelId !== undefined ||
      v.think !== undefined ||
      v.agentId !== undefined ||
      v.useProfile !== undefined,
    'nothing to update',
  );
export type UpdateChatRequest = z.infer<typeof UpdateChatRequest>;

// ---------------------------------------------------------------------------
// Messages and attachments

export const DOCUMENT_MIMES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

/** A web page the model used. Shown as a link; never loaded by the app itself. */
export const WebSource = z.object({
  title: z.string().max(300),
  url: z.url({ protocol: /^https?$/ }).max(2000),
});
export type WebSource = z.infer<typeof WebSource>;

export const AttachmentRef = z.object({
  id: Id,
  /** upload: the user's photo; generated: made by the image model; web: a photo from an image search. */
  kind: z.enum(['upload', 'generated', 'document', 'web']),
  mime: z.enum(['image/jpeg', 'image/png', ...DOCUMENT_MIMES]),
  /** Pixels for images; 0 for documents. */
  width: z.number().int().min(0),
  height: z.number().int().min(0),
  /** Original file name (documents). */
  name: z.string().nullable().default(null),
  /** Pages (PDF) or sheets (Excel) for documents. */
  pages: z.number().int().nullable().default(null),
  /** Scanned PDF pages kept as images (read by models that can see photos). */
  scanPages: z.number().int().min(0).default(0),
  /** Web photos: the page the photo was found on (credited under it, opened as a link). */
  source: WebSource.nullable().default(null),
});
export type AttachmentRef = z.infer<typeof AttachmentRef>;

export const MessageStatus = z.enum(['done', 'error', 'cancelled']);
export type MessageStatus = z.infer<typeof MessageStatus>;

/** One web search the model ran for a reply, with the pages it got back. */
export const WebSearch = z.object({
  query: z.string().max(300),
  sources: z.array(WebSource).max(8),
});
export type WebSearch = z.infer<typeof WebSearch>;

/** Why a linked page couldn't be read (shown to the user, explained to the model). */
export const WebPageReason = z.enum([
  /** Not a public web address (home network, unusual port), or the link itself is invalid. */
  'blocked',
  'not_found',
  /** 401/403: needs a login, or the site refuses automated readers (paywall, bot wall). */
  'forbidden',
  /** A PDF (linked PDFs aren't read yet: download and attach it). */
  'pdf',
  /** Not a web page (download, image, video). */
  'not_html',
  'too_large',
  'timeout',
  /** DNS, connection or TLS failure. */
  'unreachable',
  /** Almost no text without JavaScript. */
  'empty',
  'error',
]);
export type WebPageReason = z.infer<typeof WebPageReason>;

/** Links read per user message (the rest are left for the user to send again). */
export const MAX_LINKS_PER_MESSAGE = 3;

/**
 * A page the user linked in their message, read by the server for the model. The page text
 * stays on the server; the app shows a link (never loads the page itself).
 */
export const WebPage = z.object({
  id: Id,
  /** The link as the user wrote it (normalised). */
  url: z.url({ protocol: /^https?$/ }).max(2000),
  /** The page title, or '' (unreadable pages, pages without a title). */
  title: z.string().max(300),
  status: z.enum(['read', 'unreadable']),
  reason: WebPageReason.nullable().default(null),
});
export type WebPage = z.infer<typeof WebPage>;

/** Who may use web search (admin setting). Teen accounts always get strict safe search. */
export const WebSearchMode = z.enum(['off', 'adults', 'all']);
export type WebSearchMode = z.infer<typeof WebSearchMode>;

/** A profile note the model saved while answering (shown under the reply, with an undo). */
export const NotedRef = z.object({ id: Id, text: z.string() });
export type NotedRef = z.infer<typeof NotedRef>;

export const Message = z.object({
  id: Id,
  chatId: Id,
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  /** Model that wrote an assistant message; null for user messages. */
  modelId: z.string().nullable(),
  status: MessageStatus,
  attachments: z.array(AttachmentRef),
  /** Web searches the model ran for this reply (assistant messages). */
  searches: z.array(WebSearch).default([]),
  /** Pages the user linked, read for the model (user messages). */
  pages: z.array(WebPage).default([]),
  /** Profile notes the model saved while writing this reply (assistant messages). */
  notes: z.array(NotedRef).default([]),
  createdAt: z.number().int(),
});
export type Message = z.infer<typeof Message>;

/** Newest first. Pass nextCursor as ?before= to get older messages. */
export const MessagesResponse = z.object({
  messages: z.array(Message),
  nextCursor: z.string().nullable(),
});
export type MessagesResponse = z.infer<typeof MessagesResponse>;

/** Absolute upper bound for one message; each model has its own, smaller limit. */
export const MAX_MESSAGE_CHARS = 320_000;

/** Tokens a reply may use, and room for the system prompt and tool definitions. */
const REPLY_RESERVE_TOKENS = 4096 + 2500;
/** Dense text like logs and code: ~2.5 characters per token (measured 2.5–2.8). */
const CHARS_PER_TOKEN_DENSE = 2.5;

/** Longest message a model with this context window can read in full. */
export function maxMessageChars(contextTokens: number): number {
  return Math.min(
    MAX_MESSAGE_CHARS,
    Math.max(1000, Math.floor((contextTokens - REPLY_RESERVE_TOKENS) * CHARS_PER_TOKEN_DENSE)),
  );
}
export const MAX_PHOTOS_PER_MESSAGE = 4;
/** Photos and documents together. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 6;

export const SendMessageRequest = z
  .object({
    content: z.string().max(MAX_MESSAGE_CHARS),
    attachmentIds: z.array(Id).max(MAX_ATTACHMENTS_PER_MESSAGE).default([]),
    /** Switch the chat to this model for this and later messages. */
    modelId: z.string().optional(),
    /** Planner: answer with the morning snapshot, weekly planning or evening check-in. */
    briefing: z.enum(['day', 'week', 'evening']).optional(),
    /** Older apps: the same as briefing 'day'. */
    daily: z.boolean().optional(),
  })
  .refine((v) => v.content.trim().length > 0 || v.attachmentIds.length > 0, 'empty message');
export type SendMessageRequest = z.infer<typeof SendMessageRequest>;

export const GenerateImageRequest = z.object({
  prompt: z.string().trim().min(1).max(1000),
  modelId: z.string().optional(),
});
export type GenerateImageRequest = z.infer<typeof GenerateImageRequest>;

export const UploadResponse = AttachmentRef;
export type UploadResponse = z.infer<typeof UploadResponse>;

// ---------------------------------------------------------------------------
// Server-sent events for a running job (reply or image). Wire format per event:
//   event: <type>\ndata: <JSON of the event object>\n\n

export const StreamEvent = z.discriminatedUnion('type', [
  /** The job is accepted; ids for cancelling and for the saved user message. */
  z.object({ type: z.literal('started'), jobId: Id, userMessageId: Id }),
  /** Waiting for the Mac: this many jobs are ahead. */
  z.object({ type: z.literal('queued'), position: z.number().int().min(1) }),
  /** A model has to be loaded into memory first. */
  z.object({
    type: z.literal('loading'),
    modelId: z.string(),
    /** About how long loading takes (for a progress bar); absent when unknown. */
    expectedMs: z.number().int().positive().max(600_000).optional(),
  }),
  z.object({ type: z.literal('thinking'), active: z.boolean() }),
  /** A long text is being read before the reply starts (estimated tokens). */
  z.object({ type: z.literal('reading'), tokens: z.number().int() }),
  z.object({ type: z.literal('token'), text: z.string() }),
  /** The reply so far, replacing what was streamed (a draft the model wrote was dropped). */
  z.object({ type: z.literal('replace'), text: z.string() }),
  z.object({ type: z.literal('progress'), step: z.number().int(), steps: z.number().int() }),
  z.object({ type: z.literal('image'), attachment: AttachmentRef }),
  /** Linked pages in the user's message are being read (their links). */
  z.object({
    type: z.literal('reading_pages'),
    urls: z.array(z.string()).max(MAX_LINKS_PER_MESSAGE),
  }),
  /** A linked page was read, or couldn't be (also saved with the user message). */
  z.object({ type: z.literal('page'), page: WebPage }),
  /** The model is searching the web for this. */
  z.object({ type: z.literal('search'), query: z.string() }),
  /** A search finished: what it found (also saved with the reply). */
  z.object({ type: z.literal('sources'), search: WebSearch }),
  /** The model saved a note to the user's profile. */
  z.object({ type: z.literal('noted'), note: NotedRef }),
  /** Finished: the saved assistant message (status done or cancelled). */
  z.object({ type: z.literal('done'), message: Message }),
  z.object({ type: z.literal('error'), code: z.union([ErrorCode, z.literal('model_error')]) }),
]);
export type StreamEvent = z.infer<typeof StreamEvent>;

// Admin: model settings (no content involved)

export const AdminModel = z.object({
  id: z.string(),
  label: LocalizedText,
  kind: z.enum(['chat', 'image']),
  /** Allowed by config/models.json (the admin can only switch off what the config allows). */
  available: z.boolean(),
  /** Currently on for the family. */
  enabled: z.boolean(),
  /** Installed in Ollama (chat models); image models are always reported as installed. */
  installed: z.boolean(),
  /** Added by an admin from the installed models (can be removed again). */
  custom: z.boolean(),
  /** A cloud model (used with each person's own key; never the family default). */
  cloud: z.boolean().default(false),
});
export type AdminModel = z.infer<typeof AdminModel>;

/** A model installed in Ollama (or on a local server) that isn't offered yet. */
export const InstalledModel = z.object({
  engineModel: z.string(),
  sizeGiB: z.number(),
  /** "ollama" or "custom:<id>" (see engines.ts). */
  engine: z.string().default('ollama'),
  /** The local server's name, for custom engines. */
  engineLabel: z.string().nullable().default(null),
});
export type InstalledModel = z.infer<typeof InstalledModel>;

/** PUT /api/admin/web-search: request and response. */
export const AdminWebSearch = z.object({ mode: WebSearchMode }).strict();
export type AdminWebSearch = z.infer<typeof AdminWebSearch>;

export const AdminModelsResponse = z.object({
  models: z.array(AdminModel),
  installedNotOffered: z.array(InstalledModel),
  defaultChatModel: z.string().nullable(),
  defaultImageModel: z.string().nullable(),
  /** Who may use web search right now. */
  webSearch: WebSearchMode.default('all'),
  /** Who may use cloud models (with their own API key) right now. */
  cloud: WebSearchMode.default('all'),
});
export type AdminModelsResponse = z.infer<typeof AdminModelsResponse>;

export const AdminUpdateModelsRequest = z.object({
  /** Ids of models to switch off. */
  disabled: z.array(z.string()).max(50),
  /** Null only when there is no local chat model to choose. */
  defaultChatModel: z.string().nullable(),
  /** Null turns image generation off. */
  defaultImageModel: z.string().nullable(),
});
export type AdminUpdateModelsRequest = z.infer<typeof AdminUpdateModelsRequest>;

export const AdminAddModelRequest = z.object({
  engineModel: z.string().regex(/^[A-Za-z0-9._:/@-]{1,100}$/),
  label: z.string().trim().min(1).max(60),
  /** "ollama" (default) or "custom:<id>". */
  engine: z
    .string()
    .regex(/^(ollama|custom:[a-z0-9]{8})$/)
    .default('ollama'),
  /** Local servers can't tell: the admin says whether the model sees pictures / uses tools. */
  vision: z.boolean().default(false),
  tools: z.boolean().default(false),
});
export type AdminAddModelRequest = z.infer<typeof AdminAddModelRequest>;

/** PUT /api/admin/cloud: who may use cloud models (request and response). */
export const AdminCloud = z.object({ mode: WebSearchMode }).strict();
export type AdminCloud = z.infer<typeof AdminCloud>;

/** PUT /api/admin/pause: request and response. */
export const AdminPause = z.object({ paused: z.boolean() }).strict();
export type AdminPause = z.infer<typeof AdminPause>;
