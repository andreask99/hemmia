/**
 * One chat turn in phone mode (PHONE-MODE.md §2, PLAN.md P9.5): the user's message is saved
 * before anything is sent, the reply streams into the UI and is saved when it completes. A
 * reply cut off (stop button, app in the background, an error mid-way) is saved as far as it
 * got, marked as stopped. Never logs content or keys.
 */
import { type ChatTurn, type CloudClient, LlmError } from '@hemmia/providers';
import { toBase64 } from './crypto.ts';
import type { Keys } from './keys.ts';
import type { PhoneModel } from './models.ts';
import type { PhoneStore, StoredChat, StoredMessage } from './store.ts';

/** The error codes the UI explains (the same as the hub's). */
export type ChatErrorCode =
  'auth' | 'rate_limited' | 'overloaded' | 'unavailable' | 'refused' | 'no_key';

export interface ChatDeps {
  store: PhoneStore;
  keys: Keys;
  clients: Record<PhoneModel['provider'], CloudClient>;
  now: () => number;
  newId: () => string;
}

export interface TurnInput {
  text: string;
  /** JPEGs, already resized (resizePhoto). */
  photos: Uint8Array<ArrayBuffer>[];
  model: PhoneModel;
  think: boolean;
  aboutMe: string;
  language: 'en' | 'de';
  signal: AbortSignal;
  /** The reply so far, after each piece. */
  onReply: (text: string) => void;
}

export interface TurnResult {
  chat: StoredChat;
  error: ChatErrorCode | null;
  stopped: boolean;
}

const MAX_OUTPUT_TOKENS = 8000;
/** Photos are resent only for the last few messages that have them. */
const PHOTO_HISTORY = 2;

/** The first 60 characters of the first message, cut at a word boundary. */
export function titleFrom(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= 60) return flat;
  const cut = flat.slice(0, 60);
  const space = cut.lastIndexOf(' ');
  return `${(space > 20 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

export function systemPrompt(aboutMe: string, language: 'en' | 'de'): string {
  const lang = language === 'de' ? 'German' : 'English';
  const base = `You are Hemmia, a helpful assistant in a private app on the user's phone. Answer in ${lang} unless the user writes in another language.`;
  const about = aboutMe.trim();
  return about ? `${base}\n\nWhat the user tells you about themselves:\n${about}` : base;
}

/** The newest messages that fit the model's history budget (about 4 characters a token). */
function history(messages: readonly StoredMessage[], budgetTokens: number): StoredMessage[] {
  let chars = budgetTokens * 4;
  const out: StoredMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    chars -= m.content.length;
    if (chars < 0 && out.length > 0) break;
    out.unshift(m);
  }
  // A history must start with the user.
  while (out[0]?.role === 'assistant') out.shift();
  return out;
}

async function turnsFor(
  deps: ChatDeps,
  msgs: StoredMessage[],
  vision: boolean,
): Promise<ChatTurn[]> {
  const withPhotos = new Set(
    msgs
      .filter((m) => m.photoIds?.length)
      .slice(-PHOTO_HISTORY)
      .map((m) => m.id),
  );
  const turns: ChatTurn[] = [];
  for (const m of msgs) {
    const turn: ChatTurn = { role: m.role, content: m.content };
    if (vision && withPhotos.has(m.id)) {
      const images: string[] = [];
      for (const id of m.photoIds ?? []) {
        const jpeg = await deps.store.getPhoto(id);
        if (jpeg) images.push(toBase64(jpeg));
      }
      if (images.length > 0) turn.images = images;
    }
    turns.push(turn);
  }
  return turns;
}

function errorCode(e: unknown): ChatErrorCode | 'aborted' {
  if (e instanceof LlmError) {
    switch (e.code) {
      case 'aborted':
      case 'auth':
      case 'rate_limited':
      case 'overloaded':
      case 'refused':
        return e.code;
      default:
        return 'unavailable';
    }
  }
  if (e instanceof DOMException && e.name === 'AbortError') return 'aborted';
  return 'unavailable';
}

export async function sendTurn(
  deps: ChatDeps,
  chat: StoredChat,
  input: TurnInput,
): Promise<TurnResult> {
  const photoIds: string[] = [];
  for (const jpeg of input.photos) {
    const id = deps.newId();
    await deps.store.savePhoto(id, jpeg);
    photoIds.push(id);
  }
  const user: StoredMessage = {
    id: deps.newId(),
    role: 'user',
    content: input.text,
    createdAt: deps.now(),
    ...(photoIds.length > 0 ? { photoIds } : {}),
  };
  let current: StoredChat = {
    ...chat,
    model: input.model.id,
    title: chat.messages.length === 0 && chat.title === '' ? titleFrom(input.text) : chat.title,
    messages: [...chat.messages, user],
  };
  await deps.store.saveChat(current);

  const apiKey = await deps.keys.apiKey(input.model.provider);
  if (apiKey === null) return { chat: current, error: 'no_key', stopped: false };

  let reply = '';
  let error: ChatErrorCode | null = null;
  let stopped = false;
  try {
    const messages = [
      { role: 'system' as const, content: systemPrompt(input.aboutMe, input.language) },
      ...(await turnsFor(
        deps,
        history(current.messages, input.model.historyBudgetTokens),
        input.model.vision,
      )),
    ];
    const stream = deps.clients[input.model.provider].chat({
      model: input.model.providerModel,
      messages,
      think: input.think && input.model.thinking ? 'high' : false,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      apiKey,
      signal: input.signal,
    });
    for await (const chunk of stream) {
      if (chunk.type === 'content') {
        reply += chunk.text;
        input.onReply(reply);
      }
    }
  } catch (e) {
    const code = errorCode(e);
    if (code === 'aborted') stopped = true;
    else {
      error = code;
      stopped = reply !== '';
    }
  }

  if (reply !== '') {
    const assistant: StoredMessage = {
      id: deps.newId(),
      role: 'assistant',
      content: reply,
      createdAt: deps.now(),
      model: input.model.id,
      ...(stopped ? { stopped: true } : {}),
    };
    current = { ...current, messages: [...current.messages, assistant] };
    await deps.store.saveChat(current);
  }
  return { chat: current, error, stopped };
}

/** Width and height that keep the aspect ratio with the long edge at most `max`. */
export function fitLongEdge(
  width: number,
  height: number,
  max = 1568,
): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= max) return { width, height };
  const scale = max / long;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * A photo from the file picker as JPEG: long edge ≤ 1568 px, quality 0.85, metadata dropped by
 * drawing it on a canvas (PHONE-MODE.md §2). Browser only.
 */
export async function resizePhoto(file: Blob): Promise<Uint8Array<ArrayBuffer>> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitLongEdge(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.85);
  });
  if (!blob) throw new Error('could not encode the photo');
  return new Uint8Array(await blob.arrayBuffer());
}
