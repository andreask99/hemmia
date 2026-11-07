import { useEffect, useState, type SubmitEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '../auth/errorMessage.ts';
import { ME_QUERY_KEY, useAcceptInvite } from '../auth/hooks.ts';
import { RecoveryCodePanel } from '../components/RecoveryCodePanel.tsx';
import { Alert, AuthShell, Button, Card, Field } from '@hemmia/ui';
import { useT } from '../i18n/index.tsx';

export function InvitePage() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accept = useAcceptInvite();
  // Read the invite code from the URL fragment once (it's never sent to the server in a URL).
  // From a /join link the code arrives in router state (it was already read from the fragment).
  const location = useLocation();
  const fromJoin = (location.state as { inviteCode?: unknown } | null)?.inviteCode;
  const [code] = useState<string | null>(
    () => window.location.hash.slice(1) || (typeof fromJoin === 'string' ? fromJoin : null),
  );
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Remove the code from the address bar and history.
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  if (!code) {
    return (
      <AuthShell title={t('invite.title')}>
        <Alert>{t('invite.missingCode')}</Alert>
      </AuthShell>
    );
  }

  if (accept.isSuccess) {
    return (
      <RecoveryCodePanel
        code={accept.data.recoveryCode}
        onDone={() => {
          queryClient.setQueryData(ME_QUERY_KEY, accept.data.me);
          void navigate('/', { replace: true });
        }}
      />
    );
  }

  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (password !== repeat) {
      setError(t('invite.mismatch'));
      return;
    }
    accept.mutate(
      { code, username, password },
      {
        onError: (err) => {
          setError(errorMessage(err, t));
        },
      },
    );
  };

  return (
    <AuthShell title={t('invite.title')} intro={t('invite.intro')}>
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field
            id="username"
            label={t('invite.username')}
            hint={t('invite.usernameHint')}
            autoComplete="username"
            autoCapitalize="none"
            required
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
            }}
          />
          <Field
            id="password"
            type="password"
            label={t('invite.password')}
            hint={t('invite.passwordHint')}
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
          />
          <Field
            id="confirm"
            type="password"
            label={t('invite.confirm')}
            autoComplete="new-password"
            required
            value={repeat}
            onChange={(e) => {
              setRepeat(e.target.value);
            }}
          />
          {error && <Alert>{error}</Alert>}
          <Button type="submit" disabled={accept.isPending} className="mt-1 min-h-12">
            {accept.isPending ? t('invite.submitting') : t('invite.submit')}
          </Button>
        </form>
      </Card>
    </AuthShell>
  );
}
