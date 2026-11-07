import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { AccountResponse, StreamEvent } from '@hemmia/shared';
import { type App, buildApp } from '../app.ts';
import { loadConfig } from '../config/load.ts';
import { createChatRepo } from '../db/chats.ts';
import { openDatabase } from '../db/database.ts';
import type { ChatChunk, ChatRequest, LlmClient } from '../llm/types.ts';
import { createOverrideStore } from '../models/overrides.ts';
import type { ModelRegistry, ResolvedChatModel } from '../models/types.ts';
import type { WebSearchOptions } from '../tools/websearch.ts';
import { writesToolCall } from './reply.ts';
import { findPhotos, type PhotoSearchOptions } from '../tools/webphotos.ts';

const ORIGIN = 'http://localhost:5173';
const model: ResolvedChatModel = {
  id: 'smart',
  label: { en: 'Smart', de: 'Smart' },
  engine: 'ollama',
  ollamaModel: 'smart:1b',
  contextTokens: 8192,
  historyBudgetTokens: 4000,
  think: false,
  unloadAfterUse: false,
  memoryGiB: 2,
  enabled: true,
  adultOnly: false,
  vision: false,
  thinking: false,
  tools: true,
};
const registry: ModelRegistry = {
  list: () => Promise.reject(new Error('unused')),
  chatModel: (id) => Promise.resolve(id === 'smart' ? model : null),
  imageModel: () => null,
  defaultChatModelId: () => 'smart',
};

/** Scripted model: each call returns the next round. */
let rounds: ChatChunk[][];
let requests: ChatRequest[];
const llm: LlmClient = {
  async *chat(req) {
    requests.push({ ...req, messages: [...req.messages] });
    await Promise.resolve();
    for (const c of rounds.shift() ?? [{ type: 'content', text: 'fertig' }]) yield c;
    yield { type: 'done', promptTokens: 1, outputTokens: 1, loadMs: 0 };
  },
  loaded: () => Promise.resolve([{ model: 'smart:1b', memoryGiB: 2 }]),
  unload: () => Promise.resolve(),
  capabilities: () => Promise.resolve({ vision: false, thinking: false, tools: true }),
  installed: () => Promise.resolve([]),
};

let searched: { query: string; options: WebSearchOptions }[];
let searchFails: boolean;
/** Photo searches: query, count and options; image results; URLs downloaded. */
let photoSearches: { query: string; count: number; options: PhotoSearchOptions }[];
let imageResults: unknown[];
let downloaded: string[];
let built: App;

const red = sharp({ create: { width: 640, height: 480, channels: 3, background: '#c33' } })
  .withExif({ IFD0: { Copyright: 'EXIF-MARKER' } })
  .jpeg()
  .toBuffer();
let app: FastifyInstance;

beforeEach(async () => {
  rounds = [];
  requests = [];
  searched = [];
  searchFails = false;
  photoSearches = [];
  downloaded = [];
  imageResults = [1, 2, 3, 4].map((n) => ({
    url: `https://zoo${String(n)}.example/panda`,
    img_src: `https://img${String(n)}.example/panda.jpg`,
    thumbnail_src: `https://thumbs.example/${String(n)}.jpg`,
    title: `Roter Panda ${String(n)}`,
    resolution: '1200×800',
  }));
  built = await buildApp(loadConfig({ NODE_ENV: 'test' }), {
    db: openDatabase(':memory:'),
    kdfParams: { m: 1024, t: 1, p: 1 },
    llm,
    registry,
    webSearchRun: (query, options) => {
      searched.push({ query, options });
      if (searchFails) return Promise.reject(new Error('down'));
      return Promise.resolve({
        search: { query, sources: [{ title: 'Wetter', url: 'https://wetter.example/muc' }] },
        toolResult: `<web_results>Sonnig, 21 °C</web_results>`,
      });
    },
    // The real photo search and storage, with SearXNG and the image hosts faked.
    webPhotosRun: (query, count, options) => {
      photoSearches.push({ query, count, options });
      return findPhotos(query, count, {
        ...options,
        fetchJson: () => Promise.resolve(Response.json({ results: imageResults })),
        fetchBytes: async (url) => {
          downloaded.push(url);
          // Host 1 refuses the original but has a thumbnail; host 2 sends junk.
          if (url.startsWith('https://img1.')) throw new Error('403');
          if (url.startsWith('https://img2.')) return Buffer.from('<html>not an image</html>');
          return red;
        },
      });
    },
  });
  app = built.app;
});

