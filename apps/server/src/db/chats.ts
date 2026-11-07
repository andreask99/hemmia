/**
 * Chats and messages, encrypted per user. This is the repository pattern for kchat:
 * - every function takes the caller's `UserKey` (from the request's session);
 * - every query is scoped by `user_id = ?` as well as the row id, so another user's ids
 *   behave exactly like ids that don't exist;
 * - plaintext goes in and comes out; encryption happens here with AAD naming the exact
 *   user/table/row/column, so ciphertexts can't be moved between rows.
 * Owned by Claude (per-user isolation, encrypted columns).
 */
import { randomUUID } from 'node:crypto';
import {
  type AttachmentRef,
  type ChatSummary,
  type Message,
  type MessageStatus,
  NotedRef,
  type WebPage,
  WebPageReason,
  WebSearch,
  WebSource,
} from '@hemmia/shared';
import { z } from 'zod';
import { aadColumn, decryptString, encryptString } from '../security/crypto.ts';
import type { DB } from './database.ts';

/** The signed-in user's id and data key. */
export interface UserKey {
  userId: string;
  dek: Buffer;
}

interface ChatRow {
  id: string;
  title: Buffer | null;
  model_id: string;
  think: 0 | 1;
  agent_id: string | null;
  use_profile: 0 | 1;
  created_at: number;
  updated_at: number;
}

interface MessageRow {
  seq: number;
  id: string;
  chat_id: string;
  role: 'user' | 'assistant';
  content: Buffer;
  model_id: string | null;
  status: MessageStatus;
  searches: Buffer | null;
  notes: Buffer | null;
  created_at: number;
}

interface AttachmentRow {
  id: string;
  message_id: string;
  kind: AttachmentRef['kind'];
  mime: AttachmentRef['mime'];
  width: number;
  height: number;
  name: Buffer | null;
  pages: number | null;
  scan_pages: number;
  source: Buffer | null;
}

interface WebPageRow {
  id: string;
  message_id: string;
  status: WebPage['status'];
  reason: string | null;
  url: Buffer;
  title: Buffer;
}

/** A linked page as read by the server, to store with the user message. */
export interface NewWebPage {
  url: string;
  title: string;
  status: WebPage['status'];
  reason: WebPage['reason'];
  /** Readable text and link list (read pages), or null. */
  text: string | null;
}

export interface NewMessage {
  role: 'user' | 'assistant';
  content: string;
  modelId: string | null;
  status: MessageStatus;
  /** Uploaded attachments (owned by this user, not yet attached) to link to the message. */
  attachmentIds?: readonly string[];
  promptTokens?: number;
  outputTokens?: number;
  /** Web searches behind an assistant reply (stored encrypted). */
  searches?: readonly WebSearch[];
  /** Profile notes saved while writing an assistant reply (stored encrypted). */
  notes?: readonly NotedRef[];
}

const Searches = z.array(WebSearch);
const Noted = z.array(NotedRef);

/** A chat title from a first message: first non-empty line, at most 60 characters. */
export function titleFrom(text: string): string | null {
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l !== '');
  if (!line) return null;
  const chars = Array.from(
    new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(line),
    (g) => g.segment,
  );
  return chars.length > 60 ? `${chars.slice(0, 59).join('').trimEnd()}…` : line;
}

export class NotFoundError extends Error {
  override name = 'NotFoundError';
  constructor() {
    super('not found');
  }
}

