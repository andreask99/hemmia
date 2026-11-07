/**
 * Where a tapped native notification lands (P5.5): /push-open#<ref>. The ref is opaque to the
 * app; the hub resolves it to one of the user's own chats.
 */
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { ResolvePushResponse } from '@hemmia/shared';
import { api } from '../api/client.ts';

/** Only same-app paths: one leading slash, no scheme or host. */
const safePath = (p: string) => (/^\/(?!\/)[A-Za-z0-9/_-]*$/.test(p) ? p : '/');

export function PushOpenPage() {
  const [ref] = useState(() => window.location.hash.slice(1));
  const [to, setTo] = useState<string | null>(() => (ref ? null : '/'));

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
    if (!ref) return;
    let live = true;
    api('/push/resolve', { method: 'POST', body: { ref }, schema: ResolvePushResponse })
      .then((r) => {
        if (live) setTo(safePath(r.path));
      })
      .catch(() => {
        if (live) setTo('/');
      });
    return () => {
      live = false;
    };
  }, [ref]);

  return to === null ? null : <Navigate to={to} replace />;
}
