/**
 * The native app shell (apps/mobile, plan A: Capacitor with the hub as the bridge's server
 * URL, DECISIONS.md 2026-10-23). In the app, the hub's web app talks to the phone through
 * `window.Capacitor.Plugins`; in a browser `native` is null and nothing here runs. No
 * Capacitor code is bundled: the app injects it.
 */

type Listener = { remove: () => Promise<void> };
interface PushEventData {
  value?: string;
  error?: string;
  notification?: { data?: unknown };
}

/** A tapped notification (RELAY.md: data `{ k, r, h }`). */
export interface PushTap {
  hubHost: string;
  ref: string;
}

const REF = /^[A-Za-z0-9_-]{1,200}$/;
const HOST = /^[a-z0-9.-]{1,253}(:[0-9]{1,5})?$/;

export function readPushTap(data: unknown): PushTap | null {
  if (typeof data !== 'object' || data === null) return null;
  const { r, h } = data as { r?: unknown; h?: unknown };
  return typeof r === 'string' && typeof h === 'string' && REF.test(r) && HOST.test(h)
    ? { hubHost: h, ref: r }
    : null;
}

interface PushPlugin {
  checkPermissions: () => Promise<{ receive: string }>;
  requestPermissions: () => Promise<{ receive: string }>;
  register: () => Promise<void>;
  addListener: (event: string, fn: (data: PushEventData) => void) => Promise<Listener>;
}
interface ScannerPlugin {
  scanBarcode: (o: {
    hint: number;
    scanInstructions: string;
    scanButton: boolean;
    scanText: string;
    cameraDirection: number;
    scanOrientation: number;
  }) => Promise<{ ScanResult: string }>;
}
interface SharePlugin {
  share: (o: { url: string }) => Promise<unknown>;
}
interface HubLauncherPlugin {
  showShell: (o?: { push: PushTap }) => Promise<void>;
  takePhoneExport: (o: { token: string }) => Promise<{ json: string }>;
  setSensitive: (o: { on: boolean }) => Promise<void>;
}
interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, unknown>;
}

export interface NativePushToken {
  token: string;
  env?: 'production' | 'sandbox';
}

export interface NativeBridge {
  platform: 'ios' | 'android';
  /**
   * The shell's native level from its user agent (`HemmiaShell/<n>`, P5.11); 0 for a shell
   * from before the handshake. Features needing a newer shell check it.
   */
  level: number;
  pushPermission: () => Promise<'granted' | 'denied' | 'prompt'>;
  /** Asks for permission (call from a tap) and returns the device token, or null if refused. */
  registerPush: () => Promise<NativePushToken | null>;
  scanCode: () => Promise<string | null>;
  share: (url: string) => Promise<void>;
  /** Back to the app's hub list (the shell). */
  switchHub: () => void;
  /** Calls `fn` for each tapped notification, including one that started the app. */
  onPushTap: (fn: (tap: PushTap) => void) => () => void;
  /** A notification for another hub: the app returns to its shell, which opens that hub. */
  openOnOtherHub: (tap: PushTap) => void;
  /** Hide the screen from screenshots and the app switcher (recovery code, sign-in QR). */
  setSensitive: (on: boolean) => void;
  /** The phone chats the app's shell staged for this hub ("Move to a home hub"), once. */
  takePhoneExport: (token: string) => Promise<string | null>;
}

const REGISTER_TIMEOUT_MS = 15_000;

function plugin(plugins: Record<string, unknown>, name: string): object {
  const p = plugins[name];
  if (typeof p !== 'object' || p === null) throw new Error(`native plugin missing: ${name}`);
  return p;
}

/** The shell level in a user agent (`HemmiaShell/<n>`), or 0. */
export function shellLevel(userAgent: string): number {
  const m = /\bHemmiaShell\/(\d{1,4})\b/.exec(userAgent);
  return m?.[1] ? Number(m[1]) : 0;
}

export function detectNative(
  win: { Capacitor?: CapacitorGlobal },
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
): NativeBridge | null {
  const cap = win.Capacitor;
  if (!cap?.isNativePlatform?.() || !cap.Plugins) return null;
  const platform = cap.getPlatform?.();
  if (platform !== 'ios' && platform !== 'android') return null;
  const plugins = cap.Plugins;

  const permission = (s: string) =>
    s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'prompt';

  return {
    platform,
    level: shellLevel(userAgent),
    pushPermission: async () =>
      permission(
        (await (plugin(plugins, 'PushNotifications') as PushPlugin).checkPermissions()).receive,
      ),
    registerPush: async () => {
      const push = plugin(plugins, 'PushNotifications') as PushPlugin;
      if ((await push.requestPermissions()).receive !== 'granted') return null;
      const listeners: Listener[] = [];
      try {
        let done: (v: string | null) => void = () => undefined;
        const token = new Promise<string | null>((resolve) => {
          const timer = setTimeout(() => {
            resolve(null);
          }, REGISTER_TIMEOUT_MS);
          done = (v) => {
            clearTimeout(timer);
            resolve(v);
          };
        });
        // Listen before registering: the token event can fire right away.
        listeners.push(
          await push.addListener('registration', (d) => {
            done(typeof d.value === 'string' ? d.value : null);
          }),
          await push.addListener('registrationError', () => {
            done(null);
          }),
        );
        await push.register().catch(() => {
          done(null);
        });
        const value = await token;
        return value === null ? null : { token: value };
      } finally {
        for (const l of listeners) void l.remove();
      }
    },
    scanCode: async () => {
      try {
        const r = await (plugin(plugins, 'CapacitorBarcodeScanner') as ScannerPlugin).scanBarcode({
          hint: 0, // QR code
          scanInstructions: ' ',
          scanButton: false,
          scanText: ' ',
          cameraDirection: 1, // back
          scanOrientation: 3, // adaptive
        });
        return r.ScanResult || null;
      } catch {
        return null; // cancelled or no camera permission
      }
    },
    share: async (url) => {
      await (plugin(plugins, 'Share') as SharePlugin).share({ url }).catch(() => undefined);
    },
    switchHub: () => {
      void (plugin(plugins, 'HubLauncher') as HubLauncherPlugin).showShell();
    },
    onPushTap: (fn) => {
      let listener: Listener | null = null;
      let stopped = false;
      void (plugin(plugins, 'PushNotifications') as PushPlugin)
        .addListener('pushNotificationActionPerformed', (d) => {
          const tap = readPushTap(d.notification?.data);
          if (tap) fn(tap);
        })
        .then((l) => {
          if (stopped) void l.remove();
          else listener = l;
        });
      return () => {
        stopped = true;
        void listener?.remove();
      };
    },
    openOnOtherHub: (tap) => {
      void (plugin(plugins, 'HubLauncher') as HubLauncherPlugin).showShell({ push: tap });
    },
    takePhoneExport: async (token) => {
      try {
        return (
          await (plugin(plugins, 'HubLauncher') as HubLauncherPlugin).takePhoneExport({ token })
        ).json;
      } catch {
        return null;
      }
    },
    setSensitive: (on) => {
      void (plugin(plugins, 'HubLauncher') as HubLauncherPlugin)
        .setSensitive({ on })
        .catch(() => undefined);
    },
  };
}

// The demo (src/demo) runs inside the app shell but is not a hub: no push, no hub switching.
export const native: NativeBridge | null =
  typeof window === 'undefined' || import.meta.env.MODE === 'demo'
    ? null
    : detectNative(window as { Capacitor?: CapacitorGlobal });