export function createChatRepo(db: DB, now: () => number = Date.now) {
  const titleAad = (u: UserKey, chatId: string) => aadColumn(u.userId, 'chats', chatId, 'title');
  const contentAad = (u: UserKey, messageId: string) =>
    aadColumn(u.userId, 'messages', messageId, 'content');
  const searchesAad = (u: UserKey, messageId: string) =>
    aadColumn(u.userId, 'messages', messageId, 'searches');
  const notesAad = (u: UserKey, messageId: string) =>
    aadColumn(u.userId, 'messages', messageId, 'notes');

  function toSummary(u: UserKey, row: ChatRow): ChatSummary {
    return {
      id: row.id,
      title: row.title ? decryptString(u.dek, row.title, titleAad(u, row.id)) : null,
      modelId: row.model_id,
      think: row.think === 1,
      agentId: row.agent_id,
      useProfile: row.use_profile === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function attachmentsFor(u: UserKey, messageIds: readonly string[]): Map<string, AttachmentRef[]> {
    const map = new Map<string, AttachmentRef[]>();
    if (messageIds.length === 0) return map;
    const rows = db
      .prepare<string[], AttachmentRow>(
        `SELECT id, message_id, kind, mime, width, height, name, pages, scan_pages, source FROM attachments
         WHERE user_id = ? AND message_id IN (${messageIds.map(() => '?').join(',')})
         ORDER BY created_at, id`,
      )
      .all(u.userId, ...messageIds);
    for (const r of rows) {
      const list = map.get(r.message_id) ?? [];
      list.push({
        id: r.id,
        kind: r.kind,
        mime: r.mime,
        width: r.width,
        height: r.height,
        name: r.name
          ? decryptString(u.dek, r.name, aadColumn(u.userId, 'attachments', r.id, 'name'))
          : null,
        pages: r.pages,
        scanPages: r.scan_pages,
        source: r.source
          ? WebSource.parse(
              JSON.parse(
                decryptString(u.dek, r.source, aadColumn(u.userId, 'attachments', r.id, 'source')),
              ) as unknown,
            )
          : null,
      });
      map.set(r.message_id, list);
    }
    return map;
  }

  const pageAad = (u: UserKey, pageId: string, column: 'url' | 'title' | 'text') =>
    aadColumn(u.userId, 'web_pages', pageId, column);

  /** Linked pages per message (without their text), in the order they were linked. */
  function pagesFor(u: UserKey, messageIds: readonly string[]): Map<string, WebPage[]> {
    const map = new Map<string, WebPage[]>();
    if (messageIds.length === 0) return map;
    const rows = db
      .prepare<string[], WebPageRow>(
        `SELECT id, message_id, status, reason, url, title FROM web_pages
         WHERE user_id = ? AND message_id IN (${messageIds.map(() => '?').join(',')})
         ORDER BY position`,
      )
      .all(u.userId, ...messageIds);
    for (const r of rows) {
      const list = map.get(r.message_id) ?? [];
      const reason = WebPageReason.safeParse(r.reason);
      list.push({
        id: r.id,
        url: decryptString(u.dek, r.url, pageAad(u, r.id, 'url')),
        title: decryptString(u.dek, r.title, pageAad(u, r.id, 'title')),
        status: r.status,
        reason: r.reason === null ? null : reason.success ? reason.data : 'error',
      });
      map.set(r.message_id, list);
    }
    return map;
  }

  function toMessage(
    u: UserKey,
    row: MessageRow,
    attachments: AttachmentRef[],
    pages: WebPage[],
  ): Message {
    return {
      id: row.id,
      chatId: row.chat_id,
      role: row.role,
      content: decryptString(u.dek, row.content, contentAad(u, row.id)),
      modelId: row.model_id,
      status: row.status,
      attachments,
      searches: row.searches
        ? Searches.parse(
            JSON.parse(decryptString(u.dek, row.searches, searchesAad(u, row.id))) as unknown,
          )
        : [],
      notes: row.notes
        ? Noted.parse(JSON.parse(decryptString(u.dek, row.notes, notesAad(u, row.id))) as unknown)
        : [],
      pages,
      createdAt: row.created_at,
    };
  }

  function getChat(u: UserKey, chatId: string): ChatSummary | null {
    const row = db
      .prepare<[string, string], ChatRow>(
        `SELECT id, title, model_id, think, agent_id, use_profile, created_at, updated_at FROM chats
         WHERE id = ? AND user_id = ?`,
      )
      .get(chatId, u.userId);
    return row ? toSummary(u, row) : null;
  }

  function ownsChat(u: UserKey, chatId: string): boolean {
    return (
      db
        .prepare<[string, string], { one: number }>(
          'SELECT 1 AS one FROM chats WHERE id = ? AND user_id = ?',
        )
        .get(chatId, u.userId) !== undefined
    );
  }

  return {
    /** The user's chats, most recently active first (planner briefing chats left out). */
    listChats(u: UserKey): ChatSummary[] {
      return db
        .prepare<[string], ChatRow>(
          `SELECT id, title, model_id, think, agent_id, use_profile, created_at, updated_at FROM chats
           WHERE user_id = ? AND briefing IS NULL ORDER BY updated_at DESC, id`,
        )
        .all(u.userId)
        .map((row) => toSummary(u, row));
    },

    getChat,

    /** The user's planner chat of this kind for that day, if there is one with messages. */
    findBriefing(u: UserKey, kind: 'day' | 'week' | 'evening', on: string): ChatSummary | null {
      const row = db
        .prepare<[string, string, string], ChatRow>(
          `SELECT id, title, model_id, think, agent_id, use_profile, created_at, updated_at FROM chats
           WHERE user_id = ? AND briefing = ? AND briefing_on = ?
             AND EXISTS (SELECT 1 FROM messages m WHERE m.chat_id = chats.id)
           ORDER BY created_at DESC LIMIT 1`,
        )
        .get(u.userId, kind, on);
      return row ? toSummary(u, row) : null;
    },

    /** The planner kind of one of the user's chats, or null for an ordinary chat. */
    briefingOf(u: UserKey, chatId: string): 'day' | 'week' | 'evening' | null {
      const row = db
        .prepare<[string, string], { briefing: 'day' | 'week' | 'evening' | null }>(
          'SELECT briefing FROM chats WHERE id = ? AND user_id = ?',
        )
        .get(chatId, u.userId);
      return row?.briefing ?? null;
    },

    /** Ids of the user's planner chats from before that day (for deleting). */
    oldBriefings(u: UserKey, before: string): string[] {
      return db
        .prepare<[string, string], { id: string }>(
          'SELECT id FROM chats WHERE user_id = ? AND briefing IS NOT NULL AND briefing_on < ?',
        )
        .all(u.userId, before)
        .map((r) => r.id);
    },

    /** The caller checks that the agent (if any) is visible to the user. */
    createChat(
      u: UserKey,
      modelId: string,
      options: {
        agentId?: string | null;
        think?: boolean;
        /** False: a fresh chat without the user's profile. */
        useProfile?: boolean;
        /** A planner chat: its kind and day ("YYYY-MM-DD"). */
        briefing?: { kind: 'day' | 'week' | 'evening'; on: string };
      } = {},
    ): ChatSummary {
      const id = randomUUID();
      const t = now();
      const agentId = options.agentId ?? null;
      const think = options.think ?? false;
      const useProfile = options.useProfile ?? true;
      db.prepare(
        `INSERT INTO chats (id, user_id, title, model_id, think, agent_id, use_profile, briefing,
           briefing_on, created_at, updated_at)
         VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        u.userId,
        modelId,
        think ? 1 : 0,
        agentId,
        useProfile ? 1 : 0,
        options.briefing?.kind ?? null,
        options.briefing?.on ?? null,
        t,
        t,
      );
      return { id, title: null, modelId, think, agentId, useProfile, createdAt: t, updatedAt: t };
    },

    /** Sets the title and/or model. Returns the updated chat, or null if not the user's. */
    updateChat(
      u: UserKey,
      chatId: string,
      changes: {
        title?: string;
        modelId?: string;
        think?: boolean;
        agentId?: string | null;
        useProfile?: boolean;
      },
    ): ChatSummary | null {
      if (!ownsChat(u, chatId)) return null;
      db.transaction(() => {
        if (changes.title !== undefined) {
          db.prepare('UPDATE chats SET title = ? WHERE id = ? AND user_id = ?').run(
            encryptString(u.dek, changes.title, titleAad(u, chatId)),
            chatId,
            u.userId,
          );
        }
        if (changes.think !== undefined) {
          db.prepare('UPDATE chats SET think = ? WHERE id = ? AND user_id = ?').run(
            changes.think ? 1 : 0,
            chatId,
            u.userId,
          );
        }
        if (changes.useProfile !== undefined) {
          db.prepare('UPDATE chats SET use_profile = ? WHERE id = ? AND user_id = ?').run(
            changes.useProfile ? 1 : 0,
            chatId,
            u.userId,
          );
        }
        if (changes.agentId !== undefined) {
          db.prepare('UPDATE chats SET agent_id = ? WHERE id = ? AND user_id = ?').run(
            changes.agentId,
            chatId,
            u.userId,
          );
        }
        if (changes.modelId !== undefined) {
          db.prepare('UPDATE chats SET model_id = ? WHERE id = ? AND user_id = ?').run(
            changes.modelId,
            chatId,
            u.userId,
          );
        }
      })();
      return getChat(u, chatId);
    },

    /**
     * Deletes a chat with its messages and attachment rows (hard delete). Returns the ids
     * of the attachments whose blob files the caller must delete, or null if not found.
     */
    deleteChat(u: UserKey, chatId: string): string[] | null {
      if (!ownsChat(u, chatId)) return null;
      return db.transaction(() => {
        const blobs = db
          .prepare<[string, string], { id: string }>(
            `SELECT a.id FROM attachments a JOIN messages m ON m.id = a.message_id
             WHERE m.chat_id = ? AND a.user_id = ?`,
          )
          .all(chatId, u.userId)
          .map((r) => r.id);
        db.prepare('DELETE FROM chats WHERE id = ? AND user_id = ?').run(chatId, u.userId);
        return blobs;
      })();
    },

    /**
     * A page of messages, newest first. `before` is a cursor from a previous page.
     * Returns null if the chat isn't the user's.
     */
    listMessages(
      u: UserKey,
      chatId: string,
      options: { before?: string; limit: number },
    ): { messages: Message[]; nextCursor: string | null } | null {
      if (!ownsChat(u, chatId)) return null;
      const before =
        options.before !== undefined ? Number(options.before) : Number.MAX_SAFE_INTEGER;
      if (!Number.isSafeInteger(before)) return { messages: [], nextCursor: null };
      const rows = db
        .prepare<[string, string, number, number], MessageRow>(
          `SELECT seq, id, chat_id, role, content, model_id, status, searches, notes, created_at FROM messages
           WHERE chat_id = ? AND user_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?`,
        )
        .all(chatId, u.userId, before, options.limit + 1);
      const page = rows.slice(0, options.limit);
      const ids = page.map((r) => r.id);
      const atts = attachmentsFor(u, ids);
      const pages = pagesFor(u, ids);
      const last = page.at(-1);
      return {
        messages: page.map((r) => toMessage(u, r, atts.get(r.id) ?? [], pages.get(r.id) ?? [])),
        nextCursor: rows.length > options.limit && last ? String(last.seq) : null,
      };
    },

    /**
     * Appends a message and bumps the chat's updated time. Attachment ids must be the
     * user's own unsent uploads; otherwise nothing is written and NotFoundError is thrown.
     */
    addMessage(u: UserKey, chatId: string, msg: NewMessage): Message {
      const id = randomUUID();
      const t = now();
      const attachmentIds = msg.attachmentIds ?? [];
      const searches = msg.searches ?? [];
      const notes = msg.notes ?? [];
      return db.transaction(() => {
        if (!ownsChat(u, chatId)) throw new NotFoundError();
        db.prepare(
          `INSERT INTO messages (id, chat_id, user_id, role, content, model_id, status,
             prompt_tokens, output_tokens, searches, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          chatId,
          u.userId,
          msg.role,
          encryptString(u.dek, msg.content, contentAad(u, id)),
          msg.modelId,
          msg.status,
          msg.promptTokens ?? null,
          msg.outputTokens ?? null,
          searches.length > 0
            ? encryptString(u.dek, JSON.stringify(searches), searchesAad(u, id))
            : null,
          notes.length > 0 ? encryptString(u.dek, JSON.stringify(notes), notesAad(u, id)) : null,
          t,
        );
        for (const attachmentId of attachmentIds) {
          const linked = db
            .prepare(
              `UPDATE attachments SET message_id = ?
               WHERE id = ? AND user_id = ? AND message_id IS NULL`,
            )
            .run(id, attachmentId, u.userId);
          if (linked.changes !== 1) throw new NotFoundError();
        }
        db.prepare('UPDATE chats SET updated_at = ? WHERE id = ? AND user_id = ?').run(
          t,
          chatId,
          u.userId,
        );
        // Name an untitled chat after its first user message.
        const title = msg.role === 'user' ? titleFrom(msg.content) : null;
        if (title) {
          db.prepare(
            'UPDATE chats SET title = ? WHERE id = ? AND user_id = ? AND title IS NULL',
          ).run(encryptString(u.dek, title, titleAad(u, chatId)), chatId, u.userId);
        }
        const atts = attachmentsFor(u, [id]).get(id) ?? [];
        return {
          id,
          chatId,
          role: msg.role,
          content: msg.content,
          modelId: msg.modelId,
          status: msg.status,
          attachments: atts,
          searches: [...searches],
          notes: [...notes],
          pages: [],
          createdAt: t,
        };
      })();
    },

    /**
     * Stores the pages linked in one of the user's own messages (once per message).
     * Throws NotFoundError for another user's message, an assistant message, or a message
     * that already has pages.
     */
    addPages(u: UserKey, messageId: string, pages: readonly NewWebPage[]): WebPage[] {
      const t = now();
      return db.transaction(() => {
        const owned = db
          .prepare<[string, string], { one: number }>(
            `SELECT 1 AS one FROM messages m WHERE m.id = ? AND m.user_id = ? AND m.role = 'user'
               AND NOT EXISTS (SELECT 1 FROM web_pages p WHERE p.message_id = m.id)`,
          )
          .get(messageId, u.userId);
        if (!owned) throw new NotFoundError();
        const insert = db.prepare(
          `INSERT INTO web_pages (id, user_id, message_id, position, status, reason, url, title, text, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        return pages.map((page, position) => {
          const id = randomUUID();
          insert.run(
            id,
            u.userId,
            messageId,
            position,
            page.status,
            page.reason,
            encryptString(u.dek, page.url, pageAad(u, id, 'url')),
            encryptString(u.dek, page.title, pageAad(u, id, 'title')),
            page.text === null ? null : encryptString(u.dek, page.text, pageAad(u, id, 'text')),
            t,
          );
          return { id, url: page.url, title: page.title, status: page.status, reason: page.reason };
        });
      })();
    },

    /** A linked page's text (null when it wasn't read, or isn't the user's). */
    pageText(u: UserKey, pageId: string): string | null {
      const row = db
        .prepare<[string, string], { text: Buffer | null }>(
          'SELECT text FROM web_pages WHERE id = ? AND user_id = ?',
        )
        .get(pageId, u.userId);
      return row?.text ? decryptString(u.dek, row.text, pageAad(u, pageId, 'text')) : null;
    },
  };
}

export type ChatRepo = ReturnType<typeof createChatRepo>;