afterEach(async () => {
  await app.close();
});

async function signUp(restricted = false) {
  const invite = built.auth.createInvite({ role: 'member', restricted, createdBy: null });
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/invite/accept',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    payload: JSON.stringify({
      code: invite.code,
      username: 'anna',
      password: 'blue tractor sings loudly',
    }),
  });
  const cookie = String(res.headers['set-cookie']).split(';')[0] ?? '';
  AccountResponse.parse(res.json());
  const session = built.auth.resolveSession(cookie.split('=')[1] ?? '');
  if (!session) throw new Error('no session');
  return { cookie, chatId: createChatRepo(built.db).createChat(session, 'smart').id, session };
}

async function ask(cookie: string, chatId: string, content = 'Wie wird das Wetter in München?') {
  const res = await app.inject({
    method: 'POST',
    url: `/api/chats/${chatId}/messages`,
    headers: { origin: ORIGIN, 'content-type': 'application/json', cookie },
    payload: JSON.stringify({ content }),
  });
  return res.body
    .split('\n\n')
    .filter((b) => b.includes('data: '))
    .map((b) => StreamEvent.parse(JSON.parse(b.slice(b.indexOf('data: ') + 6))));
}

const searchCall = (query: string): ChatChunk => ({
  type: 'tool_call',
  name: 'web_search',
  arguments: { query },
});

describe('web search in replies', () => {
  it('searches, gives the results back to the model, and saves the searches with the reply', async () => {
    const anna = await signUp();
    rounds = [
      [{ type: 'content', text: 'Ich schaue nach.' }, searchCall('Wetter München')],
      [{ type: 'content', text: 'Sonnig, 21 °C [Wetter](https://wetter.example/muc)' }],
    ];
    const events = await ask(anna.cookie, anna.chatId);
    expect(events.map((e) => e.type)).toEqual([
      'started',
      'token',
      'search',
      'sources',
      'token',
      'token',
      'done',
    ]);
    expect(requests[0]?.tools?.map((t) => t.name)).toEqual([
      'web_search',
      'show_photos',
      'save_plan',
      'list_plans',
      'set_day_plan',
      'update_day_item',
      'add_goal',
      'update_goal',
      'list_goals',
      'remember',
    ]);
    const second = requests[1]?.messages.slice(-2);
    expect(second?.[0]).toMatchObject({
      role: 'assistant',
      toolCalls: [{ name: 'web_search', arguments: { query: 'Wetter München' } }],
    });
    expect(second?.[1]).toMatchObject({
      role: 'tool',
      toolName: 'web_search',
      content: '<web_results>Sonnig, 21 °C</web_results>',
    });
    expect(searched[0]?.options.safeSearch).toBe(1);

    const done = events.at(-1);
    expect(done?.type === 'done' && done.message.content).toBe(
      'Ich schaue nach.\n\nSonnig, 21 °C [Wetter](https://wetter.example/muc)',
    );
    const saved = createChatRepo(built.db).listMessages(anna.session, anna.chatId, { limit: 5 })
      ?.messages[0];
    expect(saved?.searches).toEqual([
      {
        query: 'Wetter München',
        sources: [{ title: 'Wetter', url: 'https://wetter.example/muc' }],
      },
    ]);
    const raw = built.db
      .prepare('SELECT searches FROM messages WHERE role = ?')
      .get('assistant') as { searches: Buffer };
    expect(raw.searches.toString('latin1')).not.toContain('München');
  });

  it('runs the round again when the model writes the call out instead of calling it', async () => {
    const anna = await signUp();
    rounds = [
      [
        {
          type: 'content',
          text: 'Let me search for this.\n\n[web_search call 525f441d-f33c-44e0-8912-36893b701d36]',
        },
      ],
      [searchCall('RCAT')],
      [{ type: 'content', text: 'Here is what I found.' }],
    ];
    const events = await ask(anna.cookie, anna.chatId);
    expect(searched.map((s) => s.query)).toEqual(['RCAT']);
    expect(events).toContainEqual({ type: 'replace', text: '' });
    const done = events.at(-1);
    expect(done?.type === 'done' && done.message.content).not.toContain('web_search');
    expect(done?.type === 'done' && done.message.content).toContain('Here is what I found.');
  });

  it('runs a round with a written call again only once', async () => {
    const anna = await signUp();
    const written: ChatChunk = { type: 'content', text: '<tool_call>{"name": "web_search"}' };
    rounds = [[written], [written], [{ type: 'content', text: 'never asked' }]];
    await ask(anna.cookie, anna.chatId);
    expect(requests).toHaveLength(2);
  });

  it(`tells the model to answer after ${String(3)} searches`, async () => {
    const anna = await signUp();
    rounds = [
      [searchCall('a'), searchCall('b')],
      [searchCall('c'), searchCall('d')],
      [searchCall('e')],
      [{ type: 'content', text: 'ok' }],
    ];
    const events = await ask(anna.cookie, anna.chatId);
    expect(searched.map((s) => s.query)).toEqual(['a', 'b', 'c']);
    // The tool stays offered (without it qwen3.8 answers with nothing); calls over the limit
    // get a result that says to answer now, one per call.
    expect(requests[2]?.tools?.map((t) => t.name)).toContain('web_search');
    const results = (n: number) =>
      requests[n]?.messages.filter((m) => m.role === 'tool').map((m) => m.content.slice(0, 13));
    expect(results(2)?.slice(-2)).toEqual(['<web_results>', 'Not searched:']);
    expect(results(3)?.at(-1)).toBe('Not searched:');
    expect(events.filter((e) => e.type === 'search')).toHaveLength(3);
    const done = events.at(-1);
    expect(done?.type === 'done' && done.message.content).toBe('ok');
  });

  it('uses strict safe search for teen accounts, and respects the admin setting', async () => {
    const teen = await signUp(true);
    rounds = [[searchCall('Hausaufgaben')]];
    await ask(teen.cookie, teen.chatId);
    expect(searched[0]?.options.safeSearch).toBe(2);

    const store = createOverrideStore(built.db);
    store.set({ ...store.get(), webSearch: 'adults' });
    requests = [];
    await ask(teen.cookie, teen.chatId, 'noch was');
    expect(requests[0]?.tools?.map((t) => t.name)).not.toContain('web_search');
    expect(requests[0]?.messages[0]?.content).toContain('You cannot browse the internet.');
  });

  it('tells the model when the search service is down and still answers', async () => {
    const anna = await signUp();
    searchFails = true;
    rounds = [[searchCall('Bahn Streik')], [{ type: 'content', text: 'Ich konnte nicht suchen.' }]];
    const events = await ask(anna.cookie, anna.chatId);
    expect(events.at(-1)?.type).toBe('done');
    expect(requests[1]?.messages.at(-1)?.content).toContain('search failed');
  });
});

