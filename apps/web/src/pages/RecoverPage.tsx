import { useState, type SubmitEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '../auth/errorMessage.ts';
import { ME_QUERY_KEY, useRecover } from '../auth/hooks.ts';
import { RecoveryCodePanel } from '../components/RecoveryCodePanel.tsx';
import { Alert, AuthShell, Button, Card, Field } from '@hemmia/ui';
import { useT } from '../i18n/index.tsx';

export function RecoverPage() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const recover = useRecover();
  const [username, setUsername] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (recover.isSuccess) {
    return (
      <RecoveryCodePanel
        code={recover.data.recoveryCode}
        note={t('recover.newCodeNote')}
        onDone={() => {
          queryClient.setQueryData(ME_QUERY_KEY, recover.data.me);
          void navigate('/', { replace: true });
        }}
      />
    );
  }

  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== repeat) {
      setError(t('invite.mismatch'));
      return;
    }
    recover.mutate(
      { username, recoveryCode, newPassword },
      {
        onError: (err) => {
          setError(errorMessage(err, t, 'recover'));
        },
      },
    );
  };

  return (
    <AuthShell title={t('recover.title')} intro={t('recover.intro')}>
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field
            id="username"
            label={t('recover.username')}
            autoComplete="username"
            autoCapitalize="none"
            required
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
            }}
          />
          <Field
            id="code"
            label={t('recover.code')}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            required
            className="font-mono tracking-wider"
            value={recoveryCode}
            onChange={(e) => {
              setRecoveryCode(e.target.value);
            }}
          />
          <Field
            id="new-password"
            type="password"
            label={t('recover.newPassword')}
            hint={t('invite.passwordHint')}
            autoComplete="new-password"
            required
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
            }}
          />
          <Field
            id="repeat"
            type="password"
            label={t('recover.confirm')}
            autoComplete="new-password"
            required
            value={repeat}
            onChange={(e) => {
              setRepeat(e.target.value);
            }}
          />
          {error && <Alert>{error}</Alert>}
          <Button type="submit" disabled={recover.isPending} className="mt-1 min-h-12">
            {recover.isPending ? t('recover.submitting') : t('recover.submit')}
          </Button>
        </form>
      </Card>
      <Link
        to="/login"
        className="self-center text-sm font-medium text-forest underline-offset-4 hover:underline"
      >
        {t('recover.backToLogin')}
      </Link>
    </AuthShell>
  );
}
