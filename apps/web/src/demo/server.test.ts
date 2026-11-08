import { describe, expect, it, vi } from 'vitest';
import { ChatListResponse, MessagesResponse, type StreamEvent } from '@hemmia/shared';
import { parseSse } from '../api/stream.ts';
import { createDemoServer } from './server.ts';

const url = (path: string) => new URL(`http://demo.test/api${path}`);

function setup() {
  const options = { onRefused: vi.fn(), onLeave: vi.fn(), onReset: vi.fn() };
  return { server: createDemoServer('en', options), options };
}

async function events(res: Response): Promise<StreamEvent[]> {
  return parseSse(await res.text()).events;
}

describe('demo server', () => {
  it('lists the made-up family chats, newest first, valid by the shared schema', async () => {
    const { server } = setup();
    const res = server.handle('GET', url('/chats'), undefined, null);
    const { chats } = ChatListResponse.parse(await res.json());
    expect(chats.map((c) => c.id)).toEqual([
      'demo-fridge',
      'demo-dragon',
      'demo-plant',
      'demo-lake',
      'demo-fractions',
    ]);
  });

  it('streams a prepared reply and saves both messages, titling a new chat', async () => {
    const { server } = setup();
    const created = (await server.handle('POST', url('/chats'), {}, null).json()) as { id: string };
    const res = server.handle(
      'POST',
      url(`/chats/${created.id}/messages`),
      { content: 'Draw a lighthouse at sunrise', attachmentIds: [] },
      null,
    );
    const types = (await events(res)).map((e) => e.type);
    expect(types[0]).toBe('started');
    expect(types).toContain('image');
    expect(types.at(-1)).toBe('done');

    const saved = MessagesResponse.parse(
      await server.handle('GET', url(`/chats/${created.id}/messages`), undefined, null).json(),
    );
    expect(saved.messages.map((m) => m.role)).toEqual(['assistant', 'user']);
    expect(saved.messages[0]?.attachments[0]?.kind).toBe('generated');
    const chat = (await server
      .handle('GET', url(`/chats/${created.id}`), undefined, null)
      .json()) as {
      title: string;
    };
    expect(chat.title).toBe('A picture');
  });

  it('keeps planner chats out of the chat list', async () => {
    const { server } = setup();
    const res = server.handle('POST', url('/briefings'), { kind: 'day' }, null);
    const { chat, created } = (await res.json()) as { chat: { id: string }; created: boolean };
    expect(created).toBe(true);
    const list = ChatListResponse.parse(
      await server.handle('GET', url('/chats'), undefined, null).json(),
    );
    expect(list.chats.some((c) => c.id === chat.id)).toBe(false);
  });

  it('refuses what needs a real hub and tells the page', () => {
    const { server, options } = setup();
    expect(server.handle('POST', url('/admin/invites'), {}, null).status).toBe(403);
    expect(server.handle('PUT', url('/cloud/keys/anthropic'), { key: 'x' }, null).status).toBe(403);
    expect(options.onRefused).toHaveBeenCalledTimes(2);
    // Notification registration is refused quietly (the app tries it by itself).
    server.handle('GET', url('/push/key'), undefined, null);
    expect(options.onRefused).toHaveBeenCalledTimes(2);
  });

  it('rebuilds the family in the new language and keeps chats the visitor started', async () => {
    vi.useFakeTimers();
    const { server, options } = setup();
    const created = (await server.handle('POST', url('/chats'), {}, null).json()) as { id: string };
    server.handle('PATCH', url('/me'), { language: 'de' }, null);
    vi.runAllTimers();
    vi.useRealTimers();
    expect(options.onReset).toHaveBeenCalledTimes(1);
    const fridge = (await server
      .handle('GET', url('/chats/demo-fridge'), undefined, null)
      .json()) as {
      title: string;
    };
    expect(fridge.title).toBe('Abendessen aus dem Kühlschrank');
    expect(server.handle('GET', url(`/chats/${created.id}`), undefined, null).status).toBe(200);
  });

  it('signing out leaves the demo', () => {
    vi.useFakeTimers();
    const { server, options } = setup();
    expect(server.handle('POST', url('/auth/logout'), undefined, null).status).toBe(204);
    vi.runAllTimers();
    vi.useRealTimers();
    expect(options.onLeave).toHaveBeenCalledTimes(1);
  });
});
