import { describe, expect, it } from 'vitest';
import type { SecretName, SecureStore } from '../native/secureStore.ts';
import { DecryptError, importDataKey, newDataKeyBytes, seal, unseal } from './crypto.ts';
import { createKeys, maskKey } from './keys.ts';
import { createPhoneStore, LIMITS, LimitError, type PhoneFiles, type StoredChat } from './store.ts';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('crypto', () => {
  it('round-trips and starts with the format byte', async () => {
    const key = await importDataKey(newDataKeyBytes());
    const sealed = await seal(key, 'chats/abcdefgh.enc', bytes('hello'));
    expect(sealed[0]).toBe(1);
    expect(sealed.length).toBe(1 + 12 + 5 + 16);
    expect(new TextDecoder().decode(await unseal(key, 'chats/abcdefgh.enc', sealed))).toBe('hello');
  });

  it('fails for another path, another key, a changed byte or a wrong version', async () => {
    const key = await importDataKey(newDataKeyBytes());
    const sealed = await seal(key, 'chats/a1b2c3d4.enc', bytes('hello'));
    await expect(unseal(key, 'chats/zzzzzzzz.enc', sealed)).rejects.toThrow(DecryptError);
    await expect(
      unseal(await importDataKey(newDataKeyBytes()), 'chats/a1b2c3d4.enc', sealed),
    ).rejects.toThrow(DecryptError);
    for (const i of [5, sealed.length - 1]) {
      const tampered = sealed.slice();
      tampered[i] = (tampered[i] ?? 0) ^ 1;
      await expect(unseal(key, 'chats/a1b2c3d4.enc', tampered)).rejects.toThrow(DecryptError);
    }
    const v2 = sealed.slice();
    v2[0] = 2;
    await expect(unseal(key, 'chats/a1b2c3d4.enc', v2)).rejects.toThrow(DecryptError);
  });
});

function fakeSecure(): SecureStore & { values: Map<SecretName, string> } {
  const values = new Map<SecretName, string>();
  return {
    values,
    get: ({ name }) => Promise.resolve({ value: values.get(name) ?? null }),
    set: ({ name, value }) => {
      values.set(name, value);
      return Promise.resolve();
    },
    remove: ({ name }) => {
      values.delete(name);
      return Promise.resolve();
    },
  };
}

describe('keys', () => {
  it('masks keys to the prefix and the last 4 characters', () => {
    expect(maskKey('sk-ant-api03-abcdefghijklmnop1234')).toBe('sk-…1234');
    expect(maskKey('  abcdefghijklWXYZ ')).toBe('…WXYZ');
    expect(maskKey('short')).toBe('…');
  });

  it('stores trimmed API keys and refuses keys with spaces', async () => {
    const s = fakeSecure();
    const keys = createKeys(s);
    await keys.setApiKey('openai', '  sk-proj-123456789 ');
    expect(await keys.apiKey('openai')).toBe('sk-proj-123456789');
    await expect(keys.setApiKey('anthropic', 'sk ant')).rejects.toThrow();
    await keys.removeApiKey('openai');
    expect(await keys.apiKey('openai')).toBeNull();
  });

  it('creates the data key once, even for parallel first uses, and reuses it', async () => {
    const s = fakeSecure();
    const keys = createKeys(s);
    await Promise.all([keys.dataKey(), keys.dataKey()]);
    const stored = s.values.get('dataKey');
    expect(typeof stored).toBe('string');
    await createKeys(s).dataKey();
    expect(s.values.get('dataKey')).toBe(stored);
  });

  it('never replaces the data key when reading it fails', async () => {
    const s = fakeSecure();
    s.values.set('dataKey', 'x');
    const failing = { ...s, get: () => Promise.reject(new Error('unreadable')) };
    await expect(createKeys(failing).dataKey()).rejects.toThrow('unreadable');
    expect(s.values.get('dataKey')).toBe('x');
  });
});

function memoryFiles(): PhoneFiles & { data: Map<string, Uint8Array<ArrayBuffer>> } {
  const data = new Map<string, Uint8Array<ArrayBuffer>>();
  return {
    data,
    read: (p) => Promise.resolve(data.get(p) ?? null),
    write: (p, d) => {
      data.set(p, d);
      return Promise.resolve();
    },
    rename: (from, to) => {
      const d = data.get(from);
      if (!d) return Promise.reject(new Error('does not exist'));
      data.delete(from);
      data.set(to, d);
      return Promise.resolve();
    },
    remove: (p) => {
      data.delete(p);
      return Promise.resolve();
    },
    list: (dir) =>
      Promise.resolve(
        [...data.entries()]
          .filter(([p]) => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes('/'))
          .map(([p, d]) => ({ name: p.slice(dir.length + 1), size: d.length })),
      ),
    removeAll: () => {
      data.clear();
      return Promise.resolve();
    },
  };
}

