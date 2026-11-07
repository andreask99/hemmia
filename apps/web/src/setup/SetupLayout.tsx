import { type ReactNode } from 'react';
import { Logo } from '@hemmia/ui';
import { type MessageKey, useT } from '../i18n/index.tsx';

const STEP_KEYS: readonly MessageKey[] = [
  'setup.step1',
  'setup.step2',
  'setup.step3',
  'setup.step4',
  'setup.step5',
  'setup.step6',
];

export function SetupLayout({ step, children }: { step: number; children: ReactNode }) {
  const t = useT();

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-paper px-5 py-10">
      <div className="flex w-full max-w-4xl flex-col gap-8">
        <div className="flex items-center gap-2.5 md:pl-2">
          <Logo size={40} />
          <span className="font-display text-2xl font-semibold text-ink">Hemmia</span>
        </div>
        <div className="flex w-full flex-col gap-8 md:flex-row">
          <ol className="hidden md:block md:w-1/4 md:flex-shrink-0 md:pl-2">
            {Array.from({ length: 6 }, (_, i) => i + 1).map((n) => (
              <li
                key={n}
                className={`flex items-center gap-2 py-3 text-sm font-medium ${
                  n < step ? 'text-ink' : n === step ? 'font-semibold text-ink' : 'text-muted'
                }`}
                aria-current={n === step ? 'step' : undefined}
              >
                {n < step ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-forest text-on-forest text-xs">
                    ✓
                  </span>
                ) : null}
                <span>{t(STEP_KEYS[n - 1] ?? 'setup.step1')}</span>
              </li>
            ))}
          </ol>
          <p className="md:hidden">{t('setup.stepOf', { n: String(step) })}</p>
          <div className="flex-1 max-w-2xl">{children}</div>
        </div>
      </div>
    </div>
  );
}
