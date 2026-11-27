import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  AccountResponse,
  ChatSummary,
  MessagesResponse,
  ShoppingAddedRef,
  ShoppingListResponse,
} from '@hemmia/shared';
import { type App, buildApp } from '../app.ts';
import { loadConfig } from '../config/load.ts';
import { openDatabase } from '../db/database.ts';
import { defaultCountry } from '../db/shopping.ts';
import type { ChatChunk, ChatRequest, LlmClient } from '../llm/types.ts';
import type { ModelRegistry, ResolvedChatModel } from '../models/types.ts';

const ORIGIN = 'http://localhost:5173';
const NOW = new Date(2026, 10, 24, 18, 0).getTime();
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
let rounds: ChatChunk[][];
let requests: ChatRequest[];
const llm: LlmClient = {
  async *chat(req) {
    requests.push({ ...req, messages: [...req.messages] });
    await Promise.resolve();
    for (const c of rounds.shift() ?? [{ type: 'content', text: 'ok' }]) yield c;
    yield { type: 'done', promptTokens: 1, outputTokens: 1, loadMs: 0 };
  },
  loaded: () => Promise.resolve([{ model: 'smart:1b', memoryGiB: 2 }]),
  unload: () => Promise.resolve(),
  capabilities: () => Promise.resolve({ vision: false, thinking: false, tools: true }),
  installed: () => Promise.resolve([]),
};

let built: App;
let app: FastifyInstance;
beforeEach(async () => {
  rounds = [];
  requests = [];
  built = await buildApp(loadConfig({ NODE_ENV: 'test' }), {
    db: openDatabase(':memory:'),
    kdfParams: { m: 1024, t: 1, p: 1 },
    llm,
    registry,
    now: () => NOW,
    webSearchRun: () => Promise.reject(new Error('unused')),
  });
  app = built.app;
});
afterEach(async () => {
  await app.close();
});

async function signUp(username: string, restricted = false) {
  const invite = built.auth.createInvite({ role: 'member', restricted, createdBy: null });
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/invite/accept',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    payload: JSON.stringify({ code: invite.code, username, password: 'blue tractor sings loudly' }),
  });
  const me = AccountResponse.parse(res.json()).me;
  return { cookie: String(res.headers['set-cookie']).split(';')[0] ?? '', userId: me.id };
}
const call = (
  method: 'GET' | 'PUT' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  cookie: string,
  body?: unknown,
) =>
  app.inject({
    method,
    url,
    headers: {
      origin: ORIGIN,
      cookie,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { payload: JSON.stringify(body) } : {}),
  });
const list = async (cookie: string, name: 'mine' | 'family' = 'mine') =>
  ShoppingListResponse.parse((await call('GET', `/api/shopping/${name}`, cookie)).json());

