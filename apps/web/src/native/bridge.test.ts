import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectNative, shellLevel } from './bridge.ts';

type Fn = (data: { value?: string; error?: string }) => void;

function fakeCapacitor(opts: { permission?: string; token?: string | null } = {}) {
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
      return Promise.resolve({ remove: () => Promise.resolve() });
    }),
  };
  const share = { share: vi.fn(() => Promise.resolve()) };
  const hub = { showShell: vi.fn(() => Promise.resolve()) };
  return {
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

describe('shell level (version handshake)', () => {
  it('reads the level from the user agent, 0 without one', () => {
    expect(shellLevel('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 HemmiaShell/3')).toBe(3);
    expect(shellLevel('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15')).toBe(0);
    expect(shellLevel('NotHemmiaShell/9x')).toBe(0);
    expect(detectNative(fakeCapacitor().win, 'X HemmiaShell/2')?.level).toBe(2);
  });
});
