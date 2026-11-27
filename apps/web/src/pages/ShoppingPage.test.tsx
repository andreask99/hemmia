import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { json, ME, renderRoute, stubFetch } from '../test-utils.tsx';

const item = (key: string, name: string, extra: object = {}) => ({
  key,
  name,
  aisle: 'pantry',
  status: 'open',
  need: null,
  buy: null,
  adjusted: false,
  sources: [],
  swappedFrom: [],
  alwaysHome: false,
  ...extra,
});
const LIST = {
  list: 'family',
  country: 'DE',
  recipes: [{ id: 'r1', title: 'Pot pie', url: null, baseServings: 4, servings: 4 }],
  items: [
    item('chicken breast', 'Hähnchenbrust', {
      aisle: 'meat',
      need: { amount: 453.6, unit: 'g' },
      buy: { count: 1, size: 450, unit: 'g' },
      sources: [{ recipeId: 'r1', recipeTitle: 'Pot pie', original: '1 lb chicken breast' }],
    }),
    item('heavy cream', 'Schlagsahne', {
      aisle: 'dairy',
      buy: { count: 1, size: 200, unit: 'ml' },
      swappedFrom: ['heavy cream'],
      sources: [{ recipeId: 'r1', recipeTitle: 'Pot pie', original: '⅔ cup heavy cream' }],
    }),
    item('parsley', 'Petersilie', {
      aisle: 'produce',
      buy: { count: 1, size: null, unit: 'bunch' },
    }),
    item('flour', 'Mehl', {
      status: 'home',
      alwaysHome: true,
      buy: { count: 1, size: 1, unit: 'kg' },
    }),
    item('eggs', 'Eier', {
      aisle: 'dairy',
      status: 'bought',
      buy: { count: 6, size: null, unit: 'piece' },
      addedBy: [{ userId: 'u1', name: 'anna' }],
      ticked: { userId: 'u2', name: 'ben', at: new Date().setHours(17, 40, 0, 0) },
    }),
    item('bananas', 'Bananen', {
      aisle: 'produce',
      addedBy: [
        { userId: 'u3', name: 'mia' },
        { userId: 'u1', name: 'anna' },
      ],
    }),
  ],
};
const MINE = {
  list: 'mine',
  country: 'DE',
  recipes: [],
  items: [item('candles', 'Kerzen', { aisle: 'household' })],
};

