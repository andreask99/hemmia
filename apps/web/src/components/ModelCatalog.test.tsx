import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../i18n/index.tsx';
import { json, stubFetch } from '../test-utils.tsx';
import { ModelCatalog } from './ModelCatalog.tsx';

const entry = (model: string, over: Record<string, unknown> = {}) => ({
  ollamaModel: model,
  label: { en: model, de: model },
  description: { en: `About ${model}`, de: `Über ${model}` },
  downloadGiB: 4.3,
  memoryGiB: 6,
  minTotalMemoryGiB: 8,
  vision: true,
  tools: true,
  fits: true,
  recommended: false,
  installed: false,
  think: false,
  contextTokens: 131072,
  isNew: false,
  popularRank: null,
  releasedAt: null,
  inUse: false,
  ...over,
});
const CATALOG = {
  memoryGiB: 16,
  entries: [
    entry('gemma4:26b', { fits: false, minTotalMemoryGiB: 32 }),
    entry('gemma4:12b', { recommended: true }),
    entry('gemma4:e2b'),
    entry('qwen3-coder:30b', { installed: true }),
  ],
};
const EVENTS =
  'event: progress\ndata: {"type":"progress","completed":2000000000,"total":4000000000}\n\n' +
  'event: done\ndata: {"type":"done","modelId":"x-gemma4-e2b"}\n\n';

function renderIt() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider language="en">
        <ModelCatalog />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ModelCatalog', () => {
  it('lists the recommended model first and hides what does not fit until asked', async () => {
    stubFetch((url) => (url === '/api/admin/catalog' ? json(CATALOG) : undefined));
    renderIt();
    await screen.findByText('Add a model');
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]?.textContent).toContain('gemma4:12b');
    expect(rows[0]?.textContent).toContain('Recommended');
    expect(rows.some((r) => r.textContent.includes('gemma4:26b'))).toBe(false);
    const installed = rows.find((r) => r.textContent.includes('qwen3-coder:30b'));
    expect(installed?.textContent).toContain('Downloaded');

    fireEvent.click(screen.getByRole('button', { name: 'Runs on this computer' }));
    const tooBig = screen
      .getAllByRole('listitem')
      .find((r) => r.textContent.includes('gemma4:26b'));
    if (!tooBig) throw new Error('missing row');
    expect(tooBig.className).toContain('opacity-60');
    expect(within(tooBig).getByText('Needs more memory')).toBeDefined();
    expect(within(tooBig).queryByRole('button', { name: 'Download' })).toBeNull();
  });

  it('groups new and popular models and searches by name', async () => {
    stubFetch((url) =>
      url === '/api/admin/catalog'
        ? json({
            ...CATALOG,
            entries: [
              ...CATALOG.entries,
              entry('qwen3.9:27b', { isNew: true, popularRank: 2, releasedAt: '2026-11-01' }),
              entry('gpt-oss:20b', { popularRank: 1, think: true }),
            ],
          })
        : undefined,
    );
    renderIt();
    await screen.findByText('Add a model');
    const heading = (name: string) => screen.getByRole('heading', { name, level: 4 });
    expect(heading('New').nextElementSibling?.textContent).toContain('qwen3.9:27b');
    expect(heading('Popular').nextElementSibling?.textContent).toContain('gpt-oss:20b');
    expect(heading('Popular').nextElementSibling?.textContent).not.toContain('qwen3.9:27b');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search models' }), {
      target: { value: 'oss' },
    });
    expect(screen.getAllByRole('listitem').map((r) => r.textContent)).toEqual([
      expect.stringContaining('gpt-oss:20b'),
    ]);
  });

  it('downloads another library model by name', async () => {
    const calls = stubFetch((url, init) => {
      if (url === '/api/admin/catalog') return json(CATALOG);
      if (url === '/api/admin/models/pulls' && init?.method === 'POST')
        return json({ pullId: 'p2' }, 202);
      return undefined;
    });
    renderIt();
    await screen.findByText('Add a model');
    const input = screen.getByRole('textbox', { name: 'Another model from Ollama’s library' });
    const button = within(input.closest('form') as HTMLElement).getByRole('button', {
      name: 'Download',
    });
    fireEvent.change(input, { target: { value: 'someone/model' } });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'qwen3:8b' } });
    fireEvent.click(button);
    await waitFor(() => {
      expect(calls.some((c) => c.init?.method === 'POST')).toBe(true);
    });
    const post = calls.find((c) => c.init?.method === 'POST');
    expect(JSON.parse(post?.init?.body as string)).toEqual({ model: 'qwen3:8b' });
  });

  it('starts a download and follows its progress', async () => {
    const calls = stubFetch((url, init) => {
      if (url === '/api/admin/catalog') return json(CATALOG);
      if (url === '/api/admin/models/pulls' && init?.method === 'POST')
        return json({ pullId: 'p1' }, 202);
      if (url === '/api/admin/models/pulls/p1/events') {
        return new Response(EVENTS, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        });
      }
      return undefined;
    });
    renderIt();
    await screen.findByText('Add a model');
    const row = screen.getAllByRole('listitem').find((r) => r.textContent.includes('gemma4:e2b'));
    if (!row) throw new Error('missing row');
    fireEvent.click(within(row).getByRole('button', { name: 'Download' }));
    await waitFor(() => {
      expect(calls.some((c) => c.url === '/api/admin/models/pulls/p1/events')).toBe(true);
    });
    const posts = calls.filter((c) => c.init?.method === 'POST');
    expect(posts.map((c) => c.url)).toEqual(['/api/admin/models/pulls']);
    expect(JSON.parse(posts[0]?.init?.body as string)).toEqual({ model: 'gemma4:e2b' });
    // Done: the catalogue is fetched again and the progress goes away.
    await waitFor(() => {
      expect(calls.filter((c) => c.url === '/api/admin/catalog').length).toBeGreaterThan(1);
    });
    await waitFor(() => {
      expect(screen.queryByRole('progressbar')).toBeNull();
    });
  });

  it('explains a refused download', async () => {
    stubFetch((url, init) => {
      if (url === '/api/admin/catalog') return json(CATALOG);
      if (url === '/api/admin/models/pulls' && init?.method === 'POST') {
        return json({ error: { code: 'disk_full' } }, 409);
      }
      return undefined;
    });
    renderIt();
    await screen.findByText('Add a model');
    fireEvent.click(screen.getAllByRole('button', { name: 'Download' })[0] as HTMLElement);
    expect((await screen.findByRole('alert')).textContent).toBe('Not enough disk space');
  });
});

