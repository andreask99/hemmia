/**
 * The shopping list (P12). Owned by Claude (encryption, per-user isolation).
 *
 * One list per person: its recipes, ingredient lines and item states are one JSON value,
 * encrypted with the user's data key (AAD names user, table, list id and column), so the list
 * can only be read while its owner is signed in. Settings (country, pantry choices) likewise.
 * Every function takes the caller's UserKey and every query is scoped by user_id.
 *
 * Changes are read-modify-write of the whole value; better-sqlite3 is synchronous and the
 * server is one process, so two changes can't interleave.
 */
import { randomUUID } from 'node:crypto';
import {
  type Aisle,
  type Country,
  COUNTRIES,
  type Language,
  type LineUnit,
  MAX_RECIPE_LINES,
  MAX_SHOPPING_LINES,
  MAX_SHOPPING_RECIPES,
  type ShoppingAddedRef,
  type ShoppingListResponse,
  type UpdateShoppingItemRequest,
} from '@hemmia/shared';
import { z } from 'zod';
import { aadColumn, decryptString, encryptString } from '../security/crypto.ts';
import { canonicalKey, findByName, mergeKey, normalizeKey } from '../shopping/ingredients.ts';
import {
  buildList,
  dropped,
  EMPTY_LIST,
  EMPTY_PANTRY,
  isAlwaysHome,
  Pantry,
  type StoredLine,
  StoredList,
  type StoredRecipe,
} from '../shopping/list.ts';
import { parseTyped } from '../shopping/units.ts';
import type { UserKey } from './chats.ts';
import type { DB } from './database.ts';

const StoredSettings = z.object({ country: z.enum(COUNTRIES).nullable(), pantry: Pantry });
type StoredSettings = z.infer<typeof StoredSettings>;

/** An ingredient line to add (amounts already in base units, for the recipe's servings). */
export interface NewLine {
  key: string;
  name: string;
  aisle: Aisle;
  amount: number | null;
  unit: LineUnit;
  original: string;
  swappedFrom: string | null;
}

export interface NewRecipe {
  title: string;
  url: string | null;
  baseServings: number | null;
  servings: number | null;
}

export class ShoppingLimitError extends Error {
  constructor() {
    super('too_many');
  }
}

/** Countries by the Mac's time zone (the hub lives where the family shops). */
const ZONES: Record<string, Country> = {
  'Europe/Berlin': 'DE',
  'Europe/Busingen': 'DE',
  'Europe/Vienna': 'AT',
  'Europe/Zurich': 'CH',
  'Europe/Paris': 'FR',
  'Europe/Rome': 'IT',
  'Europe/London': 'GB',
};
const BY_LANGUAGE: Record<Language, Country> = { en: 'GB', de: 'DE', fr: 'FR', it: 'IT' };

/** The country a person shops in unless they chose one: the hub's, else by language. */
export function defaultCountry(language: Language, timeZone: string): Country {
  if (timeZone in ZONES) return ZONES[timeZone] as Country;
  if (timeZone.startsWith('America/') && !timeZone.includes('Argentina')) return 'US';
  return BY_LANGUAGE[language];
}

