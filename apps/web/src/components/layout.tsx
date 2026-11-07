import { createContext, useContext, type ReactNode } from 'react';
import { useT } from '../i18n/index.tsx';
import { ArrowLeftIcon, MenuIcon } from '@hemmia/ui';
import { IconButton } from '@hemmia/ui';

/** Lets pages open the chat drawer on phones. */
export const DrawerContext = createContext<() => void>(() => undefined);

/** The top bar of a page: menu button on phones, a title area, and actions on the right. */
export function PageHeader({
  children,
  actions,
  onBack,
}: {
  children: ReactNode;
  actions?: ReactNode;
  /** Shows a back arrow (on every screen size) instead of the phone menu button. */
  onBack?: () => void;
}) {
  const t = useT();
  const openDrawer = useContext(DrawerContext);
  // The home-screen app on iPhone blurs content about 0.4× the status bar height below it, so
  // the title would sit in that blur with only the safe-area inset (0 elsewhere, so no change).
  return (
    <header className="flex min-h-14 items-center gap-1 border-b border-line bg-paper px-2 pt-[calc(env(safe-area-inset-top)*1.4)] lg:px-4">
      {onBack ? (
        <IconButton aria-label={t('nav.back')} onClick={onBack}>
          <ArrowLeftIcon />
        </IconButton>
      ) : (
        <IconButton aria-label={t('chat.openMenu')} onClick={openDrawer} className="lg:hidden">
          <MenuIcon />
        </IconButton>
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center px-1 py-1.5">{children}</div>
      {actions && <div className="flex shrink-0 items-center">{actions}</div>}
    </header>
  );
}
