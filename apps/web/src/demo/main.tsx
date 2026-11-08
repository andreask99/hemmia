/**
 * The demo's entry (demo.html, `npm run build:demo`): the hub's web app with a made-up family,
 * answered inside the page by server.ts. Opened from the phone app's first screen ("Have a
 * look first") and servable on the website. Never talks to a hub or any other server.
 */
// Must stay the first import (see the file).
import '../zod-setup.ts';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { setAttachmentUrlResolver } from '@hemmia/ui';
import { I18nProvider, isLanguage } from '../i18n/index.tsx';
import { createAppRouter } from '../router.tsx';
import { uploadOverride } from '../chat/photos.ts';
import { createDemoServer } from './server.ts';
import { DemoBar } from './DemoBar.tsx';
import { demoEvents } from './events.ts';
import '../index.css';
import './demo.css';

// iOS WebKit applies :active (the press feedback in theme.css) only with a touch listener.
document.addEventListener('touchstart', () => {}, { passive: true });

const base = import.meta.env.BASE_URL.replace(/\/$/, ''); // "/demo"
// The app opens /demo/index.html (a file in its bundle); the router's start page is /demo/.
if (location.pathname === `${base}/index.html` || location.pathname === `${base}/demo.html`) {
  history.replaceState(null, '', `${base}/`);
}

/** Leaving goes back to the app's first screen (or the website's home page). */
function leaveDemo(): void {
  location.assign('/');
}

function startLanguage() {
  // The website's German pages link to /demo/?lang=de.
  const asked = new URLSearchParams(location.search).get('lang');
  if (isLanguage(asked)) return asked;
  try {
    const stored = localStorage.getItem('kchat.language');
    if (isLanguage(stored)) return stored;
  } catch {
    // storage unavailable
  }
  return (navigator.languages[0] ?? navigator.language).toLowerCase().startsWith('de')
    ? 'de'
    : 'en';
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const server = createDemoServer(startLanguage(), {
  onRefused: () => {
    demoEvents.dispatchEvent(new Event('refused'));
  },
  onLeave: leaveDemo,
  onReset: () => {
    void queryClient.invalidateQueries();
  },
});

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const request = input instanceof Request ? input : null;
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(href, location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) {
    return realFetch(input, init);
  }
  const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
  let body: unknown = undefined;
  const raw = init?.body;
  if (typeof raw === 'string') {
    try {
      body = JSON.parse(raw) as unknown;
    } catch {
      body = undefined;
    }
  }
  // A moment of "network", so loading states look as they do on a hub.
  await new Promise((r) => setTimeout(r, 60));
  return server.handle(method, url, body, init?.signal ?? null);
};
uploadOverride.fn = server.upload;
setAttachmentUrlResolver(server.attachmentUrl);

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <DemoBar onLeave={leaveDemo} />
          <RouterProvider router={createAppRouter(base)} />
        </I18nProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
