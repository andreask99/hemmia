import { useEffect, useState } from 'react';
import { useUiText } from './text.tsx';
import { widthClass } from './ui.tsx';

/**
 * Progress while a model loads. The engine reports no progress, so the bar follows the
 * expected load time and waits at 95% until the model answers.
 */
export function LoadingBar({ since, expectedMs }: { since: number; expectedMs: number }) {
  const t = useUiText();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 250);
    return () => {
      clearInterval(timer);
    };
  }, []);
  const elapsed = Math.max(0, now - since);
  const pct = Math.min(95, (elapsed / expectedMs) * 100);
  const left = Math.ceil((expectedMs - elapsed) / 1000);
  return (
    <div className="flex items-center gap-3 text-xs text-muted">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className="h-1.5 w-40 overflow-hidden rounded-full bg-line"
      >
        <div
          className={`h-full rounded-full bg-forest transition-[width] duration-300 ${widthClass(pct)}`}
        />
      </div>
      <span>{left > 0 ? t('chat.loadingLeft', { seconds: left }) : t('chat.loadingAlmost')}</span>
    </div>
  );
}
