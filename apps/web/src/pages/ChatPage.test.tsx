import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { json, ME, renderRoute, stubFetch } from '../test-utils.tsx';

const MODELS = {
  chatModels: [
    {
      id: 'quick',
      label: { en: 'Quick', de: 'Schnell' },
      description: null,
      engineModel: 'm:1b',
      details: null,
      vision: true,
      thinking: false,
    },
  ],
  imageModels: [],
  defaultChatModel: 'quick',
  defaultImageModel: null,
  loaded: ['quick'],
};
const CHAT = {
  id: 'c1',
  title: 'Urlaub',
  modelId: 'quick',
  think: false,
  createdAt: 1,
  updatedAt: 1,
};
const msg = (id: string, role: 'user' | 'assistant', content: string) => ({
  id,
  chatId: 'c1',
  role,
  content,
  modelId: role === 'assistant' ? 'quick' : null,
  status: 'done',
  attachments: [],
  createdAt: 1,
});

const enc = new TextEncoder();
function sseStream(events: object[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      for (const e of events) c.enqueue(enc.encode(`event: x\ndata: ${JSON.stringify(e)}\n\n`));
      c.close();
    },
  });
}

let messages: object[];
let sendResponse: () => Response;
let calls: ReturnType<typeof stubFetch>;

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
  // newest first, like the server
  messages = [
    msg('m2', 'assistant', 'Wie wäre es mit **Italien**?'),
    msg('m1', 'user', 'Wohin im Sommer? **x**'),
  ];
  sendResponse = () =>
    new Response(
      sseStream([
        { type: 'started', jobId: 'j1', userMessageId: 'm3' },
        { type: 'token', text: 'Gern' },
        { type: 'token', text: ' geschehen' },
        { type: 'done', message: msg('m4', 'assistant', 'Gern geschehen') },
      ]),
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    );
  calls = stubFetch((url, init) => {
    if (url === '/api/me') return json(ME);
    if (url === '/api/models') return json(MODELS);
    if (url === '/api/chats') return json({ chats: [CHAT] });
    if (url.startsWith('/api/chats/c1/messages?')) return json({ messages, nextCursor: null });
    if (url === '/api/chats/c1/messages' && init?.method === 'POST') return sendResponse();
    return undefined;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ChatPage', () => {
  it('shows messages oldest first; user text plain, assistant Markdown', async () => {
    const { container } = renderRoute('/chats/c1');
    await screen.findByText('Italien');
    const log = container.querySelector('[role="log"]');
    const text = log?.textContent ?? '';
    expect(text.indexOf('Wohin')).toBeLessThan(text.indexOf('Wie wäre'));
    expect(screen.getByText('Wohin im Sommer? **x**')).toBeDefined();
    expect(screen.getByText('Italien').tagName).toBe('STRONG');
  });

  it('streams a reply and refreshes the messages afterwards', async () => {
    renderRoute('/chats/c1');
    await screen.findByText('Italien');
    const before = calls.filter((c) => c.url.startsWith('/api/chats/c1/messages?')).length;
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Danke!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Danke!')).toBeDefined();
    await vi.waitFor(() => {
      expect(
        calls.filter((c) => c.url.startsWith('/api/chats/c1/messages?')).length,
      ).toBeGreaterThan(before);
    });
    const post = calls.find((c) => c.init?.method === 'POST');
    expect(JSON.parse(post?.init?.body as string)).toEqual({
      content: 'Danke!',
      attachmentIds: [],
    });
  });

  it('shows the queue position', async () => {
    sendResponse = () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(
              enc.encode(
                `data: ${JSON.stringify({ type: 'started', jobId: 'j1', userMessageId: 'm3' })}\n\n`,
              ),
            );
            c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'queued', position: 2 })}\n\n`));
          },
        }),
        { status: 200 },
      );
    renderRoute('/chats/c1');
    await screen.findByText('Italien');
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hallo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Waiting for the Mac… 2 ahead of you')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Stop' })).toBeDefined();
  });

  it('explains a busy error and can dismiss it', async () => {
    sendResponse = () => json({ error: { code: 'busy' } }, 409);
    renderRoute('/chats/c1');
    await screen.findByText('Italien');
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hallo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Please wait until the current reply is finished.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('disables Send for blank input', async () => {
    renderRoute('/chats/c1');
    await screen.findByText('Italien');
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: '   ' } });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Send' }).disabled).toBe(true);
  });

  it('reports a chat that no longer exists', async () => {
    renderRoute('/chats/gone');
    expect(await screen.findByText('This chat doesn’t exist anymore.')).toBeDefined();
  });

  it('creates a chat on the first message from the start page', async () => {
    const created = { ...CHAT, id: 'c9', title: null };
    const extra = stubFetch((url, init) => {
      if (url === '/api/me') return json(ME);
      if (url === '/api/models') return json(MODELS);
      if (url === '/api/chats' && init?.method === 'POST') return json(created, 201);
      if (url === '/api/chats') return json({ chats: [created] });
      if (url.startsWith('/api/chats/c9/messages?'))
        return json({ messages: [], nextCursor: null });
      if (url === '/api/chats/c9/messages') return sendResponse();
      return undefined;
    });
    renderRoute('/');
    await screen.findByText('Quick');
    fireEvent.change(await screen.findByLabelText('Message'), { target: { value: 'Erste Frage' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await vi.waitFor(() => {
      expect(
        extra.some((c) => c.url === '/api/chats/c9/messages' && c.init?.method === 'POST'),
      ).toBe(true);
    });
    const create = extra.find((c) => c.url === '/api/chats' && c.init?.method === 'POST');
    expect(JSON.parse(create?.init?.body as string)).toEqual({ modelId: 'quick' });
  });
  it('starts a fresh chat without the profile when switched off', async () => {
    const created = { ...CHAT, id: 'c9', title: null, useProfile: false };
    const extra = stubFetch((url, init) => {
      if (url === '/api/me') return json(ME);
      if (url === '/api/models') return json(MODELS);
      if (url === '/api/chats' && init?.method === 'POST') return json(created, 201);
      if (url === '/api/chats') return json({ chats: [created] });
      if (url.startsWith('/api/chats/c9/messages?'))
        return json({ messages: [], nextCursor: null });
      if (url === '/api/chats/c9/messages') return sendResponse();
      return undefined;
    });
    renderRoute('/');
    const toggle = await screen.findByRole('button', { name: 'Use my profile' });
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.textContent).toBe('Fresh chat');
    fireEvent.change(await screen.findByLabelText('Message'), { target: { value: 'Neu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await vi.waitFor(() => {
      const create = extra.find((c) => c.url === '/api/chats' && c.init?.method === 'POST');
      expect(JSON.parse(create?.init?.body as string)).toEqual({
        modelId: 'quick',
        useProfile: false,
      });
    });
  });

  it('shows what the model noted, with an undo', async () => {
    const note = { id: 'n1', text: 'Spielt Cello.' };
    let inProfile = true;
    sendResponse = () =>
      new Response(
        sseStream([
          { type: 'started', jobId: 'j1', userMessageId: 'm3' },
          { type: 'noted', note },
          { type: 'token', text: 'Toll!' },
          { type: 'done', message: { ...msg('m4', 'assistant', 'Toll!'), notes: [note] } },
        ]),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );
    const extra = stubFetch((url, init) => {
      if (url === '/api/me') return json(ME);
      if (url === '/api/models') return json(MODELS);
      if (url === '/api/chats') return json({ chats: [CHAT] });
      if (url === '/api/profile')
        return json({
          available: true,
          notes: inProfile ? [{ ...note, createdAt: 1 }] : [],
          updatedAt: 1,
        });
      if (url === '/api/profile/notes/n1' && init?.method === 'DELETE') {
        inProfile = false;
        return new Response(null, { status: 204 });
      }
      if (url.startsWith('/api/chats/c1/messages?')) return json({ messages, nextCursor: null });
      if (url === '/api/chats/c1/messages' && init?.method === 'POST') {
        messages = [{ ...msg('m4', 'assistant', 'Toll!'), notes: [note] }, ...messages];
        return sendResponse();
      }
      return undefined;
    });
    renderRoute('/chats/c1');
    await screen.findByText('Italien');
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Ich spiele Cello.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('· Removed from your profile')).toBeDefined();
    expect(extra.some((c) => c.url === '/api/profile/notes/n1')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });
});

describe('ChatPage pictures', () => {
  it('shows picture progress and the generated image from a normal reply', async () => {
    const generated = {
      ...msg('m9', 'assistant', ''),
      attachments: [
        {
          id: 'img1',
          kind: 'generated',
          mime: 'image/png',
          width: 1024,
          height: 1024,
          name: null,
          pages: null,
        },
      ],
    };
    sendResponse = () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(
              enc.encode(
                `data: ${JSON.stringify({ type: 'started', jobId: 'j1', userMessageId: 'm3' })}\n\n`,
              ),
            );
            c.enqueue(
              enc.encode(`data: ${JSON.stringify({ type: 'progress', step: 2, steps: 4 })}\n\n`),
            );
          },
        }),
        { status: 200 },
      );
    renderRoute('/chats/c1');
    await screen.findByText('Italien');
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Mal einen Drachen' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Painting… step 2 of 4')).toBeDefined();
    messages = [generated, ...messages];
  });

  it('opens a generated image full screen and closes on Escape', async () => {
    messages = [
      {
        ...msg('m9', 'assistant', ''),
        attachments: [
          {
            id: 'img1',
            kind: 'generated',
            mime: 'image/png',
            width: 1024,
            height: 1024,
            name: null,
            pages: null,
          },
        ],
      },
      ...messages,
    ];
    renderRoute('/chats/c1');
    fireEvent.click(await screen.findByRole('button', { name: 'Open image' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.querySelector('a')?.getAttribute('href')).toBe('/api/attachments/img1');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows documents as chips with their name', async () => {
    messages = [
      {
        ...msg('m8', 'user', 'Was steht drin?'),
        attachments: [
          {
            id: 'd1',
            kind: 'document',
            mime: 'application/pdf',
            width: 0,
            height: 0,
            name: 'Rechnung.pdf',
            pages: 3,
          },
        ],
      },
      ...messages,
    ];
    renderRoute('/chats/c1');
    const chip = await screen.findByText('Rechnung.pdf');
    expect(chip.closest('a')?.getAttribute('href')).toBe('/api/attachments/d1');
    expect(screen.getByText('· 3 pages')).toBeDefined();
  });

  it('marks scanned documents', async () => {
    messages = [
      {
        ...msg('m8', 'user', 'Was steht drin?'),
        attachments: [
          {
            id: 'd1',
            kind: 'document',
            mime: 'application/pdf',
            width: 0,
            height: 0,
            name: 'Brief.pdf',
            pages: 1,
            scanPages: 1,
          },
        ],
      },
      ...messages,
    ];
    renderRoute('/chats/c1');
    await screen.findByText('Brief.pdf');
    expect(screen.getByText('· scanned')).toBeDefined();
  });
});

describe('ChatPage pause and busy Mac', () => {
  it('shows the pause notice and does not let anyone send', async () => {
    calls = stubFetch((url) => {
      if (url === '/api/me') return json(ME);
      if (url === '/api/models') return json({ ...MODELS, paused: true });
      if (url === '/api/chats') return json({ chats: [CHAT] });
      if (url.startsWith('/api/chats/c1/messages?')) return json({ messages, nextCursor: null });
      return undefined;
    });
    renderRoute('/chats/c1');
    expect(await screen.findByText(/Hemmia is taking a break/)).toBeDefined();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hallo?' } });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Send' }).disabled).toBe(true);
  });

  it('explains when the Mac is busy with other work', async () => {
    sendResponse = () =>
      new Response(
        sseStream([
          { type: 'started', jobId: 'j1', userMessageId: 'm3' },
          { type: 'error', code: 'machine_busy' },
        ]),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );
    renderRoute('/chats/c1');
    await screen.findByText('Italien');
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hallo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect((await screen.findByRole('alert')).textContent).toContain('busy with other work');
  });
});

describe('ChatPage on a phone', () => {
  it('closes the keyboard after sending', async () => {
    renderRoute('/chats/c1');
    await screen.findByText('Italien');
    const box = screen.getByLabelText<HTMLTextAreaElement>('Message');
    box.focus();
    fireEvent.change(box, { target: { value: 'Danke' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(document.activeElement).not.toBe(box);
  });
});

describe('ChatPage long text', () => {
  it('explains the model limit and blocks sending instead of failing', async () => {
    renderRoute('/chats/c1');
    await screen.findByText('Italien');
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'a'.repeat(32_001) } });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Too long for Quick: 32,001 of 32,000 characters.');
    expect(alert.textContent).toContain('Shorten it');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Send' }).disabled).toBe(true);
  });

  it('offers a model that can read the long text', async () => {
    const big = {
      ...MODELS.chatModels[0],
      id: 'big',
      label: { en: 'Big', de: 'Groß' },
      maxMessageChars: 300_000,
    };
    calls = stubFetch((url, init) => {
      if (url === '/api/me') return json(ME);
      if (url === '/api/models')
        return json({ ...MODELS, chatModels: [...MODELS.chatModels, big] });
      if (url === '/api/chats') return json({ chats: [CHAT] });
      if (url.startsWith('/api/chats/c1/messages?')) return json({ messages, nextCursor: null });
      if (url === '/api/chats/c1' && init?.method === 'PATCH')
        return json({ ...CHAT, modelId: 'big' });
      return undefined;
    });
    renderRoute('/chats/c1');
    await screen.findByText('Italien');
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'a'.repeat(50_000) } });
    fireEvent.click(await screen.findByRole('button', { name: 'Switch to Big (up to 300,000)' }));
    await vi.waitFor(() => {
      const patch = calls.find((c) => c.url === '/api/chats/c1' && c.init?.method === 'PATCH');
      expect(JSON.parse(patch?.init?.body as string)).toEqual({ modelId: 'big' });
    });
  });
});

describe('ChatPage agents', () => {
  const agent = (id: string, extra: object = {}) => ({
    id,
    scope: 'personal',
    editable: true,
    name: id === 'cook' ? 'Koch' : 'Übersetzer',
    emoji: id === 'cook' ? '🧑‍🍳' : '🌍',
    description: id === 'cook' ? 'Rezepte' : 'Übersetzt',
    instructions: 'x',
    examples: id === 'cook' ? ['Was koche ich heute?'] : [],
    modelId: null,
    think: null,
    webSearch: true,
    images: true,
    pinned: false,
    pinOrder: null,
    lastUsedAt: null,
    updatedAt: 1,
    ...extra,
  });

  function setup(agents: object[]) {
    return stubFetch((url, init) => {
      if (url === '/api/me') return json(ME);
      if (url === '/api/models') return json(MODELS);
      if (url === '/api/chats' && init?.method === 'POST')
        return json({ ...CHAT, id: 'c9', agentId: 'cook' }, 201);
      if (url === '/api/chats') return json({ chats: [CHAT] });
      if (url === '/api/agents') return json({ agents, templates: [] });
      if (url.startsWith('/api/agents/') && init?.method === 'PUT')
        return json({ ...agent('trans'), pinned: true, pinOrder: 0 });
      if (url.startsWith('/api/chats/c9/messages?'))
        return json({ messages: [], nextCursor: null });
      if (url === '/api/chats/c9/messages' && init?.method === 'POST') return sendResponse();
      return undefined;
    });
  }

  it('offers pinned agents as chips, shows their examples and starts the chat with them', async () => {
    calls = setup([agent('cook', { pinned: true, pinOrder: 0 }), agent('trans')]);
    renderRoute('/');
    fireEvent.click(await screen.findByRole('radio', { name: /Koch/ }));
    expect(screen.queryByRole('radio', { name: /Übersetzer/ })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Koch' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Was koche ich heute?' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await vi.waitFor(() => {
      const post = calls.find((c) => c.url === '/api/chats' && c.init?.method === 'POST');
      expect(JSON.parse(post?.init?.body as string)).toEqual({ agentId: 'cook' });
    });
  });

  it('lists every agent in the sheet and pins from there', async () => {
    calls = setup([agent('cook', { pinned: true, pinOrder: 0 }), agent('trans')]);
    renderRoute('/');
    fireEvent.click(await screen.findByRole('button', { name: 'All' }));
    const dialog = await screen.findByRole('dialog', { name: 'Agents' });
    expect(dialog.textContent).toContain('Übersetzer');
    fireEvent.click(screen.getByRole('button', { name: 'Pin: Übersetzer' }));
    await vi.waitFor(() => {
      const put = calls.find((c) => c.url === '/api/agents/trans/pin');
      expect(JSON.parse(put?.init?.body as string)).toEqual({ pinned: true });
    });
  });

  it("shows the chat's agent in the header", async () => {
    calls = stubFetch((url) => {
      if (url === '/api/me') return json(ME);
      if (url === '/api/models') return json(MODELS);
      if (url === '/api/chats') return json({ chats: [{ ...CHAT, agentId: 'cook' }] });
      if (url === '/api/agents') return json({ agents: [agent('cook')], templates: [] });
      if (url.startsWith('/api/chats/c1/messages?')) return json({ messages, nextCursor: null });
      return undefined;
    });
    renderRoute('/chats/c1');
    expect(await screen.findByRole('button', { name: 'Choose an agent: Koch' })).toBeDefined();
  });
});

describe('ChatPage: Your day', () => {
  function setup(dailyEnabled: boolean, goals = true, existing = false) {
    return stubFetch((url, init) => {
      if (url === '/api/me') return json(ME);
      if (url === '/api/briefings' && init?.method === 'POST')
        return json({ chat: { ...CHAT, id: 'c7' }, created: !existing });
      if (url === '/api/models') return json(MODELS);
      if (url === '/api/chats' && init?.method === 'POST') return json({ ...CHAT, id: 'c7' }, 201);
      if (url === '/api/chats') return json({ chats: [CHAT] });
      if (url === '/api/daily')
        return json({
          enabled: dailyEnabled,
          time: '07:30',
          sign: 'leo',
          horoscope: true,
          plans: true,
        });
      if (url === '/api/week')
        return json({
          week: '2026-09-28',
          today: '2026-10-01',
          goals: !goals
            ? []
            : [
                {
                  id: 'g1',
                  week: '2026-09-28',
                  area: 'work',
                  text: 'A',
                  status: 'done',
                  day: null,
                  doneOn: null,
                },
                {
                  id: 'g2',
                  week: '2026-09-28',
                  area: 'home',
                  text: 'B',
                  status: 'open',
                  day: null,
                  doneOn: null,
                },
              ],
          plans: [],
        });
      if (url.startsWith('/api/chats/c7/messages?'))
        return json({ messages: [], nextCursor: null });
      if (url === '/api/chats/c7/messages' && init?.method === 'POST') return sendResponse();
      return undefined;
    });
  }

  it('opens from the morning notification: a new chat asking for the day overview', async () => {
    calls = setup(true);
    renderRoute('/daily');
    await vi.waitFor(() => {
      const post = calls.find(
        (c) => c.url === '/api/chats/c7/messages' && c.init?.method === 'POST',
      );
      expect(JSON.parse(post?.init?.body as string)).toEqual({
        content: 'Good morning! What does my day look like?',
        attachmentIds: [],
        briefing: 'day',
      });
    });
    expect(calls.filter((c) => c.url === '/api/briefings')).toHaveLength(1);
    expect(JSON.parse(calls.find((c) => c.url === '/api/briefings')?.init?.body as string)).toEqual(
      {
        kind: 'day',
      },
    );
  });

  it('reopens today’s chat without asking again', async () => {
    calls = setup(true, true, true);
    renderRoute('/daily');
    await vi.waitFor(() => {
      expect(calls.some((c) => c.url.startsWith('/api/chats/c7/messages?'))).toBe(true);
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.some((c) => c.url === '/api/chats/c7/messages' && c.init?.method === 'POST')).toBe(
      false,
    );
    expect(screen.queryByText('This chat doesn’t exist anymore.')).toBeNull();
  });

  it('opens weekly planning from its notification', async () => {
    calls = setup(true);
    renderRoute('/daily?kind=week');
    await vi.waitFor(() => {
      const post = calls.find(
        (c) => c.url === '/api/chats/c7/messages' && c.init?.method === 'POST',
      );
      expect(JSON.parse(post?.init?.body as string)).toMatchObject({
        content: "Let's plan my week.",
        briefing: 'week',
      });
    });
  });

  it('shows the planner card with the week’s progress', async () => {
    calls = setup(true);
    renderRoute('/');
    const card = await screen.findByRole('button', { name: /My week\s*1 of 2 done/ });
    expect(card).toBeDefined();
    expect(screen.getByRole('button', { name: '☀️ Today' })).toBeDefined();
  });

  it('hides the card when the planner is off and there are no goals', async () => {
    calls = setup(false, false);
    renderRoute('/');
    await screen.findByText('What can I help with?');
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('button', { name: /My week/ })).toBeNull();
  });
});

describe('ChatPage waiting for another model', () => {
  it('says the chosen model still has to load', async () => {
    calls = stubFetch((url, init) => {
      if (url === '/api/me') return json(ME);
      if (url === '/api/models') return json({ ...MODELS, loaded: ['other'] });
      if (url === '/api/chats') return json({ chats: [CHAT] });
      if (url.startsWith('/api/chats/c1/messages?')) return json({ messages, nextCursor: null });
      if (url === '/api/chats/c1/messages' && init?.method === 'POST')
        return new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(
                enc.encode(
                  `data: ${JSON.stringify({ type: 'started', jobId: 'j1', userMessageId: 'm3' })}\n\n`,
                ),
              );
              c.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'queued', position: 1 })}\n\n`));
            },
          }),
          { status: 200 },
        );
      return undefined;
    });
    renderRoute('/chats/c1');
    await screen.findByText('Italien');
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hallo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(
      await screen.findByText(/1 ahead of you · then Quick loads \(about 10 s\)/),
    ).toBeDefined();
  });
});

