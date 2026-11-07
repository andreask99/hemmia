import { Button } from '@hemmia/ui';
import { useI18n } from '../i18n/index.tsx';
import { ModelCatalog } from '../components/ModelCatalog.tsx';
import { CloudSection } from '../components/CloudSection.tsx';

export function StepAI(props: { onNext: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-display text-ink">{t('setup.aiTitle')}</h2>
        <p className="mt-2 text-muted">{t('setup.aiIntro')}</p>
      </div>

      <div>
        <h3 className="mb-2 text-base font-semibold text-ink">{t('setup.aiLocal')}</h3>
        <ModelCatalog />
      </div>

      <div>
        <h3 className="mb-2 text-base font-semibold text-ink">{t('setup.aiCloud')}</h3>
        <p className="text-sm text-muted">{t('setup.aiCloudNote')}</p>
        <CloudSection />
      </div>

      <Button onClick={props.onNext}>{t('setup.continue')}</Button>
      <p className="text-sm text-muted">{t('setup.aiBackground')}</p>
    </div>
  );
}
