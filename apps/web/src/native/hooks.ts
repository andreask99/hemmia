/** React glue for the native app (no-ops in a browser). */
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { native } from './bridge.ts';

/** While mounted, the screen is hidden from screenshots and the app switcher. */
export function useSensitiveScreen(): void {
  useEffect(() => {
    if (!native) return;
    native.setSensitive(true);
    return () => {
      native?.setSensitive(false);
    };
  }, []);
}

/** Tapped notifications: this hub's open the chat, another hub's go through the app shell. */
export function useNativePushTaps(): void {
  const navigate = useNavigate();
  useEffect(() => {
    if (!native) return;
    return native.onPushTap((tap) => {
      if (tap.hubHost === window.location.host) void navigate(`/push-open#${tap.ref}`);
      else native?.openOnOtherHub(tap);
    });
  }, [navigate]);
}
