import { useState, type SubmitEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { errorMessage } from '../auth/errorMessage.ts';
import { useLogin } from '../auth/hooks.ts';
import { Alert, AuthShell, Button, Card, Field } from '@hemmia/ui';
import { useT } from '../i18n/index.tsx';

export function LoginPage() {
  const t = useT();
  const navigate = useNavigate();
  const login = useLogin();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const deviceNotice = (useLocation().state as { notice?: unknown } | null)?.notice === 'device';

  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    login.mutate(
      { username, password },
      {
        onSuccess: () => {
          void navigate('/', { replace: true });
        },
        onError: (err) => {
          setError(errorMessage(err, t));
        },
      },
    );
  };

  return (
    <AuthShell title={t('login.title')} intro={t('login.tagline')}>
      <Card>
        {deviceNotice && (
          <p
            role="status"
            className="mb-4 rounded-xl bg-champagne px-4 py-3 text-sm text-on-champagne"
          >
            {t('join.deviceAllowed')}
          </p>
        )}
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field
            id="username"
            label={t('login.username')}
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
            label={t('login.password')}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
          />
          {error && <Alert>{error}</Alert>}
          <Button type="submit" disabled={login.isPending} className="mt-1 min-h-12">
            {login.isPending ? t('login.submitting') : t('login.submit')}
          </Button>
        </form>
      </Card>
      <div className="flex flex-col items-center gap-2 text-center text-sm">
        <Link to="/recover" className="font-medium text-forest underline-offset-4 hover:underline">
          {t('login.forgot')}
        </Link>
        <p className="text-muted">{t('login.noAccount')}</p>
      </div>
    </AuthShell>
  );
}
