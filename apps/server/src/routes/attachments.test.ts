import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { AccountResponse, UploadResponse } from '@hemmia/shared';
import { type App, buildApp } from '../app.ts';
import { loadConfig } from '../config/load.ts';
import { createChatRepo } from '../db/chats.ts';
import { openDatabase } from '../db/database.ts';
import type { ChatChunk, ChatRequest, LlmClient } from '../llm/types.ts';
import type { ModelRegistry, ResolvedChatModel } from '../models/types.ts';
import { tinyPdf } from '../security/document-fixtures.ts';

const ORIGIN = 'http://localhost:5173';
const BOUNDARY = '----kchattestboundary';

function multipartBody(
  parts: { name: string; filename: string; type: string; data: Buffer }[],
): Buffer {
  const chunks: Buffer[] = [];
  for (const p of parts) {
    chunks.push(
      Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${p.name}"; filename="${p.filename}"\r\nContent-Type: ${p.type}\r\n\r\n`,
      ),
      p.data,
      Buffer.from('\r\n'),
    );
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return Buffer.concat(chunks);
}

const model: ResolvedChatModel = {
  id: 'quick',
  label: { en: 'Quick', de: 'Schnell' },
  engine: 'ollama',
  ollamaModel: 'tiny:1b',
  contextTokens: 4096,
  historyBudgetTokens: 8000,
  think: false,
  unloadAfterUse: false,
  memoryGiB: 2,
  enabled: true,
  adultOnly: false,
  vision: true,
  thinking: false,
};
const registry: ModelRegistry = {
  list: () => Promise.reject(new Error('unused')),
  chatModel: (id) => Promise.resolve(id === 'quick' ? model : null),
  imageModel: () => null,
  defaultChatModelId: () => 'quick',
};
const seen: ChatRequest[] = [];
const llm: LlmClient = {
  async *chat(req): AsyncGenerator<ChatChunk> {
    seen.push(req);
    await Promise.resolve();
    yield { type: 'content', text: 'A red square.' };
    yield { type: 'done', promptTokens: 1, outputTokens: 1, loadMs: 0 };
  },
  loaded: () => Promise.resolve([]),
  unload: () => Promise.resolve(),
  capabilities: () => Promise.resolve({ vision: true, thinking: false, tools: false }),
  installed: () => Promise.resolve([]),
};

let built: App;
let app: FastifyInstance;

beforeEach(async () => {
  seen.length = 0;
  built = await buildApp(loadConfig({ NODE_ENV: 'test' }), {
    db: openDatabase(':memory:'),
    kdfParams: { m: 1024, t: 1, p: 1 },
    llm,
    registry,
  });
  app = built.app;
});

afterEach(async () => {
  await app.close();
});

async function signUp(username: string) {
  const invite = built.auth.createInvite({ role: 'member', restricted: false, createdBy: null });
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/invite/accept',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    payload: JSON.stringify({ code: invite.code, username, password: 'blue tractor sings loudly' }),
  });
  AccountResponse.parse(res.json());
  return String(res.headers['set-cookie']).split(';')[0] ?? '';
}

function upload(cookie: string, data: Buffer, extra: Record<string, string> = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/attachments',
    headers: {
      origin: ORIGIN,
      cookie,
      'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
      ...extra,
    },
    payload: multipartBody([{ name: 'photo', filename: 'IMG_0001.jpg', type: 'image/jpeg', data }]),
  });
}

const redJpeg = () =>
  sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 255, g: 0, b: 0 } } })
    .jpeg()
    .toBuffer();