function setup() {
  return stubFetch((url) => {
    if (url === '/api/me') return json(ME);
    if (url === '/api/models') {
      return json({
        chatModels: [],
        imageModels: [],
        defaultChatModel: 'quick',
        defaultImageModel: null,
      });
    }
    if (url === '/api/chats') return json({ chats: [] });
    if (url === '/api/agents') return json({ agents: [], templates: [] });
    if (url === '/api/shopping/family') return json(LIST);
    if (url === '/api/shopping/mine') return json(MINE);
    if (url === '/api/shopping/family/items' || url === '/api/shopping/mine/items') {
      return json(
        { batchId: 'b1', list: 'family', recipe: null, count: 1, adapted: [], atHome: [] },
        201,
      );
    }
    if (url.startsWith('/api/shopping/')) return new Response(null, { status: 204 });
    return undefined;
  });
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ShoppingPage', () => {
  it('shows items by aisle with what to buy, at home and bought apart', async () => {
    setup();
    renderRoute('/shopping');
    expect(await screen.findByText('Hähnchenbrust')).toBeDefined();
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      'Fruit & veg',
      'Meat & fish',
      'Dairy & eggs',
      'At home already',
      'Bought',
    ]);
    expect(screen.getByText('450 g')).toBeDefined();
    expect(screen.getByText('1 bunch')).toBeDefined();
    expect(screen.getByText('Pot pie · instead of heavy cream')).toBeDefined();
    expect(screen.getByText('4 to buy')).toBeDefined();
    // Who added and who ticked; the user's own additions say "You".
    expect(screen.getByText('mia, You')).toBeDefined();
    expect(screen.getByText(/^Ticked by ben · (17:40|05:40 PM)$/)).toBeDefined();
    expect(screen.getByRole('button', { name: /Family/, pressed: true })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Mine 1' })).toBeDefined();
    expect(screen.getByText('4 servings')).toBeDefined();
    expect(screen.getByRole<HTMLSelectElement>('combobox').value).toBe('DE');
  });

  it('ticks items off, buys a pantry item anyway and adds items', async () => {
    const calls = setup();
    renderRoute('/shopping');
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Hähnchenbrust bought' }));
    await waitFor(() => {
      const c = calls.find((x) => x.url === '/api/shopping/family/items/chicken%20breast');
      expect(c?.init?.method).toBe('PATCH');
      expect(JSON.parse(c?.init?.body as string)).toEqual({ status: 'bought' });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    await waitFor(() => {
      const c = calls.find((x) => x.url === '/api/shopping/family/items/flour');
      expect(JSON.parse(c?.init?.body as string)).toEqual({ status: 'open' });
    });

    fireEvent.change(screen.getByRole('textbox', { name: 'Add an item' }), {
      target: { value: '2 l Milch' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => {
      const c = calls.find(
        (x) => x.url === '/api/shopping/family/items' && x.init?.method === 'POST',
      );
      expect(JSON.parse(c?.init?.body as string)).toEqual({ text: '2 l Milch' });
    });
  });

  it('opens an item to show where the amount comes from and change it', async () => {
    const calls = setup();
    renderRoute('/shopping');
    fireEvent.click(await screen.findByRole('button', { name: /Hähnchenbrust/, expanded: false }));
    expect(screen.getByText('You need 454 g · buy 450 g')).toBeDefined();
    expect(screen.getByText('1 lb chicken breast')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'We always have this' }));
    await waitFor(() => {
      const bodies = calls
        .filter((x) => x.url === '/api/shopping/family/items/chicken%20breast')
        .map((x) => JSON.parse(x.init?.body as string) as object);
      expect(bodies).toEqual([{ count: 2 }, { alwaysHome: true }]);
    });
  });

  it('changes the servings of a recipe and clears bought items', async () => {
    const calls = setup();
    renderRoute('/shopping');
    fireEvent.click(await screen.findByRole('button', { name: 'More servings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear bought' }));
    await waitFor(() => {
      expect(
        JSON.parse(
          calls.find((x) => x.url === '/api/shopping/family/recipes/r1')?.init?.body as string,
        ),
      ).toEqual({ servings: 5 });
      expect(
        JSON.parse(calls.find((x) => x.url === '/api/shopping/family/clear')?.init?.body as string),
      ).toEqual({ what: 'bought' });
    });
  });

  it('switches to the own list, remembers it and offers to share it', async () => {
    const calls = setup();
    renderRoute('/shopping');
    fireEvent.click(await screen.findByRole('button', { name: 'Mine 1' }));
    expect(await screen.findByText('Kerzen')).toBeDefined();
    expect(screen.getByText('Only you can see this list.')).toBeDefined();
    expect(localStorage.getItem('hemmia.shopping.list')).toBe('mine');
    fireEvent.click(screen.getByRole('button', { name: 'Move to family list' }));
    await waitFor(() => {
      const c = calls.find((x) => x.url === '/api/shopping/mine/move');
      expect(JSON.parse(c?.init?.body as string)).toEqual({ to: 'family' });
    });
    expect(await screen.findByRole('button', { name: /Family/, pressed: true })).toBeDefined();
  });

  it('moves one item to the own list and asks before clearing it for everyone', async () => {
    const calls = setup();
    renderRoute('/shopping');
    fireEvent.click(await screen.findByRole('button', { name: /Bananen/, expanded: false }));
    expect(screen.getByText('Added by mia, You')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Move to my list' }));
    await waitFor(() => {
      const c = calls.find((x) => x.url === '/api/shopping/family/items/bananas/move');
      expect(JSON.parse(c?.init?.body as string)).toEqual({ to: 'mine' });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Clear list' }));
    expect(screen.getByText('Clear the family list for everyone?')).toBeDefined();
  });
});
