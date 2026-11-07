import { createAnthropicClient, createOpenAiClient, type FetchLike } from '@hemmia/providers';
import { describe, expect, it } from 'vitest';
import type { SecretName, SecureStore } from '../native/secureStore.ts';
import { importDataKey, newDataKeyBytes } from './crypto.ts';
import { fitLongEdge, sendTurn, titleFrom, type TurnInput } from './chat.ts';
import { createKeys } from './keys.ts';
import type { PhoneModel } from './models.ts';
import { createPhoneStore, type PhoneFiles, type StoredChat } from './store.ts';

const sse = (events: readonly object[]) =>
  events
    .map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`)
    .join('');

const START = [
  { type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 1 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello ' } },
];
const END = [
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'there.' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } },
  { type: 'message_stop' },
];

/** Answers with SSE; with `hang`, sends the start and then waits until the request is aborted. */
function fakeFetch(opts: { status?: number; body?: string; hang?: boolean } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: FetchLike = (url, init) => {
    calls.push({ url, init });
    const bytes = new TextEncoder().encode(opts.body ?? sse([...START, ...END]));
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        if (opts.hang) {
          c.enqueue(new TextEncoder().encode(sse(START)));
          init.signal?.addEventListener('abort', () => {
            c.error(new DOMException('aborted', 'AbortError'));
          });
          return;
        }
        for (let i = 0; i < bytes.length; i += 9) c.enqueue(bytes.slice(i, i + 9));
        c.close();
      },
    });
    return Promise.resolve(new Response(stream, { status: opts.status ?? 200 }));
  };
  return { fetch, calls };
}

function memoryFiles(): PhoneFiles {
  const data = new Map<string, Uint8Array<ArrayBuffer>>();
  return {
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
    list: () => Promise.resolve([]),
    removeAll: () => {
      data.clear();
      return Promise.resolve();
    },
  };
}

const MODEL: PhoneModel = {
  id: 'claude-sonnet',
  label: { en: 'Claude', de: 'Claude' },
  description: { en: '', de: '' },
  provider: 'anthropic',
  providerModel: 'claude-sonnet-5-5',
  historyBudgetTokens: 40000,
  vision: true,
  thinking: true,
};

async function setup(f: ReturnType<typeof fakeFetch>, withKey = true) {
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
  if (withKey) await keys.setApiKey('anthropic', 'sk-ant-test-1234');
  const key = await importDataKey(newDataKeyBytes());
  const store = createPhoneStore(memoryFiles(), () => Promise.resolve(key), { language: 'en' });
  let n = 0;
  const deps = {
    store,
    keys,
    clients: {
      anthropic: createAnthropicClient({ fetch: f.fetch, browser: true }),
      openai: createOpenAiClient({ fetch: f.fetch }),
    },
    now: () => 1000 + n,
    newId: () => `id${String(++n).padStart(6, '0')}`,
  };
  return { deps, store };
}

const empty: StoredChat = {
  id: 'chat0001',
  title: '',
  createdAt: 1,
  model: 'claude-sonnet',
  messages: [],
};

function input(over: Partial<TurnInput> = {}): TurnInput & { replies: string[] } {
  const replies: string[] = [];
  return {
    text: 'Hi',
    photos: [],
    model: MODEL,
    think: false,
    aboutMe: 'I live in Hamburg.',
    language: 'en',
    signal: new AbortController().signal,
    onReply: (t) => replies.push(t),
    replies,
    ...over,
  };
}

describe('sendTurn', () => {
  it('saves the message, streams the reply and saves it, with the browser header and About me', async () => {
    const f = fakeFetch();
    const { deps, store } = await setup(f);
    const i = input();
    const r = await sendTurn(deps, empty, i);
    expect([r.error, r.stopped]).toEqual([null, false]);
    expect(i.replies.at(-1)).toBe('Hello there.');
    const saved = await store.getChat('chat0001');
    expect(saved?.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'Hi'],
      ['assistant', 'Hello there.'],
    ]);
    expect(saved?.title).toBe('Hi');
    const headers = f.calls[0]?.init.headers as Record<string, string>;
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect((f.calls[0]?.init.body as string).includes('I live in Hamburg.')).toBe(true);
  });

  it('saves a partial reply marked as stopped when aborted', async () => {
    const f = fakeFetch({ hang: true });
    const { deps, store } = await setup(f);
    const ctrl = new AbortController();
    const i = input({
      signal: ctrl.signal,
      onReply: () => {
        ctrl.abort();
      },
    });
    const r = await sendTurn(deps, empty, i);
    expect([r.error, r.stopped]).toEqual([null, true]);
    const last = (await store.getChat('chat0001'))?.messages.at(-1);
    expect([last?.content, last?.stopped]).toEqual(['Hello ', true]);
  });

  it('reports a refused key and keeps the user message', async () => {
    const f = fakeFetch({ status: 401, body: '{"type":"error"}' });
    const { deps, store } = await setup(f);
    const r = await sendTurn(deps, empty, input());
    expect(r.error).toBe('auth');
    expect((await store.getChat('chat0001'))?.messages.map((m) => m.role)).toEqual(['user']);
  });

  it('asks for a key before sending anything', async () => {
    const f = fakeFetch();
    const { deps } = await setup(f, false);
    expect((await sendTurn(deps, empty, input())).error).toBe('no_key');
    expect(f.calls.length).toBe(0);
  });

  it('sends attached photos with the message', async () => {
    const f = fakeFetch();
    const { deps, store } = await setup(f);
    await sendTurn(deps, empty, input({ photos: [new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])] }));
    const user = (await store.getChat('chat0001'))?.messages[0];
    expect(user?.photoIds?.length).toBe(1);
    expect((f.calls[0]?.init.body as string).includes('"type":"image"')).toBe(true);
  });
});

describe('helpers', () => {
  it('cuts titles at a word boundary', () => {
    expect(titleFrom('  short  question ')).toBe('short question');
    const t = titleFrom(
      'What is the best way to plan a family trip to the north of Sweden in winter?',
    );
    expect(t.length <= 61).toBe(true);
    expect(t).toBe('What is the best way to plan a family trip to the north of…');
  });

  it('keeps the aspect ratio with the long edge at most 1568', () => {
    expect(fitLongEdge(4032, 3024)).toEqual({ width: 1568, height: 1176 });
    expect(fitLongEdge(3000, 6000)).toEqual({ width: 784, height: 1568 });
    expect(fitLongEdge(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
