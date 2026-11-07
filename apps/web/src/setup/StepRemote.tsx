/** Setup step 5 (mockup H5): how phones reach this hub away from home. */
import { useState } from 'react';
import { Button } from '@hemmia/ui';
import { useI18n } from '../i18n/index.tsx';
import { useRemoteStatus, useSetRemote } from '../settings/hooks.ts';

type Choice = 'connect' | 'tailscale' | 'none';

const card =
  'flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4 has-[:checked]:border-forest has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60';

export function StepRemote(props: { onNext: () => void }) {
  const { t } = useI18n();
  const remote = useRemoteStatus();
  const setRemote = useSetRemote();
  const [choice, setChoice] = useState<Choice | null>(null);
  const relay = remote.data?.relayConfigured === true;
  // Until the user picks, Connect is the default when this build has a relay.
  const selected: Choice = choice ?? (relay ? 'connect' : 'tailscale');

  const next = () => {
    if (selected !== 'connect') {
      props.onNext();
      return;
    }
    setRemote.mutate(true, {
      onSuccess: () => {
        props.onNext();
      },
    });
  };

  const option = (value: Choice, title: string, text: string, extra?: React.ReactNode) => (
    <label className={card}>
      <input
        type="radio"
        name="remote"
        value={value}
        className="mt-1"
        checked={selected === value}
        disabled={(value === 'connect' && !relay) || setRemote.isPending}
        onChange={() => {
          setChoice(value);
        }}
      />
      <span className="flex flex-col gap-1">
        <span className="flex items-center gap-2 font-semibold text-ink">
          {title}
          {extra}
        </span>
        <span className="text-sm text-muted">{text}</span>
      </span>
    </label>
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="font-display text-xl text-ink">{t('setup.remoteTitle')}</h2>
        <p className="mt-2 text-muted">{t('setup.remoteIntro')}</p>
      </div>
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">{t('setup.remoteTitle')}</legend>
        {option(
          'connect',
          t('setup.connectTitle'),
          relay ? t('setup.connectText') : t('remote.notAvailable'),
          relay ? (
            <span className="rounded-full bg-champagne px-2 py-0.5 text-xs font-normal text-on-champagne">
              {t('setup.recommended')}
            </span>
          ) : undefined,
        )}
        {option('tailscale', t('setup.tailscaleTitle'), t('setup.tailscaleText'))}
        {option('none', t('setup.noneTitle'), t('setup.noneText'))}
      </fieldset>
      {selected === 'tailscale' && (
        <div className="rounded-xl border border-line bg-card p-4 text-sm">
          <ol className="list-decimal pl-5">
            <li>{t('setup.tailscale1')}</li>
            <li>{t('setup.tailscale2')}</li>
            <li>{t('setup.tailscale3')}</li>
          </ol>
        </div>
      )}
      {setRemote.isError && (
        <p role="alert" className="text-sm text-danger">
          {t('setup.connectFailed')}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Button onClick={next} disabled={setRemote.isPending}>
          {setRemote.isPending
            ? t('remote.working')
            : selected === 'connect'
              ? t('setup.connectButton')
              : t('setup.continue')}
        </Button>
        {selected === 'connect' && <p className="text-sm text-muted">{t('setup.connectNote')}</p>}
      </div>
    </div>
  );
}
