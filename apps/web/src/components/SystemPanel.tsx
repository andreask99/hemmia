import { useSystemStatus } from '../settings/hooks.ts';
import { type MessageKey, useI18n } from '../i18n/index.tsx';
import { widthClass } from '@hemmia/ui';
import { RemoteAccess } from './RemoteAccess.tsx';

/**
 * Fill widths in 5% steps as literal classes (Tailwind only generates classes it sees, and
 * inline styles are not allowed). The exact numbers are shown next to the meter.
 */
const OUTCOMES: Record<string, MessageKey> = {
  'nothing-to-do': 'system.outcome.nothing-to-do',
  updated: 'system.outcome.updated',
  'rolled-back': 'system.outcome.rolled-back',
  'skipped-busy': 'system.outcome.skipped-busy',
  failed: 'system.outcome.failed',
};

/** 1.3 GB, or 420 MB below one gigabyte. */
const gb = (bytes: number) =>
  bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
    : `${String(Math.round(bytes / 1024 ** 2))} MB`;

function Meter({
  label,
  used,
  total,
  warnAt = 0.8,
}: {
  label: string;
  used: number;
  total: number;
  warnAt?: number;
}) {
  const { t } = useI18n();
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const isWarn = total > 0 && used / total >= warnAt;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span>
          {t('system.ofTotal', { used: gb(used), total: gb(total) })}
          {isWarn && <span className="text-warn"> ⚠ {t('system.high')}</span>}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-champagne"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={used}
      >
        <div
          className={`h-full rounded-full ${widthClass(pct)} ${isWarn ? 'bg-warn' : 'bg-forest'}`}
        />
      </div>
    </div>
  );
}

