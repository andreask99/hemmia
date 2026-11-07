import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from '../i18n/index.tsx';
import { json, stubFetch } from '../test-utils.tsx';
import { LocalServers } from './LocalServers.tsx';

const ENGINE = {
  id: 'abcd1234',
  label: 'LM Studio',
  baseUrl: 'http://127.0.0.1:1234/v1',
  reachable: true,
  models: ['a', 'b'],
};
const engines = (custom: (typeof ENGINE)[]) => ({
  ollama: { url: 'http://127.0.0.1:11434', reachable: true, version: '0.40.5' },
  custom,
});

function renderIt() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <I18nProvider language="en">
        <LocalServers />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LocalServers', () => {
  it('lists servers with status and model count', async () => {
    stubFetch((url) => (url === '/api/admin/engines' ? json(engines([ENGINE])) : undefined));
    renderIt();
    expect(await screen.findByText('LM Studio')).toBeDefined();
    expect(screen.getByText('http://127.0.0.1:1234/v1')).toBeDefined();
    expect(screen.getByText('Reachable')).toBeDefined();
    expect(screen.getByText('· 2 models')).toBeDefined();
  });

  it('adds a server and clears the form', async () => {
    const calls = stubFetch((url, init) => {
      if (url === '/api/admin/engines' && (init?.method ?? 'GET') === 'GET')
        return json(engines([]));
      if (url === '/api/admin/engines/custom') return json(engines([ENGINE]));
      return undefined;
    });
    renderIt();
    const name = await screen.findByLabelText<HTMLInputElement>('Name');
    const address = screen.getByLabelText<HTMLInputElement>('Address');
    fireEvent.change(name, { target: { value: ' Box ' } });
    fireEvent.change(address, { target: { value: 'http://192.168.1.5:8000/v1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add server' }));
    await screen.findByText('LM Studio');
    const posts = calls.filter((c) => c.init?.method === 'POST');
    expect(posts.map((c) => c.url)).toEqual(['/api/admin/engines/custom']);
    expect(JSON.parse(posts[0]?.init?.body as string)).toEqual({
      label: 'Box',
      baseUrl: 'http://192.168.1.5:8000/v1',
    });
    await waitFor(() => {
      expect(name.value).toBe('');
    });
  });

  it('explains a refused address and keeps the input', async () => {
    stubFetch((url, init) => {
      if (url === '/api/admin/engines' && (init?.method ?? 'GET') === 'GET')
        return json(engines([]));
      if (url === '/api/admin/engines/custom') {
        return json({ error: { code: 'address_not_allowed' } }, 400);
      }
      return undefined;
    });
    renderIt();
    const name = await screen.findByLabelText<HTMLInputElement>('Name');
    fireEvent.change(name, { target: { value: 'Cloud' } });
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: 'http://8.8.8.8/v1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add server' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Only servers on this computer or your home network',
    );
    expect(name.value).toBe('Cloud');
  });

  it('removes a server', async () => {
    const calls = stubFetch((url, init) => {
      if (url === '/api/admin/engines' && (init?.method ?? 'GET') === 'GET')
        return json(engines([ENGINE]));
      if (url === '/api/admin/engines/custom/abcd1234') return json(engines([]));
      return undefined;
    });
    renderIt();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await screen.findByText(/None yet/);
    expect(
      calls.some(
        (c) => c.url === '/api/admin/engines/custom/abcd1234' && c.init?.method === 'DELETE',
      ),
    ).toBe(true);
  });
});
