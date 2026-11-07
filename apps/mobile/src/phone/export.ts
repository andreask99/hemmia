/**
 * Export, import and "delete everything" for phone mode (PHONE-MODE.md §6, §7). The export file
 * is not encrypted by design (the screen says so). Import validates with zod, refuses other
 * formats and versions, and adds every chat with new ids: it never overwrites.
 */
import { PHONE_EXPORT_FORMAT, PhoneExport, type PhoneExportChat } from '@hemmia/shared';
import { fromBase64, toBase64 } from './crypto.ts';
import type { Keys } from './keys.ts';
import type { PhoneStore, StoredChat, StoredMessage } from './store.ts';

export function exportFileName(at: Date): string {
  return `hemmia-chats-${at.toISOString().slice(0, 10)}.json`;
}

/** All readable chats with their photos; unreadable ones are left out and counted. */
export async function buildExport(
  store: PhoneStore,
  now: number,
): Promise<{ data: PhoneExport; skipped: number }> {
  const index = await store.loadIndex();
  const chats: PhoneExportChat[] = [];
  let skipped = 0;
  for (const entry of index.chats) {
    const chat = await store.getChat(entry.id);
    if (!chat) {
      skipped++;
      continue;
    }
    const messages = [];
    for (const m of chat.messages) {
      const photos: string[] = [];
      for (const id of m.photoIds ?? []) {
        const jpeg = await store.getPhoto(id);
        if (jpeg) photos.push(toBase64(jpeg));
      }
      messages.push({
        role: m.role,
        text: m.content,
        createdAt: m.createdAt,
        ...(m.model ? { model: m.model } : {}),
        ...(photos.length > 0 ? { photos } : {}),
        ...(m.stopped ? { stopped: true as const } : {}),
      });
    }
    chats.push({
      id: chat.id,
      title: chat.title,
      createdAt: chat.createdAt,
      model: chat.model,
      messages,
    });
  }
  return {
    data: {
      format: PHONE_EXPORT_FORMAT,
      version: 1,
      exportedAt: now,
      aboutMe: index.aboutMe,
      chats,
    },
    skipped,
  };
}

export type ImportResult =
  { ok: true; chats: number } | { ok: false; reason: 'not_json' | 'not_an_export' };

/**
 * Adds the chats of an export file as new chats (new ids for chats, messages and photos).
 * "About me" is taken only when the phone has none yet. Throws LimitError when the phone is full.
 */
export async function importExport(
  store: PhoneStore,
  text: string,
  newId: () => string,
): Promise<ImportResult> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not_json' };
  }
  const parsed = PhoneExport.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'not_an_export' };
  const index = await store.loadIndex();
  if (index.aboutMe.trim() === '' && parsed.data.aboutMe.trim() !== '') {
    await store.setProfile({ aboutMe: parsed.data.aboutMe.slice(0, 2000) });
  }
  // Oldest first, so the newest imported chat ends up at the top of the list.
  const chats = [...parsed.data.chats].sort(
    (a, b) =>
      (a.messages.at(-1)?.createdAt ?? a.createdAt) - (b.messages.at(-1)?.createdAt ?? b.createdAt),
  );
  for (const c of chats) {
    const messages: StoredMessage[] = [];
    for (const m of c.messages) {
      const photoIds: string[] = [];
      for (const p of m.photos ?? []) {
        const id = newId();
        await store.savePhoto(id, fromBase64(p));
        photoIds.push(id);
      }
      messages.push({
        id: newId(),
        role: m.role,
        content: m.text,
        createdAt: m.createdAt,
        ...(m.model ? { model: m.model } : {}),
        ...(photoIds.length > 0 ? { photoIds } : {}),
        ...(m.stopped ? { stopped: true as const } : {}),
      });
    }
    const chat: StoredChat = {
      id: newId(),
      title: c.title,
      createdAt: c.createdAt,
      model: c.model,
      messages,
    };
    await store.saveChat(chat);
  }
  return { ok: true, chats: chats.length };
}

/** "Delete everything on this phone": the files, the data key and both API keys. */
export async function deleteEverything(store: PhoneStore, keys: Keys): Promise<void> {
  await store.deleteAll();
  await keys.removeApiKey('anthropic');
  await keys.removeApiKey('openai');
  await keys.removeDataKey();
}
