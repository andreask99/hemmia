/**
 * Small enhancements only (WEBSITE.md §1): copy buttons on commands, and the feedback form
 * (Feedback.tsx), which posts to the relay. Pages work without it.
 */
export function enhance(doc: Document): void {
  for (const pre of Array.from(doc.querySelectorAll('pre'))) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'copy';
    button.textContent = doc.documentElement.lang === 'de' ? 'Kopieren' : 'Copy';
    button.addEventListener('click', () => {
      void navigator.clipboard.writeText(pre.textContent);
    });
    pre.append(button);
  }
}

const SENT = {
  en: {
    sending: 'Sending…',
    thanks: 'Thank you! We read every message.',
    thanksReply: "Thank you! We'll answer by email.",
    tooMany: "That's a lot of messages for now. Please try again in an hour.",
    failed: "That didn't go through. Please try again later, or email us.",
  },
  de: {
    sending: 'Wird gesendet…',
    thanks: 'Danke! Wir lesen jede Nachricht.',
    thanksReply: 'Danke! Wir antworten per E-Mail.',
    tooMany: 'Das sind gerade viele Nachrichten. Bitte versuch es in einer Stunde noch einmal.',
    failed:
      'Das hat nicht geklappt. Bitte versuch es später noch einmal oder schreib uns eine E-Mail.',
  },
} as const;

export function enhanceFeedback(doc: Document, send: typeof fetch = fetch): void {
  const form = doc.querySelector<HTMLFormElement>('form.feedback-form');
  if (!form) return;
  const api = form.dataset['api'] ?? '';
  const lang = form.dataset['lang'] === 'de' ? 'de' : 'en';
  const t = SENT[lang];
  const status = form.querySelector('.feedback-status');
  const button = form.querySelector('button');
  form.hidden = false;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const text = (k: string) => {
      const v = data.get(k);
      return typeof v === 'string' ? v.trim() : '';
    };
    const email = text('email');
    if (status) status.textContent = t.sending;
    if (button) button.disabled = true;
    // text/plain keeps this a simple request (no CORS preflight); the body is JSON.
    send(api, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({
        message: text('message'),
        ...(email ? { email } : {}),
        source: 'site',
        lang,
        page: form.dataset['page'] ?? '',
        ...(text('website') ? { website: text('website') } : {}),
      }),
    })
      .then((res) => {
        if (res.status === 204) {
          form.reset();
          if (status) status.textContent = email ? t.thanksReply : t.thanks;
        } else if (status) {
          status.textContent = res.status === 429 ? t.tooMany : t.failed;
        }
      })
      .catch(() => {
        if (status) status.textContent = t.failed;
      })
      .finally(() => {
        if (button) button.disabled = false;
      });
  });
}
