import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { ChatModelInfo, CloudProvider } from '@hemmia/shared';
import { useI18n } from '../i18n/index.tsx';
import { ChevronDownIcon, CloseIcon } from '@hemmia/ui';
import { Button, IconButton } from '@hemmia/ui';

/** The provider's name for a cloud model ("Anthropic", "OpenAI"). */
export function providerName(provider: CloudProvider, t: ReturnType<typeof useI18n>['t']): string {
  if (provider === 'anthropic') return t('provider.anthropic');
  if (provider === 'openai') return t('provider.openai');
  return t('provider.openrouter');
}

/** The model chip in the chat header: "gemma4 26B · Thinking", "☁ Claude Sonnet 5.5". */
export function ModelChip({
  model,
  think,
  onClick,
  disabled,
}: {
  model: ChatModelInfo | undefined;
  think: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const { t, language } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-haspopup="dialog"
      aria-label={t('model.title')}
      className="inline-flex max-w-full items-center gap-1 self-start rounded-full py-0.5 text-[13px] text-muted hover:text-ink disabled:opacity-60"
    >
      {model?.provider && (
        <span
          role="img"
          aria-label={t('model.cloudChip', { provider: providerName(model.provider, t) })}
          title={t('model.cloudChip', { provider: providerName(model.provider, t) })}
        >
          ☁
        </span>
      )}
      <span className="truncate">
        {model ? model.label[language] : '…'}
        {model?.thinking && think ? ` · ${t('model.think')}` : ''}
      </span>
      <ChevronDownIcon size={14} />
    </button>
  );
}

/** Bottom sheet on phones, centered dialog on wide screens. */
export function ModelSheet({
  models,
  value,
  think,
  loaded = [],
  hasHistory = false,
  cloudAllowed = false,
  onSelect,
  onThink,
  onClose,
}: {
  models: readonly ChatModelInfo[];
  value: string;
  think: boolean;
  /** Model ids in memory right now (marked "Ready"). */
  loaded?: readonly string[];
  /**
   * The chat already has messages: switching it from a model on this Mac to a cloud model
   * sends them along, so that needs a confirmation.
   */
  hasHistory?: boolean;
  /** Cloud models are allowed for this account: without a key yet, link to adding one. */
  cloudAllowed?: boolean;
  onSelect: (id: string) => void;
  onThink: (on: boolean) => void;
  onClose: () => void;
}) {
  const { t, language } = useI18n();
  const current = models.find((m) => m.id === value);
  /** A cloud model waiting for "send this chat there?" to be confirmed. */
  const [confirming, setConfirming] = useState<ChatModelInfo | null>(null);
  const local = models.filter((m) => !m.cloud);
  const cloud = models.filter((m) => m.cloud);
  const choose = (m: ChatModelInfo) => {
    if (m.cloud && hasHistory && current?.cloud !== true && m.id !== value) {
      setConfirming(m);
      return;
    }
    setConfirming(null);
    onSelect(m.id);
  };
  const card = (m: ChatModelInfo) => {
    const selected = m.id === value;
    return (
      <button
        key={m.id}
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={() => {
          choose(m);
        }}
        className={`flex flex-col gap-1 rounded-2xl border bg-card px-4 py-3 text-left transition-colors ${selected ? 'border-forest ring-1 ring-forest' : 'border-line hover:border-forest/40'}`}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[15px] font-semibold">{m.label[language]}</span>
            {loaded.includes(m.id) && (
              <span
                title={t('model.readyHint')}
                className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-ok"
              >
                <span aria-hidden="true">●</span>
                {t('model.ready')}
              </span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {m.provider && (
              <span className="rounded-full bg-forest px-2 py-0.5 text-[11px] font-semibold text-on-forest">
                ☁ {providerName(m.provider, t)}
              </span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.vision ? 'bg-champagne text-on-champagne' : 'bg-paper text-muted'}`}
            >
              {m.vision ? t('model.photos') : t('model.noPhotos')}
            </span>
          </span>
        </span>
        {m.description && <span className="text-sm text-ink/80">{m.description[language]}</span>}
        <span className="text-xs text-muted">
          {m.details ? m.details[language] : m.engineModel}
        </span>
      </button>
    );
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label={t('image.close')}
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-ink/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('model.title')}
        className="relative flex max-h-[85dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-3xl border border-line bg-paper px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl sm:p-6"
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-line sm:hidden" />
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-semibold">{t('model.title')}</h2>
          <IconButton aria-label={t('image.close')} onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </div>
        <div className="flex flex-col gap-2" role="radiogroup" aria-label={t('model.title')}>
          {cloud.length > 0 && (
            <h3 className="px-1 text-sm font-semibold text-muted">{t('model.local')}</h3>
          )}
          {local.map(card)}
          {cloud.length > 0 && (
            <>
              <h3 className="mt-2 px-1 text-sm font-semibold text-muted">
                ☁ {t('model.cloudGroup')}
              </h3>
              <p className="px-1 text-xs text-muted">{t('model.cloudNote')}</p>
              {cloud.map(card)}
            </>
          )}
        </div>
        {cloudAllowed && cloud.length === 0 && (
          <Link
            to="/settings?tab=models"
            className="px-1 text-sm font-semibold text-forest hover:underline"
          >
            {t('model.addCloud')}
          </Link>
        )}
        {confirming?.provider && (
          <div
            role="alertdialog"
            aria-label={t('model.cloudConfirmTitle', {
              provider: providerName(confirming.provider, t),
            })}
            className="flex flex-col gap-2 rounded-2xl border border-forest bg-card p-4"
          >
            <p className="text-[15px] font-semibold">
              {t('model.cloudConfirmTitle', { provider: providerName(confirming.provider, t) })}
            </p>
            <p className="text-sm text-ink/80">
              {t('model.cloudConfirm', { provider: providerName(confirming.provider, t) })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  onSelect(confirming.id);
                  setConfirming(null);
                }}
                className="min-h-11"
              >
                {t('model.cloudConfirmYes', { model: confirming.label[language] })}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setConfirming(null);
                }}
                className="min-h-11 rounded-xl border border-line bg-paper px-4 text-[15px] font-semibold"
              >
                {t('model.cloudConfirmNo')}
              </button>
            </div>
          </div>
        )}
        {current?.thinking && (
          <label className="flex min-h-12 items-center justify-between gap-4 rounded-2xl border border-line bg-card px-4 py-2">
            <span className="flex flex-col">
              <span className="text-[15px] font-semibold">{t('model.think')}</span>
              <span className="text-xs text-muted">{t('model.thinkHint')}</span>
            </span>
            <input
              name="thinkHarder"
              type="checkbox"
              role="switch"
              checked={think}
              onChange={(e) => {
                onThink(e.target.checked);
              }}
              className="h-6 w-6 accent-[var(--forest)]"
            />
          </label>
        )}
        <p className="px-1 text-sm text-muted">{t('model.imagesNote')}</p>
        <Button onClick={onClose} className="min-h-12">
          {t('model.done')}
        </Button>
      </div>
    </div>
  );
}
