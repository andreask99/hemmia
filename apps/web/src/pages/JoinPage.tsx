import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { RedeemLinkResponse } from '@hemmia/shared';
import { parseDirectPayload } from '@hemmia/relay-protocol/links';
import { api } from '../api/client.ts';
import { ME_QUERY_KEY } from '../auth/hooks.ts';
import { Alert, AuthShell } from '@hemmia/ui';
import { useT } from '../i18n/index.tsx';

type Outcome =
  { to: 'invite'; code: string } | { to: 'app' } | { to: 'login' } | { to: 'error' } | null;

/**
 * Opens a link (SECURITY.md §4): /join#<kind>~<code>. The code lives in the fragment, is read
 * once and removed from the address bar, and redeemed with the hub: an invite pairs this device
 * and continues on the invite screen, a sign-in link signs in, a device code leads to sign-in.
 */
export function JoinPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const [payload] = useState(() => parseDirectPayload(window.location.hash.slice(1)));
  const [outcome, setOutcome] = useState<Outcome>(payload ? null : { to: 'error' });
  const started = useRef(false);

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
    if (!payload || started.current) return;
    started.current = true;
    api('/links/redeem', { method: 'POST', body: payload, schema: RedeemLinkResponse })
      .then((r) => {
        if (r.next === 'invite') setOutcome({ to: 'invite', code: payload.code });
        else if (r.next === 'app') {
          void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
          setOutcome({ to: 'app' });
        } else setOutcome({ to: 'login' });
      })
      .catch(() => {
        setOutcome({ to: 'error' });
      });
  }, [payload, queryClient]);

  if (outcome?.to === 'invite')
    return <Navigate to="/invite" replace state={{ inviteCode: outcome.code }} />;
  if (outcome?.to === 'app') return <Navigate to="/" replace />;
  if (outcome?.to === 'login') return <Navigate to="/login" replace state={{ notice: 'device' }} />;
  if (outcome?.to === 'error') {
    return (
      <AuthShell title={t('join.title')}>
        <Alert>{t('join.invalid')}</Alert>
      </AuthShell>
    );
  }
  return (
    <AuthShell title={t('join.title')}>
      <p role="status" className="text-center text-muted">
        {t('join.opening')}
      </p>
    </AuthShell>
  );
}
