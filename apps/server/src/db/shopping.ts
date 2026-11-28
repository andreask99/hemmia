/**
 * The shopping lists (P12, P12.6). Owned by Claude (encryption, per-user isolation).
 *
 * Two lists per caller: their own ('mine') and the family's ('family').
 * - Own list: recipes, ingredient lines and item states are one JSON value encrypted with the
 *   user's data key (AAD names user, table, list id and column), readable only while its owner
 *   is signed in; every query is scoped by user_id. Settings (country, pantry) likewise.
 * - Family list: the same JSON in `household_shopping`, encrypted with the family key
 *   (security/household.ts, AAD user component "household"). Every signed-in account may read
 *   and change it (DECISIONS.md 2026-11-27). Lines record who added them; Undo and moves of a
 *   chat batch only touch the caller's own lines.
 *
 * Changes are read-modify-write of the whole value; better-sqlite3 is synchronous and the
 * server is one process, so two changes can't interleave. Moves write both lists in one
 * transaction.
 *
 * Past lists (P12.8): when a tick or a removal leaves nothing to buy and at least one item
 * bought, the whole stored list moves to `shopping_archive` (same key as the list: the owner's
 * data key, or the family key with user_id NULL) and the list starts empty, in one transaction.
 * Past lists are deleted after SHOPPING_ARCHIVE_DAYS (`purgeArchive`, hourly, and before every
 * listing) and at most MAX_SHOPPING_ARCHIVES are kept per list.
 */
import { randomUUID } from 'node:crypto';
import {
  type Aisle,
  type Country,
  COUNTRIES,
  type Language,
  type LineUnit,
  MAX_RECIPE_LINES,
  MAX_SHOPPING_ARCHIVES,
  MAX_SHOPPING_LINES,
  MAX_SHOPPING_RECIPES,
  SHOPPING_ARCHIVE_DAYS,
  type ShoppingAddedRef,
  type ShoppingArchiveEntry,
  type ShoppingChangeResponse,
  type ShoppingListName,
  type ShoppingListResponse,
  type UpdateShoppingItemRequest,
} from '@hemmia/shared';
import { z } from 'zod';
import { aadColumn, DecryptError, decryptString, encryptString } from '../security/crypto.ts';
import { HOUSEHOLD, type HouseholdKey, householdKeyInMemory } from '../security/household.ts';
import { canonicalKey, findByName, mergeKey, normalizeKey } from '../shopping/ingredients.ts';
import {
  buildList,
  dropped,
  EMPTY_LIST,
  EMPTY_PANTRY,
  isAlwaysHome,
  Pantry,
  type People,
  type StoredLine,
  StoredList,
  type StoredRecipe,
} from '../shopping/list.ts';
import { parseTyped } from '../shopping/units.ts';
import type { UserKey } from './chats.ts';
import type { DB } from './database.ts';

const StoredSettings = z.object({ country: z.enum(COUNTRIES).nullable(), pantry: Pantry });
type StoredSettings = z.infer<typeof StoredSettings>;

/** A past list as stored (encrypted like the list it came from). */
const ArchivedList = z.object({
  list: StoredList,
  country: z.enum(COUNTRIES),
  /** Who ticked off (or removed) the last item. */
  finishedBy: z.string().max(64),
  /** The item whose tick finished the list (opened again by Undo); null after a removal. */
  lastKey: z.string().max(80).nullable(),
});
type ArchivedList = z.infer<typeof ArchivedList>;

const DAY_MS = 24 * 60 * 60 * 1000;

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

/** The caller: their key (for their own list), id (attribution) and language. */
export type Shopper = UserKey & { language: Language };

/** What a move takes: one item, what one chat reply added, or everything. */
export type MoveWhat = { key: string } | { batchId: string } | { all: true };

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

