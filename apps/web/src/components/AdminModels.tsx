import { useState } from 'react';
import type { AdminModelsResponse } from '@hemmia/shared';
import { WebSearchMode } from '@hemmia/shared';
import { ApiError } from '../api/client.ts';
import { useI18n } from '../i18n/index.tsx';
import {
  useAddModel,
  useAdminModels,
  useRemoveModel,
  useUpdateModels,
  useWebSearchMode,
  useCloudMode,
  useCapabilities,
} from '../settings/hooks.ts';
import { Button } from '@hemmia/ui';
import { LocalServers } from './LocalServers.tsx';
import { SearchSetup } from './SearchSetup.tsx';
import { PicturesSetup } from './PicturesSetup.tsx';
import { ModelCatalog } from './ModelCatalog.tsx';

const select =
  'mt-1.5 min-h-12 w-full rounded-xl border border-line bg-paper px-3.5 text-base text-ink focus:border-forest focus:outline-none';

function Editor({ data }: { data: AdminModelsResponse }) {
  const { t, language } = useI18n();
  const update = useUpdateModels();
  const addModel = useAddModel();
  const removeModel = useRemoveModel();
  const webSearch = useWebSearchMode();
  const cloudMode = useCloudMode();
  const caps = useCapabilities().data;
  const [off, setOff] = useState(
    () => new Set(data.models.filter((m) => m.available && !m.enabled).map((m) => m.id)),
  );
  const [chatDefault, setChatDefault] = useState<string>(data.defaultChatModel ?? '');
  const [imageDefault, setImageDefault] = useState<string>(data.defaultImageModel ?? '');
  const [saved, setSaved] = useState(false);

  const available = data.models.filter((m) => m.available);
  // The family default is always a model on this Mac.
  const onChat = available.filter((m) => m.kind === 'chat' && !m.cloud && !off.has(m.id));
  const onImage = available.filter((m) => m.kind === 'image' && !off.has(m.id));
  const valid =
    (onChat.length === 0 ? chatDefault === '' : onChat.some((m) => m.id === chatDefault)) &&
    (imageDefault === '' || onImage.some((m) => m.id === imageDefault));

  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y divide-line">
        {available.map((m) => (
          <li key={m.id} className="flex min-h-12 items-center justify-between gap-3 py-1">
            <span className="min-w-0">
              <span className="block truncate font-medium">{m.label[language]}</span>
              {!m.installed && (
                <span className="text-xs text-danger">{t('admin.notInstalled')}</span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {m.custom && (
                <button
                  type="button"
                  onClick={() => {
                    removeModel.mutate(m.id);
                  }}
                  className="min-h-11 rounded-xl px-3 text-sm text-danger hover:bg-danger-soft"
                >
                  {t('admin.remove')}
                </button>
              )}
              <label className="flex min-h-11 items-center gap-2 px-2 text-sm">
                <input
                  name={`model-${m.id}`}
                  type="checkbox"
                  checked={!off.has(m.id)}
                  onChange={(e) => {
                    const next = new Set(off);
                    if (e.target.checked) next.delete(m.id);
                    else next.add(m.id);
                    setOff(next);
                    setSaved(false);
                  }}
                  className="h-5 w-5 accent-[var(--forest)]"
                />
                {t('admin.modelOn')}
              </label>
            </span>
          </li>
        ))}
      </ul>
      <label className="block text-sm font-medium text-muted">
        {t('admin.defaultChat')}
        <select
          name="defaultChatModel"
          className={select}
          value={chatDefault}
          onChange={(e) => {
            setChatDefault(e.target.value);
            setSaved(false);
          }}
        >
          {onChat.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label[language]}
            </option>
          ))}
        </select>
      </label>
      {caps?.images === false ? (
        <p className="text-sm text-muted">
          <span className="block font-medium">{t('admin.defaultImage')}</span>
          {t('admin.imagesUnavailable')}
        </p>
      ) : (
        <label className="block text-sm font-medium text-muted">
          {t('admin.defaultImage')}
          <select
            name="defaultImageModel"
            className={select}
            value={imageDefault}
            onChange={(e) => {
              setImageDefault(e.target.value);
              setSaved(false);
            }}
          >
            {onImage.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label[language]}
              </option>
            ))}
            <option value="">{t('admin.imagesOff')}</option>
          </select>
        </label>
      )}
      {caps?.webSearch === false && <SearchSetup />}
      <label className="block text-sm font-medium text-muted">
        {t('admin.webSearch')}
        <select
          name="webSearch"
          className={select}
          value={data.webSearch}
          onChange={(e) => {
            const result = WebSearchMode.safeParse(e.target.value);
            if (result.success) {
              webSearch.mutate(result.data);
            }
          }}
        >
          <option value="off">{t('admin.webSearchOff')}</option>
          <option value="adults">{t('admin.webSearchAdults')}</option>
          <option value="all">{t('admin.webSearchAll')}</option>
        </select>
      </label>
      <p className="-mt-2 text-xs text-muted">{t('admin.webSearchHint')}</p>
      <label className="block text-sm font-medium text-muted">
        {t('admin.cloud')}
        <select
          name="cloud"
          className={select}
          value={data.cloud}
          onChange={(e) => {
            const result = WebSearchMode.safeParse(e.target.value);
            if (result.success) {
              cloudMode.mutate(result.data);
            }
          }}
        >
          <option value="off">{t('admin.cloudOff')}</option>
          <option value="adults">{t('admin.cloudAdults')}</option>
          <option value="all">{t('admin.cloudAll')}</option>
        </select>
      </label>
      <p className="-mt-2 text-xs text-muted">{t('admin.cloudHint')}</p>
      <div className="flex items-center gap-3">
        <Button
          disabled={!valid || update.isPending}
          onClick={() => {
            update.mutate(
              {
                disabled: [...off],
                defaultChatModel: chatDefault === '' ? null : chatDefault,
                defaultImageModel: imageDefault === '' ? null : imageDefault,
              },
              {
                onSuccess: () => {
                  setSaved(true);
                },
              },
            );
          }}
        >
          {t('admin.saveModels')}
        </Button>
        {saved && (
          <span role="status" className="text-sm text-ok">
            {t('settings.saved')}
          </span>
        )}
      </div>

      <div className="border-t border-line pt-4">
        <ModelCatalog />
      </div>

      <PicturesSetup />

      {data.installedNotOffered.length > 0 && (
        <div className="border-t border-line pt-4">
          <h3 className="mb-2 text-sm font-semibold text-muted">{t('admin.installed')}</h3>
          <ul className="divide-y divide-line">
            {data.installedNotOffered.map((m) => (
              <li
                key={`${m.engine}/${m.engineModel}`}
                className="flex min-h-12 items-center justify-between gap-3"
              >
                <span className="min-w-0 truncate font-mono text-sm">
                  {m.engineModel}{' '}
                  <span className="text-muted">· {m.engineLabel ?? `${String(m.sizeGiB)} GB`}</span>
                </span>
                <Button
                  variant="secondary"
                  disabled={addModel.isPending}
                  onClick={() => {
                    const label = window.prompt(t('admin.labelPrompt'), m.engineModel)?.trim();
                    if (label) {
                      addModel.mutate({
                        engineModel: m.engineModel,
                        label,
                        engine: m.engine,
                        vision: false,
                        tools: false,
                      });
                    }
                  }}
                >
                  {t('admin.add')}
                </Button>
              </li>
            ))}
          </ul>
          {addModel.isPending && (
            <p role="status" className="mt-2 text-sm text-muted">
              {t('admin.checking', { model: addModel.variables.engineModel })}
            </p>
          )}
          {addModel.error instanceof ApiError && addModel.error.code === 'model_unsupported' && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {t('admin.modelUnsupported', { model: addModel.variables?.engineModel ?? '' })}
            </p>
          )}
        </div>
      )}

      <div className="border-t border-line pt-4">
        <LocalServers />
      </div>
    </div>
  );
}

export function AdminModels() {
  const { data } = useAdminModels();
  return data ? <Editor data={data} /> : null;
}
