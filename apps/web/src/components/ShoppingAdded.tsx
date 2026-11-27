import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { ShoppingAddedRef, ShoppingListName } from '@hemmia/shared';
import { useI18n } from '../i18n/index.tsx';
import { useMoveShoppingBatch, useUndoShopping } from '../shopping/hooks.ts';
import { rememberList } from '../shopping/lastList.ts';
import { BasketIcon } from '@hemmia/ui';

/**
 * What the model put on a shopping list with a reply: which list, swaps, Open list, Undo and a
 * move to the other list.
 */
export function ShoppingAdded({ added }: { added: readonly ShoppingAddedRef[] }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const undo = useUndoShopping();
  const move = useMoveShoppingBatch();
  const [undone, setUndone] = useState<ReadonlySet<string>>(new Set());
  /** Where a batch is now, after a move from this card. */
  const [moved, setMoved] = useState<ReadonlyMap<string, ShoppingListName>>(new Map());
  if (added.length === 0) return null;

  return (
    <ul className="flex w-full max-w-prose flex-col gap-2">
      {added.map((a) => {
        const gone = undone.has(a.batchId);
        const where = moved.get(a.batchId) ?? a.list;
        const other: ShoppingListName = where === 'family' ? 'mine' : 'family';
        return (
          <li
            key={a.batchId}
            className="rounded-2xl border border-line bg-card px-3.5 py-2.5 text-sm"
          >
            <p className="flex items-center gap-2 font-semibold">
              <BasketIcon size={17} className="shrink-0 text-forest" />
              <span className={gone ? 'text-muted line-through' : ''}>
                {a.recipe
                  ? t(where === 'family' ? 'shopping.addedRecipeFamily' : 'shopping.addedRecipe', {
                      recipe: a.recipe,
                      n: a.count,
                    })
                  : t(where === 'family' ? 'shopping.addedFamily' : 'shopping.added', {
                      n: a.count,
                    })}
              </span>
            </p>
            {!gone && (a.adapted.length > 0 || a.atHome.length > 0) && (
              <ul className="mt-1 space-y-0.5 text-muted">
                {a.adapted.map((x) => (
                  <li key={`${x.from}>${x.to}`}>
                    <span className="font-medium text-warn">{t('shopping.adapted')}</span> {x.from}{' '}
                    → {x.to}
                  </li>
                ))}
                {a.atHome.length > 0 && (
                  <li>{t('shopping.alreadyHome', { names: a.atHome.join(', ') })}</li>
                )}
              </ul>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {gone ? (
                <span className="text-xs text-muted">{t('shopping.undone')}</span>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      rememberList(where);
                      void navigate('/shopping');
                    }}
                    className="min-h-9 rounded-lg bg-forest px-3 font-semibold text-on-forest hover:bg-forest-hover"
                  >
                    {t('shopping.openList')}
                  </button>
                  <button
                    type="button"
                    disabled={undo.isPending}
                    onClick={() => {
                      undo.mutate(a.batchId, {
                        // 404: already removed on the list page; show it as undone either way.
                        onSettled: () => {
                          setUndone((s) => new Set([...s, a.batchId]));
                        },
                      });
                    }}
                    className="min-h-9 rounded-lg px-2 font-semibold text-forest hover:bg-champagne"
                  >
                    {t('shopping.undo')}
                  </button>
                  <button
                    type="button"
                    disabled={move.isPending}
                    onClick={() => {
                      move.mutate(
                        { batchId: a.batchId, to: other },
                        {
                          onSuccess: () => {
                            setMoved((m) => new Map([...m, [a.batchId, other]]));
                          },
                        },
                      );
                    }}
                    className="min-h-9 rounded-lg px-2 font-semibold text-forest hover:bg-champagne"
                  >
                    {t(other === 'mine' ? 'shopping.moveToMine' : 'shopping.moveToFamily')}
                  </button>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
