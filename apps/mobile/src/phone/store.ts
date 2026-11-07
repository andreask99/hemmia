/**
 * Phone-mode storage (PHONE-MODE.md §6): encrypted files under phone/v1/ in the app's data
 * directory. index.enc lists the chats; chats/<id>.enc holds one chat; photos/<id>.enc one JPEG.
 * Writes go to <file>.tmp and are then renamed. A file that can't be decrypted is skipped and
 * reported once, never deleted.
 */
import { z } from 'zod';
import { DecryptError, seal, unseal } from './crypto.ts';

/** The filesystem operations the store needs, with paths relative to phone/v1/. */
export interface PhoneFiles {
  /** null when the file does not exist. */
  read: (path: string) => Promise<Uint8Array<ArrayBuffer> | null>;
  write: (path: string, data: Uint8Array<ArrayBuffer>) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
  remove: (path: string) => Promise<void>;
  /** Files directly in `dir` (empty when it doesn't exist). */
  list: (dir: string) => Promise<{ name: string; size: number }[]>;
  /** Removes phone/v1/ entirely. */
  removeAll: () => Promise<void>;
}

export const LIMITS = {
  chats: 2000,
  messagesPerChat: 2000,
  photoBytes: 200 * 1024 * 1024,
} as const;

export class LimitError extends Error {
  override name = 'LimitError';
  readonly limit: keyof typeof LIMITS;
  constructor(limit: keyof typeof LIMITS) {
    super(`limit reached: ${limit}`);
    this.limit = limit;
  }
}

const Id = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

export const StoredMessage = z.object({
  id: Id,
  role: z.enum(['user', 'assistant']),
  content: z.string().max(1_000_000),
  createdAt: z.number().int().nonnegative(),
  model: z.string().max(200).optional(),
  photoIds: z.array(Id).max(10).optional(),
  /** The reply was cut off (stopped, app in the background, error mid-way). */
  stopped: z.literal(true).optional(),
});
export type StoredMessage = z.infer<typeof StoredMessage>;

export const StoredChat = z.object({
  id: Id,
  title: z.string().max(200),
  createdAt: z.number().int().nonnegative(),
  model: z.string().max(200),
  messages: z.array(StoredMessage).max(LIMITS.messagesPerChat),
});
export type StoredChat = z.infer<typeof StoredChat>;

const ChatEntry = z.object({
  id: Id,
  title: z.string().max(200),
  model: z.string().max(200),
  updatedAt: z.number(),
});
export type ChatEntry = z.infer<typeof ChatEntry>;

export const PhoneIndex = z.object({
  chats: z.array(ChatEntry).max(LIMITS.chats),
  aboutMe: z.string().max(4000),
  language: z.enum(['en', 'de']),
});
export type PhoneIndex = z.infer<typeof PhoneIndex>;

const INDEX = 'index.enc';
const chatPath = (id: string) => `chats/${Id.parse(id)}.enc`;
const photoPath = (id: string) => `photos/${Id.parse(id)}.enc`;
const enc = new TextEncoder();
const dec = new TextDecoder();

