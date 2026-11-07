import { describe, expect, it } from 'vitest';
import type { Message } from '@hemmia/shared';
import { buildContext } from './context.ts';

let seq = 0;
function msg(role: 'user' | 'assistant', content: string, extra: Partial<Message> = {}): Message {
  seq++;
  return {
    id: `m${String(seq)}`,
    chatId: 'c',
    role,
    content,
    modelId: null,
    status: 'done',
    attachments: [],
    searches: [],
    pages: [],
    notes: [],
    createdAt: seq,
    ...extra,
  };
}
const photo = {
  kind: 'upload' as const,
  mime: 'image/jpeg' as const,
  width: 1,
  height: 1,
  name: null,
  pages: null,
  scanPages: 0,
  source: null,
};

describe('buildContext', () => {
  it('puts the system prompt first and messages in chronological order', async () => {
    const newestFirst = [
      msg('user', 'second?'),
      msg('assistant', 'first answer'),
      msg('user', 'first?'),
    ];
    const turns = await buildContext({
      system: 'SYS',
      messagesNewestFirst: newestFirst,
      budgetTokens: 10_000,
      vision: false,
    });
    expect(turns.map((t) => `${t.role}:${t.content}`)).toEqual([
      'system:SYS',
      'user:first?',
      'assistant:first answer',
      'user:second?',
    ]);
  });

  it('drops the oldest messages beyond the budget but always keeps the newest', async () => {
    const long = 'x'.repeat(3500); // ~1000 tokens
    const newestFirst = [msg('user', long), msg('assistant', long), msg('user', long)];
    const turns = await buildContext({
      system: 'S',
      messagesNewestFirst: newestFirst,
      budgetTokens: 2100,
      vision: false,
    });
    expect(turns).toHaveLength(3); // system + 2 newest
    const tiny = await buildContext({
      system: 'S',
      messagesNewestFirst: newestFirst,
      budgetTokens: 10,
      vision: false,
    });
    expect(tiny).toHaveLength(2); // system + newest, even over budget
  });

  it('skips failed and empty assistant messages', async () => {
    const newestFirst = [
      msg('user', 'again'),
      msg('assistant', 'partial', { status: 'error' }),
      msg('assistant', '', { status: 'cancelled' }),
      msg('user', 'q'),
    ];
    const turns = await buildContext({
      system: 'S',
      messagesNewestFirst: newestFirst,
      budgetTokens: 10_000,
      vision: false,
    });
    expect(turns.map((t) => t.content)).toEqual(['S', 'q', 'again']);
  });

  it('sends images only for vision models and only the latest two photo messages', async () => {
    const newestFirst = [
      msg('user', 'c', { attachments: [{ ...photo, id: 'a3' }] }),
      msg('user', 'b', { attachments: [{ ...photo, id: 'a2' }] }),
      msg('user', 'a', { attachments: [{ ...photo, id: 'a1' }] }),
    ];
    const loaded: string[] = [];
    const loadImage = (id: string) => {
      loaded.push(id);
      return Promise.resolve(`b64-${id}`);
    };
    const turns = await buildContext({
      system: 'S',
      messagesNewestFirst: newestFirst,
      budgetTokens: 10_000,
      vision: true,
      loadImage,
    });
    expect(turns.map((t) => t.images ?? [])).toEqual([[], [], ['b64-a2'], ['b64-a3']]);
    expect(loaded.sort()).toEqual(['a2', 'a3']);

    const noVision = await buildContext({
      system: 'S',
      messagesNewestFirst: newestFirst,
      budgetTokens: 10_000,
      vision: false,
      loadImage,
    });
    expect(noVision.every((t) => t.images === undefined)).toBe(true);
  });

  it('sends scanned document pages as images to vision models, and a note to others', async () => {
    const scanned = {
      id: 'd1',
      kind: 'document' as const,
      mime: 'application/pdf' as const,
      width: 0,
      height: 0,
      name: 'Brief.pdf',
      pages: 2,
      scanPages: 2,
      source: null,
    };
    const newestFirst = [msg('user', 'Was steht drin?', { attachments: [scanned] })];
    const common = {
      system: 'S',
      messagesNewestFirst: newestFirst,
      budgetTokens: 24000,
      loadDocument: () => Promise.resolve('--- Seite/Page 1 ---\n[Gescannte Seite, Bild 1]'),
      loadScans: () => Promise.resolve(['p1', 'p2']),
    };
    const seeing = await buildContext({ ...common, vision: true });
    expect(seeing[1]?.images).toEqual(['p1', 'p2']);
    expect(seeing[1]?.content).toContain('scanned="2 page(s) attached as images, in order"');

    const blind = await buildContext({ ...common, vision: false });
    expect(blind[1]?.images).toBeUndefined();
    expect(blind[1]?.content).toContain('suggest a model that can see photos');
  });
});
