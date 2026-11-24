import { type SubmitEvent, useState } from 'react';
import {
  AISLES,
  type Aisle,
  COUNTRIES,
  type Country,
  type ShoppingItem,
  type ShoppingRecipe,
} from '@hemmia/shared';
import { ApiError } from '../api/client.ts';
import { PageHeader } from '../components/layout.tsx';
import { type MessageKey, useI18n } from '../i18n/index.tsx';
import { formatBuy, formatNeed } from '../shopping/format.ts';
import {
  useAddShoppingItem,
  useClearShopping,
  useRemoveRecipe,
  useRemoveShoppingItem,
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

/** The shopping list: recipes, items by aisle, at home, bought (P12). */
export function ShoppingPage() {
  const { t } = useI18n();
  const { data } = useShopping();
  const add = useAddShoppingItem();
  const clear = useClearShopping();
  const setCountry = useSetCountry();
  const [text, setText] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const header = (
    <PageHeader>
      <h1 className="font-display text-[19px] font-semibold">{t('shopping.title')}</h1>
    </PageHeader>
  );
  if (!data) return <div className="flex min-h-0 flex-1 flex-col">{header}</div>;

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
      country={data.country}
      open={open === item.key}
      onToggleOpen={() => {
        setOpen((o) => (o === item.key ? null : item.key));
      }}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-4 p-4 pb-10">
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
                <RecipeChip key={r.id} recipe={r} />
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
              placeholder={t('shopping.addPlaceholder')}
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

          {data.items.length === 0 && (
            <div className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted">
              <p className="font-semibold text-ink">{t('shopping.emptyTitle')}</p>
              <p className="mt-1">{t('shopping.emptyHint')}</p>
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
                  <span className="text-sm">{t('shopping.clearAllConfirm')}</span>
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
        </div>
      </div>
    </div>
  );
}

function RecipeChip({ recipe }: { recipe: ShoppingRecipe }) {
  const { t } = useI18n();
  const setServings = useSetServings();
  const remove = useRemoveRecipe();
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

function ItemRow({
  item,
  country,
  open,
  onToggleOpen,
}: {
  item: ShoppingItem;
  country: Country;
  open: boolean;
  onToggleOpen: () => void;
}) {
  const { t, language } = useI18n();
  const update = useUpdateShoppingItem();
  const remove = useRemoveShoppingItem();
  const done = item.status === 'bought';
  const recipes = [
    ...new Set(item.sources.map((s) => s.recipeTitle).filter((x): x is string => x !== null)),
  ];
  const meta = [
    recipes.length > 1 ? t('shopping.bothRecipes', { n: recipes.length }) : recipes[0],
    item.swappedFrom.length > 0
      ? t('shopping.insteadOf', { name: item.swappedFrom.join(', ') })
      : null,
  ].filter((x): x is string => Boolean(x));
  const count = item.buy?.count ?? 1;

  return (
    <li>
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
              {t('shopping.alwaysHome')}
            </label>
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