export function createShoppingRepo(db: DB, opts: { now?: () => number; timeZone?: string } = {}) {
  const now = opts.now ?? Date.now;
  const timeZone = opts.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const listAad = (userId: string, id: string) => aadColumn(userId, 'shopping_lists', id, 'data');
  const settingsAad = (userId: string) => aadColumn(userId, 'shopping_settings', userId, 'data');

  function load(u: UserKey): { id: string; list: StoredList } {
    const row = db
      .prepare<[string], { id: string; data: Buffer }>(
        'SELECT id, data FROM shopping_lists WHERE user_id = ?',
      )
      .get(u.userId);
    if (!row) return { id: randomUUID(), list: EMPTY_LIST };
    const list = StoredList.parse(
      JSON.parse(decryptString(u.dek, row.data, listAad(u.userId, row.id))) as unknown,
    );
    return { id: row.id, list };
  }

  function save(u: UserKey, id: string, list: StoredList): void {
    const data = encryptString(u.dek, JSON.stringify(list), listAad(u.userId, id));
    db.prepare(
      `INSERT INTO shopping_lists (id, user_id, data, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    ).run(id, u.userId, data, now());
  }

  function settings(u: UserKey): StoredSettings {
    const row = db
      .prepare<[string], { data: Buffer }>('SELECT data FROM shopping_settings WHERE user_id = ?')
      .get(u.userId);
    if (!row) return { country: null, pantry: EMPTY_PANTRY };
    return StoredSettings.parse(
      JSON.parse(decryptString(u.dek, row.data, settingsAad(u.userId))) as unknown,
    );
  }

  function saveSettings(u: UserKey, s: StoredSettings): void {
    const data = encryptString(u.dek, JSON.stringify(s), settingsAad(u.userId));
    db.prepare(
      `INSERT INTO shopping_settings (user_id, data, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    ).run(u.userId, data, now());
  }

  /** Changes the list; `fn` returns false to leave it unchanged. */
  function change(u: UserKey, fn: (list: StoredList) => boolean): boolean {
    const { id, list } = load(u);
    const copy: StoredList = structuredClone(list);
    if (!fn(copy)) return false;
    // Item states of items no longer on the list go.
    const keys = new Set(copy.lines.map((l) => mergeKey(l.key)));
    copy.states = Object.fromEntries(Object.entries(copy.states).filter(([k]) => keys.has(k)));
    save(u, id, copy);
    return true;
  }

  const countryOf = (u: UserKey & { language: Language }, s: StoredSettings): Country =>
    s.country ?? defaultCountry(u.language, timeZone);

  return {
    get(u: UserKey & { language: Language }): ShoppingListResponse {
      const s = settings(u);
      return buildList(load(u).list, s.pantry, countryOf(u, s));
    },

    country(u: UserKey & { language: Language }): Country {
      return countryOf(u, settings(u));
    },

    setCountry(u: UserKey, country: Country): void {
      saveSettings(u, { ...settings(u), country });
    },

    /**
     * Adds lines (from a recipe, or loose items) as one batch, for one undo. Items already on
     * the list that get more lines go back to "to buy" (bought before, needed again).
     * Throws ShoppingLimitError when the list would get too long.
     */
    add(
      u: UserKey & { language: Language },
      input: { recipe: NewRecipe | null; lines: readonly NewLine[] },
    ): ShoppingAddedRef {
      const batchId = randomUUID();
      const recipeId = input.recipe ? randomUUID() : null;
      const lines: StoredLine[] = input.lines.slice(0, MAX_RECIPE_LINES).map((l) => ({
        id: randomUUID(),
        recipeId,
        batchId,
        key: normalizeKey(l.key),
        name: l.name.trim().slice(0, 80),
        aisle: l.aisle,
        amount: l.amount,
        unit: l.unit,
        original: l.original.slice(0, 160),
        swappedFrom: l.swappedFrom ? l.swappedFrom.trim().slice(0, 80) : null,
      }));
      change(u, (list) => {
        if (list.lines.length + lines.length > MAX_SHOPPING_LINES) throw new ShoppingLimitError();
        if (input.recipe) {
          if (list.recipes.length >= MAX_SHOPPING_RECIPES) throw new ShoppingLimitError();
          const r: StoredRecipe = { id: recipeId as string, batchId, ...input.recipe };
          list.recipes.push(r);
        }
        list.lines.push(...lines);
        const again = new Set(lines.map((l) => mergeKey(l.key)));
        list.states = Object.fromEntries(
          Object.entries(list.states).filter(
            ([k, st]) => !(again.has(k) && st.status === 'bought'),
          ),
        );
        return true;
      });
      const pantry = settings(u).pantry;
      const shown = lines.filter((l) => !dropped(l));
      return {
        batchId,
        recipe: input.recipe?.title ?? null,
        count: new Set(shown.map((l) => mergeKey(l.key))).size,
        adapted: shown
          .filter((l) => l.swappedFrom !== null)
          .slice(0, 20)
          .map((l) => ({ from: l.swappedFrom ?? '', to: l.name })),
        atHome: [
          ...new Set(shown.filter((l) => isAlwaysHome(mergeKey(l.key), pantry)).map((l) => l.name)),
        ].slice(0, 20),
      };
    },

    /** An item typed on the list page: "milk", "2 l Milch", "500 g Hackfleisch". */
    addTyped(u: UserKey & { language: Language }, text: string): ShoppingAddedRef {
      const { name, base } = parseTyped(text);
      const ing = findByName(name);
      return this.add(u, {
        recipe: null,
        lines: [
          {
            key: ing ? canonicalKey(ing) : name,
            name,
            aisle: ing?.aisle ?? 'other',
            amount: base.amount,
            unit: base.unit,
            original: text.trim(),
            swappedFrom: null,
          },
        ],
      });
    },

    /** False when the item isn't on the list. */
    updateItem(u: UserKey, key: string, patch: UpdateShoppingItemRequest): boolean {
      const k = normalizeKey(key);
      if (patch.alwaysHome !== undefined) {
        const s = settings(u);
        const always = s.pantry.always.filter((x) => x !== k);
        const never = s.pantry.never.filter((x) => x !== k);
        if (patch.alwaysHome) always.push(k);
        else never.push(k);
        saveSettings(u, { ...s, pantry: { always: always.slice(-200), never: never.slice(-200) } });
      }
      return change(u, (list) => {
        if (!list.lines.some((l) => mergeKey(l.key) === k)) return false;
        const state = { ...list.states[k] };
        if (patch.status !== undefined) state.status = patch.status;
        if (patch.alwaysHome !== undefined && patch.status === undefined) {
          state.status = patch.alwaysHome ? 'home' : 'open';
        }
        if (patch.count === null) delete state.count;
        else if (patch.count !== undefined) state.count = patch.count;
        list.states[k] = state;
        return true;
      });
    },

    removeItem(u: UserKey, key: string): boolean {
      const k = normalizeKey(key);
      return change(u, (list) => {
        const before = list.lines.length;
        list.lines = list.lines.filter((l) => mergeKey(l.key) !== k);
        return list.lines.length !== before;
      });
    },

    setServings(u: UserKey, recipeId: string, servings: number): boolean {
      return change(u, (list) => {
        const r = list.recipes.find((x) => x.id === recipeId);
        if (!r) return false;
        r.servings = servings;
        if (r.baseServings === null) r.baseServings = servings;
        return true;
      });
    },

    removeRecipe(u: UserKey, recipeId: string): boolean {
      return change(u, (list) => {
        if (!list.recipes.some((r) => r.id === recipeId)) return false;
        list.recipes = list.recipes.filter((r) => r.id !== recipeId);
        list.lines = list.lines.filter((l) => l.recipeId !== recipeId);
        return true;
      });
    },

    /** Undoes one add (the chat's Undo). */
    undo(u: UserKey, batchId: string): boolean {
      return change(u, (list) => {
        const before = list.lines.length + list.recipes.length;
        list.lines = list.lines.filter((l) => l.batchId !== batchId);
        list.recipes = list.recipes.filter((r) => r.batchId !== batchId);
        return list.lines.length + list.recipes.length !== before;
      });
    },

    /** Removes bought items (and recipes left without lines), or everything. */
    clear(u: UserKey & { language: Language }, what: 'bought' | 'all'): void {
      if (what === 'all') {
        change(u, (list) => {
          list.lines = [];
          list.recipes = [];
          return true;
        });
        return;
      }
      const bought = new Set(
        this.get(u)
          .items.filter((i) => i.status === 'bought')
          .map((i) => i.key),
      );
      change(u, (list) => {
        list.lines = list.lines.filter((l) => !bought.has(mergeKey(l.key)));
        const used = new Set(list.lines.map((l) => l.recipeId));
        list.recipes = list.recipes.filter((r) => used.has(r.id));
        return true;
      });
    },
  };
}
export type ShoppingRepo = ReturnType<typeof createShoppingRepo>;
