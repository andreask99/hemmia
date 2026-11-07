import { useEffect, useRef, useState } from 'react';
import { PullEvent } from '@hemmia/shared';
import { followTypedEvents } from '../api/stream.ts';
import { type TFunction, useI18n } from '../i18n/index.tsx';
import { Button, widthClass } from '@hemmia/ui';

const gb = (bytes: number) => (bytes / 1e9).toFixed(1);

function errorText(code: Extract<PullEvent, { type: 'error' }>['code'], t: TFunction): string {
  switch (code) {
    case 'disk_full':
      return t('pull.errorDisk');
    case 'not_found':
      return t('pull.errorNotFound');
    case 'cancelled':
      return t('pull.cancelled');
    default:
      return t('pull.errorFailed');
  }
}

/** Progress of one model download, from its event stream, with Cancel. */
export function ModelPull({
  pullId,
  onFinished,
}: {
  pullId: string;
  onFinished: (outcome: 'done' | 'error') => void;
}) {
  const { t } = useI18n();
  const [last, setLast] = useState<PullEvent | null>(null);
  // The latest callback, without restarting the stream when the parent re-renders.
  const finished = useRef(onFinished);
  useEffect(() => {
    finished.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    const ctrl = new AbortController();
    void (async () => {
      try {
        for await (const e of followTypedEvents(
          `/admin/models/pulls/${pullId}/events`,
          PullEvent,
          ctrl.signal,
        )) {
          setLast(e);
          if (e.type === 'done') finished.current('done');
          if (e.type === 'error') finished.current('error');
        }
      } catch {
        if (!ctrl.signal.aborted) {
          setLast({ type: 'error', code: 'failed' });
          finished.current('error');
        }
      }
    })();
    return () => {
      ctrl.abort();
    };
  }, [pullId]);

  if (last?.type === 'error') {
    return (
      <p role="alert" className="mt-2 text-sm text-danger">
        {errorText(last.code, t)}
      </p>
    );
  }
  const completed = last?.type === 'progress' ? last.completed : 0;
  const total = last?.type === 'progress' ? last.total : 0;
  const pct = total > 0 ? Math.floor((completed * 100) / total) : 0;
  return (
    <div className="mt-2 space-y-1">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-2 w-full overflow-hidden rounded-full bg-champagne"
      >
        <div className={`h-full rounded-full bg-forest ${widthClass(pct)}`} />
      </div>
      <div className="flex items-center justify-between gap-2 text-sm text-muted">
        <span>{t('pull.progress', { done: gb(completed), total: gb(total) })}</span>
        <Button
          variant="secondary"
          onClick={() => {
            void fetch(`/api/admin/models/pulls/${pullId}`, {
              method: 'DELETE',
              credentials: 'same-origin',
            });
          }}
        >
          {t('pull.cancel')}
        </Button>
      </div>
    </div>
  );
}
