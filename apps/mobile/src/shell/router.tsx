/** A small state-based router for the shell's few screens (no URLs, no history). */
import type { LinkTarget } from './open.ts';
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';

export type Screen =
  | { name: 'starting' }
  | { name: 'welcome' }
  | { name: 'getHub' }
  | { name: 'scan' }
  | { name: 'hubs' }
  | { name: 'phone'; setup: boolean }
  | { name: 'offline'; hubHost: string }
  /** A tapped link leads to a hub not saved yet: ask first (review 2026-11-07, H1). */
  | { name: 'confirmHub'; target: LinkTarget }
  /** The version handshake failed (P5.11): this app or that hub needs an update. */
  | { name: 'outdated'; hubHost: string; side: 'app' | 'hub' };

interface Router {
  screen: Screen;
  go: (screen: Screen) => void;
}

const RouterContext = createContext<Router | null>(null);

export function ShellRouter({ initial, children }: { initial: Screen; children: ReactNode }) {
  const [screen, go] = useState<Screen>(initial);
  const value = useMemo(() => ({ screen, go }), [screen]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): Router {
  const r = useContext(RouterContext);
  if (!r) throw new Error('useRouter outside ShellRouter');
  return r;
}
