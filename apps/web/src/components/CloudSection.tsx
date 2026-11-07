import { useState } from 'react';
import type { CloudProvider, CloudSettingsResponse } from '@hemmia/shared';
import { ApiError } from '../api/client.ts';
import {
  useCloudSettings,
  useRemoveCloudKey,
  useSaveCloudKey,
  useSetCloudCap,
} from '../cloud/hooks.ts';
import { type MessageKey, useI18n } from '../i18n/index.tsx';

const field =
  'w-full rounded-xl border border-line bg-paper px-3.5 py-3 text-base text-ink focus:border-forest focus:outline-none';
const button = 'min-h-11 rounded-xl px-4 text-[15px] font-semibold disabled:opacity-60';

const PROVIDERS: readonly { id: CloudProvider; name: MessageKey; where: MessageKey }[] = [
  { id: 'anthropic', name: 'cloud.providerAnthropic', where: 'cloud.keyWhereAnthropic' },
  { id: 'openai', name: 'cloud.providerOpenai', where: 'cloud.keyWhereOpenai' },
  { id: 'openrouter', name: 'cloud.providerOpenrouter', where: 'cloud.keyWhereOpenrouter' },
];

/** A message under a provider or the limit: an error (alert) or a success (status). */
type Note = { kind: 'ok' | 'error'; key: MessageKey } | null;

function NoteLine({ note }: { note: Note }) {
  const { t } = useI18n();
  if (!note) return null;
  return note.kind === 'error' ? (
    <p role="alert" className="text-sm text-danger">
      {t(note.key)}
    </p>
  ) : (
    <p role="status" className="text-sm text-ok">
      {t(note.key)}
    </p>
  );
}

/**
 * Settings → Account → Cloud AI: what cloud models mean (shown before any key can be added),
 * the user's own Anthropic and OpenAI keys, a monthly limit, and this month's use.
 */
export function CloudSection() {
  const { t } = useI18n();
  const { data } = useCloudSettings();
  if (!data) return null;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{t('cloud.intro')}</p>
      <p className="text-sm text-muted">{t('cloud.keyNote')}</p>
      {data.allowed ? (
        <>
          {PROVIDERS.map((p) => (
            <ProviderKey key={p.id} provider={p} settings={data} />
          ))}
          {/* Mounted once the settings are there: starts from the saved limit. */}
          <CapForm settings={data} />
        </>
      ) : (
        <p className="text-sm">{t('cloud.notAllowed')}</p>
      )}
    </div>
  );
}

function ProviderKey({
  provider,
  settings,
}: {
  provider: (typeof PROVIDERS)[number];
  settings: CloudSettingsResponse;
}) {
  const { t } = useI18n();
  const save = useSaveCloudKey();
  const remove = useRemoveCloudKey();
  const [text, setText] = useState('');
  const [note, setNote] = useState<Note>(null);
  const saved = settings.keys.find((k) => k.provider === provider.id);
  const inputId = `cloud-key-${provider.id}`;

  const onSave = () => {
    setNote(null);
    save.mutate(
      { provider: provider.id, key: text.trim() },
      {
        onSuccess: () => {
          setText('');
          setNote({ kind: 'ok', key: 'cloud.saved' });
        },
        onError: (err) => {
          const code = err instanceof ApiError ? err.code : null;
          setNote({
            kind: 'error',
            key:
              code === 'cloud_key'
                ? 'cloud.badKey'
                : code === 'cloud_unavailable'
                  ? 'cloud.unreachable'
                  : 'cloud.failed',
          });
        },
      },
    );
  };

  const onRemove = () => {
    setNote(null);
    remove.mutate(provider.id, {
      onSuccess: () => {
        setNote({ kind: 'ok', key: 'cloud.removed' });
      },
      onError: () => {
        setNote({ kind: 'error', key: 'cloud.failed' });
      },
    });
  };

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      <h3 className="text-[15px] font-semibold">{t(provider.name)}</h3>
      {saved ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm">{t('cloud.keySet', { hint: saved.hint })}</span>
          <button
            type="button"
            onClick={onRemove}
            disabled={remove.isPending}
            className={`${button} border border-line text-danger hover:bg-danger-soft`}
          >
            {t('cloud.remove')}
          </button>
        </div>
      ) : (
        <>
          <div>
            <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-muted">
              {t('cloud.keyLabel')}
            </label>
            <input
              id={inputId}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
              }}
              className={field}
            />
            <p className="mt-1 text-sm text-muted">{t(provider.where)}</p>
          </div>
          <button
            type="button"
            onClick={onSave}
            disabled={text.trim() === '' || save.isPending}
            className={`${button} self-start bg-forest text-on-forest`}
          >
            {t('cloud.save')}
          </button>
        </>
      )}
      <NoteLine note={note} />
    </div>
  );
}

function CapForm({ settings }: { settings: CloudSettingsResponse }) {
  const { t } = useI18n();
  const setCap = useSetCloudCap();
  const [text, setText] = useState(
    settings.capCents === null ? '' : String(settings.capCents / 100),
  );
  const [note, setNote] = useState<Note>(null);
  const { month } = settings;

  const onSave = () => {
    let capCents: number | null = null;
    if (text.trim() !== '') {
      capCents = Math.round(Number(text) * 100);
      if (!Number.isFinite(capCents) || capCents < 100 || capCents > 100_000) {
        setNote({ kind: 'error', key: 'cloud.failed' });
        return;
      }
    }
    setNote(null);
    setCap.mutate(capCents, {
      onSuccess: () => {
        setNote({ kind: 'ok', key: 'cloud.capSaved' });
      },
      onError: () => {
        setNote({ kind: 'error', key: 'cloud.failed' });
      },
    });
  };

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      <label htmlFor="cloud-cap" className="block text-sm font-medium text-muted">
        {t('cloud.capLabel')}
      </label>
      <div className="flex gap-2">
        <input
          id="cloud-cap"
          type="number"
          inputMode="decimal"
          min="1"
          step="1"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
          className={`${field} max-w-40`}
        />
        <button
          type="button"
          onClick={onSave}
          disabled={setCap.isPending}
          className={`${button} bg-forest text-on-forest`}
        >
          {t('cloud.capSave')}
        </button>
      </div>
      <p className="text-sm text-muted">{t('cloud.capHint')}</p>
      <NoteLine note={note} />
      <p className="text-sm">
        {t('cloud.month', {
          cost: (month.costCents / 100).toFixed(2),
          tokens: (month.inputTokens + month.outputTokens).toLocaleString(),
        })}
      </p>
    </div>
  );
}
