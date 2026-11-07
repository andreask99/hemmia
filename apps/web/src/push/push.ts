/**
 * Notifications when a reply or picture is ready (Web Push). On iPhone this works only for
 * kchat added to the Home Screen (iOS 16.4+); the permission prompt needs a tap. In the native
 * app, the phone's own push (APNs/FCM through the relay) is used instead (P5.5).
 */
import { PushKeyResponse } from '@hemmia/shared';
import { api } from '../api/client.ts';
import { native } from '../native/bridge.ts';

/** Whether this device registered its native token (the token itself stays on the hub). */
const NATIVE_FLAG = 'kchat.nativePush';
const nativeFlag = (): boolean => {
  try {
    return localStorage.getItem(NATIVE_FLAG) === '1';
  } catch {
    return false;
  }
};
const setNativeFlag = (on: boolean): void => {
  try {
    if (on) localStorage.setItem(NATIVE_FLAG, '1');
    else localStorage.removeItem(NATIVE_FLAG);
  } catch {
    // private mode: state just isn't remembered
  }
};

async function nativeState(): Promise<PushState> {
  if (!native) return 'unsupported';
  const p = await native.pushPermission();
  if (p === 'denied') return 'denied';
  return p === 'granted' && nativeFlag() ? 'on' : 'off';
}

async function registerNative(): Promise<boolean> {
  if (!native) return false;
  const t = await native.registerPush();
  if (!t) return false;
  await api('/push/native', {
    method: 'POST',
    body: { platform: native.platform, token: t.token, ...(t.env ? { env: t.env } : {}) },
  });
  return true;
}

export type PushState =
  | 'unsupported' // browser can't do it
  | 'needs-home-screen' // iPhone/iPad in Safari: add to Home Screen first
  | 'denied' // the user blocked notifications in system settings
  | 'off'
  | 'on';

const isIos = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const supported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function pushState(): Promise<PushState> {
  if (native) return nativeState();
  if (!supported()) return isIos() && !isStandalone() ? 'needs-home-screen' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const sub = await (await registration())?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

async function register(sub: PushSubscription): Promise<void> {
  await api('/push/subscription', { method: 'POST', body: sub.toJSON() });
}

/** Asks for permission (call from a tap) and registers this device. */
export async function enablePush(): Promise<PushState> {
  if (native) {
    setNativeFlag(await registerNative());
    return nativeState();
  }
  if (!supported()) return pushState();
  if ((await Notification.requestPermission()) !== 'granted') return pushState();
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api('/push/key', { schema: PushKeyResponse });
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: Uint8Array.from(
        atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')),
        (c) => c.charCodeAt(0),
      ),
    }));
  await register(sub);
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  if (native) {
    await api('/push/native', { method: 'DELETE' }).catch(() => undefined);
    setNativeFlag(false);
    return nativeState();
  }
  const sub = await (await registration())?.pushManager.getSubscription();
  if (sub) {
    await api('/push/subscription', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(
      () => undefined,
    );
    await sub.unsubscribe();
  }
  return pushState();
}

/**
 * After signing in, re-register an existing subscription with the new session (signing out
 * removes it on the server). Silent; never prompts.
 */
export async function resyncPush(): Promise<void> {
  if (native) {
    if (nativeFlag() && (await native.pushPermission()) === 'granted') {
      await registerNative().catch(() => undefined);
    }
    return;
  }
  if (!supported() || Notification.permission !== 'granted') return;
  const sub = await (await registration())?.pushManager.getSubscription();
  if (sub) await register(sub).catch(() => undefined);
}
