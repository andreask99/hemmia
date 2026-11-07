import type { TFunction } from '../i18n/index.tsx';
import { ApiError } from '../api/client.ts';

export function errorMessage(err: unknown, t: TFunction, context?: 'recover'): string {
  if (!(err instanceof ApiError)) {
    return t('error.generic');
  }

  switch (err.code) {
    case 'invalid_credentials':
      return context === 'recover' ? t('error.invalid_recovery') : t('error.invalid_credentials');
    case 'invite_invalid':
      return t('error.invite_invalid');
    case 'username_taken':
      return t('error.username_taken');
    case 'weak_password':
      return t('error.weak_password');
    case 'network':
      return t('error.network');
    case 'unauthenticated':
      return t('error.unauthenticated');
    case 'rate_limited':
      return t('error.rate_limited', {
        minutes: Math.max(1, Math.ceil((err.retryAfterSeconds ?? 60) / 60)),
      });
    case 'bad_request':
      return context === 'recover' ? t('error.invalid_recovery') : t('error.generic');
    default:
      return t('error.generic');
  }
}
