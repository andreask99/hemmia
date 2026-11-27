import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { I18nProvider } from '../i18n/index.tsx';
import { stubFetch } from '../test-utils.tsx';
import { ShoppingAdded } from './ShoppingAdded.tsx';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ShoppingAdded', () => {
  it('says what was added and adapted, and undoes it', async () => {
    const calls = stubFetch((url) =>
      url.startsWith('/api/shopping') ? new Response(null, { status: 204 }) : undefined,
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <I18nProvider language="en">
            <ShoppingAdded
              added={[
                {
                  batchId: 'b1',
                  list: 'family',
                  recipe: 'Pot pie',
                  count: 11,
                  adapted: [{ from: 'heavy cream', to: 'Schlagsahne' }],
                  atHome: ['Mehl', 'Salz'],
                },
              ]}
            />
          </I18nProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText('Pot pie: 11 items on the family list')).toBeDefined();
    expect(screen.getByText(/heavy cream → Schlagsahne/)).toBeDefined();
    expect(screen.getByText('Usually at home: Mehl, Salz')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('Removed from the list')).toBeDefined();
    expect(calls.find((c) => c.url === '/api/shopping/batches/b1')?.init?.method).toBe('DELETE');
  });

  it('moves what was added to the other list', async () => {
    const calls = stubFetch((url) =>
      url.startsWith('/api/shopping') ? new Response(null, { status: 204 }) : undefined,
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <I18nProvider language="en">
            <ShoppingAdded
              added={[
                { batchId: 'b2', list: 'family', recipe: null, count: 2, adapted: [], atHome: [] },
              ]}
            />
          </I18nProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Move to my list' }));
    expect(await screen.findByText('2 items on your own list')).toBeDefined();
    const c = calls.find((x) => x.url === '/api/shopping/batches/b2/move');
    expect(JSON.parse(c?.init?.body as string)).toEqual({ to: 'mine' });
    expect(screen.getByRole('button', { name: 'Move to family list' })).toBeDefined();
  });
});
