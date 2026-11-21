/**
 * "Questions or feedback?" under the install pages (help, download, get started, guides). The
 * form is hidden until enhance.ts wires it up (it posts to the relay, POST /v1/feedback); without
 * JavaScript the email address still works.
 */
import type { Lang } from './content.ts';

export const FEEDBACK_API = 'https://api.hemmia.app/v1/feedback';
const EMAIL = 'andreas.apps@icloud.com';

/** Pages that show the box: the ones people read while installing. */
export function showsFeedback(slug: string): boolean {
  return (
    slug === 'help' || slug === 'download' || slug === 'get-started' || slug.startsWith('guides')
  );
}

const T = {
  en: {
    title: 'Questions or feedback?',
    intro: 'Stuck while installing, or something unclear? Write to the people who make Hemmia.',
    message: 'Your question or feedback',
    email: "Your email (optional, only if you'd like an answer)",
    send: 'Send',
    privacy: 'Sent to our relay in Switzerland and kept for at most 12 months.',
    policy: 'Privacy policy',
    policyHref: '/legal/privacy/',
    or: 'Or email',
  },
  de: {
    title: 'Fragen oder Feedback?',
    intro:
      'Hängst du bei der Installation fest oder ist etwas unklar? Schreib den Leuten, die Hemmia machen.',
    message: 'Deine Frage oder dein Feedback',
    email: 'Deine E-Mail (freiwillig, nur wenn du eine Antwort möchtest)',
    send: 'Senden',
    privacy: 'Geht an unser Relay in der Schweiz und wird höchstens 12 Monate aufbewahrt.',
    policy: 'Datenschutzerklärung',
    policyHref: '/de/legal/privacy/',
    or: 'Oder per E-Mail an',
  },
  fr: {
    title: 'Des questions ou un avis ?',
    intro:
      'Tu es bloqué pendant l’installation ou quelque chose n’est pas clair ? Écris aux personnes qui font Hemmia.',
    message: 'Ta question ou ton avis',
    email: 'Ton e-mail (facultatif, seulement si tu veux une réponse)',
    send: 'Envoyer',
    privacy: 'Envoyé à notre relais en Suisse et conservé au maximum 12 mois.',
    policy: 'Politique de confidentialité',
    policyHref: '/fr/legal/privacy/',
    or: 'Ou par e-mail à',
  },
  it: {
    title: 'Domande o feedback?',
    intro:
      'Sei bloccato durante l’installazione o qualcosa non è chiaro? Scrivi alle persone che fanno Hemmia.',
    message: 'La tua domanda o il tuo feedback',
    email: 'La tua e-mail (facoltativa, solo se vuoi una risposta)',
    send: 'Invia',
    privacy: 'Inviato al nostro relay in Svizzera e conservato al massimo 12 mesi.',
    policy: 'Informativa sulla privacy',
    policyHref: '/it/legal/privacy/',
    or: 'Oppure via e-mail a',
  },
} as const;

export function Feedback({ lang, slug }: { lang: Lang; slug: string }) {
  const t = T[lang];
  return (
    <section className="feedback" id="feedback" aria-labelledby="feedback-title">
      <h2 id="feedback-title">{t.title}</h2>
      <p>{t.intro}</p>
      <form
        className="feedback-form"
        hidden
        data-api={FEEDBACK_API}
        data-lang={lang}
        data-page={`/${slug}`}
      >
        <label htmlFor="feedback-message">{t.message}</label>
        <textarea id="feedback-message" name="message" required maxLength={4000} rows={4} />
        <label htmlFor="feedback-email">{t.email}</label>
        <input id="feedback-email" name="email" type="email" autoComplete="email" maxLength={254} />
        {/* Left empty by people; bots fill it in. */}
        <div className="feedback-trap" aria-hidden="true">
          <label htmlFor="feedback-website">Website</label>
          <input id="feedback-website" name="website" tabIndex={-1} autoComplete="off" />
        </div>
        <p className="feedback-small">
          {t.privacy} <a href={t.policyHref}>{t.policy}</a>
        </p>
        <button type="submit" className="button">
          {t.send}
        </button>
        <p className="feedback-status" role="status" aria-live="polite" />
      </form>
      <p className="feedback-small">
        {t.or} <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
      </p>
    </section>
  );
}
