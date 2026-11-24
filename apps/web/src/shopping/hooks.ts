/** The shopping list (P12). Changes show at once (optimistic) and reload from the server. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type Country,
  ShoppingAddedRef,
  ShoppingListResponse,
  ShoppingSettings,
  type UpdateShoppingItemRequest,
} from '@hemmia/shared';
import { api } from '../api/client.ts';

export const SHOPPING_KEY = ['shopping'] as const;

export function useShopping() {
  return useQuery({
    queryKey: SHOPPING_KEY,
    queryFn: () => api('/shopping', { schema: ShoppingListResponse }),
  });
}

/** A change that is shown at once and undone if the server refuses it. */
function useListChange<V>(
  call: (v: V) => Promise<unknown>,
  apply?: (list: ShoppingListResponse, v: V) => ShoppingListResponse,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: call,
    onMutate: async (v: V) => {
      if (!apply) return { before: undefined };
      await queryClient.cancelQueries({ queryKey: SHOPPING_KEY });
      const before = queryClient.getQueryData<ShoppingListResponse>(SHOPPING_KEY);
      if (before) queryClient.setQueryData(SHOPPING_KEY, apply(before, v));
      return { before };
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.before) queryClient.setQueryData(SHOPPING_KEY, ctx.before);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: SHOPPING_KEY }),
  });
}

const path = (key: string) => `/shopping/items/${encodeURIComponent(key)}`;

export function useAddShoppingItem() {
  return useListChange((text: string) =>
    api('/shopping/items', { method: 'POST', body: { text }, schema: ShoppingAddedRef }),
  );
}

export function useUpdateShoppingItem() {
  return useListChange(
    ({ key, ...body }: UpdateShoppingItemRequest & { key: string }) =>
      api(path(key), { method: 'PATCH', body }),
    (list, { key, status, alwaysHome }) => ({
      ...list,
      items: list.items.map((i) =>
        i.key !== key
          ? i
          : {
              ...i,
              ...(status ? { status } : {}),
              ...(alwaysHome !== undefined
                ? { alwaysHome, ...(status ? {} : { status: alwaysHome ? 'home' : 'open' }) }
                : {}),
            },
      ),
    }),
  );
}

export function useRemoveShoppingItem() {
  return useListChange(
    (key: string) => api(path(key), { method: 'DELETE' }),
    (list, key) => ({ ...list, items: list.items.filter((i) => i.key !== key) }),
  );
}

export function useSetServings() {
  return useListChange(({ id, servings }: { id: string; servings: number }) =>
    api(`/shopping/recipes/${encodeURIComponent(id)}`, { method: 'PATCH', body: { servings } }),
  );
}

export function useRemoveRecipe() {
  return useListChange((id: string) =>
    api(`/shopping/recipes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  );
}

export function useClearShopping() {
  return useListChange(
    (what: 'bought' | 'all') => api('/shopping/clear', { method: 'POST', body: { what } }),
    (list, what) =>
      what === 'all'
        ? { ...list, items: [], recipes: [] }
        : { ...list, items: list.items.filter((i) => i.status !== 'bought') },
  );
}

/** The chat's Undo for what the model put on the list. */
export function useUndoShopping() {
  return useListChange((batchId: string) =>
    api(`/shopping/batches/${encodeURIComponent(batchId)}`, { method: 'DELETE' }),
  );
}

export function useSetCountry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (country: Country) =>
      api('/shopping/settings', { method: 'PUT', body: { country }, schema: ShoppingSettings }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: SHOPPING_KEY }),
  });
}
