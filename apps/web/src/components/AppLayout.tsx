import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import type { Language } from '@hemmia/shared';
import { useLogout, useMe } from '../auth/hooks.ts';
import { useUpdateMe } from '../settings/hooks.ts';
import { useI18n } from '../i18n/index.tsx';
import { ChatSidebar } from './ChatSidebar.tsx';
import { CloseIcon, LogoutIcon, SettingsIcon } from '@hemmia/ui';
import { DrawerContext } from './layout.tsx';
import { resyncPush } from '../push/push.ts';
import { useNativePushTaps } from '../native/hooks.ts';
import { IconButton, Logo } from '@hemmia/ui';

/** Avatar and name; opens a small menu with the language and sign out. */
function AccountMenu() {
  const { t, language, setLanguage } = useI18n();
  const navigate = useNavigate();
  const me = useMe().data;
  const updateMe = useUpdateMe();
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (lang: Language) => {
    setLanguage(lang);
    updateMe.mutate({ language: lang });
  };

  return (
    <div ref={box} className="relative min-w-0 flex-1">
      <button
        type="button"
        aria-label={t('nav.account')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
        className="flex min-h-11 w-full min-w-0 items-center gap-2.5 rounded-xl px-1.5 text-left hover:bg-champagne"
      >
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-champagne text-sm font-semibold text-on-champagne uppercase"
        >
          {me?.username.slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{me?.username}</span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label={t('nav.account')}
          className="absolute bottom-full left-0 z-30 mb-2 w-60 rounded-2xl border border-line bg-card p-1.5 shadow-xl"
        >
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="text-sm text-muted">{t('settings.language')}</span>
            <div
              role="group"
              aria-label={t('settings.language')}
              className="flex rounded-full bg-paper p-0.5"
            >
              {(['en', 'de'] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  role="menuitemradio"
                  aria-checked={language === lang}
                  onClick={() => {
                    choose(lang);
                  }}
                  className={`min-h-9 rounded-full px-3 text-sm font-semibold uppercase ${
                    language === lang ? 'bg-forest text-on-forest' : 'text-muted hover:text-ink'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>
          <div className="my-1 border-t border-line" />
          <button
            type="button"
            role="menuitem"
            disabled={logout.isPending}
            onClick={() => {
              logout.mutate(undefined, {
                onSettled: () => {
                  void navigate('/login', { replace: true });
                },
              });
            }}
            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] text-danger hover:bg-danger-soft disabled:opacity-50"
          >
            <LogoutIcon size={18} />
            {logout.isPending ? t('nav.signingOut') : t('nav.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}

function SidebarFooter({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2 border-t border-line px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <AccountMenu />
      <NavLink
        to="/settings"
        onClick={onNavigate}
        className={({ isActive }) =>
          `inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-[15px] font-medium hover:bg-champagne ${isActive ? 'bg-champagne text-forest' : 'text-ink'}`
        }
      >
        <SettingsIcon size={19} />
        {t('nav.settings')}
      </NavLink>
    </div>
  );
}

function Sidebar({ onNavigate, onClose }: { onNavigate: () => void; onClose?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex h-full flex-col bg-card">
      <div className="flex items-center gap-2 px-3 pt-[max(1rem,calc(var(--top-inset)*1.4))] pb-2">
        {/* Home: a new chat; on phones this also closes the menu. */}
        <NavLink
          to="/"
          end
          onClick={onNavigate}
          aria-label="Hemmia"
          className="flex min-h-11 flex-1 items-center gap-2.5 rounded-xl px-1 hover:bg-champagne/60"
        >
          <Logo size={32} />
          <span className="font-display text-xl font-semibold">Hemmia</span>
        </NavLink>
        {onClose && (
          <IconButton aria-label={t('chat.closeMenu')} onClick={onClose}>
            <CloseIcon />
          </IconButton>
        )}
      </div>
      <ChatSidebar onNavigate={onNavigate} />
      <SidebarFooter onNavigate={onNavigate} />
    </div>
  );
}

export function AppLayout() {
  const { setLanguage } = useI18n();
  useNativePushTaps();
  const [drawer, setDrawer] = useState(false);
  const open = useCallback(() => {
    setDrawer(true);
  }, []);
  const close = useCallback(() => {
    setDrawer(false);
  }, []);

  // The account's language (chosen in Settings or the switcher) applies on every device.
  const accountLanguage = useMe().data?.language;
  useEffect(() => {
    if (accountLanguage) setLanguage(accountLanguage);
  }, [accountLanguage, setLanguage]);

  // Notifications: keep this device registered with the current session, and open the
  // chat a tapped notification points to.
  const navigate = useNavigate();
  useEffect(() => {
    void resyncPush();
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (e: MessageEvent<unknown>) => {
      const data = e.data as { type?: unknown; url?: unknown } | null;
      if (
        data?.type === 'open' &&
        typeof data.url === 'string' &&
        /^\/(chats\/[A-Za-z0-9-]{1,64}|daily(\?kind=(week|evening))?|planner|settings(\?tab=[a-z]+)?)$/.test(
          data.url,
        )
      ) {
        void navigate(data.url);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, [navigate]);

  useEffect(() => {
    document.documentElement.classList.add('app-frame');
    return () => {
      document.documentElement.classList.remove('app-frame');
    };
  }, []);

  return (
    <DrawerContext.Provider value={open}>
      <div className="flex h-[var(--app-height)] w-full overflow-hidden bg-paper text-ink">
        <aside className="hidden w-72 shrink-0 border-r border-line lg:block">
          <Sidebar onNavigate={close} />
        </aside>
        {drawer && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              type="button"
              aria-label="Close"
              tabIndex={-1}
              onClick={close}
              className="absolute inset-0 h-full w-full bg-ink/40"
            />
            <div className="absolute inset-y-0 left-0 w-80 max-w-[86vw] shadow-2xl">
              <Sidebar onNavigate={close} onClose={close} />
            </div>
          </div>
        )}
        <main className="flex min-w-0 flex-1 flex-col">
          <Outlet />
        </main>
      </div>
    </DrawerContext.Provider>
  );
}
