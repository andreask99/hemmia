import { useState } from 'react';
import type { NotedRef } from '@hemmia/shared';
import { useI18n } from '../i18n/index.tsx';
import { useProfile, useRemoveNote } from '../profile/hooks.ts';
import { CheckIcon } from '@hemmia/ui';

/**
 * Profile notes the model saved with a reply: "Noted: …" with an undo. A note shows as
 * removed once undone here or when it is no longer in the profile (edited in Settings).
 */
export function NotedNotes({ notes }: { notes: readonly NotedRef[] }) {
  const { t } = useI18n();
  const profile = useProfile();
  const remove = useRemoveNote();
  const [undone, setUndone] = useState<ReadonlySet<string>>(new Set());
  if (notes.length === 0) return null;
  const inProfile = (id: string) =>
    !profile.isSuccess || profile.isFetching || profile.data.notes.some((n) => n.id === id);

  return (
    <ul className="flex w-full max-w-prose flex-col gap-1 text-sm">
      {notes.map((note) => {
        const removed = undone.has(note.id) || !inProfile(note.id);
        return (
          <li key={note.id} className="flex flex-wrap items-center gap-x-2 text-muted">
            <CheckIcon size={14} className="shrink-0 text-forest" />
            {removed ? (
              <span className="line-through">{note.text}</span>
            ) : (
              <span>
                <span className="font-medium text-ink">{t('profile.noted')}:</span> {note.text}
              </span>
            )}
            {removed ? (
              <span className="text-xs">· {t('profile.removed')}</span>
            ) : (
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => {
                  remove.mutate(note.id, {
                    // 404: already gone (e.g. removed in Settings); show it as removed either way.
                    onSettled: () => {
                      setUndone((s) => new Set([...s, note.id]));
                    },
                  });
                }}
                className="min-h-9 rounded-lg px-2 font-semibold text-forest hover:bg-champagne"
              >
                {t('profile.undo')}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
