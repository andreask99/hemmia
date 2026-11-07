import { beforeEach, describe, expect, it } from 'vitest';
import { randomKey } from '../security/crypto.ts';
import { type ChatRepo, createChatRepo, NotFoundError, titleFrom, type UserKey } from './chats.ts';
import { type DB, openDatabase } from './database.ts';

let db: DB;
let repo: ChatRepo;
let clock: number;
let anna: UserKey;
let ben: UserKey;

function insertUser(id: string, username: string): void {
  const b = Buffer.alloc(1);
  db.prepare(
    `INSERT INTO users (id, username, role, auth_hash, kdf_salt, kdf_params, wrapped_dek_pw,
       recovery_salt, recovery_kdf_params, wrapped_dek_recovery, created_at, password_changed_at)
     VALUES (?, ?, 'member', ?, ?, '{}', ?, ?, '{}', ?, 0, 0)`,
  ).run(id, username, b, b, b, b, b);
}

function insertUpload(u: UserKey, id: string): void {
  db.prepare(
    `INSERT INTO attachments (id, user_id, message_id, kind, mime, width, height, bytes, created_at)
     VALUES (?, ?, NULL, 'upload', 'image/jpeg', 800, 600, 1000, ?)`,
  ).run(id, u.userId, clock);
}

beforeEach(() => {
  db = openDatabase(':memory:');
  clock = 1_000;
  repo = createChatRepo(db, () => clock);
  insertUser('u-anna', 'anna');
  insertUser('u-ben', 'ben');
  anna = { userId: 'u-anna', dek: randomKey() };
  ben = { userId: 'u-ben', dek: randomKey() };
});