export function SystemPanel() {
  const { data, isLoading } = useSystemStatus();
  const { t } = useI18n();

  if (isLoading || !data) return null;

  const status = data;

  return (
    <div className="flex flex-col gap-5">
      <RemoteAccess />
      {/* Memory and Swap */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-muted">Mac</h3>
        <div className="flex flex-col gap-3">
          <Meter
            label={t('system.memory')}
            used={status.mac.usedBytes}
            total={status.mac.totalBytes}
            warnAt={0.8}
          />
          {status.mac.swapTotalBytes > 0 && (
            <Meter
              label={t('system.swap')}
              used={status.mac.swapUsedBytes}
              total={status.mac.swapTotalBytes}
              warnAt={0.8}
            />
          )}
        </div>
        <div className="mt-3 text-sm">
          {t('system.cpu')}: {Math.round(status.mac.cpuLoad * 100)}%
        </div>
        {status.keepAwake && <p className="mt-1 text-sm text-muted">{t('system.keepAwake')}</p>}
        {status.update?.belowMinimum && (
          <p role="alert" className="mt-2 text-sm font-semibold text-danger">
            {t('system.updateUnsafe')}
          </p>
        )}
        {status.update?.version && status.update.url && (
          <p
            role="status"
            className="mt-2 rounded-xl bg-champagne px-3 py-2 text-sm text-on-champagne"
          >
            {t('system.update', { version: status.update.version })}{' '}
            <a
              href={status.update.url}
              target="_blank"
              rel="noreferrer"
              className="font-semibold underline"
            >
              {t('system.updateLink')}
            </a>
          </p>
        )}
      </div>

      {/* Models */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-muted">{t('system.models')}</h3>
        {status.models.length === 0 ? (
          <p className="text-sm text-muted">{t('system.noModels')}</p>
        ) : (
          <ul className="space-y-2">
            {status.models.map((model) => {
              const minutes = model.unloadsAt
                ? Math.ceil((model.unloadsAt - status.at) / 60000)
                : null;

              return (
                <li key={model.model} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-mono">{model.model}</span>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        model.kchat
                          ? 'bg-champagne text-on-champagne'
                          : 'border border-line text-muted'
                      }`}
                    >
                      {model.kchat ? t('system.kchat') : t('system.other')}
                    </span>
                    <span>{gb(model.memoryBytes)}</span>
                    {minutes !== null && (
                      <span className="text-xs text-muted">
                        {minutes > 0 ? t('system.unloadsIn', { minutes }) : t('system.unloadsSoon')}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Activity */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-muted">{t('system.activity')}</h3>
        <p className="text-sm">
          {status.activity.paused
            ? t('system.paused')
            : status.activity.running
              ? t(
                  status.activity.running.kind === 'chat'
                    ? 'system.runningChat'
                    : 'system.runningImage',
                  {
                    model: status.activity.running.model,
                    seconds: Math.max(
                      0,
                      Math.round((status.at - status.activity.running.startedAt) / 1000),
                    ),
                  },
                )
              : t('system.idle')}
          {status.activity.queued > 0 &&
            ` · ${t('system.queued', { count: status.activity.queued })}`}
        </p>
      </div>

      {/* Services */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-muted">{t('system.services')}</h3>
        <ul className="space-y-1">
          <li className="flex items-center justify-between gap-3 text-sm">
            <span>{t('system.ollama')}</span>
            <span className={status.services.ollama ? 'text-ok' : 'text-danger'}>
              {status.services.ollama ? '● ' : '✕ '}
              {status.services.ollama ? t('system.up') : t('system.down')}
            </span>
          </li>
          <li className="flex items-center justify-between gap-3 text-sm">
            <span>{t('system.searxng')}</span>
            <span className={status.services.searxng ? 'text-ok' : 'text-danger'}>
              {status.services.searxng ? '● ' : '✕ '}
              {status.services.searxng ? t('system.up') : t('system.down')}
            </span>
          </li>
          <li className="flex items-center justify-between gap-3 text-sm">
            <span>{t('system.imageWorker')}</span>
            <span className={status.services.imageWorker === 'busy' ? 'text-ok' : 'text-muted'}>
              {status.services.imageWorker === 'busy'
                ? t('system.imageWorkerBusy')
                : t('system.imageWorkerIdle')}
            </span>
          </li>
        </ul>
      </div>

      {/* Disk */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-muted">{t('system.disk')}</h3>
        <ul className="space-y-1">
          <li className="flex items-center justify-between gap-3 text-sm">
            <span>{t('system.diskData')}</span>
            <span>{status.disk.data !== null ? gb(status.disk.data) : t('system.measuring')}</span>
          </li>
          <li className="flex items-center justify-between gap-3 text-sm">
            <span>{t('system.diskImageModels')}</span>
            <span>
              {status.disk.imageModels !== null
                ? gb(status.disk.imageModels)
                : t('system.measuring')}
            </span>
          </li>
          <li className="flex items-center justify-between gap-3 text-sm">
            <span>{t('system.diskChatModels')}</span>
            <span>
              {status.disk.chatModels !== null ? gb(status.disk.chatModels) : t('system.measuring')}
            </span>
          </li>
        </ul>
      </div>

      {/* Last 24 hours */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-muted">{t('system.last24h')}</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-line bg-paper p-3">
            <div className="text-2xl font-semibold">{status.last24h.replies}</div>
            <div className="text-xs text-muted">{t('system.replies')}</div>
          </div>
          <div className="rounded-xl border border-line bg-paper p-3">
            <div className="text-2xl font-semibold">{status.last24h.pictures}</div>
            <div className="text-xs text-muted">{t('system.pictures')}</div>
          </div>
          <div className="rounded-xl border border-line bg-paper p-3">
            <div className="text-2xl font-semibold">{status.last24h.searches}</div>
            <div className="text-xs text-muted">{t('system.searches')}</div>
          </div>
          <div className="rounded-xl border border-line bg-paper p-3">
            <div className="text-2xl font-semibold">{status.last24h.activeUsers}</div>
            <div className="text-xs text-muted">{t('system.activeUsers')}</div>
          </div>
        </div>
      </div>

      {/* Monthly maintenance */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-muted">{t('system.maintenance')}</h3>
        {status.maintenance ? (
          <div className="flex flex-col gap-1 text-sm">
            <p className={status.maintenance.ok ? '' : 'text-danger'}>
              {status.maintenance.ok ? '✓ ' : '⚠ '}
              {t(OUTCOMES[status.maintenance.outcome] ?? 'system.outcome.failed')}
              <span className="text-muted">
                {' · '}
                {new Date(status.maintenance.at).toLocaleDateString()}
              </span>
            </p>
            {status.maintenance.steps.map((s) => (
              <p key={s.component} className="text-xs text-muted">
                {s.component}: {s.from} → {s.to}
              </p>
            ))}
            {status.maintenance.held && (
              <p className="text-xs text-muted">
                {t('system.held', { what: status.maintenance.held })}
              </p>
            )}
            <p className="text-xs text-muted">{t('system.maintenanceNext')}</p>
          </div>
        ) : (
          <p className="text-sm text-muted">{t('system.maintenanceNever')}</p>
        )}
      </div>

      <p className="text-xs text-muted">{t('system.noContent')}</p>
    </div>
  );
}
