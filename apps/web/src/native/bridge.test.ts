import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectNative, shellLevel } from './bridge.ts';

type Fn = (data: { value?: string; error?: string; notification?: { data?: unknown } }) => void;

function fakeCapacitor(
  opts: { permission?: string; token?: string | null; directListener?: boolean } = {},
) {
  const remove = vi.fn(() => Promise.resolve());
  const listeners: Record<string, Fn> = {};
  const push = {
    checkPermissions: vi.fn(() => Promise.resolve({ receive: opts.permission ?? 'prompt' })),
    requestPermissions: vi.fn(() => Promise.resolve({ receive: opts.permission ?? 'granted' })),
    register: vi.fn(() => {
      if (opts.token === null) listeners['registrationError']?.({ error: 'x' });
      else listeners['registration']?.({ value: opts.token ?? 'tok' });
      return Promise.resolve();
    }),
    addListener: vi.fn((event: string, fn: Fn) => {
      listeners[event] = fn;
      // The bridge injected into a hub page returns the listener itself.
      return opts.directListener ? { remove } : Promise.resolve({ remove });
    }),
  };
  const share = { share: vi.fn(() => Promise.resolve()) };
  const hub = { showShell: vi.fn(() => Promise.resolve()) };
  return {
    listeners,
    remove,
    push,
    share,
    hub,
    win: {
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => 'android',
        Plugins: { PushNotifications: push, Share: share, HubLauncher: hub },
      },
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('detectNative', () => {
  it('is null in a browser and on the web platform', () => {
    expect(detectNative({})).toBeNull();
    expect(detectNative({ Capacitor: { isNativePlatform: () => false, Plugins: {} } })).toBeNull();
    expect(
      detectNative({
        Capacitor: { isNativePlatform: () => true, getPlatform: () => 'web', Plugins: {} },
      }),
    ).toBeNull();
  });

  it('registers for push after permission and returns the token', async () => {
    const f = fakeCapacitor({ token: 'abc' });
    const bridge = detectNative(f.win);
    expect(bridge?.platform).toBe('android');
    expect(await bridge?.registerPush()).toEqual({ token: 'abc' });
  });

  it('tells the hub which APNs environment an iOS token belongs to', async () => {
    const ios = (hub: object) => {
      const f = fakeCapacitor({ token: 'abc' });
      return detectNative({
        Capacitor: {
          ...f.win.Capacitor,
          getPlatform: () => 'ios',
          Plugins: { ...f.win.Capacitor.Plugins, HubLauncher: hub },
        },
      });
    };
    const env = (value: string) => ({ pushEnvironment: () => Promise.resolve({ env: value }) });
    expect(await ios(env('sandbox'))?.registerPush()).toEqual({ token: 'abc', env: 'sandbox' });
    expect(await ios(env('production'))?.registerPush()).toEqual({
      token: 'abc',
      env: 'production',
    });
    // Older app builds don't have the method, or reject it: the hub assumes production.
    expect(await ios({})?.registerPush()).toEqual({ token: 'abc' });
    expect(
      await ios({ pushEnvironment: () => Promise.reject(new Error('unknown')) })?.registerPush(),
    ).toEqual({ token: 'abc' });
  });

  it('returns null when permission is refused or registration fails', async () => {
    expect(
      await detectNative(fakeCapacitor({ permission: 'denied' }).win)?.registerPush(),
    ).toBeNull();
    expect(await detectNative(fakeCapacitor({ token: null }).win)?.registerPush()).toBeNull();
  });

  it('shares through the plugin and switches hub', async () => {
    const f = fakeCapacitor();
    const bridge = detectNative(f.win);
    await bridge?.share('https://join.relay.example/j#1');
    bridge?.switchHub();
    expect(f.share.share).toHaveBeenCalledWith({ url: 'https://join.relay.example/j#1' });
    expect(f.hub.showShell).toHaveBeenCalledTimes(1);
  });
});

describe('notification taps', () => {
  const data = { r: 'ref1', h: 'abc.h.hemmia.app' };

  it('works with the listener Capacitor injects into a hub page (returned directly)', async () => {
    const f = fakeCapacitor({ directListener: true });
    const seen: unknown[] = [];
    const stop = detectNative(f.win)?.onPushTap((t) => seen.push(t));
    f.listeners['pushNotificationActionPerformed']?.({ notification: { data } });
    expect(seen).toEqual([{ hubHost: data.h, ref: data.r }]);
    await Promise.resolve();
    stop?.();
    expect(f.remove).toHaveBeenCalled();
  });

  it('works with the promise from @capacitor/core, and without a push plugin', async () => {
    const f = fakeCapacitor();
    const stop = detectNative(f.win)?.onPushTap(() => undefined);
    await Promise.resolve();
    expect(() => stop?.()).not.toThrow();
    const bare = detectNative({
      Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {} },
    });
    expect(() => bare?.onPushTap(() => undefined)()).not.toThrow();
  });
});

describe('shell level (version handshake)', () => {
  it('reads the level from the user agent, 0 without one', () => {
    expect(shellLevel('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 HemmiaShell/3')).toBe(3);
    expect(shellLevel('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15')).toBe(0);
    expect(shellLevel('NotHemmiaShell/9x')).toBe(0);
    expect(detectNative(fakeCapacitor().win, 'X HemmiaShell/2')?.level).toBe(2);
  });
});
