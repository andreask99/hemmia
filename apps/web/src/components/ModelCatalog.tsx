import { type ReactNode, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CatalogItem } from '@hemmia/shared';
import { ApiError } from '../api/client.ts';
import { type TFunction, useI18n } from '../i18n/index.tsx';
import { useCatalog, useCatalogCheck, useModelUpdates, useStartPull } from '../settings/hooks.ts';
import { ModelPull } from './ModelPull.tsx';
import { OllamaSetup } from './OllamaSetup.tsx';
import { Button } from '@hemmia/ui';

function startError(err: unknown, t: TFunction): string {
  if (!(err instanceof ApiError)) return t('error.generic');
  switch (err.code) {
    case 'disk_full':
      return t('pull.errorDisk');
    case 'busy':
      return t('pull.errorBusy');
    case 'paused':
      return t('pull.errorPaused');
    case 'unreachable':
      return t('pull.errorOllama');
    case 'bad_model':
    case 'bad_request':
      return t('catalog.byNameBad');
    default:
      return t('error.generic');
  }
}

/** Ollama library names, as the hub accepts them (no namespaces, no cloud tags). */
const LIBRARY_NAME = /^[a-z0-9][a-z0-9._-]{0,60}(:[a-z0-9][a-z0-9._-]{0,39})?$/;
const POPULAR_SHOWN = 8;
const NEW_SHOWN = 6;

type Filter = 'fits' | 'vision' | 'tools' | 'think';

interface Active {
  model: string;
  pullId: string;
}

