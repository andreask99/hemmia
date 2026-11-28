/**
 * Settings → Models (owner redesign 2026-11-28; mockup:
 * https://claude.ai/artifact/TNafiDcri3AGYbnnM9qCBY). Three parts, important first:
 *
 * 1. Everyone: the model their new chats start with.
 * 2. Admins: an update strip (only when there is one), then ONE list of the family's models on
 *    this Mac (switch to offer, ⋯ for family default, delete, remove), "Add a model" opening
 *    the catalogue as its own screen, and the rules (web search, cloud) that save at once.
 * 3. Cloud AI: open when the hub has no models of its own (then it is how the family chats),
 *    otherwise a closed subsection (owner, 2026-11-28). Advanced plumbing stays closed.
 */
import { type ReactNode, useEffect, useState } from 'react';
import { prettyModelName } from '@hemmia/relay-protocol/names';
import {
  type AdminModel,
  type AdminModelsResponse,
  type CatalogItem,
  type InstalledModelsResponse,
  WebSearchMode,
} from '@hemmia/shared';
import { ApiError } from '../api/client.ts';
import { useMe } from '../auth/hooks.ts';
import { modelLabel, useModels } from '../chat/hooks.ts';
import { useCloudSettings } from '../cloud/hooks.ts';
import { type MessageKey, type TFunction, useI18n } from '../i18n/index.tsx';
import {
  useAddModel,
  useAdminModels,
  useCapabilities,
  useCatalog,
  useCloudMode,
  useDeleteModel,
  useInstalledModels,
  useRemoveModel,
  useUpdateMe,
  useUpdateModels,
  useWebSearchMode,
} from '../settings/hooks.ts';
import { CatalogCheck, ModelCatalog } from './ModelCatalog.tsx';
import { CloudSection } from './CloudSection.tsx';
import { LocalServers } from './LocalServers.tsx';
import { ModelUpdates } from './ModelUpdates.tsx';
import { PicturesSetup } from './PicturesSetup.tsx';
import { SearchSetup } from './SearchSetup.tsx';

const card = 'rounded-2xl border border-line bg-card p-5 shadow-[0_1px_2px_rgba(23,35,31,0.04)]';
const select =
  'min-h-11 rounded-xl border border-line bg-paper px-3 text-base font-semibold text-ink focus:border-forest focus:outline-none';
const quietButton =
  'min-h-11 rounded-xl border border-line bg-paper px-4 text-sm font-semibold hover:bg-champagne disabled:opacity-50';
const switchClass =
  'relative h-[26px] w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-line transition-colors ' +
  "after:absolute after:top-[3px] after:left-[3px] after:size-5 after:rounded-full after:bg-card after:shadow after:transition-all after:content-[''] " +
  'checked:bg-forest checked:after:left-[21px] disabled:cursor-not-allowed disabled:opacity-60';

const PROVIDER_NAMES: Record<string, MessageKey> = {
  anthropic: 'cloud.providerAnthropic',
  openai: 'cloud.providerOpenai',
  openrouter: 'cloud.providerOpenrouter',
};

function deleteError(err: unknown, t: TFunction): string {
  if (err instanceof ApiError && err.code === 'busy') return t('installed.errorBusy');
  if (err instanceof ApiError && err.code === 'last_model') return t('installed.errorLast');
  return t('error.generic');
}

