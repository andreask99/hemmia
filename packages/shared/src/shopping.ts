import { z } from 'zod';
import { Id } from './chat.ts';

/**
 * The shopping list (P12): ingredients from recipes (chat, links, pasted text) and items added
 * by hand, converted to the units, pack sizes and products of the user's country. Each person
 * has their own list (encrypted with their data key) and the family shares one (P12.6,
 * encrypted with the family key); items and whole lists can move between them.
 *
 * The model only reads recipes (names, amounts as written, aisle, local product); the server
 * does all arithmetic: units, scaling to the servings wanted, merging and pack sizes.
 */

/** Which list: the family's (shared by every account on the hub) or the person's own. */
export const SHOPPING_LISTS = ['family', 'mine'] as const;
export const ShoppingListName = z.enum(SHOPPING_LISTS);
export type ShoppingListName = z.infer<typeof ShoppingListName>;

export const COUNTRIES = ['DE', 'AT', 'CH', 'FR', 'IT', 'GB', 'US'] as const;
export const Country = z.enum(COUNTRIES);
export type Country = z.infer<typeof Country>;

/** Shop aisles, in the order a list is shown. */
export const AISLES = [
  'produce',
  'meat',
  'dairy',
  'bakery',
  'pantry',
  'frozen',
  'drinks',
  'household',
  'other',
] as const;
export const Aisle = z.enum(AISLES);
export type Aisle = z.infer<typeof Aisle>;

/** Base units an ingredient line is stored in (amounts in grams, millilitres or pieces). */
export const LineUnit = z.enum(['g', 'ml', 'piece', 'can', 'bunch', 'clove', 'pack', 'slice']);
export type LineUnit = z.infer<typeof LineUnit>;

/** Units an item is bought in (shown per country: kg in Germany, lb in the US). */
export const BuyUnit = z.enum([
  'g',
  'kg',
  'ml',
  'l',
  'lb',
  'oz',
  'fl_oz',
  'pt',
  'qt',
  'gal',
  'piece',
  'pack',
  'bunch',
  'can',
  'bulb',
  'jar',
]);
export type BuyUnit = z.infer<typeof BuyUnit>;

/** What to put in the basket: `count` × `size` `unit` ("2 × 250 g"), or `count` `unit` ("3"). */
export const BuyAmount = z.object({
  count: z.number().int().min(1).max(999),
  size: z.number().positive().nullable(),
  unit: BuyUnit,
});
export type BuyAmount = z.infer<typeof BuyAmount>;

export const ItemStatus = z.enum(['open', 'bought', 'home']);
export type ItemStatus = z.infer<typeof ItemStatus>;

/** Where an item's amount comes from: one recipe line, as written. */
export const ItemSource = z.object({
  recipeId: Id.nullable(),
  recipeTitle: z.string().nullable(),
  original: z.string(),
});
export type ItemSource = z.infer<typeof ItemSource>;

/** A family member, as shown on the family list; `name` is null for a deleted account. */
export const ShoppingPerson = z.object({ userId: z.string(), name: z.string().nullable() });
export type ShoppingPerson = z.infer<typeof ShoppingPerson>;

/** One item on the list as shown: lines with the same ingredient merged. */
export const ShoppingItem = z.object({
  /** Merge key (the ingredient's generic English name); identifies the item in requests. */
  key: z.string(),
  name: z.string(),
  aisle: Aisle,
  status: ItemStatus,
  /** What the recipes need together (base units), when known. */
  need: z.object({ amount: z.number(), unit: LineUnit }).nullable(),
  buy: BuyAmount.nullable(),
  /** The amount was changed by hand (the stepper). */
  adjusted: z.boolean(),
  sources: z.array(ItemSource),
  /** Original products this one stands in for ("heavy cream"), when swapped for the country. */
  swappedFrom: z.array(z.string()),
  /** On the "always at home" list (the person's own, or the family's on the family list). */
  alwaysHome: z.boolean(),
  /** Family list: who put it on the list (each person once, in order). Empty on your own. */
  addedBy: z.array(ShoppingPerson).default([]),
  /** Family list: who ticked it off, while it is bought. */
  ticked: ShoppingPerson.extend({ at: z.number().int() }).nullable().default(null),
});
export type ShoppingItem = z.infer<typeof ShoppingItem>;

