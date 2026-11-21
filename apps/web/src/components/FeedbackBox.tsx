/**
 * "Questions or feedback?" for people setting Hemmia up: goes to the Hemmia team through the
 * hub and our relay (routes/feedback.ts), never to the family's admins. Before an account exists
 * (setup steps 1 to 3) there is no session, so it points to the form on hemmia.app instead.
 */
import { useState, type SubmitEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '../api/client.ts';
import { useI18n } from '../i18n/index.tsx';

const SITE = 'https://hemmia.app';
const input =
  'w-full rounded-xl border border-line bg-paper px-3.5 py-2.5 text-base text-ink focus:border-forest focus:outline-none';

export function FeedbackBox({ page, signedIn = true }: { page: string; signedIn?: boolean }) {
  const { t, language } = useI18n();
  const site = language === 'en' ? SITE : `${SITE}/${language}`;
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const send = useMutation({
    mutationFn: () =>
      api('/feedback', { method: 'POST', body: { message, ...(email ? { email } : {}), page } }),
  });

  if (!signedIn) {
    return (
      <p className="text-sm text-muted">
        {t('feedback.question')}{' '}
        <a
          href={`${site}/help/#feedback`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {t('feedback.askOnline')}
        </a>
      </p>
    );
  }

  if (send.isSuccess) {
    return (
      <p role="status" className="rounded-xl bg-champagne px-3.5 py-2.5 text-sm text-ok">
        {t(email ? 'feedback.thanksReply' : 'feedback.thanks')}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="self-start text-sm font-medium text-forest underline"
        onClick={() => {
          setOpen(true);
        }}
      >
        {t('feedback.question')}
      </button>
    );
  }

  const error =
    send.error instanceof ApiError && send.error.code === 'rate_limited'
      ? t('feedback.tooMany')
      : send.error
        ? t('feedback.failed')
        : null;

  return (
    <form
      className="space-y-3 rounded-2xl border border-line bg-card p-4"
      onSubmit={(e: SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        send.mutate();
      }}
    >
      <h3 className="font-semibold text-ink">{t('feedback.title')}</h3>
      <p className="text-sm text-muted">{t('feedback.intro')}</p>
      <div>
        <label htmlFor="feedback-message" className="mb-1.5 block text-sm font-medium text-muted">
          {t('feedback.message')}
        </label>
        <textarea
          id="feedback-message"
          required
          maxLength={4000}
          rows={4}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
          }}
          className={input}
        />
      </div>
      <div>
        <label htmlFor="feedback-email" className="mb-1.5 block text-sm font-medium text-muted">
          {t('feedback.email')}
        </label>
        <input
          id="feedback-email"
          type="email"
          autoComplete="email"
          maxLength={254}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
          className={input}
        />
      </div>
      <p className="text-xs text-muted">
        {t('feedback.privacy')}{' '}
        <a
          href={`${site}/legal/privacy/`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {t('remote.privacy')}
        </a>
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={send.isPending || message.trim() === ''}
        className="min-h-11 rounded-xl bg-forest px-4 font-semibold text-on-forest hover:bg-forest-hover disabled:opacity-45"
      >
        {t('feedback.send')}
      </button>
    </form>
  );
}
