import { Button } from '@hemmia/ui';
import { useI18n } from '../i18n/index.tsx';
import { SignInDevice } from '../components/SignInDevice.tsx';
import { useRemoteStatus } from '../settings/hooks.ts';

export function StepPhone(props: { username: string; onDone: () => void }) {
  const { t } = useI18n();
  const remote = useRemoteStatus();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-display text-ink">{t('setup.phoneTitle')}</h2>
        <p className="mt-2 text-muted">{t('setup.phoneIntro', { name: props.username })}</p>
      </div>

      <SignInDevice />

      <div>
        <h3>{t('setup.ready')}</h3>
        <ul className="mt-2 space-y-1 text-sm">
          <li>✓ {t('setup.readyAccount', { name: props.username })}</li>
          {typeof remote.data?.hostname === 'string' && (
            <li>✓ {t('setup.readyConnect', { host: remote.data.hostname })}</li>
          )}
        </ul>
      </div>

      <Button onClick={props.onDone}>{t('setup.done')}</Button>
    </div>
  );
}
