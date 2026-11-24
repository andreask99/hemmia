/**
 * Builds the shopping list as shown from the stored lines: scales recipe lines to the servings
 * wanted, merges lines of the same ingredient, converts them into one unit and rounds the total
 * to what one buys in the user's country (packs, counter amounts, pieces). Pure functions, no
 * model involved: local models get arithmetic like "⅓ cup + 1½ cups in grams" wrong too often.
 */
import { z } from 'zod';
import {
  Aisle,
  AISLES,
  type BuyAmount,
  type Country,
  Id,
  ItemStatus,
  LineUnit,
  type ShoppingItem,
  type ShoppingListResponse,
  ShoppingRecipe,
} from '@hemmia/shared';
import { findIngredient, type Ingredient, mergeKey, type Pack, packsFor } from './ingredients.ts';

/** One ingredient line as stored (encrypted with the list). Amounts for the recipe's servings. */
export const StoredLine = z.object({
  id: Id,
  recipeId: Id.nullable(),
  batchId: Id,
  /** The generic English name the model gave (or the canonical one for typed items). */
  key: z.string().min(1).max(80),
  name: z.string().min(1).max(80),
  aisle: Aisle,
  amount: z.number().nonnegative().nullable(),
  unit: LineUnit,
  original: z.string().max(160),
  swappedFrom: z.string().max(80).nullable(),
});
export type StoredLine = z.infer<typeof StoredLine>;

export const StoredRecipe = ShoppingRecipe.extend({ batchId: Id });
export type StoredRecipe = z.infer<typeof StoredRecipe>;

export const ItemState = z.object({
  status: ItemStatus.optional(),
  count: z.number().int().min(1).max(99).optional(),
});
export type ItemState = z.infer<typeof ItemState>;

export const StoredList = z.object({
  recipes: z.array(StoredRecipe),
  lines: z.array(StoredLine),
  /** By merge key. */
  states: z.record(z.string(), ItemState),
});
export type StoredList = z.infer<typeof StoredList>;

/** The user's own pantry choices (merge keys): always at home, or never assumed at home. */
export const Pantry = z.object({ always: z.array(z.string()), never: z.array(z.string()) });
export type Pantry = z.infer<typeof Pantry>;

export const EMPTY_LIST: StoredList = { recipes: [], lines: [], states: {} };
export const EMPTY_PANTRY: Pantry = { always: [], never: [] };

/** Whether an item starts in "At home". */
export function isAlwaysHome(key: string, pantry: Pantry): boolean {
  if (pantry.always.includes(key)) return true;
  if (pantry.never.includes(key)) return false;
  return findIngredient(key)?.pantry === true;
}

/** Whether a line is never shown (water). */
export const dropped = (line: Pick<StoredLine, 'key'>): boolean =>
  findIngredient(line.key)?.drop === true;

type Family = 'g' | 'ml' | 'piece' | 'can' | 'bunch' | 'clove' | 'pack';

/** The base-unit family of a pack (eggs: pieces; canned tomatoes: grams). */
function packFamily(ing: Ingredient, pack: Pack): Family {
  switch (pack.unit) {
    case 'piece':
      return 'piece';
    case 'can':
      return ing.liquid === true ? 'ml' : 'g';
    case 'ml':
    case 'l':
    case 'fl_oz':
    case 'pt':
    case 'qt':
    case 'gal':
      return 'ml';
    default:
      return 'g';
  }
}

const lineFamily = (unit: StoredLine['unit']): Family => (unit === 'slice' ? 'piece' : unit);

/** Converts `amount` from one family to another for this ingredient; null if it can't. */
function convert(
  amount: number,
  from: Family,
  to: Family,
  ing: Ingredient | undefined,
  packs: Pack[] | undefined,
): number | null {
  if (from === to) return amount;
  const can = packs?.find((p) => p.unit === 'can');
  if (from === 'can' && can)
    return convert(amount * can.base, packFamily(ing ?? { match: [] }, can), to, ing, packs);
  const density = ing?.density;
  const piece = ing?.pieceGrams;
  // "200 Parmesan", "250 Pasta": a number that size without a unit is grams (or millilitres).
  if (from === 'piece' && amount >= 25 && (to === 'g' || to === 'ml')) return amount;
  // "1 box pie crust", "2 puff pastry": one usual pack each.
  const first = packs?.[0];
  if (ing && first && (from === 'pack' || (from === 'piece' && !piece))) {
    if (packFamily(ing, first) === to) return amount * first.base;
  }
  if (from === 'ml' && to === 'g' && density) return amount * density;
  if (from === 'g' && to === 'ml' && density) return amount / density;
  if (from === 'piece' && to === 'g' && piece) return amount * piece;
  if (from === 'g' && to === 'piece' && piece) return amount / piece;
  if (from === 'ml' && to === 'piece' && density && piece) return (amount * density) / piece;
  if (from === 'piece' && to === 'ml' && density && piece) return (amount * piece) / density;
  if (from === 'clove' && to === 'g' && piece) return amount * piece;
  return null;
}

