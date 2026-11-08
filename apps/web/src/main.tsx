// Must stay the first import (see the file).
import './zod-setup.ts';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from './i18n/index.tsx';
import { RouterProvider } from 'react-router';
import { createAppRouter } from './router.tsx';
import { MIN_SHELL_LEVEL } from '@hemmia/shared';
import { native } from './native/bridge.ts';
import { AppOutdated } from './native/AppOutdated.tsx';
import './index.css';

// iOS WebKit applies :active (the press feedback in theme.css) only with a touch listener.
document.addEventListener('touchstart', () => {}, { passive: true });

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        {native && native.level < MIN_SHELL_LEVEL ? (
          <AppOutdated native={native} />
        ) : (
          <RouterProvider router={createAppRouter()} />
        )}
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
);

// Register service worker for PWA in production (not in the native app, which has its own push)
if (import.meta.env.PROD && !native && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
