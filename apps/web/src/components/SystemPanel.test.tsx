import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { json, ME, renderRoute, stubFetch } from '../test-utils.tsx';

const GiB = 1024 ** 3;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SystemPanel', () => {
  const at = Date.now();

  const STATUS = {
    at,
    mac: {
      totalBytes: 32 * 1024 ** 3,
      usedBytes: 28 * 1024 ** 3,
      swapUsedBytes: 1 * 1024 ** 3,
      swapTotalBytes: 3 * 1024 ** 3,
      cpuLoad: 0.45,
      cpus: 6,
    },
    models: [
      {
        engine: 'ollama',
        model: 'gemma4:26b',
        memoryBytes: 19 * 1024 ** 3,
        kchat: true,
        unloadsAt: at + 4 * 60000,
      },
    ],
    activity: {
      running: {
        kind: 'chat',
        model: 'gemma4:26b',
        startedAt: at - 12000,
      },
      queued: 2,
      paused: false,
    },
    services: {
      ollama: true,
      searxng: false,
      imageWorker: 'idle',
    },
    disk: {
      data: null,
      imageModels: null,
      chatModels: null,
    },
    maintenance: {
      at: Date.UTC(2026, 9, 1, 3, 40),
      ok: true,
      outcome: 'nothing-to-do',
      steps: [],
      held: 'Ollama 0.40.0 (#18620)',
    },
    last24h: {
      replies: 14,
      pictures: 3,
      searches: 5,
      activeUsers: 2,
    },
  };

  it('shows memory, models, activity, services and counts', async () => {
    stubFetch((url) => {
      if (url === '/api/admin/system') return json(STATUS);
      if (url === '/api/me') return json({ ...ME, id: 'u1', role: 'admin' });
      if (url === '/api/models')
        return json({
          chatModels: [],
          imageModels: [],
          defaultChatModel: 'quick',
          defaultImageModel: null,
        });
      if (url === '/api/chats') return json({ chats: [] });
      if (url === '/api/me/sessions') return json({ sessions: [] });
      if (url === '/api/admin/users') return json({ users: [] });
      if (url === '/api/admin/models')
        return json({
          models: [],
          installedNotOffered: [],
          defaultChatModel: 'quick',
          defaultImageModel: null,
        });
      if (url === '/api/agents') return json({ agents: [], templates: [] });
      return undefined;
    });
    renderRoute('/settings?tab=system');
    expect(await screen.findByText('gemma4:26b')).toBeDefined();
    expect(screen.getByText('unloads in 4 min')).toBeDefined();
    expect(screen.getByText(/Writing a reply with gemma4:26b for 12 s/).textContent).toContain(
      '2 waiting',
    );
    expect(screen.getByText(/not reachable/)).toBeDefined();
    const memory = screen.getByRole('meter', { name: 'Memory' });
    expect(memory.getAttribute('aria-valuenow')).toBe(String(28 * GiB));
    expect(screen.getAllByText(/High/).length).toBeGreaterThan(0);
    expect(screen.getByText('14')).toBeDefined();
    expect(screen.getAllByText('measuring…')).toHaveLength(3);
    expect(screen.getByText(/Held back: Ollama 0.40.0 \(#18620\)/)).toBeDefined();
  });
});