export function ModelsTab({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const models = useModels().data;
  // Cloud AI is the main way to chat only when the hub has no models of its own.
  const hasLocal = models ? models.chatModels.some((m) => !m.cloud) : true;

  useEffect(() => {
    if (adding) window.scrollTo({ top: 0 });
  }, [adding]);

  if (adding && isAdmin) {
    return (
      <section className={card}>
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            aria-label={t('models.back')}
            onClick={() => {
              setAdding(false);
            }}
            className="flex size-11 items-center justify-center rounded-xl hover:bg-champagne"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
          </button>
          <h2 className="font-display text-xl font-semibold">{t('models.add')}</h2>
        </div>
        <ModelCatalog hideTitle />
      </section>
    );
  }

  return (
    <>
      <MyModel />
      {isAdmin && <ModelUpdates />}
      {isAdmin && (
        <FamilyModels
          onAdd={() => {
            setAdding(true);
          }}
        />
      )}
      {isAdmin && <Rules showCloud={!hasLocal} />}
      {hasLocal ? (
        <details className={`${card} group`}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3">
            <span>
              <span className="block font-display text-xl font-semibold">{t('cloud.title')}</span>
              <CloudSummary />
            </span>
            <Chevron />
          </summary>
          <div className="mt-4 flex flex-col gap-5">
            {isAdmin && <CloudRule />}
            {isAdmin && <CloudModels />}
            <CloudSection />
          </div>
        </details>
      ) : (
        <section className={card}>
          <h2 className="mb-4 font-display text-xl font-semibold">{t('cloud.title')}</h2>
          <div className="flex flex-col gap-5">
            {isAdmin && <CloudModels />}
            <CloudSection />
          </div>
        </section>
      )}
      {isAdmin && (
        <details className={`${card} group`}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3">
            <span>
              <span className="block font-semibold">{t('models.advanced')}</span>
              <span className="block text-sm text-muted">{t('models.advancedHint')}</span>
            </span>
            <Chevron />
          </summary>
          <div className="mt-4 flex flex-col gap-5">
            <CatalogCheck />
            <div className="border-t border-line pt-4">
              <LocalServers />
            </div>
          </div>
        </details>
      )}
    </>
  );
}

function Chevron() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-muted transition-transform group-open:rotate-180"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** Everyone: the model their own new chats start with (or the family's default). */
function MyModel() {
  const { t, language } = useI18n();
  const me = useMe().data;
  const models = useModels().data;
  const update = useUpdateMe();
  const [saved, setSaved] = useState(false);
  if (!me || !models) return null;
  const familyDefault = models.chatModels.find((m) => m.id === models.defaultChatModel);
  const value =
    me.defaultModelId && models.chatModels.some((m) => m.id === me.defaultModelId)
      ? me.defaultModelId
      : '';
  return (
    <section className={`${card} flex flex-wrap items-center justify-between gap-4`}>
      <div className="min-w-0 flex-1">
        <label htmlFor="my-model" className="block font-semibold">
          {t('settings.defaultModel')}
        </label>
        <span className="block text-sm text-muted">{t('models.mineHint')}</span>
        {saved && (
          <span role="status" className="block text-sm text-ok">
            {t('settings.saved')}
          </span>
        )}
      </div>
      <select
        id="my-model"
        name="defaultModel"
        value={value}
        disabled={update.isPending}
        onChange={(e) => {
          setSaved(false);
          update.mutate(
            { defaultModelId: e.target.value === '' ? null : e.target.value },
            {
              onSuccess: () => {
                setSaved(true);
              },
            },
          );
        }}
        className={`${select} max-w-full`}
      >
        <option value="">
          {familyDefault
            ? t('models.familyDefaultOption', { model: modelLabel(familyDefault, language) })
            : t('models.familyDefault')}
        </option>
        {models.chatModels.map((m) => (
          <option key={m.id} value={m.id}>
            {modelLabel(m, language)}
          </option>
        ))}
      </select>
    </section>
  );
}

/** The request that saves the family's models with one change applied. */
function nextSettings(
  data: AdminModelsResponse,
  change: { id: string; on: boolean } | { defaultChat: string },
) {
  const off = new Set(data.models.filter((m) => m.available && !m.enabled).map((m) => m.id));
  let defaultChat = data.defaultChatModel;
  let defaultImage = data.defaultImageModel;
  if ('defaultChat' in change) {
    defaultChat = change.defaultChat;
    off.delete(change.defaultChat);
  } else {
    if (change.on) off.delete(change.id);
    else off.add(change.id);
    const images = data.models.filter((m) => m.kind === 'image' && m.available && !off.has(m.id));
    if (!images.some((m) => m.id === defaultImage)) defaultImage = images[0]?.id ?? null;
  }
  return { disabled: [...off], defaultChatModel: defaultChat, defaultImageModel: defaultImage };
}

/** Admins: the one list of the family's models on this Mac. */
function FamilyModels({ onAdd }: { onAdd: () => void }) {
  const { t } = useI18n();
  const { data } = useAdminModels();
  const installed = useInstalledModels().data;
  const catalog = useCatalog().data;
  const update = useUpdateModels();
  const [menu, setMenu] = useState<string | null>(null);
  if (!data) return null;

  const local = data.models.filter((m) => m.available && !m.cloud);
  const save = (change: { id: string; on: boolean } | { defaultChat: string }) => {
    update.mutate(nextSettings(data, change));
  };

  return (
    <section aria-labelledby="family-models" className={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 id="family-models" className="font-display text-xl font-semibold">
          {t('models.familyTitle')}
        </h2>
        {installed && installed.diskFreeGiB !== null && (
          <span className="text-sm text-muted">
            {t('installed.free', { free: String(Math.round(installed.diskFreeGiB)) })}
          </span>
        )}
      </div>
      <p className="mb-2 text-sm text-muted">{t('models.familyHint')}</p>
      <ul className="divide-y divide-line border-t border-line">
        {local.map((m) => (
          <ModelRow
            key={m.id}
            model={m}
            data={data}
            installed={installed}
            catalog={catalog?.entries ?? []}
            menuOpen={menu === m.id}
            onMenu={() => {
              setMenu((cur) => (cur === m.id ? null : m.id));
            }}
            onToggle={(on) => {
              save({ id: m.id, on });
            }}
            onMakeDefault={() => {
              setMenu(null);
              save({ defaultChat: m.id });
            }}
            busy={update.isPending}
          />
        ))}
      </ul>
      {update.error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {t('error.generic')}
        </p>
      )}
      <PicturesSetup />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <button
          type="button"
          onClick={onAdd}
          className="flex min-h-11 items-center gap-2 rounded-xl border-[1.5px] border-forest px-4 font-semibold text-forest hover:bg-champagne"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          {t('models.add')}
        </button>
      </div>
      <NotOffered data={data} />
    </section>
  );
}

function ModelRow({
  model: m,
  data,
  installed,
  catalog,
  menuOpen,
  onMenu,
  onToggle,
  onMakeDefault,
  busy,
}: {
  model: AdminModel;
  data: AdminModelsResponse;
  installed: InstalledModelsResponse | undefined;
  catalog: readonly CatalogItem[];
  menuOpen: boolean;
  onMenu: () => void;
  onToggle: (on: boolean) => void;
  onMakeDefault: () => void;
  busy: boolean;
}) {
  const { t, language } = useI18n();
  const remove = useRemoveModel();
  const del = useDeleteModel();
  const [confirm, setConfirm] = useState(false);
  const name = modelLabel(m, language);
  const isDefault = m.kind === 'chat' && m.id === data.defaultChatModel;
  const disk = installed?.models.find((x) => x.offeredId === m.id);
  const entry = m.engineModel ? catalog.find((e) => e.ollamaModel === m.engineModel) : undefined;
  const facts = [
    entry?.vision ? t('models.seesPictures') : null,
    entry?.tools ? t('models.usesTools') : null,
    disk ? t('models.size', { size: String(Math.round(disk.sizeGiB)) }) : null,
  ].filter((x): x is string => x !== null);
  const canDefault = m.kind === 'chat' && !isDefault && m.installed;
  const hasMenu = canDefault || disk !== undefined || m.custom;

  return (
    <li className="py-2">
      <div className="flex min-h-12 items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{name}</span>
            {isDefault && (
              <span className="rounded-full bg-forest px-2 py-0.5 text-xs font-semibold text-on-forest">
                {t('models.familyDefault')}
              </span>
            )}
            {m.kind === 'image' && (
              <span className="rounded-full bg-champagne px-2 py-0.5 text-xs font-semibold text-on-champagne">
                {t('models.makesPictures')}
              </span>
            )}
          </p>
          {!m.installed ? (
            <p className="text-sm text-danger">{t('admin.notInstalled')}</p>
          ) : (
            facts.length > 0 && <p className="text-sm text-muted">{facts.join(' · ')}</p>
          )}
        </div>
        <input
          type="checkbox"
          role="switch"
          name={`model-${m.id}`}
          aria-label={t('models.offer', { model: name })}
          title={isDefault ? t('models.defaultStaysOn') : undefined}
          checked={m.enabled}
          disabled={busy || isDefault}
          onChange={(e) => {
            onToggle(e.target.checked);
          }}
          className={switchClass}
        />
        {hasMenu ? (
          <button
            type="button"
            aria-label={t('models.more', { model: name })}
            aria-expanded={menuOpen}
            onClick={() => {
              setConfirm(false);
              del.reset();
              onMenu();
            }}
            className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${
              menuOpen ? 'bg-champagne text-ink' : 'text-muted hover:bg-champagne'
            }`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
          </button>
        ) : (
          <span className="size-11 shrink-0" aria-hidden="true" />
        )}
      </div>
      {menuOpen && (
        <div className="mt-1 ml-auto flex w-full max-w-xs flex-col rounded-2xl border border-line bg-card p-1.5 shadow-lg">
          {canDefault && (
            <button
              type="button"
              onClick={onMakeDefault}
              className="min-h-11 rounded-xl px-3 text-left font-semibold hover:bg-champagne"
            >
              {t('models.makeDefault')}
            </button>
          )}
          {m.custom && (
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate(m.id);
              }}
              className="min-h-11 rounded-xl px-3 text-left hover:bg-champagne"
            >
              {t('models.removeFromList')}
            </button>
          )}
          {disk &&
            (confirm ? (
              <div className="flex flex-col gap-2 p-2">
                <span className="text-sm">{t('installed.confirm', { model: name })}</span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    disabled={del.isPending}
                    onClick={() => {
                      del.mutate(disk.model);
                    }}
                    className="min-h-11 rounded-xl bg-danger px-3 text-sm font-semibold text-card disabled:opacity-50"
                  >
                    {t('installed.delete')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirm(false);
                    }}
                    className={quietButton}
                  >
                    {t('installed.cancel')}
                  </button>
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setConfirm(true);
                }}
                className="min-h-11 rounded-xl px-3 text-left font-semibold text-danger hover:bg-danger-soft"
              >
                {t('models.deleteFrees', { size: String(Math.round(disk.sizeGiB)) })}
              </button>
            ))}
          {del.error && (
            <p role="alert" className="px-3 pb-2 text-sm text-danger">
              {deleteError(del.error, t)}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/** Installed in Ollama or on a local server, not offered: closed, one "Offer" each. */
function NotOffered({ data }: { data: AdminModelsResponse }) {
  const { t } = useI18n();
  const add = useAddModel();
  const del = useDeleteModel();
  const installed = useInstalledModels().data;
  if (data.installedNotOffered.length === 0) return null;
  return (
    <details className="mt-2">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm text-muted">
        {t('models.notOffered', { n: String(data.installedNotOffered.length) })}
      </summary>
      <ul className="divide-y divide-line">
        {data.installedNotOffered.map((m) => {
          const ollama = m.engine === 'ollama';
          const name = ollama ? prettyModelName(m.engineModel) : m.engineModel;
          const onDisk = ollama && installed?.models.some((x) => x.model === m.engineModel);
          return (
            <li
              key={`${m.engine}/${m.engineModel}`}
              className="flex min-h-12 flex-wrap items-center justify-between gap-2 py-1"
            >
              <span className="min-w-0">
                <span className="block font-semibold">{name}</span>
                <span className="block text-sm text-muted">
                  {m.engineLabel ?? `${m.engineModel} · ${String(Math.round(m.sizeGiB))} GB`}
                </span>
              </span>
              <span className="flex gap-2">
                {onDisk && (
                  <button
                    type="button"
                    disabled={del.isPending}
                    onClick={() => {
                      del.mutate(m.engineModel);
                    }}
                    className="min-h-11 rounded-xl px-3 text-sm text-muted hover:text-danger"
                  >
                    {t('installed.delete')}
                  </button>
                )}
                <button
                  type="button"
                  disabled={add.isPending}
                  onClick={() => {
                    add.mutate({
                      engineModel: m.engineModel,
                      label: name.slice(0, 60),
                      engine: m.engine,
                      vision: false,
                      tools: false,
                    });
                  }}
                  className={quietButton}
                >
                  {t('models.offerButton')}
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {add.isPending && (
        <p role="status" className="mt-2 text-sm text-muted">
          {t('admin.checking', { model: add.variables.engineModel })}
        </p>
      )}
      {add.error instanceof ApiError && add.error.code === 'model_unsupported' && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {t('admin.modelUnsupported', { model: add.variables?.engineModel ?? '' })}
        </p>
      )}
      {del.error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {deleteError(del.error, t)}
        </p>
      )}
    </details>
  );
}

/** Off / Adults / Everyone, saved at once. */
function ModeSwitch({
  label,
  hint,
  value,
  onChange,
  busy,
  extra,
}: {
  label: string;
  hint: string;
  value: WebSearchMode;
  onChange: (m: WebSearchMode) => void;
  busy: boolean;
  extra?: ReactNode;
}) {
  const { t } = useI18n();
  const options: { mode: WebSearchMode; key: MessageKey }[] = [
    { mode: 'off', key: 'models.modeOff' },
    { mode: 'adults', key: 'models.modeAdults' },
    { mode: 'all', key: 'models.modeAll' },
  ];
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-56 flex-1">
        <span className="block font-semibold">{label}</span>
        <span className="block text-sm text-muted">{hint}</span>
        {extra}
      </div>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex rounded-xl border border-line bg-paper p-[3px]"
      >
        {options.map((o) => (
          <button
            key={o.mode}
            type="button"
            role="radio"
            aria-checked={value === o.mode}
            disabled={busy}
            onClick={() => {
              if (value !== o.mode) onChange(WebSearchMode.parse(o.mode));
            }}
            className={`min-h-10 rounded-[9px] px-3.5 text-sm font-semibold ${
              value === o.mode ? 'bg-forest text-on-forest' : 'text-muted hover:text-ink'
            }`}
          >
            {t(o.key)}
          </button>
        ))}
      </div>
    </div>
  );
}

function CloudRule() {
  const { t } = useI18n();
  const { data } = useAdminModels();
  const cloud = useCloudMode();
  if (!data) return null;
  return (
    <ModeSwitch
      label={t('models.cloudRule')}
      hint={t('admin.cloudHint')}
      value={data.cloud}
      onChange={(m) => {
        cloud.mutate(m);
      }}
      busy={cloud.isPending}
    />
  );
}

/** Admins: who may use web search (and cloud AI, when it isn't in its own closed section). */
function Rules({ showCloud }: { showCloud: boolean }) {
  const { t } = useI18n();
  const { data } = useAdminModels();
  const caps = useCapabilities().data;
  const webSearch = useWebSearchMode();
  if (!data) return null;
  return (
    <section aria-labelledby="model-rules" className={`${card} flex flex-col gap-5`}>
      <h2 id="model-rules" className="font-display text-xl font-semibold">
        {t('models.rules')}
      </h2>
      {caps?.webSearch === false && <SearchSetup />}
      <ModeSwitch
        label={t('admin.webSearch')}
        hint={t('admin.webSearchHint')}
        value={data.webSearch}
        onChange={(m) => {
          webSearch.mutate(m);
        }}
        busy={webSearch.isPending}
      />
      {showCloud && <CloudRule />}
      <p className="text-xs text-muted">{t('models.savesAtOnce')}</p>
    </section>
  );
}

/** Admins: which cloud models the family's list offers (each person still needs a key). */
function CloudModels() {
  const { t, language } = useI18n();
  const { data } = useAdminModels();
  const update = useUpdateModels();
  const cloud = data?.models.filter((m) => m.available && m.cloud) ?? [];
  if (!data || cloud.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold text-muted">{t('models.cloudModels')}</h3>
      <ul className="divide-y divide-line">
        {cloud.map((m) => {
          const name = modelLabel(m, language);
          return (
            <li key={m.id} className="flex min-h-12 items-center justify-between gap-3">
              <span className="font-medium">{name}</span>
              <input
                type="checkbox"
                role="switch"
                aria-label={t('models.offer', { model: name })}
                checked={m.enabled}
                disabled={update.isPending}
                onChange={(e) => {
                  update.mutate(nextSettings(data, { id: m.id, on: e.target.checked }));
                }}
                className={switchClass}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** "Not set up" or "Your keys: Claude (Anthropic)", under the closed Cloud AI heading. */
function CloudSummary() {
  const { t } = useI18n();
  const { data } = useCloudSettings();
  if (!data) return null;
  if (!data.allowed)
    return <span className="block text-sm text-muted">{t('cloud.notAllowed')}</span>;
  const names = data.keys.map((k) => {
    const key = PROVIDER_NAMES[k.provider];
    return key ? t(key) : k.provider;
  });
  return (
    <span className="block text-sm text-muted">
      {names.length === 0
        ? t('models.cloudNone')
        : t('models.cloudKeys', { providers: names.join(', ') })}
    </span>
  );
}