describe('shopping list', () => {
  it('keeps each person’s list to themselves, encrypted', async () => {
    const rosa = await signUp('rosa');
    const ben = await signUp('ben');
    await call('PUT', '/api/shopping/mine/settings', rosa.cookie, { country: 'DE' });
    const added = await call('POST', '/api/shopping/mine/items', rosa.cookie, {
      text: '2 l Milch',
    });
    expect(added.statusCode).toBe(201);
    expect(ShoppingAddedRef.parse(added.json()).count).toBe(1);

    const mine = await list(rosa.cookie);
    expect(mine.items).toMatchObject([
      { key: 'milk', name: 'Milch', aisle: 'dairy', buy: { count: 2, size: 1, unit: 'l' } },
    ]);
    expect((await list(ben.cookie)).items).toEqual([]);
    expect((await call('DELETE', '/api/shopping/mine/items/milk', ben.cookie)).statusCode).toBe(
      404,
    );

    const raw = built.db.prepare('SELECT data FROM shopping_lists').get() as { data: Buffer };
    expect(raw.data.toString('latin1')).not.toContain('Milch');
  });

  it('ticks off, marks as at home, changes the count and removes items', async () => {
    const rosa = await signUp('rosa');
    await call('PUT', '/api/shopping/mine/settings', rosa.cookie, { country: 'DE' });
    await call('POST', '/api/shopping/mine/items', rosa.cookie, { text: '6 eggs' });
    await call('POST', '/api/shopping/mine/items', rosa.cookie, { text: 'Salz' });
    await call('POST', '/api/shopping/mine/items', rosa.cookie, { text: 'saffron' });

    let items = (await list(rosa.cookie)).items;
    expect(items.find((i) => i.key === 'salt')).toMatchObject({ status: 'home', alwaysHome: true });
    expect(items.find((i) => i.key === 'eggs')?.buy).toEqual({
      count: 6,
      size: null,
      unit: 'piece',
    });

    expect(
      (
        await call('PATCH', '/api/shopping/mine/items/eggs', rosa.cookie, {
          status: 'bought',
          count: 10,
        })
      ).statusCode,
    ).toBe(204);
    await call('PATCH', '/api/shopping/mine/items/saffron', rosa.cookie, { alwaysHome: true });
    await call('PATCH', '/api/shopping/mine/items/salt', rosa.cookie, { status: 'open' });
    items = (await list(rosa.cookie)).items;
    expect(items.find((i) => i.key === 'eggs')).toMatchObject({
      status: 'bought',
      adjusted: true,
      buy: { count: 10 },
    });
    expect(items.find((i) => i.key === 'saffron')).toMatchObject({
      status: 'home',
      alwaysHome: true,
    });
    expect(items.find((i) => i.key === 'salt')?.status).toBe('open');

    await call('POST', '/api/shopping/mine/clear', rosa.cookie, { what: 'bought' });
    expect((await list(rosa.cookie)).items.map((i) => i.key).sort()).toEqual(['saffron', 'salt']);

    // "Always at home" lasts: saffron added again starts at home.
    await call('DELETE', '/api/shopping/mine/items/saffron', rosa.cookie);
    await call('POST', '/api/shopping/mine/items', rosa.cookie, { text: 'Saffron' });
    expect((await list(rosa.cookie)).items.find((i) => i.key === 'saffron')?.status).toBe('home');

    await call('POST', '/api/shopping/mine/clear', rosa.cookie, { what: 'all' });
    expect((await list(rosa.cookie)).items).toEqual([]);
  });

  it('lets teens use it and rejects bad input', async () => {
    const kid = await signUp('kid', true);
    expect(
      (await call('POST', '/api/shopping/mine/items', kid.cookie, { text: 'apples' })).statusCode,
    ).toBe(201);
    expect(
      (await call('POST', '/api/shopping/mine/items', kid.cookie, { text: '' })).statusCode,
    ).toBe(400);
    expect(
      (await call('PUT', '/api/shopping/mine/settings', kid.cookie, { country: 'XX' })).statusCode,
    ).toBe(400);
    expect((await call('GET', '/api/shopping/family', '')).statusCode).toBe(401);
    expect((await call('GET', '/api/shopping/everyone', kid.cookie)).statusCode).toBe(400);
  });

  it('picks a country from the hub’s time zone, else the language', () => {
    expect(defaultCountry('en', 'Europe/Berlin')).toBe('DE');
    expect(defaultCountry('de', 'America/New_York')).toBe('US');
    expect(defaultCountry('fr', 'Asia/Tokyo')).toBe('FR');
    expect(defaultCountry('en', 'UTC')).toBe('GB');
  });

  it('puts a recipe from the chat on the list, adapted to the country, with undo', async () => {
    const rosa = await signUp('rosa');
    const kid = await signUp('kid', true);
    await call('PUT', '/api/shopping/family/settings', rosa.cookie, { country: 'DE' });
    const chat = ChatSummary.parse((await call('POST', '/api/chats', rosa.cookie, {})).json());
    rounds = [
      [
        {
          type: 'tool_call',
          name: 'add_to_shopping_list',
          arguments: {
            recipe: { title: 'Chicken pot pie', servings: 4, servings_wanted: 8 },
            items: [
              {
                name: 'Hähnchenbrust',
                generic: 'chicken breast',
                amount: '1',
                unit: 'lb',
                aisle: 'meat',
              },
              {
                name: 'Schlagsahne 30 %',
                generic: 'heavy cream',
                amount: '⅔',
                unit: 'cup',
                aisle: 'dairy',
                replaces: 'heavy cream',
              },
              { name: 'Mehl', generic: 'flour', amount: '1/3', unit: 'cup', aisle: 'pantry' },
              { name: 'Wasser', generic: 'water', amount: '1', unit: 'cup', aisle: 'other' },
              { name: 'Thymian', generic: 'thyme', amount: 1, unit: 'tsp', aisle: 'nonsense' },
            ],
          },
        },
      ],
      [{ type: 'content', text: 'Steht auf der Liste.' }],
    ];
    await call('POST', `/api/chats/${chat.id}/messages`, rosa.cookie, {
      content: 'Setz das auf die Einkaufsliste, für 8 Personen',
    });
    const system = requests[0]?.messages[0]?.content ?? '';
    expect(system).toContain('shops in Germany');
    expect(system).toContain('offering to put the ingredients on the shopping list');
    expect(requests[0]?.tools?.map((t) => t.name)).toContain('add_to_shopping_list');
    expect(requests[1]?.messages.at(-1)).toMatchObject({
      role: 'tool',
      toolName: 'add_to_shopping_list',
    });
    expect(requests[1]?.messages.at(-1)?.content).toContain('Added 4 items to the family');

    // Without "list", the model's items go on the family list.
    expect((await list(rosa.cookie)).items).toEqual([]);
    const items = (await list(kid.cookie, 'family')).items;
    expect(items.map((i) => i.key)).toEqual(['thyme', 'chicken breast', 'heavy cream', 'flour']);
    // 8 servings from a recipe for 4: 2 lb chicken, 1⅓ cups cream.
    expect(items.find((i) => i.key === 'chicken breast')?.buy).toEqual({
      count: 1,
      size: 900,
      unit: 'g',
    });
    expect(items.find((i) => i.key === 'heavy cream')).toMatchObject({
      buy: { count: 2, size: 200, unit: 'ml' },
      swappedFrom: ['heavy cream'],
    });
    expect(items.find((i) => i.key === 'flour')?.status).toBe('home');
    expect(items.find((i) => i.key === 'thyme')?.aisle).toBe('produce');

    const messages = MessagesResponse.parse(
      (await call('GET', `/api/chats/${chat.id}/messages`, rosa.cookie)).json(),
    ).messages;
    const added = messages.find((m) => m.role === 'assistant')?.shopping[0];
    expect(added).toMatchObject({
      list: 'family',
      recipe: 'Chicken pot pie',
      count: 4,
      adapted: [{ from: 'heavy cream', to: 'Schlagsahne 30 %' }],
      atHome: ['Mehl'],
    });
    expect(
      (await call('DELETE', `/api/shopping/batches/${added?.batchId ?? ''}`, kid.cookie))
        .statusCode,
    ).toBe(404);
    expect(
      (await call('DELETE', `/api/shopping/batches/${added?.batchId ?? ''}`, rosa.cookie))
        .statusCode,
    ).toBe(204);
    expect(await list(rosa.cookie, 'family')).toMatchObject({ items: [], recipes: [] });
  });

  it('offers the tools to teens too, and answers what is on the list', async () => {
    const kid = await signUp('kid', true);
    await call('POST', '/api/shopping/mine/items', kid.cookie, { text: 'Äpfel' });
    const chat = ChatSummary.parse((await call('POST', '/api/chats', kid.cookie, {})).json());
    rounds = [
      [{ type: 'tool_call', name: 'show_shopping_list', arguments: {} }],
      [{ type: 'content', text: 'Äpfel.' }],
    ];
    await call('POST', `/api/chats/${chat.id}/messages`, kid.cookie, {
      content: 'Was muss ich kaufen?',
    });
    expect(requests[1]?.messages.at(-1)?.content).toBe(
      "The family shopping list:\nEmpty.\n\nThe user's own list:\nTo buy:\n- Äpfel",
    );
  });

  it('shares the family list with everyone, encrypted, and says who did what', async () => {
    const rosa = await signUp('rosa');
    const kid = await signUp('kid', true);
    await call('PUT', '/api/shopping/family/settings', rosa.cookie, { country: 'DE' });
    await call('POST', '/api/shopping/family/items', rosa.cookie, { text: '2 l Milch' });
    await call('POST', '/api/shopping/family/items', kid.cookie, { text: 'Bananen' });
    await call('POST', '/api/shopping/mine/items', rosa.cookie, { text: 'Kerzen' });
    expect((await call('GET', '/api/shopping/family/settings', kid.cookie)).json()).toEqual({
      country: 'DE',
    });

    const seen = await list(kid.cookie, 'family');
    expect(seen.list).toBe('family');
    expect(seen.items.map((i) => i.name).sort()).toEqual(['Bananen', 'Milch']);
    expect(seen.items.find((i) => i.key === 'milk')?.addedBy).toEqual([
      { userId: rosa.userId, name: 'rosa' },
    ]);
    // Rosa's own list stays hers.
    expect((await list(kid.cookie)).items).toEqual([]);

    expect(
      (await call('PATCH', '/api/shopping/family/items/milk', kid.cookie, { status: 'bought' }))
        .statusCode,
    ).toBe(204);
    expect((await list(rosa.cookie, 'family')).items.find((i) => i.key === 'milk')).toMatchObject({
      status: 'bought',
      ticked: { userId: kid.userId, name: 'kid', at: NOW },
    });

    const raw = built.db.prepare('SELECT data FROM household_shopping').get() as { data: Buffer };
    expect(raw.data.toString('latin1')).not.toContain('Milch');

    // Anyone can clear the family list, teens included (owner, 2026-11-27).
    await call('POST', '/api/shopping/family/clear', kid.cookie, { what: 'all' });
    expect((await list(rosa.cookie, 'family')).items).toEqual([]);
    expect((await list(rosa.cookie)).items).toHaveLength(1);
  });

  it('moves items and whole lists between the lists', async () => {
    const rosa = await signUp('rosa');
    const ben = await signUp('ben');
    await call('POST', '/api/shopping/family/items', ben.cookie, { text: '6 eggs' });
    await call('PATCH', '/api/shopping/family/items/eggs', ben.cookie, { status: 'bought' });
    await call('POST', '/api/shopping/mine/items', rosa.cookie, { text: '4 eggs' });
    await call('POST', '/api/shopping/mine/items', rosa.cookie, { text: 'candles' });
    await call('POST', '/api/shopping/mine/items', rosa.cookie, { text: 'present for dad' });

    expect(
      (
        await call('POST', '/api/shopping/mine/items/present%20for%20dad/move', rosa.cookie, {
          to: 'mine',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await call('POST', '/api/shopping/mine/items/candles/move', rosa.cookie, { to: 'family' }))
        .statusCode,
    ).toBe(204);
    expect((await list(ben.cookie, 'family')).items.map((i) => i.key).sort()).toEqual([
      'candles',
      'eggs',
    ]);
    expect((await list(rosa.cookie)).items.map((i) => i.key).sort()).toEqual([
      'eggs',
      'present for dad',
    ]);

    // Moving everything adds up with what's there; eggs were bought, now needed again.
    expect(
      (await call('POST', '/api/shopping/mine/move', rosa.cookie, { to: 'family' })).statusCode,
    ).toBe(204);
    expect((await list(rosa.cookie)).items).toEqual([]);
    const family = (await list(ben.cookie, 'family')).items;
    expect(family.find((i) => i.key === 'eggs')).toMatchObject({
      status: 'open',
      buy: { count: 10, unit: 'piece' },
      addedBy: [
        { userId: ben.userId, name: 'ben' },
        { userId: rosa.userId, name: 'rosa' },
      ],
    });
    expect(
      (await call('POST', '/api/shopping/mine/move', rosa.cookie, { to: 'family' })).statusCode,
    ).toBe(404);

    // And back: one item to Rosa's own list.
    await call('POST', '/api/shopping/family/items/present%20for%20dad/move', rosa.cookie, {
      to: 'mine',
    });
    expect((await list(rosa.cookie)).items.map((i) => i.key)).toEqual(['present for dad']);
    expect((await list(ben.cookie, 'family')).items.map((i) => i.key)).not.toContain(
      'present for dad',
    );
  });

  it('undoes and moves a chat batch only for the person who added it', async () => {
    const rosa = await signUp('rosa');
    const ben = await signUp('ben');
    const chat = ChatSummary.parse((await call('POST', '/api/chats', rosa.cookie, {})).json());
    rounds = [
      [
        {
          type: 'tool_call',
          name: 'add_to_shopping_list',
          arguments: {
            recipe: { title: 'Pancakes', servings: 4 },
            items: [
              { name: 'Milk', generic: 'milk', amount: '500', unit: 'ml', aisle: 'dairy' },
              { name: 'Flour', generic: 'flour', amount: '250', unit: 'g', aisle: 'pantry' },
            ],
          },
        },
      ],
      [{ type: 'content', text: 'Done.' }],
    ];
    await call('POST', `/api/chats/${chat.id}/messages`, rosa.cookie, { content: 'Pancakes!' });
    expect((await list(ben.cookie, 'family')).recipes.map((r) => r.title)).toEqual(['Pancakes']);
    const messages = MessagesResponse.parse(
      (await call('GET', `/api/chats/${chat.id}/messages`, rosa.cookie)).json(),
    ).messages;
    const ref = messages.find((m) => m.role === 'assistant')?.shopping[0];
    const id = ref?.batchId ?? '';
    expect(ref?.list).toBe('family');

    expect((await call('DELETE', `/api/shopping/batches/${id}`, ben.cookie)).statusCode).toBe(404);
    expect(
      (await call('POST', `/api/shopping/batches/${id}/move`, ben.cookie, { to: 'mine' }))
        .statusCode,
    ).toBe(404);
    expect(
      (await call('POST', `/api/shopping/batches/${id}/move`, rosa.cookie, { to: 'mine' }))
        .statusCode,
    ).toBe(204);
    expect(await list(ben.cookie, 'family')).toMatchObject({ items: [], recipes: [] });
    expect((await list(rosa.cookie)).recipes.map((r) => r.title)).toEqual(['Pancakes']);

    // Undo still finds it on Rosa's own list.
    expect((await call('DELETE', `/api/shopping/batches/${id}`, rosa.cookie)).statusCode).toBe(204);
    expect(await list(rosa.cookie)).toMatchObject({ items: [], recipes: [] });
  });

  it('asks the model for the family list unless the user wants their own', async () => {
    const rosa = await signUp('rosa');
    const chat = ChatSummary.parse((await call('POST', '/api/chats', rosa.cookie, {})).json());
    rounds = [
      [
        {
          type: 'tool_call',
          name: 'add_to_shopping_list',
          arguments: {
            list: 'mine',
            items: [{ name: 'Wool socks', generic: 'wool socks', aisle: 'other' }],
          },
        },
      ],
      [{ type: 'content', text: 'Only on your list.' }],
    ];
    await call('POST', `/api/chats/${chat.id}/messages`, rosa.cookie, {
      content: 'Put socks for Dad on my own list',
    });
    const system = requests[0]?.messages[0]?.content ?? '';
    expect(system).toContain('family shares a shopping list');
    expect(requests[1]?.messages.at(-1)?.content).toContain("the user's own shopping list");
    expect((await list(rosa.cookie)).items.map((i) => i.key)).toEqual(['wool socks']);
    expect((await list(rosa.cookie, 'family')).items).toEqual([]);
  });
});