describe('chats', () => {
  it('creates, titles, lists newest first', () => {
    const a = repo.createChat(anna, 'quick');
    clock = 2_000;
    const b = repo.createChat(anna, 'smart');
    expect(repo.updateChat(anna, a.id, { title: 'Urlaub in Italien' })?.title).toBe(
      'Urlaub in Italien',
    );
    expect(repo.listChats(anna).map((c) => c.id)).toEqual([b.id, a.id]);
    clock = 3_000;
    repo.addMessage(anna, a.id, { role: 'user', content: 'hi', modelId: null, status: 'done' });
    expect(repo.listChats(anna).map((c) => c.id)).toEqual([a.id, b.id]);
  });

  it("hides other users' chats completely", () => {
    const a = repo.createChat(anna, 'quick');
    repo.updateChat(anna, a.id, { title: 'secret' });
    expect(repo.listChats(ben)).toEqual([]);
    expect(repo.getChat(ben, a.id)).toBeNull();
    expect(repo.updateChat(ben, a.id, { title: 'mine now' })).toBeNull();
    expect(repo.listMessages(ben, a.id, { limit: 10 })).toBeNull();
    expect(() =>
      repo.addMessage(ben, a.id, { role: 'user', content: 'x', modelId: null, status: 'done' }),
    ).toThrow(NotFoundError);
    expect(repo.deleteChat(ben, a.id)).toBeNull();
    expect(repo.getChat(anna, a.id)?.title).toBe('secret');
  });

  it('stores titles and messages encrypted', () => {
    const a = repo.createChat(anna, 'quick');
    repo.updateChat(anna, a.id, { title: 'Geburtstag Oma' });
    repo.addMessage(anna, a.id, {
      role: 'user',
      content: 'Was schenke ich Oma zum 80.?',
      modelId: null,
      status: 'done',
    });
    const rows = [
      ...(db.prepare('SELECT * FROM chats').all() as Record<string, unknown>[]),
      ...(db.prepare('SELECT * FROM messages').all() as Record<string, unknown>[]),
    ];
    const dump = rows
      .flatMap((row) => Object.values(row))
      .map((v) => (Buffer.isBuffer(v) ? v.toString('latin1') : String(v)))
      .join(' ');
    expect(dump).not.toContain('Oma');
    expect(dump).not.toContain('schenke');
  });

  it('cannot be decrypted with another key or after moving rows', () => {
    const a = repo.createChat(anna, 'quick');
    repo.addMessage(anna, a.id, {
      role: 'user',
      content: 'private',
      modelId: null,
      status: 'done',
    });
    // Wrong key (e.g. an admin guessing) fails.
    expect(() =>
      repo.listMessages({ userId: anna.userId, dek: randomKey() }, a.id, { limit: 10 }),
    ).toThrow();
    // Moving Anna's message into Ben's chat (DB tampering) doesn't reveal it to Ben.
    const b = repo.createChat(ben, 'quick');
    db.prepare('UPDATE messages SET chat_id = ?, user_id = ?').run(b.id, ben.userId);
    expect(() => repo.listMessages(ben, b.id, { limit: 10 })).toThrow();
  });

  it('pages messages newest first', () => {
    const a = repo.createChat(anna, 'quick');
    for (let i = 1; i <= 5; i++) {
      repo.addMessage(anna, a.id, {
        role: 'user',
        content: `m${String(i)}`,
        modelId: null,
        status: 'done',
      });
    }
    const p1 = repo.listMessages(anna, a.id, { limit: 2 });
    expect(p1?.messages.map((m) => m.content)).toEqual(['m5', 'm4']);
    const p2 = repo.listMessages(anna, a.id, { limit: 2, before: p1?.nextCursor ?? '' });
    expect(p2?.messages.map((m) => m.content)).toEqual(['m3', 'm2']);
    const p3 = repo.listMessages(anna, a.id, { limit: 2, before: p2?.nextCursor ?? '' });
    expect(p3?.messages.map((m) => m.content)).toEqual(['m1']);
    expect(p3?.nextCursor).toBeNull();
    expect(repo.listMessages(anna, a.id, { limit: 2, before: 'junk' })?.messages).toEqual([]);
  });

  it("links only the user's own unsent uploads", () => {
    const a = repo.createChat(anna, 'quick');
    insertUpload(anna, 'att-anna');
    insertUpload(ben, 'att-ben');
    const msg = repo.addMessage(anna, a.id, {
      role: 'user',
      content: 'look',
      modelId: null,
      status: 'done',
      attachmentIds: ['att-anna'],
    });
    expect(msg.attachments.map((x) => x.id)).toEqual(['att-anna']);
    // Ben's upload can't be attached by Anna; the whole message is rolled back.
    expect(() =>
      repo.addMessage(anna, a.id, {
        role: 'user',
        content: 'steal',
        modelId: null,
        status: 'done',
        attachmentIds: ['att-ben'],
      }),
    ).toThrow(NotFoundError);
    // An already-sent upload can't be reused.
    expect(() =>
      repo.addMessage(anna, a.id, {
        role: 'user',
        content: 'again',
        modelId: null,
        status: 'done',
        attachmentIds: ['att-anna'],
      }),
    ).toThrow(NotFoundError);
    expect(repo.listMessages(anna, a.id, { limit: 10 })?.messages).toHaveLength(1);
  });

  it('deletes a chat with messages and returns blob ids to remove', () => {
    const a = repo.createChat(anna, 'quick');
    insertUpload(anna, 'att-1');
    repo.addMessage(anna, a.id, {
      role: 'user',
      content: 'x',
      modelId: null,
      status: 'done',
      attachmentIds: ['att-1'],
    });
    expect(repo.deleteChat(anna, a.id)).toEqual(['att-1']);
    expect(repo.getChat(anna, a.id)).toBeNull();
    expect(db.prepare('SELECT COUNT(*) AS n FROM messages').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM attachments').get()).toEqual({ n: 0 });
  });
});

describe('linked pages', () => {
  const read = {
    url: 'https://example.org/agb',
    title: 'Allgemeine Geschäftsbedingungen',
    status: 'read' as const,
    reason: null,
    text: 'Widerruf innerhalb von 14 Tagen',
  };
  const failed = {
    url: 'https://paywall.example/artikel',
    title: '',
    status: 'unreadable' as const,
    reason: 'forbidden' as const,
    text: null,
  };

  it('stores pages with the user message, encrypted, text only on request', () => {
    const a = repo.createChat(anna, 'quick');
    const msg = repo.addMessage(anna, a.id, {
      role: 'user',
      content: 'Summarise https://example.org/agb',
      modelId: null,
      status: 'done',
    });
    expect(msg.pages).toEqual([]);
    const pages = repo.addPages(anna, msg.id, [read, failed]);
    expect(pages.map((p) => p.status)).toEqual(['read', 'unreadable']);

    const listed = repo.listMessages(anna, a.id, { limit: 10 })?.messages[0];
    expect(listed?.pages).toEqual(pages);
    expect(listed?.pages[1]?.reason).toBe('forbidden');
    expect(repo.pageText(anna, pages[0]?.id ?? '')).toBe('Widerruf innerhalb von 14 Tagen');
    expect(repo.pageText(anna, pages[1]?.id ?? '')).toBeNull();

    const dump = (db.prepare('SELECT * FROM web_pages').all() as Record<string, unknown>[])
      .flatMap((row) => Object.values(row))
      .map((v) => (Buffer.isBuffer(v) ? v.toString('latin1') : String(v)))
      .join('|');
    expect(dump).not.toContain('example.org');
    expect(dump).not.toContain('Geschäftsbedingungen');
    expect(dump).not.toContain('Widerruf');
  });

  it("refuses another user's message, assistant messages and a second set", () => {
    const a = repo.createChat(anna, 'quick');
    const msg = repo.addMessage(anna, a.id, {
      role: 'user',
      content: 'x',
      modelId: null,
      status: 'done',
    });
    const reply = repo.addMessage(anna, a.id, {
      role: 'assistant',
      content: 'y',
      modelId: 'quick',
      status: 'done',
    });
    expect(() => repo.addPages(ben, msg.id, [read])).toThrow(NotFoundError);
    expect(() => repo.addPages(anna, reply.id, [read])).toThrow(NotFoundError);
    const [page] = repo.addPages(anna, msg.id, [read]);
    expect(() => repo.addPages(anna, msg.id, [read])).toThrow(NotFoundError);
    expect(repo.pageText(ben, page?.id ?? '')).toBeNull();
  });

  it('deletes pages with the chat', () => {
    const a = repo.createChat(anna, 'quick');
    const msg = repo.addMessage(anna, a.id, {
      role: 'user',
      content: 'x',
      modelId: null,
      status: 'done',
    });
    repo.addPages(anna, msg.id, [read]);
    repo.deleteChat(anna, a.id);
    expect(db.prepare('SELECT COUNT(*) AS n FROM web_pages').get()).toEqual({ n: 0 });
  });
});

describe('titles', () => {
  it('names an untitled chat after the first user message only', () => {
    const a = repo.createChat(anna, 'quick');
    repo.addMessage(anna, a.id, {
      role: 'user',
      content: '\n  Urlaub planen  \nDetails',
      modelId: null,
      status: 'done',
    });
    repo.addMessage(anna, a.id, {
      role: 'user',
      content: 'Zweite Frage',
      modelId: null,
      status: 'done',
    });
    expect(repo.getChat(anna, a.id)?.title).toBe('Urlaub planen');
    const b = repo.createChat(anna, 'quick');
    repo.updateChat(anna, b.id, { title: 'Mein Titel' });
    repo.addMessage(anna, b.id, { role: 'user', content: 'Hallo', modelId: null, status: 'done' });
    expect(repo.getChat(anna, b.id)?.title).toBe('Mein Titel');
  });

  it('shortens long first lines and ignores photo-only messages', () => {
    expect(titleFrom('x'.repeat(100))).toBe(`${'x'.repeat(59)}…`);
    expect(titleFrom('   ')).toBeNull();
    expect(titleFrom('Grüße 👋')).toBe('Grüße 👋');
  });
});
