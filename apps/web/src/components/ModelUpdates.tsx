import { useEffect, useState } from 'react';
import type { ModelUpdateItem } from '@hemmia/shared';
import { ApiError } from '../api/client.ts';
import { type TFunction, useI18n } from '../i18n/index.tsx';
import {
  useDeleteModel,
  useDismissUpdate,
  useInstalledModels,
  useModelUpdates,
  useModelUpdatesSeen,
  useReplaceModel,
  useStartPull,
} from '../settings/hooks.ts';
import { ModelPull } from './ModelPull.tsx';
import { Button } from '@hemmia/ui';

function pullError(err: unknown, t: TFunction): string {
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
    default:
      return t('error.generic');
  }
}

interface Switched {
  from: string;
  to: string;
  kind: ModelUpdateItem['kind'];
}

/** One update: download (with progress), then move the family over. */
function UpdateCard({
  update,
  onSwitched,
}: {
  update: ModelUpdateItem;
  onSwitched: (s: Switched) => void;
}) {
  const { t, language } = useI18n();
  const startPull = useStartPull();
  const replace = useReplaceModel();
  const dismiss = useDismissUpdate();
  const [pullId, setPullId] = useState<string | null>(null);

  const switchOver = () => {
    replace.mutate(
      { from: update.from, to: update.to },
      {
        onSuccess: () => {
          onSwitched({ from: update.from, to: update.to, kind: update.kind });
        },
      },
    );
  };
  const busy = startPull.isPending || pullId !== null || replace.isPending;

  return (
    <li className="py-3">
      <p className="font-semibold">
        {update.kind === 'version'
          ? t('updates.version', { to: update.label[language], from: update.from })
          : t('updates.weights', { model: update.from })}
      </p>
      {!update.installed && (
        <p className="text-sm text-muted">
          {t('updates.size', { size: String(update.downloadGiB) })}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          disabled={busy}
          onClick={() => {
            if (update.installed) {
              switchOver();
              return;
            }
            startPull.mutate(update.to, {
              onSuccess: (r) => {
                setPullId(r.pullId);
              },
            });
          }}
        >
          {update.installed ? t('updates.switch') : t('updates.update')}
        </Button>
        <Button
          variant="secondary"
          disabled={busy || dismiss.isPending}
          onClick={() => {
            dismiss.mutate(update.key);
          }}
        >
          {t('updates.later')}
        </Button>
      </div>
      {pullId !== null && (
        <ModelPull
          pullId={pullId}
          onFinished={(outcome) => {
            setPullId(null);
            if (outcome === 'done') switchOver();
          }}
        />
      )}
      {replace.isPending && (
        <p role="status" className="mt-2 text-sm text-muted">
          {t('updates.switching')}
        </p>
      )}
      {startPull.error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {pullError(startPull.error, t)}
        </p>
      )}
      {replace.error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {t('updates.error')}
        </p>
      )}
    </li>
  );
}

/** After a switch to a new version: offer to delete the old one to free disk space. */
function SwitchedCard({ done }: { done: Switched }) {
  const { t } = useI18n();
  const installed = useInstalledModels();
  const remove = useDeleteModel();
  const [kept, setKept] = useState(false);
  const old = installed.data?.models.find((m) => m.model === done.from);
  return (
    <li className="py-3">
      <p role="status" className="text-sm text-ok">
        {t('updates.done', { model: done.to })}
      </p>
      {done.kind === 'version' && old && !kept && !remove.isSuccess && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sm">
            {t('updates.deleteOld', { model: done.from, size: String(old.sizeGiB) })}
          </span>
          <Button
            variant="secondary"
            disabled={remove.isPending}
            onClick={() => {
              remove.mutate(done.from);
            }}
          >
            {t('installed.delete')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setKept(true);
            }}
          >
            {t('updates.keep')}
          </Button>
        </div>
      )}
      {remove.isSuccess && (
        <p role="status" className="mt-1 text-sm text-muted">
          {t('updates.deleted', { model: done.from })}
        </p>
      )}
      {remove.error && (
        <p role="alert" className="mt-1 text-sm text-danger">
          {remove.error instanceof ApiError && remove.error.code === 'busy'
            ? t('installed.errorBusy')
            : t('error.generic')}
        </p>
      )}
    </li>
  );
}

/** Settings → Models: new versions of the models the family uses (P11.9). */
export function ModelUpdates() {
  const { t } = useI18n();
  const { data } = useModelUpdates();
  const seen = useModelUpdatesSeen();
  const [switched, setSwitched] = useState<Switched[]>([]);
  const unseen = data?.unseen === true;
  const markSeen = seen.mutate;
  useEffect(() => {
    // Opening Settings → Models clears the dot on Settings.
    if (unseen) markSeen();
  }, [unseen, markSeen]);

  const updates = data?.updates ?? [];
  if (updates.length === 0 && switched.length === 0) return null;
  return (
    <section aria-labelledby="model-updates" className="rounded-2xl bg-champagne/40 px-4 py-3">
      <h3 id="model-updates" className="text-sm font-semibold text-muted">
        {t('updates.title')}
      </h3>
      <ul className="divide-y divide-line">
        {switched.map((s) => (
          <SwitchedCard key={`${s.from}>${s.to}`} done={s} />
        ))}
        {updates.map((u) => (
          <UpdateCard
            key={u.key}
            update={u}
            onSwitched={(s) => {
              setSwitched((list) => [...list, s]);
            }}
          />
        ))}
      </ul>
    </section>
  );
}