/** Settings → Models (and the setup's AI step): browse the catalogue and download a model. */
export function ModelCatalog({ showCheck = false }: { showCheck?: boolean }) {
  const { t, language } = useI18n();
  const { data } = useCatalog();
  const startPull = useStartPull();
  const [active, setActive] = useState<Active | null>(null);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<ReadonlySet<Filter>>(new Set(['fits']));
  const [byName, setByName] = useState('');
  const queryClient = useQueryClient();
  if (!data) return null;

  const finished = (outcome: 'done' | 'error') => {
    for (const key of ['catalog', 'models', 'installed', 'model-updates']) {
      void queryClient.invalidateQueries({ queryKey: ['admin', key] });
    }
    if (outcome === 'done') setActive(null);
  };

  const download = (model: string) => {
    startPull.mutate(model, {
      onSuccess: (r) => {
        setActive({ model, pullId: r.pullId });
      },
    });
  };
  const matches = (e: CatalogItem) => {
    if (filters.has('fits') && !e.fits) return false;
    if (filters.has('vision') && !e.vision) return false;
    if (filters.has('tools') && !e.tools) return false;
    if (filters.has('think') && !e.think) return false;
    const q = query.trim().toLowerCase();
    return (
      q === '' ||
      e.ollamaModel.includes(q) ||
      e.label[language].toLowerCase().includes(q) ||
      e.description[language].toLowerCase().includes(q)
    );
  };
  const shown = data.entries.filter(matches);
  const searching = query.trim() !== '' || filters.size !== 1 || !filters.has('fits');
  const recommended = shown.filter((e) => e.recommended);
  const fresh = shown
    .filter((e) => e.isNew && !e.recommended)
    .sort((a, b) => (b.releasedAt ?? '').localeCompare(a.releasedAt ?? ''))
    .slice(0, NEW_SHOWN);
  const popular = shown
    .filter((e) => e.popularRank !== null && !e.recommended && !fresh.includes(e))
    .sort((a, b) => (a.popularRank ?? 0) - (b.popularRank ?? 0))
    .slice(0, POPULAR_SHOWN);
  const card = (e: CatalogItem) => (
    <CatalogCard
      key={e.ollamaModel}
      entry={e}
      active={active}
      disabled={startPull.isPending || active !== null}
      onDownload={() => {
        download(e.ollamaModel);
      }}
      onFinished={finished}
    />
  );
  const filterChip = (f: Filter, label: string) => (
    <button
      key={f}
      type="button"
      aria-pressed={filters.has(f)}
      onClick={() => {
        setFilters((cur) => {
          const next = new Set(cur);
          if (next.has(f)) next.delete(f);
          else next.add(f);
          return next;
        });
      }}
      className={`min-h-9 rounded-full border px-3 text-sm ${
        filters.has(f) ? 'border-forest bg-forest text-on-forest' : 'border-line text-ink'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <OllamaSetup />
      <h3 className="mb-2 text-sm font-semibold text-muted">{t('catalog.title')}</h3>
      <input
        type="search"
        value={query}
        aria-label={t('catalog.search')}
        placeholder={t('catalog.search')}
        onChange={(e) => {
          setQuery(e.target.value);
        }}
        className="mb-2 min-h-11 w-full rounded-xl border border-line bg-card px-3"
      />
      <div className="mb-2 flex flex-wrap gap-2">
        {filterChip('fits', t('catalog.filterFits'))}
        {filterChip('vision', t('catalog.filterVision'))}
        {filterChip('tools', t('catalog.filterTools'))}
        {filterChip('think', t('catalog.filterThink'))}
      </div>

      {shown.length === 0 && <p className="text-sm text-muted">{t('catalog.none')}</p>}
      {searching ? (
        <ul className="divide-y divide-line">{shown.map(card)}</ul>
      ) : (
        <>
          {recommended.length > 0 && (
            <Group title={t('catalog.forThis')}>{recommended.map(card)}</Group>
          )}
          {fresh.length > 0 && <Group title={t('catalog.new')}>{fresh.map(card)}</Group>}
          {popular.length > 0 && <Group title={t('catalog.popular')}>{popular.map(card)}</Group>}
          {shown.length > recommended.length + fresh.length + popular.length && (
            <details className="mt-3">
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">
                {t('catalog.all', { count: String(shown.length) })}
              </summary>
              <ul className="divide-y divide-line">{shown.map(card)}</ul>
            </details>
          )}
        </>
      )}

      <details className="mt-3">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">
          {t('catalog.byName')}
        </summary>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            const name = byName.trim().toLowerCase();
            if (LIBRARY_NAME.test(name)) download(name);
          }}
        >
          <input
            value={byName}
            aria-label={t('catalog.byName')}
            placeholder={t('catalog.byNameHint')}
            onChange={(e) => {
              setByName(e.target.value);
            }}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-card px-3 font-mono text-sm"
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={
              startPull.isPending ||
              active !== null ||
              !LIBRARY_NAME.test(byName.trim().toLowerCase())
            }
          >
            {t('catalog.download')}
          </Button>
        </form>
        {active && !data.entries.some((e) => e.ollamaModel === active.model) && (
          <ModelPull pullId={active.pullId} onFinished={finished} />
        )}
      </details>

      {startPull.error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {startError(startPull.error, t)}
        </p>
      )}
      {showCheck && <CatalogCheck />}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-3">
      <h4 className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</h4>
      <ul className="divide-y divide-line">{children}</ul>
    </div>
  );
}

function CatalogCard({
  entry: e,
  active,
  disabled,
  onDownload,
  onFinished,
}: {
  entry: CatalogItem;
  active: Active | null;
  disabled: boolean;
  onDownload: () => void;
  onFinished: (outcome: 'done' | 'error') => void;
}) {
  const { t, language } = useI18n();
  const abilities = [
    e.vision ? t('catalog.vision') : null,
    e.tools ? t('catalog.tools') : null,
    e.think ? t('catalog.think') : null,
  ].filter((a): a is string => a !== null);
  return (
    <li className={`py-3 ${e.fits ? '' : 'opacity-60'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{e.label[language]}</span>
            {e.recommended && <Badge>{t('catalog.recommended')}</Badge>}
            {e.isNew && <Badge>{t('catalog.new')}</Badge>}
            {e.inUse && <Badge>{t('catalog.inUse')}</Badge>}
          </p>
          {e.description[language] && (
            <p className="text-sm text-muted">{e.description[language]}</p>
          )}
          <p className="text-sm text-muted">
            {t('catalog.facts', {
              size: String(e.downloadGiB),
              memory: String(e.minTotalMemoryGiB),
            })}
            {abilities.length > 0 ? ` · ${abilities.join(', ')}` : ''}
          </p>
        </div>
        {!e.fits ? (
          <span className="shrink-0 text-sm text-muted">{t('catalog.needsMore')}</span>
        ) : e.installed ? (
          <span className="shrink-0 text-sm text-muted">{t('catalog.installed')}</span>
        ) : (
          <Button variant="secondary" disabled={disabled} onClick={onDownload}>
            {t('catalog.download')}
          </Button>
        )}
      </div>
      {active?.model === e.ollamaModel && (
        <ModelPull pullId={active.pullId} onFinished={onFinished} />
      )}
    </li>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-champagne px-2 py-0.5 text-xs text-on-champagne">
      {children}
    </span>
  );
}

/** The admin's switch "Look for new models" (the daily catalogue request). */
function CatalogCheck() {
  const { t } = useI18n();
  const { data } = useModelUpdates();
  const set = useCatalogCheck();
  if (!data) return null;
  return (
    <label className="mt-4 flex items-start gap-3">
      <input
        type="checkbox"
        className="mt-1 size-5"
        checked={data.catalogCheck}
        disabled={set.isPending}
        onChange={(e) => {
          set.mutate(e.target.checked);
        }}
      />
      <span>
        <span className="block">{t('catalog.check')}</span>
        <span className="block text-sm text-muted">{t('catalog.checkHint')}</span>
      </span>
    </label>
  );
}
