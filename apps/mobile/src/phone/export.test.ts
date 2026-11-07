import { describe, expect, it } from 'vitest';
import type { SecretName, SecureStore } from '../native/secureStore.ts';
import { buildExport, deleteEverything, exportFileName, importExport } from './export.ts';
import { createKeys } from './keys.ts';
import { createPhoneStore, type PhoneFiles, type StoredChat } from './store.ts';

function memoryFiles(): PhoneFiles & { data: Map<string, Uint8Array<ArrayBuffer>> } {
  const data = new Map<string, Uint8Array<ArrayBuffer>>();
  return {
    data,
    read: (p) => Promise.resolve(data.get(p) ?? null),
    write: (p, d) => {
      data.set(p, d);
      return Promise.resolve();
    },
    rename: (a, b) => {
      const d = data.get(a);
      if (d) data.set(b, d);
      data.delete(a);
      return Promise.resolve();
    },
    remove: (p) => {
      data.delete(p);
      return Promise.resolve();
    },
    list: (dir) =>
      Promise.resolve(
        [...data.entries()]
          .filter(([p]) => p.startsWith(`${dir}/`))
          .map(([p, d]) => ({ name: p.slice(dir.length + 1), size: d.length })),
      ),
    removeAll: () => {
      data.clear();
      return Promise.resolve();
    },
  };
}

function phone() {
  const files = memoryFiles();
  const secrets = new Map<SecretName, string>();
  const secure: SecureStore = {
    get: ({ name }) => Promise.resolve({ value: secrets.get(name) ?? null }),
    set: ({ name, value }) => {
      secrets.set(name, value);
      return Promise.resolve();
    },
    remove: ({ name }) => {
      secrets.delete(name);
      return Promise.resolve();
    },
  };
  const keys = createKeys(secure);
  const store = createPhoneStore(files, () => keys.dataKey(), { language: 'en' });
  let n = 0;
  const newId = () => `id${String(++n).padStart(6, '0')}`;
  return { files, secrets, keys, store, newId };
}

const chat = (id: string, title: string, at: number, photoIds?: string[]): StoredChat => ({
  id,
  title,
  createdAt: at,
  model: 'claude-sonnet',
  messages: [
    {
      id: `u${id}`,
      role: 'user',
      content: `question ${title}`,
      createdAt: at + 1,
      ...(photoIds ? { photoIds } : {}),
    },
    {
      id: `a${id}`,
      role: 'assistant',
      content: 'answer',
      createdAt: at + 2,
      model: 'claude-sonnet',
      stopped: true,
    },
  ],
});

describe('phone export', () => {
  it('names the file by date', () => {
    expect(exportFileName(new Date(Date.UTC(2026, 9, 24, 23, 0)))).toBe(
      'hemmia-chats-2026-10-24.json',
    );
  });

  it('round-trips chats and photos into another phone with new ids', async () => {
    const a = phone();
    await a.store.setProfile({ aboutMe: 'I like trains.' });
    await a.store.savePhoto('photo001', new Uint8Array([0xff, 0xd8, 1, 2, 3]));
    await a.store.saveChat(chat('chat0001', 'One', 10, ['photo001']));
    await a.store.saveChat(chat('chat0002', 'Two', 20));
    const { data, skipped } = await buildExport(a.store, 99);
    expect(skipped).toBe(0);
    expect(data.chats.map((c) => c.title)).toEqual(['Two', 'One']);

    const b = phone();
    const r = await importExport(b.store, JSON.stringify(data), b.newId);
    expect(r).toEqual({ ok: true, chats: 2 });
    const list = await b.store.listChats();
    expect(list.map((c) => c.title)).toEqual(['Two', 'One']);
    expect(list.some((c) => c.id === 'chat0001')).toBe(false);
    const one = await b.store.getChat(list[1]?.id ?? '');
    expect(one?.messages.map((m) => [m.role, m.content, m.stopped])).toEqual([
      ['user', 'question One', undefined],
      ['assistant', 'answer', true],
    ]);
    const photo = await b.store.getPhoto(one?.messages[0]?.photoIds?.[0] ?? '');
    expect([...(photo ?? [])]).toEqual([0xff, 0xd8, 1, 2, 3]);
    expect((await b.store.loadIndex()).aboutMe).toBe('I like trains.');
  });

  it('never overwrites: importing twice gives two copies', async () => {
    const a = phone();
    await a.store.saveChat(chat('chat0001', 'One', 10));
    const text = JSON.stringify((await buildExport(a.store, 1)).data);
    await importExport(a.store, text, a.newId);
    expect((await a.store.listChats()).map((c) => c.title)).toEqual(['One', 'One']);
    expect((await a.store.getChat('chat0001'))?.title).toBe('One');
  });

  it('refuses other files, formats and versions', async () => {
    const b = phone();
    expect(await importExport(b.store, 'not json', b.newId)).toEqual({
      ok: false,
      reason: 'not_json',
    });
    const base = {
      format: 'Hemmia-phone-export',
      version: 1,
      exportedAt: 1,
      aboutMe: '',
      chats: [],
    };
    expect(
      await importExport(b.store, JSON.stringify({ ...base, format: 'other' }), b.newId),
    ).toEqual({
      ok: false,
      reason: 'not_an_export',
    });
    expect(await importExport(b.store, JSON.stringify({ ...base, version: 2 }), b.newId)).toEqual({
      ok: false,
      reason: 'not_an_export',
    });
    expect(await b.store.listChats()).toEqual([]);
  });

  it('deletes everything: no files and no keys remain', async () => {
    const a = phone();
    await a.keys.setApiKey('anthropic', 'sk-ant-1234567890');
    await a.keys.setApiKey('openai', 'sk-proj-1234567890');
    await a.store.saveChat(chat('chat0001', 'One', 10));
    await deleteEverything(a.store, a.keys);
    expect(a.files.data.size).toBe(0);
    expect(a.secrets.size).toBe(0);
  });
});