export const ShoppingRecipe = z.object({
  id: Id,
  title: z.string(),
  url: z.string().nullable(),
  /** Servings the recipe is written for; null when it doesn't say (amounts aren't scaled). */
  baseServings: z.number().int().nullable(),
  servings: z.number().int().nullable(),
});
export type ShoppingRecipe = z.infer<typeof ShoppingRecipe>;

/** GET /api/shopping/:list. */
export const ShoppingListResponse = z.object({
  list: ShoppingListName.default('mine'),
  country: Country,
  recipes: z.array(ShoppingRecipe),
  items: z.array(ShoppingItem),
});
export type ShoppingListResponse = z.infer<typeof ShoppingListResponse>;

/** POST /api/shopping/:list/items: "milk", "2 l milk", "500 g Hackfleisch". */
export const AddShoppingItemRequest = z.object({ text: z.string().trim().min(1).max(120) });
export type AddShoppingItemRequest = z.infer<typeof AddShoppingItemRequest>;

/** PATCH /api/shopping/:list/items/:key. `count` sets the number of packs or pieces by hand. */
export const UpdateShoppingItemRequest = z.object({
  status: ItemStatus.optional(),
  count: z.number().int().min(1).max(99).nullable().optional(),
  alwaysHome: z.boolean().optional(),
});
export type UpdateShoppingItemRequest = z.infer<typeof UpdateShoppingItemRequest>;

/** PATCH /api/shopping/:list/recipes/:id. */
export const UpdateShoppingRecipeRequest = z.object({ servings: z.number().int().min(1).max(50) });
export type UpdateShoppingRecipeRequest = z.infer<typeof UpdateShoppingRecipeRequest>;

/** POST /api/shopping/:list/clear: bought items, or the whole list. */
export const ClearShoppingRequest = z.object({ what: z.enum(['bought', 'all']) });
export type ClearShoppingRequest = z.infer<typeof ClearShoppingRequest>;

/**
 * Moves to the other list: POST /api/shopping/:list/items/:key/move (one item),
 * /api/shopping/:list/move (everything) and /api/shopping/batches/:batchId/move (what the model
 * added in one reply).
 */
export const MoveShoppingRequest = z.object({ to: ShoppingListName });
export type MoveShoppingRequest = z.infer<typeof MoveShoppingRequest>;

/** GET/PUT /api/shopping/:list/settings. */
export const ShoppingSettings = z.object({ country: Country });
export type ShoppingSettings = z.infer<typeof ShoppingSettings>;

/** Limits: lines on a list, lines per recipe, recipes on a list. */
export const MAX_SHOPPING_LINES = 300;
export const MAX_RECIPE_LINES = 60;
export const MAX_SHOPPING_RECIPES = 20;

/**
 * Past lists (P12.8): when the last item on a list is ticked off (nothing left to buy, at least
 * one item bought), the whole list is archived and the list starts empty. Past lists can be
 * looked at, put back (Undo right after, or "shop again" later) and deleted; they are deleted
 * on their own after SHOPPING_ARCHIVE_DAYS.
 */
export const SHOPPING_ARCHIVE_DAYS = 30;
export const MAX_SHOPPING_ARCHIVES = 50;

/**
 * PATCH and DELETE /api/shopping/:list/items/:key: `archived` is the past list's id when that
 * change finished the list.
 */
export const ShoppingChangeResponse = z.object({ archived: Id.nullable() });
export type ShoppingChangeResponse = z.infer<typeof ShoppingChangeResponse>;

/** One past list. `list` is the list as it was when finished. */
export const ShoppingArchiveEntry = z.object({
  id: Id,
  archivedAt: z.number().int(),
  /** When it is deleted on its own. */
  deleteAt: z.number().int(),
  /** Family list: who ticked off the last item. */
  finishedBy: ShoppingPerson.nullable(),
  list: ShoppingListResponse,
});
export type ShoppingArchiveEntry = z.infer<typeof ShoppingArchiveEntry>;

/** GET /api/shopping/:list/archive: newest first. */
export const ShoppingArchiveResponse = z.object({ archives: z.array(ShoppingArchiveEntry) });
export type ShoppingArchiveResponse = z.infer<typeof ShoppingArchiveResponse>;

/**
 * POST /api/shopping/:list/archive/:id/restore. `undo`: the list comes back as it was, with the
 * item ticked last open again, and the past list goes. `again`: its items are added to the list
 * as "to buy" (shopping for the same again); the past list stays.
 */
export const RestoreShoppingRequest = z.object({ as: z.enum(['undo', 'again']) });
export type RestoreShoppingRequest = z.infer<typeof RestoreShoppingRequest>;
