/**
 * The bar above the demo: says it is a demo with a made-up family, offers the way out, and
 * briefly explains when something needs a real hub (the server refused it).
 */
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.tsx';
import { demoEvents } from './events.ts';

const TEXT = {
  en: {
    label: 'Demo · the Berg family is made up',
    refused: 'Not in the demo: that needs your own hub',
    leave: 'Leave demo',
  },
  de: {
    label: 'Demo · Familie Berg ist erfunden',
    refused: 'Nicht in der Demo: Dafür brauchst du deinen eigenen Hub',
    leave: 'Demo beenden',
  },
} as const;

export function DemoBar({ onLeave }: { onLeave: () => void }) {
  const { language } = useI18n();
  const text = TEXT[language];
  const [refused, setRefused] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onRefused = () => {
      setRefused(true);
      clearTimeout(timer);
      timer = setTimeout(() => {
        setRefused(false);
      }, 3500);
    };
    demoEvents.addEventListener('refused', onRefused);
    return () => {
      demoEvents.removeEventListener('refused', onRefused);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div
      className={`pt-[env(safe-area-inset-top)] transition-colors ${refused ? 'bg-champagne text-on-champagne' : 'bg-forest text-on-forest'}`}
    >
      <div className="flex h-[var(--demo-bar)] items-center gap-3 px-4">
        <p role="status" className="min-w-0 flex-1 truncate text-sm font-medium">
          {refused ? text.refused : text.label}
        </p>
        <button
          type="button"
          onClick={onLeave}
          className={`min-h-8 shrink-0 rounded-full px-3 text-sm font-semibold ${refused ? 'bg-forest text-on-forest' : 'bg-on-forest/15'}`}
        >
          {text.leave}
        </button>
      </div>
    </div>
  );
}
