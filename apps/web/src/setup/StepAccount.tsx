import { useState } from 'react';
import { Button, Field } from '@hemmia/ui';
import { useT } from '../i18n/index.tsx';
import { Alert } from '@hemmia/ui';

export function StepAccount({
  onSubmit,
  pending,
  error: errorProp,
}: {
  onSubmit: (username: string, password: string) => void;
  pending: boolean;
  error: string | null;
}) {
  const t = useT();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setError(null);

    if (password !== repeat) {
      setError(t('invite.mismatch'));
      return;
    }

    if (password.length < 12) {
      setError(t('setup.tooShort'));
      return;
    }

    onSubmit(username, password);
  };

  return (
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

      {errorProp && <Alert>{errorProp}</Alert>}
      {error && <Alert>{error}</Alert>}

      <Button type="submit" disabled={pending} className="mt-1 min-h-12">
        {pending ? t('invite.submitting') : t('setup.createAccount')}
      </Button>
    </form>
  );
}
