/**
 * Shown instead of the web app when the phone app's shell is older than this hub supports
 * (version handshake, PLAN.md P5.11). The shell checks this before it opens a hub; this
 * covers a hub that was updated while the app stayed open.
 */
import { useT } from '../i18n/index.tsx';
import type { NativeBridge } from './bridge.ts';

export function AppOutdated({ native }: { native: NativeBridge }) {
  const t = useT();
  return (
    <main className="min-h-screen bg-paper text-ink flex flex-col gap-4 p-6">
      <h1 className="mt-16 font-display text-xl font-semibold text-center">
        {t('appOutdated.title')}
      </h1>
      <p className="text-sm text-muted text-center">{t('appOutdated.text')}</p>
      <button
        onClick={() => {
          native.switchHub();
        }}
        className="mt-6 w-full min-h-[52px] rounded-xl bg-paper border border-line text-ink font-semibold text-base"
      >
        {t('appOutdated.switch')}
      </button>
    </main>
  );
}
