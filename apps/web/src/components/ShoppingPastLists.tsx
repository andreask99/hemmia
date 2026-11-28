/**
 * Past shopping lists (P12.8): lists whose last item was ticked off, kept 30 days. Each can be
 * opened to see what was on it, put back on the list to shop for the same again, or deleted.
 */
import { useState } from 'react';
import type { ShoppingArchiveEntry, ShoppingListName } from '@hemmia/shared';
import { ApiError } from '../api/client.ts';
import { useI18n } from '../i18n/index.tsx';
import { formatBuy } from '../shopping/format.ts';
import { useDeleteArchived, useRestoreShopping, useShoppingArchive } from '../shopping/hooks.ts';
import { TrashIcon } from '@hemmia/ui';

/** How many item names a closed past list shows. */
const PREVIEW = 4;

/** "Sat 28 Nov, 17:40". */
function formatDay(at: number, language: string): string {
  return new Intl.DateTimeFormat(language, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(at));
}

export function ShoppingPastLists({
  list,
  me,
  onShopAgain,
}: {
  list: ShoppingListName;
  me: string | undefined;
  onShopAgain: () => void;
}) {
  const { t } = useI18n();
  const { data } = useShoppingArchive(list);
  const [shown, setShown] = useState(false);
  const archives = data?.archives ?? [];
  if (archives.length === 0) return null;

  return (
    <section aria-labelledby="past-lists" className="pt-2">
      <button
        type="button"
        id="past-lists"
        aria-expanded={shown}
        onClick={() => {
          setShown((s) => !s);
        }}
        className="flex min-h-11 w-full items-center justify-between rounded-xl px-1 text-left text-sm font-semibold text-forest hover:bg-champagne"
      >
        <span>
          {t('shopping.pastLists')}{' '}
          <span className="text-muted tabular-nums">{archives.length}</span>
        </span>
        <span aria-hidden="true">{shown ? '−' : '+'}</span>
      </button>
      {shown && (
        <div className="mt-1 space-y-2">
          <p className="px-1 text-xs text-muted">{t('shopping.pastHint')}</p>
          <ul className="space-y-2">
            {archives.map((a) => (
              <PastList key={a.id} entry={a} list={list} me={me} onShopAgain={onShopAgain} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function PastList({
  entry,
  list,
  me,
  onShopAgain,
}: {
  entry: ShoppingArchiveEntry;
  list: ShoppingListName;
  me: string | undefined;
  onShopAgain: () => void;
}) {
  const { t, language } = useI18n();
  const [open, setOpen] = useState(false);
  const restore = useRestoreShopping(list);
  const remove = useDeleteArchived(list);
  const items = entry.list.items;
  const names = items.map((i) => i.name);
  const preview =
    names.slice(0, PREVIEW).join(', ') +
    (names.length > PREVIEW ? ` +${String(names.length - PREVIEW)}` : '');
  const by = entry.finishedBy
    ? entry.finishedBy.userId === me
      ? t('shopping.you')
      : entry.finishedBy.name
    : null;
  const error = restore.error ?? remove.error;

  return (
    <li className="rounded-2xl border border-line bg-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
        }}
        className="block w-full px-3.5 py-2.5 text-left"
      >
        <span className="block text-sm font-semibold">
          {formatDay(entry.archivedAt, language)}
          {by && (
            <span className="font-normal text-muted">
              {' · '}
              {t('shopping.finishedBy', { name: by })}
            </span>
          )}
        </span>
        {!open && <span className="block truncate text-sm text-muted">{preview}</span>}
      </button>
      {open && (
        <div className="space-y-3 border-t border-line px-3.5 py-3 text-sm">
          <ul className="space-y-1">
            {items.map((i) => (
              <li
                key={i.key}
                className={`flex justify-between gap-3 ${i.status === 'bought' ? '' : 'text-muted'}`}
              >
                <span className="min-w-0 truncate">{i.name}</span>
                {i.buy && i.status === 'bought' && (
                  <span className="shrink-0 tabular-nums">{formatBuy(i.buy, t, language)}</span>
                )}
                {i.status === 'home' && (
                  <span className="shrink-0 text-xs">{t('shopping.atHome')}</span>
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={restore.isPending}
              onClick={() => {
                restore.mutate(
                  { id: entry.id, as: 'again' },
                  {
                    onSuccess: () => {
                      setOpen(false);
                      onShopAgain();
                    },
                  },
                );
              }}
              className="min-h-11 rounded-xl border border-line px-3 text-sm font-semibold hover:bg-champagne disabled:opacity-50"
            >
              {t('shopping.shopAgain')}
            </button>
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate(entry.id);
              }}
              className="ml-auto flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-muted hover:text-danger"
            >
              <TrashIcon size={17} />
              {t('shopping.deletePast')}
            </button>
          </div>
          {error && (
            <p role="alert" className="text-danger">
              {error instanceof ApiError && error.code === 'too_many'
                ? t('shopping.full')
                : t('error.generic')}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
