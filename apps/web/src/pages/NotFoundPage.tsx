import { Link } from 'react-router';
import { AuthShell } from '@hemmia/ui';
import { useT } from '../i18n/index.tsx';

export function NotFoundPage() {
  const t = useT();
  return (
    <AuthShell title={t('notFound.title')}>
      <Link
        to="/"
        className="self-center font-medium text-forest underline-offset-4 hover:underline"
      >
        {t('notFound.back')}
      </Link>
    </AuthShell>
  );
}
