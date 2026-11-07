import { useState } from 'react';
import { MAX_NOTE_CHARS, MAX_PROFILE_CHARS, MAX_PROFILE_NOTES } from '@hemmia/shared';
import { useI18n } from '../i18n/index.tsx';
import { useProfile, useSaveProfile, useWipeProfile } from '../profile/hooks.ts';

const field =
  'w-full rounded-xl border border-line bg-paper px-3.5 py-3 text-base text-ink focus:border-forest focus:outline-none';
const button = 'min-h-11 rounded-xl px-4 text-[15px] font-semibold disabled:opacity-60';

/** One note per non-empty line, trimmed. */
const notesOf = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

/** Settings → Profile: the notes kchat keeps about the user, one per line; edit or wipe. */
export function ProfileSection() {
  const { data } = useProfile();
  if (!data?.available) return null;
  // Keyed form: starts from the saved notes, then keeps its own text while editing.
  return <ProfileForm initial={data.notes.map((n) => n.text).join('\n')} />;
}

function ProfileForm({ initial }: { initial: string }) {
  const { t } = useI18n();
  const save = useSaveProfile();
  const wipe = useWipeProfile();
  const [text, setText] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<'saved' | 'wiped' | 'tooLong' | 'failed' | null>(null);
  const notes = notesOf(text);

  const onSave = () => {
    if (
      notes.length > MAX_PROFILE_NOTES ||
      notes.some((n) => n.length > MAX_NOTE_CHARS) ||
      notes.join('').length > MAX_PROFILE_CHARS
    ) {
      setMessage('tooLong');
      return;
    }
    setMessage(null);
    save.mutate(notes, {
      onSuccess: (saved) => {
        setText(saved.notes.map((n) => n.text).join('\n'));
        setMessage('saved');
      },
      onError: () => {
        setMessage('failed');
      },
    });
  };

  const onWipe = () => {
    wipe.mutate(undefined, {
      onSuccess: () => {
        setText('');
        setConfirming(false);
        setMessage('wiped');
      },
      onError: () => {
        setConfirming(false);
        setMessage('failed');
      },
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{t('profile.hint')}</p>
      <div>
        <label htmlFor="profile-notes" className="mb-1.5 block text-sm font-medium text-muted">
          {t('profile.label')}
        </label>
        <textarea
          id="profile-notes"
          rows={8}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
          className={field}
        />
        <p className="mt-1 text-sm text-muted">
          {t('profile.count', { count: notes.length, max: MAX_PROFILE_NOTES })}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={save.isPending}
          className={`${button} bg-forest text-on-forest`}
        >
          {t('profile.save')}
        </button>
        {(notes.length > 0 || initial !== '') && !confirming && (
          <button
            type="button"
            onClick={() => {
              setConfirming(true);
            }}
            className={`${button} border border-line text-danger hover:bg-danger-soft`}
          >
            {t('profile.wipe')}
          </button>
        )}
      </div>

      {confirming && (
        <div className="flex flex-col gap-2 rounded-xl bg-danger-soft p-3">
          <p className="text-sm text-danger">{t('profile.wipeConfirm')}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onWipe}
              disabled={wipe.isPending}
              className={`${button} border border-danger bg-paper text-danger`}
            >
              {t('profile.wipeYes')}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
              }}
              className={`${button} border border-line bg-paper`}
            >
              {t('profile.cancel')}
            </button>
          </div>
        </div>
      )}

      {(message === 'tooLong' || message === 'failed') && (
        <p role="alert" className="text-sm text-danger">
          {message === 'tooLong'
            ? t('profile.tooLong', { max: MAX_PROFILE_NOTES, chars: MAX_NOTE_CHARS })
            : t('profile.failed')}
        </p>
      )}
      {(message === 'saved' || message === 'wiped') && (
        <p role="status" className="text-sm text-ok">
          {message === 'saved' ? t('daily.saved') : t('profile.wiped')}
        </p>
      )}
    </div>
  );
}
