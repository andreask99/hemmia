/**
 * The shopping lists (P12, P12.6). Owned by Claude (per-user data). `:list` is `mine` (the
 * signed-in user's own list) or `family` (shared by every account on the hub, teens included;
 * DECISIONS.md 2026-11-27). A chat batch is found on either list; on the family list only the
 * caller's own additions can be undone or moved by batch. Past lists (P12.8): a list whose last
 * item is ticked off is archived; `/:list/archive` lists, restores and deletes them.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  AddShoppingItemRequest,
  ClearShoppingRequest,
  Id,
  MoveShoppingRequest,
  RestoreShoppingRequest,
  type ShoppingAddedRef,
  type ShoppingArchiveResponse,
  type ShoppingChangeResponse,
  ShoppingListName,
  type ShoppingListResponse,
  ShoppingSettings,
  UpdateShoppingItemRequest,
  UpdateShoppingRecipeRequest,
} from '@hemmia/shared';
import { type MoveWhat, type ShoppingRepo, ShoppingLimitError } from '../db/shopping.ts';
import { currentUser, HttpError, requireUser } from '../security/http.ts';

const ListParams = z.object({ list: ShoppingListName });
const ItemParams = ListParams.extend({ key: z.string().min(1).max(80) });
const RecipeParams = ListParams.extend({ recipeId: Id });
const BatchParams = z.object({ batchId: Id });
const ArchiveParams = ListParams.extend({ id: Id });

/** Runs a change that may hit the list limits: 409 `too_many`. */
function limited<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof ShoppingLimitError) throw new HttpError(409, 'too_many');
    throw err;
  }
}

export function registerShoppingRoutes(
  app: FastifyInstance,
  deps: { shopping: ShoppingRepo },
): void {
  const { shopping } = deps;

  app.get(
    '/api/shopping/:list',
    { preHandler: requireUser },
    async (req): Promise<ShoppingListResponse> => {
      const { list } = ListParams.parse(req.params);
      return shopping.get(currentUser(req), list);
    },
  );

  app.post(
    '/api/shopping/:list/items',
    { preHandler: requireUser },
    async (req, reply): Promise<ShoppingAddedRef> => {
      const { list } = ListParams.parse(req.params);
      const body = AddShoppingItemRequest.parse(req.body);
      const added = limited(() => shopping.addTyped(currentUser(req), list, body.text));
      return reply.code(201).send(added);
    },
  );

  app.patch(
    '/api/shopping/:list/items/:key',
    { preHandler: requireUser },
    async (req): Promise<ShoppingChangeResponse> => {
      const { list, key } = ItemParams.parse(req.params);
      const body = UpdateShoppingItemRequest.parse(req.body);
      const done = shopping.updateItem(currentUser(req), list, key, body);
      if (!done) throw new HttpError(404, 'not_found');
      return done;
    },
  );

  app.delete(
    '/api/shopping/:list/items/:key',
    { preHandler: requireUser },
    async (req): Promise<ShoppingChangeResponse> => {
      const { list, key } = ItemParams.parse(req.params);
      const done = shopping.removeItem(currentUser(req), list, key);
      if (!done) throw new HttpError(404, 'not_found');
      return done;
    },
  );

  const move = (
    from: ShoppingListName | null,
    what: MoveWhat,
    body: unknown,
    user: Parameters<ShoppingRepo['move']>[0],
  ) => {
    const { to } = MoveShoppingRequest.parse(body);
    if (from === to) throw new HttpError(400, 'bad_request');
    if (!limited(() => shopping.move(user, from, to, what))) throw new HttpError(404, 'not_found');
  };

  app.post(
    '/api/shopping/:list/items/:key/move',
    { preHandler: requireUser },
    async (req, reply) => {
      const { list, key } = ItemParams.parse(req.params);
      move(list, { key }, req.body, currentUser(req));
      return reply.code(204).send();
    },
  );

  app.post('/api/shopping/:list/move', { preHandler: requireUser }, async (req, reply) => {
    const { list } = ListParams.parse(req.params);
    move(list, { all: true }, req.body, currentUser(req));
    return reply.code(204).send();
  });

  app.patch(
    '/api/shopping/:list/recipes/:recipeId',
    { preHandler: requireUser },
    async (req, reply) => {
      const { list, recipeId } = RecipeParams.parse(req.params);
      const { servings } = UpdateShoppingRecipeRequest.parse(req.body);
      if (!shopping.setServings(currentUser(req), list, recipeId, servings)) {
        throw new HttpError(404, 'not_found');
      }
      return reply.code(204).send();
    },
  );

  app.delete(
    '/api/shopping/:list/recipes/:recipeId',
    { preHandler: requireUser },
    async (req, reply) => {
      const { list, recipeId } = RecipeParams.parse(req.params);
      if (!shopping.removeRecipe(currentUser(req), list, recipeId)) {
        throw new HttpError(404, 'not_found');
      }
      return reply.code(204).send();
    },
  );

  /** The chat's Undo for what the model added in a reply, on whichever list it is now. */
  app.delete('/api/shopping/batches/:batchId', { preHandler: requireUser }, async (req, reply) => {
    const { batchId } = BatchParams.parse(req.params);
    if (!shopping.undo(currentUser(req), batchId)) throw new HttpError(404, 'not_found');
    return reply.code(204).send();
  });

  /** The chat's "Move to my list" / "Move to family list" for what the model added. */
  app.post(
    '/api/shopping/batches/:batchId/move',
    { preHandler: requireUser },
    async (req, reply) => {
      const { batchId } = BatchParams.parse(req.params);
      move(null, { batchId }, req.body, currentUser(req));
      return reply.code(204).send();
    },
  );

  app.post('/api/shopping/:list/clear', { preHandler: requireUser }, async (req, reply) => {
    const { list } = ListParams.parse(req.params);
    const { what } = ClearShoppingRequest.parse(req.body);
    shopping.clear(currentUser(req), list, what);
    return reply.code(204).send();
  });

  app.get(
    '/api/shopping/:list/archive',
    { preHandler: requireUser },
    async (req): Promise<ShoppingArchiveResponse> => {
      const { list } = ListParams.parse(req.params);
      return { archives: shopping.archive(currentUser(req), list) };
    },
  );

  app.post(
    '/api/shopping/:list/archive/:id/restore',
    { preHandler: requireUser },
    async (req, reply) => {
      const { list, id } = ArchiveParams.parse(req.params);
      const { as } = RestoreShoppingRequest.parse(req.body);
      if (!limited(() => shopping.restore(currentUser(req), list, id, as))) {
        throw new HttpError(404, 'not_found');
      }
      return reply.code(204).send();
    },
  );

  app.delete('/api/shopping/:list/archive/:id', { preHandler: requireUser }, async (req, reply) => {
    const { list, id } = ArchiveParams.parse(req.params);
    if (!shopping.deleteArchived(currentUser(req), list, id)) {
      throw new HttpError(404, 'not_found');
    }
    return reply.code(204).send();
  });

  app.get(
    '/api/shopping/:list/settings',
    { preHandler: requireUser },
    async (req): Promise<ShoppingSettings> => {
      const { list } = ListParams.parse(req.params);
      return { country: shopping.country(currentUser(req), list) };
    },
  );

  app.put(
    '/api/shopping/:list/settings',
    { preHandler: requireUser },
    async (req): Promise<ShoppingSettings> => {
      const { list } = ListParams.parse(req.params);
      const body = ShoppingSettings.parse(req.body);
      const user = currentUser(req);
      shopping.setCountry(user, list, body.country);
      return { country: shopping.country(user, list) };
    },
  );
}
