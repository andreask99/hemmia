import { type SubmitEvent, useEffect, useRef, useState } from 'react';
import {
  AISLES,
  type Aisle,
  COUNTRIES,
  type Country,
  type ShoppingItem,
  type ShoppingListName,
  type ShoppingListResponse,
  type ShoppingRecipe,
} from '@hemmia/shared';
import { ApiError } from '../api/client.ts';
import { useMe } from '../auth/hooks.ts';
import { PageHeader } from '../components/layout.tsx';
import { ShoppingPastLists } from '../components/ShoppingPastLists.tsx';
import { type MessageKey, useI18n } from '../i18n/index.tsx';
import { formatBuy, formatNeed } from '../shopping/format.ts';
import { dismissShare, lastList, rememberList, shareDismissed } from '../shopping/lastList.ts';
import {
  useAddShoppingItem,
  useClearShopping,
  useMoveShopping,
  useRemoveRecipe,
  useRemoveShoppingItem,
  useRestoreShopping,
  useSetCountry,
  useSetServings,
  useShopping,
  useUpdateShoppingItem,
} from '../shopping/hooks.ts';
import { CheckIcon, CloseIcon, TrashIcon } from '@hemmia/ui';

const input =
  'min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-paper px-3.5 text-base focus:border-forest focus:outline-none';
const primaryButton =
  'min-h-11 shrink-0 rounded-xl bg-forest px-4 font-semibold text-on-forest hover:bg-forest-hover disabled:opacity-50';
const secondaryButton =
  'min-h-11 rounded-xl border border-line px-3 text-sm font-semibold hover:bg-champagne disabled:opacity-50';
const stepButton =
  'min-h-9 min-w-9 rounded-lg border border-line text-lg leading-none hover:bg-champagne disabled:opacity-40';

const AISLE_KEYS: Record<Aisle, MessageKey> = {
  produce: 'shopping.aisle.produce',
  meat: 'shopping.aisle.meat',
  dairy: 'shopping.aisle.dairy',
  bakery: 'shopping.aisle.bakery',
  pantry: 'shopping.aisle.pantry',
  frozen: 'shopping.aisle.frozen',
  drinks: 'shopping.aisle.drinks',
  household: 'shopping.aisle.household',
  other: 'shopping.aisle.other',
};
const COUNTRY_KEYS: Record<Country, MessageKey> = {
  DE: 'shopping.country.DE',
  AT: 'shopping.country.AT',
  CH: 'shopping.country.CH',
  FR: 'shopping.country.FR',
  IT: 'shopping.country.IT',
  GB: 'shopping.country.GB',
  US: 'shopping.country.US',
};

/** How long items others added keep their "just added" outline. */
const JUST_ADDED_MS = 15_000;

/**
 * Keys of items to buy that appeared on the list since it was last shown and weren't added by
 * the user (someone else in the family added them); cleared after a while. Items that come back
 * already bought (an Undo of a finished list) aren't new.
 */
function useJustAdded(data: ShoppingListResponse | undefined, me: string | undefined) {
  const seen = useRef<{ list: ShoppingListName; keys: Set<string> } | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (!data) return;
    const keys = new Set(data.items.map((i) => i.key));
    const before = seen.current;
    seen.current = { list: data.list, keys };
    if (!before || before.list !== data.list || data.list !== 'family') return;
    const added = data.items
      .filter(
        (i) =>
          i.status === 'open' && !before.keys.has(i.key) && !i.addedBy.some((p) => p.userId === me),
      )
      .map((i) => i.key);
    if (added.length === 0) return;
    setFresh((f) => new Set([...f, ...added]));
    const timer = setTimeout(() => {
      setFresh((f) => new Set([...f].filter((k) => !added.includes(k))));
    }, JUST_ADDED_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [data, me]);
  return fresh;
}

/**
 * The shopping lists, family and own: recipes, items by aisle, at home, bought (P12). Ticking
 * off the last item archives the list (P12.8): a card offers Undo, past lists are below.
 */
