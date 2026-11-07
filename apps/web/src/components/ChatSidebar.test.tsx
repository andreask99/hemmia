import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { ReactNode } from 'react';
import { I18nProvider, type Language } from '../i18n/index.tsx';
import { json, stubFetch } from '../test-utils.tsx';
import { chatTitle, modelLabel } from '../chat/hooks.ts';
import { ChatActions } from './ChatActions.tsx';
import { ChatSidebar } from './ChatSidebar.tsx';
import { ModelSheet } from './ModelSheet.tsx';

afterEach(() => {
  vi.unstubAllGlobals();
});

const chat = (id: string, title: string | null) => ({
  id,
  title,
  modelId: 'quick',
  think: false,
  agentId: null,
  useProfile: true,
  createdAt: 1,
  updatedAt: 1,
});
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
    {
      id: 'smart',
      label: { en: 'Smart', de: 'Gründlich' },
      description: null,
      engineModel: 'm:1b',
      details: null,
      vision: true,
      thinking: true,
    },
  ],
  imageModels: [],
  defaultChatModel: 'quick',
  defaultImageModel: null,
};

function show(element: ReactNode, path = '/chats/c2', language: Language = 'en') {
  const router = createMemoryRouter([{ path: '*', element }], { initialEntries: [path] });
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider language={language}>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

describe('ChatSidebar', () => {
  it('lists chats in order, names untitled ones, marks the open one', async () => {
    stubFetch((url) =>
      url === '/api/chats' ? json({ chats: [chat('c1', 'Urlaub'), chat('c2', null)] }) : undefined,
    );
    show(<ChatSidebar />);
    await screen.findByText('Urlaub');
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Planner', 'Urlaub', 'New chat']);
    expect(links[2]?.getAttribute('aria-current')).toBe('page');
  });

  it('deletes a chat from the list after confirmation, leaving the open chat', async () => {
    const calls = stubFetch((url, init) => {
      if (url === '/api/chats')
        return json({ chats: [chat('c1', 'Urlaub'), chat('c2', 'Steuer')] });
      if (url === '/api/chats/c2' && init?.method === 'DELETE')
        return new Response(null, { status: 204 });
      return undefined;
    });
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    const router = createMemoryRouter([{ path: '*', element: <ChatSidebar /> }], {
      initialEntries: ['/chats/c2'],
    });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <I18nProvider language="en">
          <RouterProvider router={router} />
        </I18nProvider>
      </QueryClientProvider>,
    );
    const del = await screen.findByRole('button', { name: 'Delete chat: Steuer' });
    fireEvent.click(del);
    expect(calls.some((c) => c.init?.method === 'DELETE')).toBe(false);

    confirm.mockReturnValue(true);
    fireEvent.click(del);
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe('/');
    });
    expect(calls.filter((c) => c.init?.method === 'DELETE').map((c) => c.url)).toEqual([
      '/api/chats/c2',
    ]);
  });

  it('shows an empty state', async () => {
    stubFetch((url) => (url === '/api/chats' ? json({ chats: [] }) : undefined));
    show(<ChatSidebar />);
    expect(await screen.findByText('No chats yet')).toBeDefined();
  });
});

describe('ModelSheet ready badge', () => {
  it('marks the loaded model as ready', () => {
    const models = MODELS.chatModels.map((m) => ({
      ...m,
      details: null,
      maxMessageChars: 65_000,
      cloud: false,
      provider: null,
    }));
    render(
      <I18nProvider language="en">
        <ModelSheet
          models={models}
          value="quick"
          think={false}
          loaded={['smart']}
          onSelect={() => undefined}
          onThink={() => undefined}
          onClose={() => undefined}
        />
      </I18nProvider>,
    );
    const smart = screen.getByRole('radio', { name: /Smart/ });
    expect(smart.textContent).toContain('Ready');
    expect(screen.getByRole('radio', { name: /Quick/ }).textContent).not.toContain('Ready');
  });
});

describe('ModelSheet', () => {
  it('lists real models in the UI language, selects, and offers thinking only where possible', () => {
    const onSelect = vi.fn();
    const onThink = vi.fn();
    const models = MODELS.chatModels.map((m) => ({
      ...m,
      details: { en: '26B', de: '26B' },
      maxMessageChars: 65_000,
      cloud: false,
      provider: null,
    }));
    render(
      <I18nProvider language="de">
        <ModelSheet
          models={models}
          value="smart"
          think={false}
          onSelect={onSelect}
          onThink={onThink}
          onClose={() => undefined}
        />
      </I18nProvider>,
    );
    expect(screen.getByRole('radio', { name: /Gründlich/ }).getAttribute('aria-checked')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('radio', { name: /Schnell/ }));
    expect(onSelect).toHaveBeenCalledWith('quick');
    fireEvent.click(screen.getByRole('switch'));
    expect(onThink).toHaveBeenCalledWith(true);
  });
});

describe('ChatActions', () => {
  it('deletes only after confirmation', async () => {
    const calls = stubFetch((url, init) =>
      url === '/api/chats/c1' && init?.method === 'DELETE'
        ? new Response(null, { status: 204 })
        : undefined,
    );
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    show(<ChatActions chat={chat('c1', 'Urlaub')} />);
    fireEvent.click(await screen.findByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete chat' }));
    expect(confirm).toHaveBeenCalledWith('Delete this chat? This can’t be undone.');
    expect(calls.some((c) => c.init?.method === 'DELETE')).toBe(false);
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete chat' }));
    await vi.waitFor(() => {
      expect(calls.some((c) => c.url === '/api/chats/c1' && c.init?.method === 'DELETE')).toBe(
        true,
      );
    });
  });

  it('renames with the trimmed title', async () => {
    const calls = stubFetch((url, init) =>
      init?.method === 'PATCH'
        ? json(chat('c1', 'Neu'))
        : url === '/api/chats'
          ? json({ chats: [] })
          : undefined,
    );
    vi.stubGlobal('prompt', () => '  Neu  ');
    show(<ChatActions chat={chat('c1', 'Alt')} />);
    fireEvent.click(await screen.findByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rename chat' }));
    await vi.waitFor(() => {
      const patch = calls.find((c) => c.init?.method === 'PATCH');
      expect(patch?.init?.body).toBe('{"title":"Neu"}');
    });
  });
});

describe('helpers', () => {
  it('chatTitle and modelLabel', () => {
    const t = (k: string) => (k === 'chat.untitled' ? 'New chat' : k);
    expect(chatTitle({ title: null }, t)).toBe('New chat');
    expect(chatTitle({ title: 'X' }, t)).toBe('X');
    expect(modelLabel({ label: { en: 'Smart', de: 'Gründlich' } }, 'de')).toBe('Gründlich');
  });
});
