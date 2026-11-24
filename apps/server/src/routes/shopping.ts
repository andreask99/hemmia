/**
 * The shopping list (P12). Owned by Claude (per-user data). Every route works on the signed-in
 * user's own list only; teens included.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  AddShoppingItemRequest,
  ClearShoppingRequest,
  Id,
  type ShoppingAddedRef,
  type ShoppingListResponse,
  ShoppingSettings,
  UpdateShoppingItemRequest,
  UpdateShoppingRecipeRequest,
} from '@hemmia/shared';
import { type ShoppingRepo, ShoppingLimitError } from '../db/shopping.ts';
import { currentUser, HttpError, requireUser } from '../security/http.ts';

const ItemParams = z.object({ key: z.string().min(1).max(80) });
const RecipeParams = z.object({ recipeId: Id });
const BatchParams = z.object({ batchId: Id });

export function registerShoppingRoutes(
  app: FastifyInstance,
  deps: { shopping: ShoppingRepo },
): void {
  const { shopping } = deps;

  app.get(
    '/api/shopping',
    { preHandler: requireUser },
    async (req): Promise<ShoppingListResponse> => shopping.get(currentUser(req)),
  );

  app.post(
    '/api/shopping/items',
    { preHandler: requireUser },
    async (req, reply): Promise<ShoppingAddedRef> => {
      const body = AddShoppingItemRequest.parse(req.body);
      try {
        return await reply.code(201).send(shopping.addTyped(currentUser(req), body.text));
      } catch (err) {
        if (err instanceof ShoppingLimitError) throw new HttpError(409, 'too_many');
        throw err;
      }
    },
  );

  app.patch('/api/shopping/items/:key', { preHandler: requireUser }, async (req, reply) => {
    const { key } = ItemParams.parse(req.params);
    const body = UpdateShoppingItemRequest.parse(req.body);
    if (!shopping.updateItem(currentUser(req), key, body)) throw new HttpError(404, 'not_found');
    return reply.code(204).send();
  });

  app.delete('/api/shopping/items/:key', { preHandler: requireUser }, async (req, reply) => {
    const { key } = ItemParams.parse(req.params);
    if (!shopping.removeItem(currentUser(req), key)) throw new HttpError(404, 'not_found');
    return reply.code(204).send();
  });

  app.patch('/api/shopping/recipes/:recipeId', { preHandler: requireUser }, async (req, reply) => {
    const { recipeId } = RecipeParams.parse(req.params);
    const { servings } = UpdateShoppingRecipeRequest.parse(req.body);
    if (!shopping.setServings(currentUser(req), recipeId, servings)) {
      throw new HttpError(404, 'not_found');
    }
    return reply.code(204).send();
  });

  app.delete('/api/shopping/recipes/:recipeId', { preHandler: requireUser }, async (req, reply) => {
    const { recipeId } = RecipeParams.parse(req.params);
    if (!shopping.removeRecipe(currentUser(req), recipeId)) throw new HttpError(404, 'not_found');
    return reply.code(204).send();
  });

  /** The chat's Undo for what the model added in a reply. */
  app.delete('/api/shopping/batches/:batchId', { preHandler: requireUser }, async (req, reply) => {
    const { batchId } = BatchParams.parse(req.params);
    if (!shopping.undo(currentUser(req), batchId)) throw new HttpError(404, 'not_found');
    return reply.code(204).send();
  });

  app.post('/api/shopping/clear', { preHandler: requireUser }, async (req, reply) => {
    const { what } = ClearShoppingRequest.parse(req.body);
    shopping.clear(currentUser(req), what);
    return reply.code(204).send();
  });

  app.get(
    '/api/shopping/settings',
    { preHandler: requireUser },
    async (req): Promise<ShoppingSettings> => ({
      country: shopping.country(currentUser(req)),
    }),
  );

  app.put(
    '/api/shopping/settings',
    { preHandler: requireUser },
    async (req): Promise<ShoppingSettings> => {
      const body = ShoppingSettings.parse(req.body);
      const user = currentUser(req);
      shopping.setCountry(user, body.country);
      return { country: shopping.country(user) };
    },
  );
}
