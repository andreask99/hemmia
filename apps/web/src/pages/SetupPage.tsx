import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client.ts';
import { errorMessage } from '../auth/errorMessage.ts';
import { ME_QUERY_KEY } from '../auth/hooks.ts';
import { Alert, AuthShell } from '@hemmia/ui';
import { useI18n } from '../i18n/index.tsx';
import { useSetupAccount, useSetupState } from '../setup/hooks.ts';
import { SetupLayout } from '../setup/SetupLayout.tsx';
import { StepAccount } from '../setup/StepAccount.tsx';
import { StepRecovery } from '../setup/StepRecovery.tsx';
import { StepWelcome } from '../setup/StepWelcome.tsx';
import { StepAI } from '../setup/StepAI.tsx';
import { StepRemote } from '../setup/StepRemote.tsx';
import { StepPhone } from '../setup/StepPhone.tsx';

/** First-run setup of a new hub (mockups H1–H3; SECURITY.md §6.1). */
export function SetupPage() {
  const { t, language } = useI18n();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // The setup code lives in the fragment (never sent in a URL) and only in memory.
  const [code] = useState<string | null>(() => window.location.hash.slice(1) || null);
  const [step, setStep] = useState(1);
  const [familyName, setFamilyName] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const setupState = useSetupState();
  const account = useSetupAccount();

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  if (!code) {
    return (
      <AuthShell title={t('setup.title')}>
        <Alert>{t('setup.noCode')}</Alert>
      </AuthShell>
    );
  }
  if (setupState.error instanceof ApiError && setupState.error.status === 404 && step < 3) {
    return <Navigate to="/login" replace />;
  }
  const state = setupState.data;
  if (!state && step < 3) return null;

  let content;
  if (step === 1 && state) {
    content = (
      <StepWelcome
        state={state}
        familyName={familyName ?? state.familyName ?? ''}
        onFamilyName={setFamilyName}
        onNext={() => {
          setStep(2);
        }}
      />
    );
  } else if (step === 2) {
    const err = account.error;
    content = (
      <StepAccount
        pending={account.isPending}
        error={
          err === null
            ? null
            : err instanceof ApiError && err.code === 'forbidden'
              ? t('setup.badCode')
              : errorMessage(err, t)
        }
        onSubmit={(username, password) => {
          account.mutate(
            {
              setupCode: code,
              username,
              password,
              familyName: (familyName ?? state?.familyName ?? '').trim(),
              lang: language,
            },
            {
              onSuccess: (res) => {
                queryClient.setQueryData(ME_QUERY_KEY, res.me);
                setRecoveryCode(res.recoveryCode);
                setUsername(res.me.username);
                setStep(3);
              },
            },
          );
        }}
      />
    );
  } else if (step === 3 && recoveryCode) {
    content = (
      <StepRecovery
        code={recoveryCode}
        onNext={() => {
          setStep(4);
        }}
      />
    );
  } else if (step === 4) {
    content = (
      <StepAI
        onNext={() => {
          setStep(5);
        }}
      />
    );
  } else if (step === 5) {
    content = (
      <StepRemote
        onNext={() => {
          setStep(6);
        }}
      />
    );
  } else if (step === 6 && username) {
    content = (
      <StepPhone username={username} onDone={() => void navigate('/', { replace: true })} />
    );
  }
  return <SetupLayout step={step}>{content}</SetupLayout>;
}