/** The unit an ingredient's lines are added up in. */
function targetFamily(
  ing: Ingredient | undefined,
  packs: Pack[] | undefined,
  lines: { family: Family }[],
): Family {
  if (ing?.clovesPerBulb) return 'clove';
  if (ing?.byPiece) return 'piece';
  const pack = packs?.[0];
  if (ing && pack) return packFamily(ing, pack);
  // Vegetables and fruit: "½ cup diced carrots" is one carrot; "500 g carrots" stays a weight.
  if (ing?.aisle === 'produce' && ing.pieceGrams) {
    return lines.length > 0 && lines.every((l) => l.family === 'g') ? 'g' : 'piece';
  }
  // Solids measured in cups and spoons are bought by weight.
  if (ing?.density && ing.liquid !== true) return 'g';
  return lines[0]?.family ?? 'piece';
}

/** Aisles whose things are solid: volumes there are converted to weights. */
const SOLID_AISLES = new Set<Aisle>(['produce', 'meat', 'frozen', 'bakery']);

const ceilTo = (x: number, step: number) => Math.ceil(x / step - 1e-9) * step;
const roundTo = (x: number, step: number) => Math.round(x / step) * step;

/** Rounds up to a sensible amount: 30 g, 150 g, 600 g, 1250 g. */
function niceUp(x: number): number {
  if (x <= 100) return Math.max(10, ceilTo(x, 10));
  if (x <= 500) return ceilTo(x, 50);
  if (x <= 1000) return ceilTo(x, 100);
  return ceilTo(x, 250);
}

/** A metric weight or volume to show: kilograms and litres from 1000 up. */
function metric(base: number, family: 'g' | 'ml'): BuyAmount {
  if (base >= 1000) {
    return { count: 1, size: Math.round(base / 10) / 100, unit: family === 'g' ? 'kg' : 'l' };
  }
  return { count: 1, size: Math.round(base), unit: family };
}

/** The pack(s) that cover `need` with the least left over (fewer packs on a tie). */
export function pickPack(need: number, packs: Pack[]): { pack: Pack; count: number } {
  let best: { pack: Pack; count: number; total: number } | null = null;
  for (const pack of packs) {
    const count = Math.max(1, Math.ceil(need / pack.base - 1e-9));
    const total = count * pack.base;
    if (best === null || total < best.total || (total === best.total && count < best.count)) {
      best = { pack, count, total };
    }
  }
  if (best === null) throw new Error('no packs');
  return { pack: best.pack, count: best.count };
}

function fromPack(p: { pack: Pack; count: number }): BuyAmount {
  if (p.pack.unit === 'piece') return { count: p.pack.base * p.count, size: null, unit: 'piece' };
  return { count: Math.min(p.count, 999), size: p.pack.size, unit: p.pack.unit };
}

