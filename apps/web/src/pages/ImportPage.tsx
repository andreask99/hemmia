/**
 * /import#phone~<token> (PHONE-MODE.md §8): the app's shell staged the phone's chats for this
 * hub; this page takes them once through the bridge and imports them for the signed-in user.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { AuthShell, Button } from '@hemmia/ui';
import { PhoneImportResponse } from '@hemmia/shared';
import { api, ApiError } from '../api/client.ts';
import { useI18n } from '../i18n/index.tsx';
import { native } from '../native/bridge.ts';

type State =
  | { step: 'working' }
  | { step: 'done'; chats: number; photosSkipped: number }
  | { step: 'failed'; reason: 'nothing' | 'too_many' | 'failed' };

export function ImportPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [token] = useState(
    () => /^#phone~([A-Za-z0-9_-]{20,100})$/.exec(window.location.hash)?.[1] ?? null,
  );
  const [state, setState] = useState<State>(() =>
    token && native ? { step: 'working' } : { step: 'failed', reason: 'nothing' },
  );
  const started = useRef(false);

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
    if (!token || !native || started.current) return;
    started.current = true;
    void (async () => {
      const json = await native.takePhoneExport(token);
      if (json === null) {
        setState({ step: 'failed', reason: 'nothing' });
        return;
      }
      try {
        const r = await api('/import/phone', {
          method: 'POST',
          body: JSON.parse(json) as unknown,
          schema: PhoneImportResponse,
        });
        void queryClient.invalidateQueries({ queryKey: ['chats'] });
        setState({ step: 'done', chats: r.chats, photosSkipped: r.photosSkipped });
      } catch (err) {
        setState({
          step: 'failed',
          reason: err instanceof ApiError && err.status === 429 ? 'too_many' : 'failed',
        });
      }
    })();
  }, [token, queryClient]);

  return (
    <AuthShell title={t('import.title')}>
      {state.step === 'working' && (
        <p role="status" className="text-muted">
          {t('import.working')}
        </p>
      )}
      {state.step === 'done' && (
        <div className="flex flex-col gap-4">
          <p role="status">{t('import.done', { count: String(state.chats) })}</p>
          {state.photosSkipped > 0 && (
            <p className="text-sm text-muted">
              {t('import.photosSkipped', { count: String(state.photosSkipped) })}
            </p>
          )}
          <p className="text-sm text-muted">{t('import.phoneCopy')}</p>
        </div>
      )}
      {state.step === 'failed' && (
        <p role="alert" className="text-danger">
          {t(`import.failed.${state.reason}`)}
        </p>
      )}
      {state.step !== 'working' && (
        <Button
          className="mt-6"
          onClick={() => {
            void navigate('/', { replace: true });
          }}
        >
          {t('import.toChats')}
        </Button>
      )}
    </AuthShell>
  );
}
