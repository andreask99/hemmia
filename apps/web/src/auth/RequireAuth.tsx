import type { ReactNode } from 'react';
import { useMe } from './hooks.ts';
import { Navigate } from 'react-router';
import { useT } from '../i18n/index.tsx';
import { errorMessage } from './errorMessage.ts';
import { ApiError } from '../api/client.ts';
import { Logo } from '@hemmia/ui';

export function RequireAuth({ children }: { children: ReactNode }) {
  const t = useT();
  const { data, isLoading, error } = useMe();

  if (isLoading) {
    // Matches the iPhone launch screen, so starting the app doesn't flash a "Loading" text.
    return (
      <div
        role="status"
        aria-label={t('common.loading')}
        className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-paper"
      >
        <Logo size={56} />
        <span className="font-display text-3xl font-semibold text-ink">Hemmia</span>
      </div>
    );
  }

  if (error && error instanceof Error) {
    if (error instanceof ApiError && error.status === 401) {
      return <Navigate to="/login" replace />;
    }
    return (
      <div className="flex min-h-dvh items-center justify-center">{errorMessage(error, t)}</div>
    );
  }

  if (!data) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