/** What to buy for `need` (in `family` units) of an ingredient in `country`. */
export function buyAmount(
  need: number | null,
  family: Family,
  ing: Ingredient | undefined,
  aisle: Aisle,
  country: Country,
): BuyAmount | null {
  const us = country === 'US';
  if (ing?.herb) {
    return { count: family === 'bunch' && need ? Math.ceil(need) : 1, size: null, unit: 'bunch' };
  }
  if (ing?.clovesPerBulb) {
    const cloves = need === null ? 1 : family === 'g' ? need / (ing.pieceGrams ?? 5) : need;
    return { count: Math.max(1, Math.ceil(cloves / ing.clovesPerBulb)), size: null, unit: 'bulb' };
  }
  if (need === null || need <= 0) return null;
  const packs = ing ? packsFor(ing, country) : undefined;
  // Salt, pepper, spices: one has them or buys a jar; an amount would mislead.
  if (ing?.pantry && !packs) return null;
  // A few spoonfuls of a sauce or extract: one bottle, whatever its size.
  if (family === 'ml' && !packs && need <= 60) return null;
  if (ing && packs && packs.length > 0 && packFamily(ing, packs[0] as Pack) === family) {
    return fromPack(pickPack(need, packs));
  }
  switch (family) {
    case 'piece':
    case 'clove':
      return { count: Math.max(1, Math.ceil(need - 1e-9)), size: null, unit: 'piece' };
    case 'can':
    case 'bunch':
    case 'pack':
      return { count: Math.max(1, Math.ceil(need - 1e-9)), size: null, unit: family };
    case 'g':
      if (aisle === 'meat') {
        // Meat and fish from the counter: close to the recipe, not a whole pack more.
        if (us) return { count: 1, size: Math.max(0.25, roundTo(need / 453.6, 0.25)), unit: 'lb' };
        return metric(Math.max(50, roundTo(need, 50)), 'g');
      }
      if (us) {
        const ounces = need / 28.35;
        if (ounces <= 16)
          return { count: 1, size: Math.max(1, Math.ceil(ounces - 1e-9)), unit: 'oz' };
        return { count: 1, size: ceilTo(need / 453.6, 0.5), unit: 'lb' };
      }
      if (aisle === 'produce' && need > 100) {
        const steps = [250, 500, 750, 1000];
        return metric(steps.find((s) => s >= need) ?? ceilTo(need, 500), 'g');
      }
      return metric(niceUp(need), 'g');
    case 'ml':
      if (us) {
        const fl = need / 29.57;
        if (fl <= 32) return { count: 1, size: Math.max(1, Math.ceil(fl - 1e-9)), unit: 'fl_oz' };
        return { count: 1, size: Math.ceil(need / 946 - 1e-9), unit: 'qt' };
      }
      return metric(niceUp(need), 'ml');
  }
}

const recipeFactor = (r: StoredRecipe | undefined): number =>
  r && r.baseServings && r.servings ? r.servings / r.baseServings : 1;

/** The list as shown, from what is stored. */
export function buildList(
  list: StoredList,
  pantry: Pantry,
  country: Country,
): ShoppingListResponse {
  const recipes = new Map(list.recipes.map((r) => [r.id, r]));
  const groups = new Map<string, StoredLine[]>();
  for (const line of list.lines) {
    if (dropped(line)) continue;
    const key = mergeKey(line.key);
    const group = groups.get(key);
    if (group) group.push(line);
    else groups.set(key, [line]);
  }

  const items: ShoppingItem[] = [];
  for (const [key, lines] of groups) {
    const first = lines[0] as StoredLine;
    const ing = findIngredient(key);
    const packs = ing ? packsFor(ing, country) : undefined;
    const scaled = lines.map((l) => ({
      amount: l.amount === null ? null : l.amount * recipeFactor(recipes.get(l.recipeId ?? '')),
      family: lineFamily(l.unit),
    }));
    let family = targetFamily(
      ing,
      packs,
      scaled.filter((l) => l.amount !== null),
    );
    let need: number | null = null;
    for (const l of scaled) {
      if (l.amount === null) continue;
      const v = convert(l.amount, l.family, family, ing, packs);
      if (v !== null) need = (need ?? 0) + v;
    }
    const aisle = first.aisle === 'other' && ing?.aisle ? ing.aisle : first.aisle;
    // Unknown vegetables, meat or frozen food measured in cups: about 0.6 g per ml.
    if (family === 'ml' && need !== null && !ing?.liquid && SOLID_AISLES.has(aisle)) {
      family = 'g';
      need *= 0.6;
    }
    const state = list.states[key] ?? {};
    const alwaysHome = isAlwaysHome(key, pantry);
    let buy = buyAmount(need, family, ing, aisle, country);
    if (state.count !== undefined) {
      buy = buy
        ? { ...buy, count: state.count }
        : { count: state.count, size: null, unit: 'piece' };
    }
    items.push({
      key,
      name: first.name,
      aisle,
      status: state.status ?? (alwaysHome ? 'home' : 'open'),
      need: need === null ? null : { amount: Math.round(need * 10) / 10, unit: family },
      buy,
      adjusted: state.count !== undefined,
      sources: lines.map((l) => ({
        recipeId: l.recipeId,
        recipeTitle: l.recipeId ? (recipes.get(l.recipeId)?.title ?? null) : null,
        original: l.original,
      })),
      swappedFrom: [
        ...new Set(lines.map((l) => l.swappedFrom).filter((s): s is string => s !== null)),
      ],
      alwaysHome,
    });
  }
  items.sort(
    (a, b) => AISLES.indexOf(a.aisle) - AISLES.indexOf(b.aisle) || a.name.localeCompare(b.name),
  );
  return {
    country,
    recipes: list.recipes.map((r) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      baseServings: r.baseServings,
      servings: r.servings,
    })),
    items,
  };
}
