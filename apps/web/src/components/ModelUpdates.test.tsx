import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../i18n/index.tsx';
import { json, stubFetch } from '../test-utils.tsx';
import { InstalledModels } from './InstalledModels.tsx';
import { ModelUpdates } from './ModelUpdates.tsx';

const UPDATE = {
  key: 'v:qwen3.8:27b>qwen3.9:27b',
  from: 'qwen3.8:27b',
  to: 'qwen3.9:27b',
  kind: 'version',
  label: { en: 'qwen3.9 27B', de: 'qwen3.9 27B' },
  downloadGiB: 18,
  installed: false,
};
const EVENTS = 'event: done\ndata: {"type":"done","modelId":"x-qwen3-9-27b"}\n\n';

function renderIt(node: React.ReactNode) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <I18nProvider language="en">{node}</I18nProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ModelUpdates', () => {
  it('downloads the new version, switches over, then offers to delete the old one', async () => {
    let updates: object[] = [UPDATE];
    const calls = stubFetch((url, init) => {
      if (url === '/api/admin/models/updates') {
        return json({ updates, unseen: true, catalogCheck: true });
      }
      if (url === '/api/admin/models/updates/seen') return new Response(null, { status: 204 });
      if (url === '/api/admin/models/pulls' && init?.method === 'POST') {
        return json({ pullId: 'p1' }, 202);
      }
      if (url === '/api/admin/models/pulls/p1/events') {
        return new Response(EVENTS, { headers: { 'content-type': 'text/event-stream' } });
      }
      if (url === '/api/admin/models/replace') {
        updates = [];
        return json({ modelId: 'x-qwen3-9-27b', moved: 3 });
      }
      if (url === '/api/admin/models/installed') {
        return json({
          diskFreeGiB: 100,
          models: [{ model: 'qwen3.8:27b', sizeGiB: 17, offeredId: null }],
        });
      }
      if (url === '/api/admin/models/remove') return new Response(null, { status: 204 });
      return undefined;
    });
    renderIt(<ModelUpdates />);
    expect(await screen.findByText('qwen3.9 27B replaces qwen3.8:27b')).toBeDefined();
    await waitFor(() => {
      expect(calls.some((c) => c.url === '/api/admin/models/updates/seen')).toBe(true);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(await screen.findByText('Done: the family now uses qwen3.9:27b.')).toBeDefined();
    const replace = calls.find((c) => c.url === '/api/admin/models/replace');
    expect(JSON.parse(replace?.init?.body as string)).toEqual({
      from: 'qwen3.8:27b',
      to: 'qwen3.9:27b',
    });

    expect(await screen.findByText('Delete qwen3.8:27b to free 17 GB?')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('qwen3.8:27b deleted.')).toBeDefined();
    const remove = calls.find((c) => c.url === '/api/admin/models/remove');
    expect(JSON.parse(remove?.init?.body as string)).toEqual({ model: 'qwen3.8:27b' });
  });

  it('puts an update off with Later', async () => {
    const calls = stubFetch((url) => {
      if (url === '/api/admin/models/updates') {
        return json({ updates: [UPDATE], unseen: false, catalogCheck: true });
      }
      if (url === '/api/admin/models/updates/dismiss') return new Response(null, { status: 204 });
      return undefined;
    });
    renderIt(<ModelUpdates />);
    fireEvent.click(await screen.findByRole('button', { name: 'Later' }));
    await waitFor(() => {
      const d = calls.find((c) => c.url === '/api/admin/models/updates/dismiss');
      expect(JSON.parse(d?.init?.body as string)).toEqual({ key: UPDATE.key });
    });
    expect(calls.some((c) => c.url === '/api/admin/models/updates/seen')).toBe(false);
  });

  it('shows nothing without updates', async () => {
    const calls = stubFetch((url) =>
      url === '/api/admin/models/updates'
        ? json({ updates: [], unseen: false, catalogCheck: true })
        : undefined,
    );
    renderIt(<ModelUpdates />);
    await waitFor(() => {
      expect(calls.length).toBeGreaterThan(0);
    });
    expect(screen.queryByText('New model versions')).toBeNull();
  });
});

describe('InstalledModels', () => {
  it('asks before deleting and explains a refusal', async () => {
    const calls = stubFetch((url) => {
      if (url === '/api/admin/models/installed') {
        return json({
          diskFreeGiB: 52.4,
          models: [
            { model: 'gemma4:26b', sizeGiB: 17.4, offeredId: 'smart' },
            { model: 'qwen3-coder-dev:latest', sizeGiB: 17.3, offeredId: null },
          ],
        });
      }
      if (url === '/api/admin/models/remove') {
        return json({ error: { code: 'last_model' } }, 409);
      }
      return undefined;
    });
    renderIt(<InstalledModels />);
    expect(await screen.findByText('52 GB free on this computer')).toBeDefined();
    expect(screen.getByText(/17.4 GB · offered/)).toBeDefined();
    expect(screen.getByText(/17.3 GB · not used by Hemmia/)).toBeDefined();
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0] as HTMLElement);
    expect(screen.getByText('Delete gemma4:26b from this computer?')).toBeDefined();
    expect(calls.some((c) => c.url === '/api/admin/models/remove')).toBe(false);
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0] as HTMLElement);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'This is the family’s last model. Add another one first.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Delete gemma4:26b from this computer?')).toBeNull();
  });
});