export function createPhoneStore(
  files: PhoneFiles,
  key: () => Promise<CryptoKey>,
  defaults: Pick<PhoneIndex, 'language'>,
) {
  let index: PhoneIndex | null = null;
  const unreadable = new Set<string>();
  let reported = 0;

  async function readJson<T>(path: string, schema: z.ZodType<T>): Promise<T | null> {
    const data = await files.read(path);
    if (data === null) return null;
    try {
      const parsed = schema.safeParse(
        JSON.parse(dec.decode(await unseal(await key(), path, data))),
      );
      if (parsed.success) return parsed.data;
    } catch (e) {
      if (!(e instanceof DecryptError) && !(e instanceof SyntaxError)) throw e;
    }
    unreadable.add(path);
    return null;
  }

  async function writeJson(path: string, value: unknown): Promise<void> {
    const sealed = await seal(await key(), path, enc.encode(JSON.stringify(value)));
    await files.write(`${path}.tmp`, sealed);
    await files.rename(`${path}.tmp`, path);
  }

  /** The index, rebuilt from the chat files if it is missing or unreadable. */
  async function loadIndex(): Promise<PhoneIndex> {
    if (index) return index;
    const stored = await readJson(INDEX, PhoneIndex);
    if (stored) return (index = stored);
    const chats: ChatEntry[] = [];
    for (const f of await files.list('chats')) {
      if (!f.name.endsWith('.enc')) continue;
      const chat = await readJson(`chats/${f.name}`, StoredChat);
      if (chat)
        chats.push({
          id: chat.id,
          title: chat.title,
          model: chat.model,
          updatedAt: lastUpdate(chat),
        });
    }
    index = {
      chats: chats.sort((a, b) => b.updatedAt - a.updatedAt),
      aboutMe: '',
      language: defaults.language,
    };
    if (chats.length > 0 || !unreadable.has(INDEX)) await writeJson(INDEX, index);
    return index;
  }

  async function saveIndex(next: PhoneIndex): Promise<void> {
    await writeJson(INDEX, next);
    index = next;
  }

  const lastUpdate = (c: StoredChat) => c.messages.at(-1)?.createdAt ?? c.createdAt;

  return {
    loadIndex,

    async listChats(): Promise<ChatEntry[]> {
      return (await loadIndex()).chats;
    },

    async getChat(id: string): Promise<StoredChat | null> {
      return readJson(chatPath(id), StoredChat);
    },

    /** Creates or replaces a chat and moves it to the top of the list. */
    async saveChat(chat: StoredChat): Promise<void> {
      const parsed = StoredChat.safeParse(chat);
      if (!parsed.success) {
        if (chat.messages.length > LIMITS.messagesPerChat) throw new LimitError('messagesPerChat');
        throw new Error('invalid chat');
      }
      const idx = await loadIndex();
      const others = idx.chats.filter((c) => c.id !== chat.id);
      if (others.length >= LIMITS.chats && others.length === idx.chats.length)
        throw new LimitError('chats');
      await writeJson(chatPath(chat.id), parsed.data);
      const entry = {
        id: chat.id,
        title: chat.title,
        model: chat.model,
        updatedAt: lastUpdate(parsed.data),
      };
      await saveIndex({ ...idx, chats: [entry, ...others] });
    },

    async renameChat(id: string, title: string): Promise<void> {
      const chat = await readJson(chatPath(id), StoredChat);
      if (!chat) throw new Error('chat not found');
      const t = title.trim().slice(0, 200);
      await writeJson(chatPath(id), { ...chat, title: t });
      const idx = await loadIndex();
      await saveIndex({
        ...idx,
        chats: idx.chats.map((c) => (c.id === id ? { ...c, title: t } : c)),
      });
    },

    /** Removes the chat and its photos. */
    async deleteChat(id: string): Promise<void> {
      const chat = await readJson(chatPath(id), StoredChat);
      const idx = await loadIndex();
      await saveIndex({ ...idx, chats: idx.chats.filter((c) => c.id !== id) });
      await files.remove(chatPath(id));
      for (const m of chat?.messages ?? [])
        for (const p of m.photoIds ?? []) await files.remove(photoPath(p));
    },

    async setProfile(profile: Partial<Pick<PhoneIndex, 'aboutMe' | 'language'>>): Promise<void> {
      await saveIndex(PhoneIndex.parse({ ...(await loadIndex()), ...profile }));
    },

    async savePhoto(id: string, jpeg: Uint8Array<ArrayBuffer>): Promise<void> {
      const used = (await files.list('photos')).reduce((n, f) => n + f.size, 0);
      if (used + jpeg.length > LIMITS.photoBytes) throw new LimitError('photoBytes');
      const path = photoPath(id);
      const sealed = await seal(await key(), path, jpeg);
      await files.write(`${path}.tmp`, sealed);
      await files.rename(`${path}.tmp`, path);
    },

    async getPhoto(id: string): Promise<Uint8Array<ArrayBuffer> | null> {
      const path = photoPath(id);
      const data = await files.read(path);
      if (data === null) return null;
      try {
        return await unseal(await key(), path, data);
      } catch (e) {
        if (!(e instanceof DecryptError)) throw e;
        unreadable.add(path);
        return null;
      }
    },

    /** How many files could not be read since the last call (each reported once). */
    takeUnreadable(): number {
      const n = unreadable.size - reported;
      reported = unreadable.size;
      return n;
    },

    /** "Delete everything" for the files; the caller also removes the keys. */
    async deleteAll(): Promise<void> {
      await files.removeAll();
      index = null;
    },
  };
}
export type PhoneStore = ReturnType<typeof createPhoneStore>;