const chat = (id: string, title: string, at: number): StoredChat => ({
  id,
  title,
  createdAt: at,
  model: 'claude-sonnet-5-5',
  messages: [{ id: `m${id}`, role: 'user', content: 'secret text', createdAt: at + 1 }],
});

async function setup() {
  const files = memoryFiles();
  const key = await importDataKey(newDataKeyBytes());
  return {
    files,
    key,
    store: createPhoneStore(files, () => Promise.resolve(key), { language: 'en' }),
  };
}

describe('phone store', () => {
  it('creates, lists, renames and deletes chats, encrypted on disk', async () => {
    const { files, store } = await setup();
    await store.saveChat(chat('chat0001', 'First', 10));
    await store.saveChat(chat('chat0002', 'Second', 20));
    expect((await store.listChats()).map((c) => c.title)).toEqual(['Second', 'First']);
    await store.renameChat('chat0001', ' Renamed ');
    expect((await store.getChat('chat0001'))?.title).toBe('Renamed');
    expect((await store.listChats()).map((c) => c.title)).toEqual(['Second', 'Renamed']);
    const raw = new TextDecoder().decode(files.data.get('chats/chat0002.enc'));
    expect(raw.includes('secret text')).toBe(false);
    expect([...files.data.keys()].some((p) => p.endsWith('.tmp'))).toBe(false);
    await store.deleteChat('chat0002');
    expect((await store.listChats()).map((c) => c.id)).toEqual(['chat0001']);
    expect(files.data.has('chats/chat0002.enc')).toBe(false);
  });

  it('enforces the limits', async () => {
    const { store } = await setup();
    const big = chat('chat0001', 'Big', 1);
    big.messages = Array.from({ length: LIMITS.messagesPerChat + 1 }, (_, i) => ({
      id: `msg${String(i).padStart(5, '0')}`,
      role: 'user' as const,
      content: 'x',
      createdAt: i,
    }));
    await expect(store.saveChat(big)).rejects.toThrow(LimitError);
    await expect(
      store.savePhoto('photo001', new Uint8Array(LIMITS.photoBytes + 1)),
    ).rejects.toThrow(LimitError);
  });

  it('refuses ids that could leave the folder', async () => {
    const { store } = await setup();
    await expect(store.getChat('../index')).rejects.toThrow();
  });

  it('skips an unreadable chat, reports it once, and never deletes it', async () => {
    const { files, store, key } = await setup();
    await store.saveChat(chat('chat0001', 'Good', 10));
    // A chat written with another key (e.g. after a restore without the data key).
    const other = createPhoneStore(files, () => importDataKey(newDataKeyBytes()), {
      language: 'en',
    });
    await other.saveChat(chat('chat0002', 'Lost', 20)).catch(() => undefined);
    const fresh = createPhoneStore(files, () => Promise.resolve(key), { language: 'en' });
    expect(await fresh.getChat('chat0002')).toBeNull();
    expect(fresh.takeUnreadable()).toBeGreaterThan(0);
    expect(fresh.takeUnreadable()).toBe(0);
    expect(files.data.has('chats/chat0002.enc')).toBe(true);
  });

  it('rebuilds a lost index from the chat files', async () => {
    const { files, store, key } = await setup();
    await store.saveChat(chat('chat0001', 'One', 10));
    files.data.delete('index.enc');
    const fresh = createPhoneStore(files, () => Promise.resolve(key), { language: 'de' });
    expect((await fresh.listChats()).map((c) => c.title)).toEqual(['One']);
  });

  it('stores photos encrypted and deletes them with their chat', async () => {
    const { files, store } = await setup();
    await store.savePhoto('photo001', bytes('JPEGDATA'));
    const c = chat('chat0001', 'Pic', 1);
    c.messages[0] = {
      id: 'msg00001',
      role: 'user',
      content: 'look',
      createdAt: 2,
      photoIds: ['photo001'],
    };
    await store.saveChat(c);
    expect(new TextDecoder().decode((await store.getPhoto('photo001')) ?? new Uint8Array())).toBe(
      'JPEGDATA',
    );
    await store.deleteChat('chat0001');
    expect(files.data.has('photos/photo001.enc')).toBe(false);
  });
});