export function createShoppingRepo(
  db: DB,
  opts: {
    now?: () => number;
    timeZone?: string;
    householdKey?: HouseholdKey;
    /** Called (without content) when the family list can't be decrypted: it starts empty. */
    onFamilyUnreadable?: () => void;
  } = {},
) {
  const now = opts.now ?? Date.now;
  const timeZone = opts.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const familyKey = opts.householdKey ?? householdKeyInMemory();
  const listAad = (userId: string, id: string) => aadColumn(userId, 'shopping_lists', id, 'data');
  const settingsAad = (userId: string) => aadColumn(userId, 'shopping_settings', userId, 'data');
  const familyListAad = aadColumn(HOUSEHOLD, 'household_shopping', 'family', 'data');
  const familySettingsAad = aadColumn(HOUSEHOLD, 'household_shopping_settings', 'family', 'data');
  const EMPTY_SETTINGS: StoredSettings = { country: null, pantry: EMPTY_PANTRY };

  /** Storage for one list as seen by one caller. */
  interface Store {
    load(): { id: string; list: StoredList };
    save(id: string, list: StoredList): void;
    settings(): StoredSettings;
    saveSettings(s: StoredSettings): void;
  }

  function ownStore(u: UserKey): Store {
    return {
      load() {
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
      },
      save(id, list) {
        const data = encryptString(u.dek, JSON.stringify(list), listAad(u.userId, id));
        db.prepare(
          `INSERT INTO shopping_lists (id, user_id, data, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
        ).run(id, u.userId, data, now());
      },
      settings() {
        const row = db
          .prepare<[string], { data: Buffer }>(
            'SELECT data FROM shopping_settings WHERE user_id = ?',
          )
          .get(u.userId);
        if (!row) return EMPTY_SETTINGS;
        return StoredSettings.parse(
          JSON.parse(decryptString(u.dek, row.data, settingsAad(u.userId))) as unknown,
        );
      },
      saveSettings(s) {
        const data = encryptString(u.dek, JSON.stringify(s), settingsAad(u.userId));
        db.prepare(
          `INSERT INTO shopping_settings (user_id, data, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
        ).run(u.userId, data, now());
      },
    };
  }

  /** Reads a family row; a value the family key can't open (a lost key file) reads as absent. */
  function readFamily(table: 'household_shopping' | 'household_shopping_settings', aad: string) {
    const row = db
      .prepare<[], { data: Buffer }>(`SELECT data FROM ${table} WHERE id = 'family'`)
      .get();
    if (!row) return null;
    try {
      return JSON.parse(decryptString(familyKey(), row.data, aad)) as unknown;
    } catch (err) {
      if (!(err instanceof DecryptError)) throw err;
      opts.onFamilyUnreadable?.();
      return null;
    }
  }

  function writeFamily(
    table: 'household_shopping' | 'household_shopping_settings',
    aad: string,
    value: unknown,
  ) {
    const data = encryptString(familyKey(), JSON.stringify(value), aad);
    db.prepare(
      `INSERT INTO ${table} (id, data, updated_at) VALUES ('family', ?, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    ).run(data, now());
  }

  const familyStore: Store = {
    load() {
      const raw = readFamily('household_shopping', familyListAad);
      return { id: 'family', list: raw === null ? EMPTY_LIST : StoredList.parse(raw) };
    },
    save(_id, list) {
      writeFamily('household_shopping', familyListAad, list);
    },
    settings() {
      const raw = readFamily('household_shopping_settings', familySettingsAad);
      return raw === null ? EMPTY_SETTINGS : StoredSettings.parse(raw);
    },
    saveSettings(s) {
      writeFamily('household_shopping_settings', familySettingsAad, s);
    },
  };

  const storeOf = (u: UserKey, list: ShoppingListName): Store =>
    list === 'family' ? familyStore : ownStore(u);

  /** Drops the states of items no longer on the list. */
  function tidy(list: StoredList): void {
    const keys = new Set(list.lines.map((l) => mergeKey(l.key)));
    list.states = Object.fromEntries(Object.entries(list.states).filter(([k]) => keys.has(k)));
  }

  /** Changes a list; `fn` returns false to leave it unchanged. */
  function change(store: Store, fn: (list: StoredList) => boolean): boolean {
    const { id, list } = store.load();
    const copy: StoredList = structuredClone(list);
    if (!fn(copy)) return false;
    tidy(copy);
    store.save(id, copy);
    return true;
  }

  /** Changes one item; `onStatus` is called when its status changed. False when absent. */
  function updateOne(
    u: UserKey,
    name: ShoppingListName,
    key: string,
    patch: UpdateShoppingItemRequest,
    onStatus: () => void,
  ): boolean {
    const store = storeOf(u, name);
    const k = normalizeKey(key);
    if (patch.alwaysHome !== undefined) {
      const s = store.settings();
      const always = s.pantry.always.filter((x) => x !== k);
      const never = s.pantry.never.filter((x) => x !== k);
      if (patch.alwaysHome) always.push(k);
      else never.push(k);
      store.saveSettings({
        ...s,
        pantry: { always: always.slice(-200), never: never.slice(-200) },
      });
    }
    return change(store, (list) => {
      if (!list.lines.some((l) => mergeKey(l.key) === k)) return false;
      const state = { ...list.states[k] };
      const before = state.status;
      if (patch.status !== undefined) state.status = patch.status;
      if (patch.alwaysHome !== undefined && patch.status === undefined) {
        state.status = patch.alwaysHome ? 'home' : 'open';
      }
      if (state.status !== before) {
        onStatus();
        state.by = u.userId;
        state.at = now();
      }
      if (patch.count === null) delete state.count;
      else if (patch.count !== undefined) state.count = patch.count;
      list.states[k] = state;
      return true;
    });
  }

  // ---- Past lists ----

  /** Where one list's past lists are kept: the owner column, and how they are encrypted. */
  function archiveOwner(u: UserKey, name: ShoppingListName) {
    const owner = name === 'family' ? null : u.userId;
    const key = () => (name === 'family' ? familyKey() : u.dek);
    const aad = (id: string) => aadColumn(owner ?? HOUSEHOLD, 'shopping_archive', id, 'data');
    return { owner, key, aad };
  }

  /** Whether a list is finished: nothing left to buy, at least one item bought. */
  function finished(list: StoredList, pantry: StoredSettings['pantry']): boolean {
    const items = buildList(list, pantry, 'DE').items;
    return items.some((i) => i.status === 'bought') && !items.some((i) => i.status === 'open');
  }

  /**
   * Archives the list if it is finished (and empties it). Returns the past list's id, or null.
   * Runs inside the caller's transaction.
   */
  function archiveIfFinished(
    u: Shopper | UserKey,
    name: ShoppingListName,
    lastKey: string | null,
  ): string | null {
    const store = storeOf(u, name);
    const { id: listId, list } = store.load();
    const s = store.settings();
    if (!finished(list, s.pantry)) return null;
    const language = 'language' in u ? u.language : 'en';
    const value: ArchivedList = {
      list,
      country: s.country ?? defaultCountry(language, timeZone),
      finishedBy: u.userId,
      lastKey,
    };
    const { owner, key, aad } = archiveOwner(u, name);
    const id = randomUUID();
    db.prepare(
      'INSERT INTO shopping_archive (id, user_id, data, archived_at) VALUES (?, ?, ?, ?)',
    ).run(id, owner, encryptString(key(), JSON.stringify(value), aad(id)), now());
    db.prepare(
      `DELETE FROM shopping_archive WHERE user_id IS ? AND id NOT IN (
         SELECT id FROM shopping_archive WHERE user_id IS ?
         ORDER BY archived_at DESC, rowid DESC LIMIT ?)`,
    ).run(owner, owner, MAX_SHOPPING_ARCHIVES);
    store.save(listId, EMPTY_LIST);
    return id;
  }

  /** One past list of the caller's (own or family); null when absent or unreadable. */
  function loadArchive(
    u: UserKey,
    name: ShoppingListName,
    id: string,
  ): { value: ArchivedList; archivedAt: number } | null {
    const { owner, key, aad } = archiveOwner(u, name);
    const row = db
      .prepare<[string, string | null], { data: Buffer; archived_at: number }>(
        'SELECT data, archived_at FROM shopping_archive WHERE id = ? AND user_id IS ?',
      )
      .get(id, owner);
    if (!row) return null;
    try {
      const value = ArchivedList.parse(
        JSON.parse(decryptString(key(), row.data, aad(id))) as unknown,
      );
      return { value, archivedAt: row.archived_at };
    } catch (err) {
      if (!(err instanceof DecryptError) || name !== 'family') throw err;
      opts.onFamilyUnreadable?.();
      return null;
    }
  }

  const purgeArchive = (): number =>
    db
      .prepare<[number]>('DELETE FROM shopping_archive WHERE archived_at < ?')
      .run(now() - SHOPPING_ARCHIVE_DAYS * DAY_MS).changes;

  /** Puts a past list back on the list (see RestoreShoppingRequest). */
  const restoreArchive = db.transaction(
    (u: UserKey, name: ShoppingListName, id: string, as: 'undo' | 'again'): boolean => {
      const found = loadArchive(u, name, id);
      if (!found) return false;
      const past = found.value.list;
      const store = storeOf(u, name);
      const { id: listId, list } = store.load();
      const target: StoredList = structuredClone(list);

      let recipes: StoredRecipe[];
      let lines: StoredLine[];
      if (as === 'undo') {
        const known = new Set(target.recipes.map((r) => r.id));
        const onList = new Set(target.lines.map((l) => l.id));
        recipes = past.recipes.filter((r) => !known.has(r.id));
        lines = past.lines.filter((l) => !onList.has(l.id));
      } else {
        const batchId = randomUUID();
        const ids = new Map(past.recipes.map((r) => [r.id, randomUUID()]));
        recipes = past.recipes.map((r) => ({ ...r, id: ids.get(r.id) as string, batchId }));
        lines = past.lines.map((l) => ({
          ...l,
          id: randomUUID(),
          batchId,
          recipeId: l.recipeId === null ? null : (ids.get(l.recipeId) ?? null),
          addedBy: u.userId,
        }));
      }
      if (
        target.lines.length + lines.length > MAX_SHOPPING_LINES ||
        target.recipes.length + recipes.length > MAX_SHOPPING_RECIPES
      ) {
        throw new ShoppingLimitError();
      }

      const keys = new Set(lines.map((l) => mergeKey(l.key)));
      if (as === 'undo') {
        for (const k of keys) {
          const st = past.states[k];
          if (st && target.states[k] === undefined) target.states[k] = st;
        }
        const last = found.value.lastKey;
        if (last !== null && keys.has(last)) {
          target.states[last] = { ...target.states[last], status: 'open', by: u.userId, at: now() };
        }
      } else {
        reopen(target, keys);
        for (const k of keys) {
          const count = past.states[k]?.count;
          if (count !== undefined && target.states[k] === undefined) target.states[k] = { count };
        }
      }
      target.recipes.push(...recipes);
      target.lines.push(...lines);
      tidy(target);
      store.save(listId, target);
      if (as === 'undo') {
        db.prepare('DELETE FROM shopping_archive WHERE id = ? AND user_id IS ?').run(
          id,
          archiveOwner(u, name).owner,
        );
      }
      return true;
    },
  );

  /** Usernames by id, for the family list. */
  function people(): People {
    const rows = db
      .prepare<[], { id: string; username: string }>('SELECT id, username FROM users')
      .all();
    return new Map(rows.map((r) => [r.id, r.username]));
  }

  const countryOf = (u: Shopper, s: StoredSettings): Country =>
    s.country ?? defaultCountry(u.language, timeZone);

  /** Whether a line may be touched by a batch operation (Undo, moving a reply's items). */
  const ownLine = (u: UserKey, name: ShoppingListName, l: StoredLine) =>
    name === 'mine' || l.addedBy === u.userId;

  function add(
    u: Shopper,
    name: ShoppingListName,
    input: { recipe: NewRecipe | null; lines: readonly NewLine[] },
  ): ShoppingAddedRef {
    const store = storeOf(u, name);
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
      addedBy: u.userId,
    }));
    change(store, (list) => {
      if (list.lines.length + lines.length > MAX_SHOPPING_LINES) throw new ShoppingLimitError();
      if (input.recipe) {
        if (list.recipes.length >= MAX_SHOPPING_RECIPES) throw new ShoppingLimitError();
        const r: StoredRecipe = { id: recipeId as string, batchId, ...input.recipe };
        list.recipes.push(r);
      }
      list.lines.push(...lines);
      reopen(list, new Set(lines.map((l) => mergeKey(l.key))));
      return true;
    });
    const pantry = store.settings().pantry;
    const shown = lines.filter((l) => !dropped(l));
    return {
      batchId,
      list: name,
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
  }

  /** Items bought before that get new lines go back to "to buy" (needed again). */
  function reopen(list: StoredList, keys: ReadonlySet<string>): void {
    list.states = Object.fromEntries(
      Object.entries(list.states).filter(([k, st]) => !(keys.has(k) && st.status === 'bought')),
    );
  }

  /** The list holding a chat batch the caller added: their own first, then the family's. */
  function batchList(u: UserKey, batchId: string): ShoppingListName | null {
    for (const name of ['mine', 'family'] as const) {
      const { list } = storeOf(u, name).load();
      if (list.lines.some((l) => l.batchId === batchId && ownLine(u, name, l))) return name;
      if (list.recipes.some((r) => r.batchId === batchId && name === 'mine')) return name;
    }
    return null;
  }

  const moveAll = db.transaction(
    (u: UserKey, from: ShoppingListName, to: ShoppingListName, what: MoveWhat): boolean => {
      const src = storeOf(u, from);
      const dst = storeOf(u, to);
      const a = src.load();
      const b = dst.load();
      const source: StoredList = structuredClone(a.list);
      const target: StoredList = structuredClone(b.list);
      const picked = (l: StoredLine) =>
        'all' in what
          ? true
          : 'key' in what
            ? mergeKey(l.key) === normalizeKey(what.key)
            : l.batchId === what.batchId && ownLine(u, from, l);
      const moving = source.lines.filter(picked);
      const movingRecipes =
        'all' in what
          ? source.recipes
          : source.recipes.filter((r) => moving.some((l) => l.recipeId === r.id));
      if (moving.length === 0 && movingRecipes.length === 0) return false;

      const known = new Set(target.recipes.map((r) => r.id));
      const newRecipes = movingRecipes.filter((r) => !known.has(r.id));
      if (
        target.lines.length + moving.length > MAX_SHOPPING_LINES ||
        target.recipes.length + newRecipes.length > MAX_SHOPPING_RECIPES
      ) {
        throw new ShoppingLimitError();
      }

      const keys = new Set(moving.map((l) => mergeKey(l.key)));
      reopen(target, keys);
      for (const k of keys) {
        const st = source.states[k];
        if (st && target.states[k] === undefined) target.states[k] = st;
      }
      target.recipes.push(...newRecipes);
      target.lines.push(...moving.map((l) => ({ ...l, addedBy: l.addedBy ?? u.userId })));

      const movedIds = new Set(moving.map((l) => l.id));
      source.lines = source.lines.filter((l) => !movedIds.has(l.id));
      const used = new Set(source.lines.map((l) => l.recipeId));
      const leaving = new Set(movingRecipes.map((r) => r.id));
      source.recipes = source.recipes.filter((r) => !leaving.has(r.id) || used.has(r.id));

      tidy(source);
      tidy(target);
      src.save(a.id, source);
      dst.save(b.id, target);
      return true;
    },
  );

  return {
    get(u: Shopper, name: ShoppingListName): ShoppingListResponse {
      const store = storeOf(u, name);
      const s = store.settings();
      return buildList(
        store.load().list,
        s.pantry,
        countryOf(u, s),
        name,
        name === 'family' ? people() : null,
      );
    },

    country(u: Shopper, name: ShoppingListName): Country {
      return countryOf(u, storeOf(u, name).settings());
    },

    setCountry(u: UserKey, name: ShoppingListName, country: Country): void {
      const store = storeOf(u, name);
      store.saveSettings({ ...store.settings(), country });
    },

    /**
     * Adds lines (from a recipe, or loose items) as one batch, for one undo. Items already on
     * the list that get more lines go back to "to buy" (bought before, needed again).
     * Throws ShoppingLimitError when the list would get too long.
     */
    add,

    /** An item typed on the list page: "milk", "2 l Milch", "500 g Hackfleisch". */
    addTyped(u: Shopper, name: ShoppingListName, text: string): ShoppingAddedRef {
      const { name: item, base } = parseTyped(text);
      const ing = findByName(item);
      return add(u, name, {
        recipe: null,
        lines: [
          {
            key: ing ? canonicalKey(ing) : item,
            name: item,
            aisle: ing?.aisle ?? 'other',
            amount: base.amount,
            unit: base.unit,
            original: text.trim(),
            swappedFrom: null,
          },
        ],
      });
    },

    /**
     * Null when the item isn't on the list. A change of status that finishes the list archives
     * it (`archived`: the past list's id).
     */
    updateItem(
      u: UserKey,
      name: ShoppingListName,
      key: string,
      patch: UpdateShoppingItemRequest,
    ): ShoppingChangeResponse | null {
      return db.transaction(() => {
        const seen = { status: false };
        const ok = updateOne(u, name, key, patch, () => {
          seen.status = true;
        });
        if (!ok) return null;
        return {
          archived: seen.status ? archiveIfFinished(u, name, normalizeKey(key)) : null,
        };
      })();
    },

    /** Null when the item isn't on the list; removing the last item to buy archives the list. */
    removeItem(u: UserKey, name: ShoppingListName, key: string): ShoppingChangeResponse | null {
      const k = normalizeKey(key);
      return db.transaction(() => {
        const ok = change(storeOf(u, name), (list) => {
          const before = list.lines.length;
          list.lines = list.lines.filter((l) => mergeKey(l.key) !== k);
          return list.lines.length !== before;
        });
        if (!ok) return null;
        return { archived: archiveIfFinished(u, name, null) };
      })();
    },

    /** The caller's past lists, newest first (expired ones are deleted first). */
    archive(u: Shopper, name: ShoppingListName): ShoppingArchiveEntry[] {
      purgeArchive();
      const { owner } = archiveOwner(u, name);
      const rows = db
        .prepare<[string | null], { id: string }>(
          'SELECT id FROM shopping_archive WHERE user_id IS ? ORDER BY archived_at DESC, rowid DESC',
        )
        .all(owner);
      const pantry = storeOf(u, name).settings().pantry;
      const who = name === 'family' ? people() : null;
      const out: ShoppingArchiveEntry[] = [];
      for (const { id } of rows) {
        const found = loadArchive(u, name, id);
        if (!found) continue;
        const { value, archivedAt } = found;
        out.push({
          id,
          archivedAt,
          deleteAt: archivedAt + SHOPPING_ARCHIVE_DAYS * DAY_MS,
          finishedBy: who
            ? { userId: value.finishedBy, name: who.get(value.finishedBy) ?? null }
            : null,
          list: buildList(value.list, pantry, value.country, name, who),
        });
      }
      return out;
    },

    /** False when the past list isn't there. Throws ShoppingLimitError when the list is full. */
    restore(u: UserKey, name: ShoppingListName, id: string, as: 'undo' | 'again'): boolean {
      return restoreArchive(u, name, id, as);
    },

    deleteArchived(u: UserKey, name: ShoppingListName, id: string): boolean {
      const { owner } = archiveOwner(u, name);
      return (
        db.prepare('DELETE FROM shopping_archive WHERE id = ? AND user_id IS ?').run(id, owner)
          .changes > 0
      );
    },

    /** Deletes past lists older than SHOPPING_ARCHIVE_DAYS; returns how many. */
    purgeArchive,

    setServings(u: UserKey, name: ShoppingListName, recipeId: string, servings: number): boolean {
      return change(storeOf(u, name), (list) => {
        const r = list.recipes.find((x) => x.id === recipeId);
        if (!r) return false;
        r.servings = servings;
        if (r.baseServings === null) r.baseServings = servings;
        return true;
      });
    },

    removeRecipe(u: UserKey, name: ShoppingListName, recipeId: string): boolean {
      return change(storeOf(u, name), (list) => {
        if (!list.recipes.some((r) => r.id === recipeId)) return false;
        list.recipes = list.recipes.filter((r) => r.id !== recipeId);
        list.lines = list.lines.filter((l) => l.recipeId !== recipeId);
        return true;
      });
    },

    /**
     * Undoes one add (the chat's Undo), on whichever list it is now. On the family list only
     * the caller's own lines go.
     */
    undo(u: UserKey, batchId: string): boolean {
      const name = batchList(u, batchId);
      if (name === null) return false;
      return change(storeOf(u, name), (list) => {
        const before = list.lines.length + list.recipes.length;
        list.lines = list.lines.filter((l) => !(l.batchId === batchId && ownLine(u, name, l)));
        const used = new Set(list.lines.map((l) => l.recipeId));
        list.recipes = list.recipes.filter((r) => r.batchId !== batchId || used.has(r.id));
        return list.lines.length + list.recipes.length !== before;
      });
    },

    /**
     * Moves one item, everything, or a chat batch (found on either list) to the other list.
     * False when there was nothing to move. Throws ShoppingLimitError when the target is full.
     */
    move(u: UserKey, from: ShoppingListName | null, to: ShoppingListName, what: MoveWhat): boolean {
      const source = from ?? ('batchId' in what ? batchList(u, what.batchId) : null);
      if (source === null || source === to) return false;
      return moveAll(u, source, to, what);
    },

    /** Removes bought items (and recipes left without lines), or everything. */
    clear(u: Shopper, name: ShoppingListName, what: 'bought' | 'all'): void {
      const store = storeOf(u, name);
      if (what === 'all') {
        change(store, (list) => {
          list.lines = [];
          list.recipes = [];
          return true;
        });
        return;
      }
      const bought = new Set(
        this.get(u, name)
          .items.filter((i) => i.status === 'bought')
          .map((i) => i.key),
      );
      change(store, (list) => {
        list.lines = list.lines.filter((l) => !bought.has(mergeKey(l.key)));
        const used = new Set(list.lines.map((l) => l.recipeId));
        list.recipes = list.recipes.filter((r) => used.has(r.id));
        return true;
      });
    },
  };
}
export type ShoppingRepo = ReturnType<typeof createShoppingRepo>;
