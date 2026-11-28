/**
 * The shopping lists (P12, P12.6): the family's and the user's own. Changes show at once
 * (optimistic) and reload from the server; the family list also reloads every 10 seconds while
 * it is on screen, so what others add shows up. Past lists (P12.8): a tick or removal that
 * finishes a list answers with the past list's id, for the page's Undo.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type Country,
  ShoppingAddedRef,
  ShoppingArchiveResponse,
  ShoppingChangeResponse,
  type ShoppingListName,
  ShoppingListResponse,
  ShoppingSettings,
  type UpdateShoppingItemRequest,
} from '@hemmia/shared';
import { api } from '../api/client.ts';

/** Prefix of both lists' query keys. */
export const SHOPPING_KEY = ['shopping'] as const;
const keyOf = (list: ShoppingListName) => ['shopping', list] as const;

/** How often the family list reloads while on screen. */
export const FAMILY_REFRESH_MS = 10_000;

export function useShopping(list: ShoppingListName) {
  return useQuery({
    queryKey: keyOf(list),
    queryFn: () => api(`/shopping/${list}`, { schema: ShoppingListResponse }),
    refetchInterval: list === 'family' ? FAMILY_REFRESH_MS : false,
    refetchIntervalInBackground: false,
  });
}

/** A change to one list that is shown at once and undone if the server refuses it. */
function useListChange<V, R = unknown>(
  list: ShoppingListName,
  call: (v: V) => Promise<R>,
  apply?: (data: ShoppingListResponse, v: V) => ShoppingListResponse,
  onSuccess?: (r: R) => void,
) {
  const queryClient = useQueryClient();
  const key = keyOf(list);
  return useMutation({
    mutationFn: call,
    onMutate: async (v: V) => {
      if (!apply) return { before: undefined };
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<ShoppingListResponse>(key);
      if (before) queryClient.setQueryData(key, apply(before, v));
      return { before };
    },
    // Here rather than in mutate(): a ticked row moves to another section and remounts, and
    // mutate()'s callbacks don't run once the component that called it is gone.
    ...(onSuccess ? { onSuccess } : {}),
    onError: (_err, _v, ctx) => {
      if (ctx?.before) queryClient.setQueryData(key, ctx.before);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

const itemPath = (list: ShoppingListName, key: string) =>
  `/shopping/${list}/items/${encodeURIComponent(key)}`;

export function useAddShoppingItem(list: ShoppingListName) {
  return useListChange(list, (text: string) =>
    api(`/shopping/${list}/items`, { method: 'POST', body: { text }, schema: ShoppingAddedRef }),
  );
}

/** Calls `onFinished` with the past list's id when a change finished (archived) the list. */
const finishedBy =
  (onFinished?: (id: string) => void) =>
  (r: ShoppingChangeResponse): void => {
    if (r.archived && onFinished) onFinished(r.archived);
  };

export function useUpdateShoppingItem(list: ShoppingListName, onFinished?: (id: string) => void) {
  return useListChange(
    list,
    ({ key, ...body }: UpdateShoppingItemRequest & { key: string }) =>
      api(itemPath(list, key), { method: 'PATCH', body, schema: ShoppingChangeResponse }),
    (data, { key, status, alwaysHome }) => ({
      ...data,
      items: data.items.map((i) =>
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
    finishedBy(onFinished),
  );
}

export function useRemoveShoppingItem(list: ShoppingListName, onFinished?: (id: string) => void) {
  return useListChange(
    list,
    (key: string) => api(itemPath(list, key), { method: 'DELETE', schema: ShoppingChangeResponse }),
    (data, key) => ({ ...data, items: data.items.filter((i) => i.key !== key) }),
    finishedBy(onFinished),
  );
}

export function useSetServings(list: ShoppingListName) {
  return useListChange(list, ({ id, servings }: { id: string; servings: number }) =>
    api(`/shopping/${list}/recipes/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { servings },
    }),
  );
}

export function useRemoveRecipe(list: ShoppingListName) {
  return useListChange(list, (id: string) =>
    api(`/shopping/${list}/recipes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  );
}

export function useClearShopping(list: ShoppingListName) {
  return useListChange(
    list,
    (what: 'bought' | 'all') => api(`/shopping/${list}/clear`, { method: 'POST', body: { what } }),
    (data, what) =>
      what === 'all'
        ? { ...data, items: [], recipes: [] }
        : { ...data, items: data.items.filter((i) => i.status !== 'bought') },
  );
}

/** A change that touches both lists (moves, the chat's Undo): reloads both afterwards. */
function useBothLists<V>(call: (v: V) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: call,
    onSettled: () => queryClient.invalidateQueries({ queryKey: SHOPPING_KEY }),
  });
}

/** Moves one item, or (without `key`) the whole list, to the other list. */
export function useMoveShopping(list: ShoppingListName) {
  const to: ShoppingListName = list === 'family' ? 'mine' : 'family';
  return useBothLists((key: string | null) =>
    api(key === null ? `/shopping/${list}/move` : `${itemPath(list, key)}/move`, {
      method: 'POST',
      body: { to },
    }),
  );
}

/** The chat's Undo for what the model put on a list. */
export function useUndoShopping() {
  return useBothLists((batchId: string) =>
    api(`/shopping/batches/${encodeURIComponent(batchId)}`, { method: 'DELETE' }),
  );
}

/** The chat's "Move to my list" / "Move to family list" for what the model added. */
export function useMoveShoppingBatch() {
  return useBothLists(({ batchId, to }: { batchId: string; to: ShoppingListName }) =>
    api(`/shopping/batches/${encodeURIComponent(batchId)}/move`, {
      method: 'POST',
      body: { to },
    }),
  );
}

export function useSetCountry(list: ShoppingListName) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (country: Country) =>
      api(`/shopping/${list}/settings`, {
        method: 'PUT',
        body: { country },
        schema: ShoppingSettings,
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keyOf(list) }),
  });
}

/** The list's past lists (finished lists, kept 30 days). Reloaded with the list. */
export function useShoppingArchive(list: ShoppingListName) {
  return useQuery({
    queryKey: [...keyOf(list), 'archive'],
    queryFn: () => api(`/shopping/${list}/archive`, { schema: ShoppingArchiveResponse }),
  });
}

/** Undo (the list as it was) or "shop again" (its items back on the list as to buy). */
export function useRestoreShopping(list: ShoppingListName) {
  return useListChange(list, ({ id, as }: { id: string; as: 'undo' | 'again' }) =>
    api(`/shopping/${list}/archive/${encodeURIComponent(id)}/restore`, {
      method: 'POST',
      body: { as },
    }),
  );
}

export function useDeleteArchived(list: ShoppingListName) {
  return useListChange(list, (id: string) =>
    api(`/shopping/${list}/archive/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  );
}