describe('ChatPage no model', () => {
  const NO_MODELS = {
    chatModels: [],
    imageModels: [],
    defaultChatModel: null,
    defaultImageModel: null,
    loaded: [],
  };

  it('shows admin notice when there are no models and user is admin', async () => {
    calls = stubFetch((url) => {
      if (url === '/api/me') return json({ ...ME, role: 'admin' });
      if (url === '/api/models') return json(NO_MODELS);
      if (url === '/api/chats') return json({ chats: [CHAT] });
      if (url.startsWith('/api/chats/c1/messages?')) return json({ messages, nextCursor: null });
      return undefined;
    });
    renderRoute('/chats/c1');
    expect(
      await screen.findByText('No AI model yet. Add one in Settings → Models.', { exact: false }),
    ).toBeDefined();
    const link = screen.getByRole('link', { name: 'Open Settings' });
    expect(link.getAttribute('href')).toBe('/settings?tab=models');
  });

  it('shows member notice when there are no models and user is member', async () => {
    calls = stubFetch((url) => {
      if (url === '/api/me') return json({ ...ME, role: 'member' });
      if (url === '/api/models') return json(NO_MODELS);
      if (url === '/api/chats') return json({ chats: [CHAT] });
      if (url.startsWith('/api/chats/c1/messages?')) return json({ messages, nextCursor: null });
      return undefined;
    });
    renderRoute('/chats/c1');
    expect(
      await screen.findByText('No AI model yet. Ask your admin to add one.', { exact: false }),
    ).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Open Settings' })).toBeNull();
  });
});