const photoCall = (query: string, count?: number): ChatChunk => ({
  type: 'tool_call',
  name: 'show_photos',
  arguments: count === undefined ? { query } : { query, count },
});

describe('photos from the web in replies', () => {
  it('stores the photos re-encoded and encrypted with the reply and credits their pages', async () => {
    const anna = await signUp();
    rounds = [
      [photoCall('red panda', 2)],
      [{ type: 'content', text: 'Der Rote Panda lebt im Himalaya.' }],
    ];
    const events = await ask(anna.cookie, anna.chatId, 'Wie sieht ein Roter Panda aus?');
    expect(events.map((e) => e.type)).toEqual([
      'started',
      'search',
      'sources',
      'image',
      'image',
      'token',
      'done',
    ]);
    expect(requests[0]?.tools?.map((t) => t.name)).toContain('show_photos');
    expect(requests[0]?.messages[0]?.content).toContain('show_photos');
    expect(photoSearches[0]?.options.safeSearch).toBe(1);
    // Host 1 via its thumbnail, host 2 skipped (not an image), host 3; host 4 not needed.
    const done = events.at(-1);
    const attachments = done?.type === 'done' ? done.message.attachments : [];
    expect(attachments.map((a) => [a.kind, a.mime, a.source?.url])).toEqual([
      ['web', 'image/jpeg', 'https://zoo1.example/panda'],
      ['web', 'image/jpeg', 'https://zoo3.example/panda'],
    ]);
    expect(downloaded).toContain('https://thumbs.example/1.jpg');
    expect(requests[1]?.messages.at(-1)).toMatchObject({
      role: 'tool',
      toolName: 'show_photos',
      content: expect.stringContaining('Shown 2 photos') as unknown,
    });
    expect(requests[1]?.messages.at(-1)?.content).toContain('zoo1.example, zoo3.example');

    const saved = createChatRepo(built.db).listMessages(anna.session, anna.chatId, { limit: 5 })
      ?.messages[0];
    expect(saved?.attachments.map((a) => a.source)).toEqual([
      { title: 'Roter Panda 1', url: 'https://zoo1.example/panda' },
      { title: 'Roter Panda 3', url: 'https://zoo3.example/panda' },
    ]);
    expect(saved?.searches).toEqual([
      { query: 'red panda', sources: saved?.attachments.map((a) => a.source) },
    ]);
    const raw = built.db.prepare("SELECT source FROM attachments WHERE kind = 'web'").all() as {
      source: Buffer;
    }[];
    expect(raw).toHaveLength(2);
    for (const r of raw) expect(r.source.toString('latin1')).not.toContain('zoo');

    const first = attachments[0];
    const res = await app.inject({
      method: 'GET',
      url: `/api/attachments/${first?.id ?? ''}`,
      headers: { cookie: anna.cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.rawPayload.toString('latin1')).not.toContain('EXIF-MARKER');
  });

  it('runs one photo search per reply and refuses further calls', async () => {
    const anna = await signUp();
    rounds = [[photoCall('a')], [photoCall('b')], [{ type: 'content', text: 'ok' }]];
    const events = await ask(anna.cookie, anna.chatId);
    expect(photoSearches.map((p) => [p.query, p.count])).toEqual([['a', 3]]);
    expect(requests[2]?.tools?.map((t) => t.name)).toContain('show_photos');
    expect(requests[2]?.messages.at(-1)?.content).toContain('already shown');
    const done = events.at(-1);
    expect(done?.type === 'done' && done.message.attachments).toHaveLength(3);
  });

  it('does not count the photo search against the web searches', async () => {
    const anna = await signUp();
    rounds = [
      [photoCall('Elch')],
      [searchCall('a'), searchCall('b'), searchCall('c')],
      [{ type: 'content', text: 'ok' }],
    ];
    await ask(anna.cookie, anna.chatId);
    expect(searched.map((s) => s.query)).toEqual(['a', 'b', 'c']);
  });

  it('answers without photos when none can be fetched', async () => {
    const anna = await signUp();
    imageResults = [{ url: 'javascript:x', img_src: 'https://img9.example/a.jpg' }];
    rounds = [[photoCall('nichts')], [{ type: 'content', text: 'ok' }]];
    const events = await ask(anna.cookie, anna.chatId);
    expect(requests[1]?.messages.at(-1)?.content).toContain('No photos found');
    const done = events.at(-1);
    expect(done?.type === 'done' && done.message.attachments).toEqual([]);
  });

  it('follows the web search setting: strict for teens, off when search is off', async () => {
    const teen = await signUp(true);
    rounds = [[photoCall('Pferd')]];
    await ask(teen.cookie, teen.chatId);
    expect(photoSearches[0]?.options.safeSearch).toBe(2);

    const store = createOverrideStore(built.db);
    store.set({ ...store.get(), webSearch: 'adults' });
    requests = [];
    await ask(teen.cookie, teen.chatId, 'noch was');
    expect(requests[0]?.tools?.map((t) => t.name)).not.toContain('show_photos');
    expect(requests[0]?.messages[0]?.content).not.toContain('show_photos');
  });
});

describe('writesToolCall', () => {
  const tools = ['web_search', 'show_photos'];
  it('finds calls written as text', () => {
    expect(writesToolCall('…\n[web_search call 525f441d]', tools)).toBe(true);
    expect(writesToolCall('[ show_photos: pandas ]', tools)).toBe(true);
    expect(writesToolCall('{"name": "web_search", "arguments": {}}', tools)).toBe(true);
    expect(writesToolCall('<tool_call>\n<function=web_search>', tools)).toBe(true);
  });
  it('leaves normal answers alone', () => {
    expect(writesToolCall('I searched the web: [Wetter](https://wetter.example)', tools)).toBe(
      false,
    );
    expect(writesToolCall('[web_searching] is not a tool', tools)).toBe(false);
    expect(writesToolCall('[remember this]', tools)).toBe(false);
  });
});