describe('attachments', () => {
  it('uploads a photo and serves it back only to its owner', async () => {
    const anna = await signUp('anna');
    const ben = await signUp('ben');
    const res = await upload(anna, await redJpeg());
    expect(res.statusCode).toBe(201);
    const ref = UploadResponse.parse(res.json());
    expect([ref.width, ref.height, ref.mime]).toEqual([64, 48, 'image/jpeg']);

    const get = await app.inject({
      method: 'GET',
      url: `/api/attachments/${ref.id}`,
      headers: { cookie: anna },
    });
    expect(get.statusCode).toBe(200);
    expect(get.headers['content-type']).toBe('image/jpeg');
    expect(get.headers['x-content-type-options']).toBe('nosniff');
    expect(get.headers['content-disposition']).toBe('inline');
    expect(get.headers['cache-control']).toContain('no-store');
    expect(get.rawPayload.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));

    const other = await app.inject({
      method: 'GET',
      url: `/api/attachments/${ref.id}`,
      headers: { cookie: ben },
    });
    expect(other.statusCode).toBe(404);
    const anon = await app.inject({ method: 'GET', url: `/api/attachments/${ref.id}` });
    expect(anon.statusCode).toBe(401);
  });

  it('rejects non-images, oversize files and uploads without Origin', async () => {
    const anna = await signUp('anna');
    expect(
      (await upload(anna, Buffer.from('<html><script>alert(1)</script></html>'))).statusCode,
    ).toBe(400);
    // Photos over 10 MB are refused by the image check, anything over 20 MB by the upload limit.
    const bigPhoto = Buffer.concat([await redJpeg(), Buffer.alloc(11 * 1024 * 1024)]);
    expect((await upload(anna, bigPhoto)).statusCode).toBe(400);
    const huge = Buffer.concat([await redJpeg(), Buffer.alloc(21 * 1024 * 1024)]);
    expect((await upload(anna, huge)).statusCode).toBe(413);
    const noOrigin = await app.inject({
      method: 'POST',
      url: '/api/attachments',
      headers: { cookie: anna, 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
      payload: multipartBody([
        { name: 'photo', filename: 'a.jpg', type: 'image/jpeg', data: await redJpeg() },
      ]),
    });
    expect(noOrigin.statusCode).toBe(403);
  });

  it('only accepts multipart on the upload route', async () => {
    const anna = await signUp('anna');
    const json = await app.inject({
      method: 'POST',
      url: '/api/attachments',
      headers: { origin: ORIGIN, cookie: anna, 'content-type': 'application/json' },
      payload: '{}',
    });
    expect(json.statusCode).toBe(415);
    // Multipart is not accepted anywhere else.
    const elsewhere = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin: ORIGIN, 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
      payload: multipartBody([
        { name: 'x', filename: 'x', type: 'text/plain', data: Buffer.from('x') },
      ]),
    });
    expect(elsewhere.statusCode).toBe(415);
  });

  it("sends an attached photo to the model, but never another user's", async () => {
    const anna = await signUp('anna');
    const ben = await signUp('ben');
    const annaSession = built.auth.resolveSession(anna.split('=')[1] ?? '');
    const benSession = built.auth.resolveSession(ben.split('=')[1] ?? '');
    if (!annaSession || !benSession) throw new Error('no session');
    const repo = createChatRepo(built.db);
    const chat = repo.createChat(annaSession, 'quick');
    const ref = UploadResponse.parse((await upload(anna, await redJpeg())).json());

    // Ben can't attach Anna's photo to his own chat.
    const benChat = repo.createChat(benSession, 'quick');
    const steal = await app.inject({
      method: 'POST',
      url: `/api/chats/${benChat.id}/messages`,
      headers: { origin: ORIGIN, cookie: ben, 'content-type': 'application/json' },
      payload: JSON.stringify({ content: 'what is this?', attachmentIds: [ref.id] }),
    });
    expect(steal.statusCode).toBe(404);
    expect(seen).toHaveLength(0);

    const res = await app.inject({
      method: 'POST',
      url: `/api/chats/${chat.id}/messages`,
      headers: { origin: ORIGIN, cookie: anna, 'content-type': 'application/json' },
      payload: JSON.stringify({ content: 'What is this?', attachmentIds: [ref.id] }),
    });
    expect(res.statusCode).toBe(200);
    const userTurn = seen[0]?.messages.at(-1);
    expect(userTurn?.images).toHaveLength(1);
    expect(Buffer.from(userTurn?.images?.[0] ?? '', 'base64').subarray(0, 3)).toEqual(
      Buffer.from([0xff, 0xd8, 0xff]),
    );
  });
});

describe('documents', () => {
  function uploadFile(cookie: string, data: Buffer, filename: string) {
    return app.inject({
      method: 'POST',
      url: '/api/attachments',
      headers: {
        origin: ORIGIN,
        cookie,
        'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
      },
      payload: multipartBody([{ name: 'file', filename, type: 'application/octet-stream', data }]),
    });
  }

  it('uploads a PDF, gives its text to the model, and keeps it private', async () => {
    const anna = await signUp('anna');
    const ben = await signUp('ben');
    const res = await uploadFile(anna, tinyPdf('Abschlag 86 EUR'), '../../Strom/Rechnung Sep.pdf');
    expect(res.statusCode).toBe(201);
    const ref = UploadResponse.parse(res.json());
    expect(ref).toMatchObject({
      kind: 'document',
      mime: 'application/pdf',
      name: 'Rechnung Sep.pdf',
      pages: 1,
    });

    const annaSession = built.auth.resolveSession(anna.split('=')[1] ?? '');
    if (!annaSession) throw new Error('no session');
    const chat = createChatRepo(built.db).createChat(annaSession, 'quick');
    const send = await app.inject({
      method: 'POST',
      url: `/api/chats/${chat.id}/messages`,
      headers: { origin: ORIGIN, cookie: anna, 'content-type': 'application/json' },
      payload: JSON.stringify({ content: 'Wie hoch ist der Abschlag?', attachmentIds: [ref.id] }),
    });
    expect(send.statusCode).toBe(200);
    const userTurn = seen.at(-1)?.messages.at(-1);
    expect(userTurn?.content).toContain('<document name="Rechnung Sep.pdf" pages="1">');
    expect(userTurn?.content).toContain('Abschlag 86 EUR');
    expect(userTurn?.images).toBeUndefined();

    const dl = await app.inject({
      method: 'GET',
      url: `/api/attachments/${ref.id}`,
      headers: { cookie: anna },
    });
    expect(dl.headers['content-type']).toBe('application/pdf');
    expect(dl.headers['content-disposition']).toMatch(/^attachment;/);
    const other = await app.inject({
      method: 'GET',
      url: `/api/attachments/${ref.id}`,
      headers: { cookie: ben },
    });
    expect(other.statusCode).toBe(404);
  });

  it('rejects files that only look like documents', async () => {
    const anna = await signUp('anna');
    expect(
      (await uploadFile(anna, Buffer.from('PK\u0003\u0004 not office'), 'x.xlsx')).statusCode,
    ).toBe(400);
    expect((await uploadFile(anna, Buffer.from('%PDF-1.4 garbage'), 'x.pdf')).statusCode).toBe(400);
    expect((await uploadFile(anna, Buffer.from('MZ executable'), 'x.pdf')).statusCode).toBe(400);
  });
});