describe('Ollama setup above the model list', () => {
  it('offers to install Ollama when there is none, then shows the progress', async () => {
    let state: object = { state: 'missing', version: null };
    const calls = stubFetch((url, init) => {
      if (url === '/api/admin/catalog') return json(CATALOG);
      if (url === '/api/admin/ollama/install' && init?.method === 'POST') {
        state = {
          state: 'installing',
          version: '0.40.15',
          received: 50 * 1024 * 1024,
          total: 186 * 1024 * 1024,
        };
        return json(state, 202);
      }
      if (url === '/api/admin/ollama') return json(state);
      return undefined;
    });
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Install Ollama' }));
    expect(await screen.findByText('Installing Ollama… 50 of 186 MB')).toBeDefined();
    expect(calls.some((c) => c.url === '/api/admin/ollama/install')).toBe(true);
  });

  it('shows nothing when an Ollama already runs', async () => {
    stubFetch((url) =>
      url === '/api/admin/catalog'
        ? json(CATALOG)
        : url === '/api/admin/ollama'
          ? json({ state: 'external', version: null })
          : undefined,
    );
    renderIt();
    await screen.findByText('Add a model');
    expect(screen.queryByText('Local models need Ollama')).toBeNull();
  });

  it('explains a failed safety check and offers to try again', async () => {
    stubFetch((url) =>
      url === '/api/admin/catalog'
        ? json(CATALOG)
        : url === '/api/admin/ollama'
          ? json({ state: 'failed', version: '0.40.15', error: 'signature' })
          : undefined,
    );
    renderIt();
    expect((await screen.findByRole('alert')).textContent).toContain('safety check');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined();
  });
});