export function ShoppingPage() {
  const { t } = useI18n();
  const [list, setList] = useState<ShoppingListName>(lastList);
  const family = useShopping('family');
  const mine = useShopping('mine');
  const { data } = list === 'family' ? family : mine;
  const me = useMe().data?.id;
  const fresh = useJustAdded(data, me);
  const add = useAddShoppingItem(list);
  const clear = useClearShopping(list);
  const setCountry = useSetCountry(list);
  const moveAll = useMoveShopping('mine');
  const [text, setText] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [shareHidden, setShareHidden] = useState(shareDismissed);
  /** The past list the user's last tick made, for its Undo. */
  const [finished, setFinished] = useState<{ list: ShoppingListName; id: string } | null>(null);
  const restore = useRestoreShopping(list);
  const onFinished = (id: string) => {
    setFinished({ list, id });
    setOpen(null);
    setConfirmClear(false);
  };

  const choose = (next: ShoppingListName) => {
    setList(next);
    setOpen(null);
    setConfirmClear(false);
    setFinished(null);
    add.reset();
    rememberList(next);
  };
  const openCount = (d: ShoppingListResponse | undefined) =>
    d ? d.items.filter((i) => i.status === 'open').length : null;

  const header = (
    <PageHeader>
      <h1 className="font-display text-[19px] font-semibold">{t('shopping.title')}</h1>
    </PageHeader>
  );
  const switcher = (
    <div
      role="group"
      aria-label={t('shopping.whichList')}
      className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-paper p-1"
    >
      {(['family', 'mine'] as const).map((name) => {
        const n = openCount(name === 'family' ? family.data : mine.data);
        return (
          <button
            key={name}
            type="button"
            aria-pressed={list === name}
            onClick={() => {
              choose(name);
            }}
            className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${
              list === name ? 'bg-card text-ink shadow-sm' : 'text-muted hover:text-ink'
            }`}
          >
            {t(name === 'family' ? 'shopping.family' : 'shopping.mine')}
            {n !== null && n > 0 && (
              <>
                {' '}
                <span className="ml-1 text-forest tabular-nums">{n}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
  if (!data) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <div className="mx-auto w-full max-w-2xl p-4">{switcher}</div>
      </div>
    );
  }

  const toBuy = data.items.filter((i) => i.status === 'open');
  const atHome = data.items.filter((i) => i.status === 'home');
  const bought = data.items.filter((i) => i.status === 'bought');
  const onAdd = (e: SubmitEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    add.mutate(value, {
      onSuccess: () => {
        setText('');
      },
    });
  };
  const row = (item: ShoppingItem) => (
    <ItemRow
      key={item.key}
      item={item}
      list={list}
      me={me}
      fresh={fresh.has(item.key)}
      country={data.country}
      open={open === item.key}
      onToggleOpen={() => {
        setOpen((o) => (o === item.key ? null : item.key));
      }}
      onFinished={onFinished}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-4 p-4 pb-10">
          {switcher}

          {list === 'mine' && data.items.length > 0 && !shareHidden && (
            <div className="space-y-2 rounded-2xl border border-forest bg-card p-3.5 text-sm">
              <p className="font-semibold">{t('shopping.shareTitle')}</p>
              <p className="text-muted">{t('shopping.shareText')}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={moveAll.isPending}
                  onClick={() => {
                    moveAll.mutate(null, {
                      onSuccess: () => {
                        choose('family');
                      },
                    });
                  }}
                  className={primaryButton}
                >
                  {t('shopping.shareMove')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShareHidden(true);
                    dismissShare();
                  }}
                  className="min-h-11 rounded-xl px-3 font-semibold text-forest hover:bg-champagne"
                >
                  {t('shopping.notNow')}
                </button>
              </div>
              {moveAll.error && (
                <p role="alert" className="text-danger">
                  {moveAll.error instanceof ApiError && moveAll.error.code === 'too_many'
                    ? t('shopping.full')
                    : t('error.generic')}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-forest">
              {toBuy.length === 0
                ? t('shopping.nothingToBuy')
                : t('shopping.toBuyCount', { n: toBuy.length })}
            </p>
            <label className="flex items-center gap-2 text-sm text-muted">
              {t('shopping.country')}
              <select
                value={data.country}
                disabled={setCountry.isPending}
                onChange={(e) => {
                  const c = COUNTRIES.find((x) => x === e.target.value);
                  if (c) setCountry.mutate(c);
                }}
                className="min-h-9 rounded-lg border border-line bg-card px-2 text-ink"
              >
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>
                    {t(COUNTRY_KEYS[c])}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {data.recipes.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label={t('shopping.recipes')}>
              {data.recipes.map((r) => (
                <RecipeChip key={r.id} recipe={r} list={list} />
              ))}
            </ul>
          )}

          <form onSubmit={onAdd} className="flex gap-2">
            <input
              value={text}
              onChange={(e) => {
                setText(e.target.value);
              }}
              aria-label={t('shopping.addLabel')}
              placeholder={t(
                list === 'family' ? 'shopping.addPlaceholderFamily' : 'shopping.addPlaceholderMine',
              )}
              maxLength={120}
              className={input}
            />
            <button
              type="submit"
              disabled={add.isPending || text.trim() === ''}
              className={primaryButton}
            >
              {t('shopping.add')}
            </button>
          </form>
          {add.error && (
            <p role="alert" className="text-sm text-danger">
              {add.error instanceof ApiError && add.error.code === 'too_many'
                ? t('shopping.full')
                : t('error.generic')}
            </p>
          )}

          {finished?.list === list && (
            <div
              role="status"
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-forest bg-card p-3.5 text-sm"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-forest text-on-forest">
                <CheckIcon size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{t('shopping.finishedTitle')}</span>
                <span className="block text-muted">{t('shopping.finishedText')}</span>
              </span>
              <button
                type="button"
                disabled={restore.isPending}
                onClick={() => {
                  restore.mutate(
                    { id: finished.id, as: 'undo' },
                    {
                      onSuccess: () => {
                        setFinished(null);
                      },
                    },
                  );
                }}
                className={secondaryButton}
              >
                {t('shopping.undo')}
              </button>
              {restore.error && (
                <p role="alert" className="w-full text-danger">
                  {restore.error instanceof ApiError && restore.error.code === 'too_many'
                    ? t('shopping.full')
                    : t('error.generic')}
                </p>
              )}
            </div>
          )}

          {data.items.length === 0 && finished?.list !== list && (
            <div className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted">
              <p className="font-semibold text-ink">
                {t(list === 'family' ? 'shopping.emptyFamilyTitle' : 'shopping.emptyTitle')}
              </p>
              <p className="mt-1">
                {t(list === 'family' ? 'shopping.emptyFamilyHint' : 'shopping.emptyHint')}
              </p>
            </div>
          )}

          {AISLES.map((aisle) => {
            const here = toBuy.filter((i) => i.aisle === aisle);
            if (here.length === 0) return null;
            return (
              <section key={aisle} aria-labelledby={`aisle-${aisle}`}>
                <h2
                  id={`aisle-${aisle}`}
                  className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase"
                >
                  {t(AISLE_KEYS[aisle])}
                </h2>
                <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
                  {here.map(row)}
                </ul>
              </section>
            );
          })}

          {atHome.length > 0 && (
            <section aria-labelledby="at-home">
              <h2
                id="at-home"
                className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase"
              >
                {t('shopping.atHome')}
              </h2>
              <p className="mb-1.5 text-xs text-muted">{t('shopping.atHomeHint')}</p>
              <ul className="divide-y divide-line rounded-2xl border border-line bg-card opacity-80">
                {atHome.map(row)}
              </ul>
            </section>
          )}

          {bought.length > 0 && (
            <section aria-labelledby="bought">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <h2
                  id="bought"
                  className="text-xs font-semibold tracking-wide text-muted uppercase"
                >
                  {t('shopping.bought')}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    clear.mutate('bought');
                  }}
                  className="min-h-9 rounded-lg px-2 text-sm font-semibold text-forest hover:bg-champagne"
                >
                  {t('shopping.clearBought')}
                </button>
              </div>
              <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
                {bought.map(row)}
              </ul>
            </section>
          )}

          {data.items.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-2">
              {confirmClear ? (
                <>
                  <span className="text-sm">
                    {t(
                      list === 'family'
                        ? 'shopping.clearFamilyConfirm'
                        : 'shopping.clearAllConfirm',
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      clear.mutate('all');
                      setConfirmClear(false);
                    }}
                    className="min-h-11 rounded-xl border border-line bg-card px-3 text-sm font-semibold text-danger hover:bg-danger-soft"
                  >
                    {t('shopping.clearAll')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmClear(false);
                    }}
                    className={secondaryButton}
                  >
                    {t('shopping.cancel')}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmClear(true);
                  }}
                  className="min-h-11 rounded-xl px-2 text-sm text-muted hover:text-danger"
                >
                  {t('shopping.clearAll')}
                </button>
              )}
            </div>
          )}

          <ShoppingPastLists
            list={list}
            me={me}
            onShopAgain={() => {
              setFinished(null);
            }}
          />

          {list === 'mine' && <p className="text-xs text-muted">{t('shopping.onlyYou')}</p>}
        </div>
      </div>
    </div>
  );
}

function RecipeChip({ recipe, list }: { recipe: ShoppingRecipe; list: ShoppingListName }) {
  const { t } = useI18n();
  const setServings = useSetServings(list);
  const remove = useRemoveRecipe(list);
  const n = recipe.servings;
  return (
    <li className="flex items-center gap-1.5 rounded-full border border-line bg-card py-1 pr-1 pl-3 text-sm">
      <span className="max-w-[14rem] truncate font-semibold">{recipe.title}</span>
      {n !== null && (
        <span className="flex items-center gap-1">
          <button
            type="button"
            aria-label={t('shopping.fewerServings')}
            disabled={n <= 1 || setServings.isPending}
            onClick={() => {
              setServings.mutate({ id: recipe.id, servings: n - 1 });
            }}
            className="min-h-8 min-w-8 rounded-full hover:bg-champagne disabled:opacity-40"
          >
            −
          </button>
          <span className="rounded-full bg-champagne px-2 text-xs text-on-champagne tabular-nums">
            {t('shopping.servings', { n })}
          </span>
          <button
            type="button"
            aria-label={t('shopping.moreServings')}
            disabled={n >= 50 || setServings.isPending}
            onClick={() => {
              setServings.mutate({ id: recipe.id, servings: n + 1 });
            }}
            className="min-h-8 min-w-8 rounded-full hover:bg-champagne disabled:opacity-40"
          >
            +
          </button>
        </span>
      )}
      <button
        type="button"
        aria-label={t('shopping.removeRecipe', { title: recipe.title })}
        disabled={remove.isPending}
        onClick={() => {
          remove.mutate(recipe.id);
        }}
        className="flex min-h-8 min-w-8 items-center justify-center rounded-full text-muted hover:bg-champagne hover:text-danger"
      >
        <CloseIcon size={16} />
      </button>
    </li>
  );
}

/** "You", or the person's username; null for a deleted account. */
function personName(
  p: { userId: string; name: string | null },
  me: string | undefined,
  you: string,
): string | null {
  return p.userId === me ? you : p.name;
}

/** "17:40" today, else "Tue 17:40". */
function formatTime(at: number, language: string): string {
  const d = new Date(at);
  const today = new Date().toDateString() === d.toDateString();
  return new Intl.DateTimeFormat(language, {
    ...(today ? {} : { weekday: 'short' }),
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function ItemRow({
  item,
  list,
  me,
  fresh,
  country,
  open,
  onToggleOpen,
  onFinished,
}: {
  item: ShoppingItem;
  list: ShoppingListName;
  me: string | undefined;
  fresh: boolean;
  country: Country;
  open: boolean;
  onToggleOpen: () => void;
  /** The change finished the list: it was archived as this past list. */
  onFinished: (id: string) => void;
}) {
  const { t, language } = useI18n();
  const update = useUpdateShoppingItem(list, onFinished);
  const remove = useRemoveShoppingItem(list, onFinished);
  const move = useMoveShopping(list);
  const done = item.status === 'bought';
  const you = t('shopping.you');
  const adders = item.addedBy
    .map((p) => personName(p, me, you))
    .filter((x): x is string => x !== null);
  const ticker = item.ticked ? personName(item.ticked, me, you) : null;
  const recipes = [
    ...new Set(item.sources.map((s) => s.recipeTitle).filter((x): x is string => x !== null)),
  ];
  const meta = [
    recipes.length > 1 ? t('shopping.bothRecipes', { n: recipes.length }) : recipes[0],
    item.swappedFrom.length > 0
      ? t('shopping.insteadOf', { name: item.swappedFrom.join(', ') })
      : null,
    done && item.ticked && ticker
      ? t('shopping.tickedBy', { name: ticker, time: formatTime(item.ticked.at, language) })
      : adders.length > 0
        ? adders.join(', ')
        : null,
    fresh ? t('shopping.justAdded') : null,
  ].filter((x): x is string => Boolean(x));
  const count = item.buy?.count ?? 1;

  return (
    <li className={fresh ? 'rounded-2xl outline-2 -outline-offset-2 outline-forest' : ''}>
      <div className="flex min-h-12 items-center gap-3 px-3 py-1.5">
        {item.status === 'home' ? (
          <button
            type="button"
            onClick={() => {
              update.mutate({ key: item.key, status: 'open' });
            }}
            className="min-h-9 shrink-0 rounded-lg border border-line px-2 text-xs font-semibold text-forest hover:bg-champagne"
          >
            {t('shopping.buyAnyway')}
          </button>
        ) : (
          <button
            type="button"
            role="checkbox"
            aria-checked={done}
            aria-label={t('shopping.markBought', { name: item.name })}
            onClick={() => {
              update.mutate({ key: item.key, status: done ? 'open' : 'bought' });
            }}
            className={`flex size-6 shrink-0 items-center justify-center rounded-md border-2 ${
              done ? 'border-forest bg-forest text-on-forest' : 'border-muted'
            }`}
          >
            {done && <CheckIcon size={15} />}
          </button>
        )}
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggleOpen}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
        >
          <span className="min-w-0">
            <span className={`block truncate font-medium ${done ? 'text-muted line-through' : ''}`}>
              {item.name}
            </span>
            {meta.length > 0 && (
              <span className="block truncate text-xs text-muted">{meta.join(' · ')}</span>
            )}
          </span>
          {item.buy && (
            <span
              className={`shrink-0 font-semibold tabular-nums ${done ? 'text-muted line-through' : ''}`}
            >
              {formatBuy(item.buy, t, language)}
            </span>
          )}
        </button>
      </div>

      {open && (
        <div className="space-y-3 border-t border-line bg-paper/60 px-3 py-3 text-sm">
          {item.sources.length > 0 && (
            <ul className="space-y-0.5 text-muted">
              {item.sources.map((s, i) => (
                <li key={i}>
                  {s.recipeTitle ? (
                    <span className="font-medium text-ink">{s.recipeTitle}: </span>
                  ) : null}
                  {s.original}
                </li>
              ))}
            </ul>
          )}
          {item.need && item.buy && (
            <p>
              {t('shopping.needBuy', {
                need: formatNeed(item.need, country, t, language),
                buy: formatBuy(item.buy, t, language),
              })}
            </p>
          )}
          {item.buy && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={t('shopping.less')}
                disabled={count <= 1}
                onClick={() => {
                  update.mutate({ key: item.key, count: count - 1 });
                }}
                className={stepButton}
              >
                −
              </button>
              <span className="min-w-16 text-center font-semibold tabular-nums">
                {formatBuy(item.buy, t, language)}
              </span>
              <button
                type="button"
                aria-label={t('shopping.more')}
                disabled={count >= 99}
                onClick={() => {
                  update.mutate({ key: item.key, count: count + 1 });
                }}
                className={stepButton}
              >
                +
              </button>
              {item.adjusted && (
                <button
                  type="button"
                  onClick={() => {
                    update.mutate({ key: item.key, count: null });
                  }}
                  className="min-h-9 rounded-lg px-2 text-forest hover:bg-champagne"
                >
                  {t('shopping.resetAmount')}
                </button>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {item.status !== 'home' && (
              <button
                type="button"
                onClick={() => {
                  update.mutate({ key: item.key, status: 'home' });
                }}
                className={secondaryButton}
              >
                {t('shopping.haveIt')}
              </button>
            )}
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                className="size-5"
                checked={item.alwaysHome}
                onChange={(e) => {
                  update.mutate({ key: item.key, alwaysHome: e.target.checked });
                }}
              />
              {t(list === 'family' ? 'shopping.alwaysHomeFamily' : 'shopping.alwaysHome')}
            </label>
          </div>
          {list === 'family' && adders.length > 0 && (
            <p className="text-muted">{t('shopping.addedBy', { names: adders.join(', ') })}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={move.isPending}
              onClick={() => {
                move.mutate(item.key);
              }}
              className={secondaryButton}
            >
              {t(list === 'family' ? 'shopping.moveToMine' : 'shopping.moveToFamily')}
            </button>
            {move.error && (
              <span role="alert" className="text-danger">
                {move.error instanceof ApiError && move.error.code === 'too_many'
                  ? t('shopping.full')
                  : t('error.generic')}
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                remove.mutate(item.key);
              }}
              className="ml-auto flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-muted hover:text-danger"
            >
              <TrashIcon size={17} />
              {t('shopping.remove')}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
