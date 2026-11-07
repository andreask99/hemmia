import { type SetupState } from '@hemmia/shared';
import { Button, Field } from '@hemmia/ui';
import { useT } from '../i18n/index.tsx';

export function StepWelcome({
  state,
  familyName,
  onFamilyName,
  onNext,
}: {
  state: SetupState;
  familyName: string;
  onFamilyName: (v: string) => void;
  onNext: () => void;
}) {
  const t = useT();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">{t('setup.welcomeTitle')}</h1>
        <p className="mt-2 text-muted">{t('setup.welcomeIntro')}</p>
      </div>

      <div className="flex flex-col gap-2 rounded-xl bg-card p-4">
        <p className="text-sm font-medium text-muted">{t('setup.systemInfo')}</p>
        <ul className="flex flex-col gap-1 text-sm">
          <li className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-forest"></span>
            {t('setup.memory', { gb: String(Math.round(state.machine.memoryGiB)) })}
          </li>
          {state.machine.diskFreeGiB !== null && (
            <li className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-forest"></span>
              {t('setup.disk', { gb: String(Math.round(state.machine.diskFreeGiB)) })}
            </li>
          )}
        </ul>
      </div>

      <Field
        id="family"
        label={t('setup.familyName')}
        value={familyName}
        onChange={(e) => {
          onFamilyName(e.target.value);
        }}
      />

      <Button disabled={!familyName.trim()} onClick={onNext} className="mt-2 min-h-12">
        {t('setup.continue')}
      </Button>
    </div>
  );
}
