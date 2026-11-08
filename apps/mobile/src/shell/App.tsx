/** The app shell: picks the start screen and wires the screens to the phone (PLAN.md P5.4). */
import { useCallback, useEffect, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerTypeHint,
} from '@capacitor/barcode-scanner';
import { PushNotifications } from '@capacitor/push-notifications';
import { Share } from '@capacitor/share';
import { hubLauncher, type LaunchInfo } from '../native/hubLauncher.ts';
import { secureStore } from '../native/secureStore.ts';
import { PhoneApp } from '../phone/PhoneApp.tsx';
import { GetHub } from './GetHub.tsx';
import { HubList } from './HubList.tsx';
import { useHubs } from './hubs.ts';
import { useShellText } from './i18n.ts';
import { ConfirmHub } from './ConfirmHub.tsx';
import { Offline } from './Offline.tsx';
import {
  checkHub,
  incomingLinkTarget,
  type LinkTarget,
  linkTarget,
  type NativeGet,
  openHub,
  startAction,
} from './open.ts';
import { Outdated } from './Outdated.tsx';
import { ShellRouter, useRouter } from './router.tsx';
import { Scan } from './Scan.tsx';
import { hostRules, hubStore } from './store.ts';
import { Welcome } from './Welcome.tsx';

/** Native HTTP for the hub's health answer (the handshake, P5.11); null in a browser. */
const nativeGet: NativeGet | null = Capacitor.isNativePlatform()
  ? async (url) => {
      const res = await CapacitorHttp.get({
        url,
        headers: { Accept: 'application/json' },
        connectTimeout: 8000,
        readTimeout: 8000,
      });
      return { status: res.status, data: res.data as unknown };
    }
  : null;

const STORE_URL = Capacitor.getPlatform() === 'android' ? __STORE_URL_ANDROID__ : __STORE_URL_IOS__;

const START_INFO: LaunchInfo = { reason: 'start', hubHost: null, link: null, push: null };

/** Phone mode is set up when an API key is stored (PHONE-MODE.md §3). */
async function isPhoneReady(): Promise<boolean> {
  try {
    for (const name of ['apiKey.anthropic', 'apiKey.openai'] as const) {
      if ((await secureStore.get({ name })).value !== null) return true;
    }
  } catch {
    // Not in the app (browser dev), or the keychain is locked: no phone mode.
  }
  return false;
}

export function App() {
  return (
    <ShellRouter initial={{ name: 'starting' }}>
      <main className="min-h-screen bg-paper text-ink supports-[height:100dvh]:min-h-dvh">
        <Shell />
      </main>
    </ShellRouter>
  );
}

function Shell() {
  const { t } = useShellText();
  const { screen, go } = useRouter();
  const { hubs, remove } = useHubs(hubStore);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phoneReady, setPhoneReady] = useState(false);
  const started = useRef(false);

  const open = useCallback(
    async (target: LinkTarget) => {
      setBusy(true);
      setError(null);
      const result = await openHub(
        {
          store: hubStore,
          rules: hostRules,
          launcher: hubLauncher,
          check: (h) => checkHub(h, nativeGet),
          now: () => Date.now(),
          defaultName: t('open.defaultName'),
        },
        target,
      ).catch(() => 'offline' as const);
      setBusy(false);
      // 'opened': the native side restarts the app on the hub.
      if (result === 'appTooOld' || result === 'hubTooOld') {
        go({
          name: 'outdated',
          hubHost: target.hubHost,
          side: result === 'appTooOld' ? 'app' : 'hub',
        });
      } else if (result === 'refused') {
        setError(t('open.invalidLink'));
        go({ name: 'scan' });
      } else if (result === 'offline') {
        const saved = (await hubStore.list()).some((h) => h.hubHost === target.hubHost);
        if (saved) go({ name: 'offline', hubHost: target.hubHost });
        else {
          setError(t('open.unreachable'));
          go({ name: 'scan' });
        }
      }
    },
    [go, t],
  );

  /** A link tapped outside the app: a hub not saved yet is confirmed first. */
  const openIncoming = useCallback(
    async (target: LinkTarget) => {
      const saved = (await hubStore.list()).some((h) => h.hubHost === target.hubHost);
      if (saved) void open(target);
      else go({ name: 'confirmHub', target });
    },
    [go, open],
  );

  const openLink = useCallback(
    (raw: string, parse: typeof linkTarget = linkTarget, incoming = false) => {
      const target = parse(raw, hostRules);
      if (target && incoming) void openIncoming(target);
      else if (target) void open(target);
      else {
        setError(t('open.invalidLink'));
        go({ name: 'scan' });
      }
    },
    [go, open, openIncoming, t],
  );

  // Start: why the shell is showing, a launch link, or a tapped notification.
  useEffect(() => {
    if (hubs === null || started.current) return;
    started.current = true;
    void (async () => {
      const info = await hubLauncher.launchInfo().catch(() => START_INFO);
      const launchUrl = (await CapApp.getLaunchUrl().catch(() => undefined))?.url ?? null;
      const ready = await isPhoneReady();
      setPhoneReady(ready);
      const action = startAction(info, hubs, launchUrl, hostRules, ready);
      // A push tap or the only saved hub opens directly; a launch link to a new hub asks.
      if (action.kind === 'open') void openIncoming(action.target);
      else if (action.kind === 'offline') go({ name: 'offline', hubHost: action.hubHost });
      else if (action.screen === 'phone') go({ name: 'phone', setup: false });
      else go({ name: action.screen });
    })();
  }, [hubs, go, openIncoming]);

  // Links and notification taps while the shell is open.
  useEffect(() => {
    const subs = [
      CapApp.addListener('appUrlOpen', ({ url }) => {
        openLink(url, incomingLinkTarget, true);
      }),
      PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
        const data = a.notification.data as { h?: unknown; r?: unknown } | undefined;
        const h = typeof data?.h === 'string' ? data.h : null;
        const r =
          typeof data?.r === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(data.r) ? data.r : null;
        void hubStore.list().then((saved) => {
          if (h && r && saved.some((x) => x.hubHost === h))
            void open({ hubHost: h, path: `/push-open#${r}` });
        });
      }),
    ];
    return () => {
      for (const s of subs) void s.then((l) => l.remove());
    };
  }, [open, openLink]);

  const scan = async () => {
    try {
      const r = await CapacitorBarcodeScanner.scanBarcode({
        hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
      });
      if (r.ScanResult) openLink(r.ScanResult);
    } catch {
      // cancelled, or no camera permission: stay on this screen
    }
  };

  if (busy || screen.name === 'starting') {
    return (
      <p role="status" className="p-6 pt-24 text-center text-muted">
        {t('open.connecting')}
      </p>
    );
  }

  switch (screen.name) {
    case 'welcome':
      return (
        <Welcome
          onScan={() => void scan()}
          onPasteLink={(text) => {
            openLink(text);
          }}
          onGetHub={() => {
            go({ name: 'getHub' });
          }}
          onPhoneMode={() => {
            go({ name: 'phone', setup: !phoneReady });
          }}
          onDemo={() => {
            // A page of this bundle (same origin, no hub): its "Leave demo" comes back here.
            window.location.assign('./demo/index.html');
          }}
        />
      );
    case 'getHub':
      return (
        <GetHub
          onShareDownloadLink={() =>
            void Share.share({ text: t('getHub.shareText'), url: __DOWNLOAD_URL__ }).catch(
              () => undefined,
            )
          }
          onBack={() => {
            go({ name: 'welcome' });
          }}
        />
      );
    case 'scan':
      return (
        <Scan
          error={error}
          onPasteLink={(text) => {
            openLink(text);
          }}
          onBack={() => {
            setError(null);
            go({ name: (hubs?.length ?? 0) > 0 ? 'hubs' : 'welcome' });
          }}
        />
      );
    case 'hubs':
      return (
        <HubList
          hubs={hubs ?? []}
          onOpenHub={(hubHost) => void open({ hubHost, path: '/' })}
          onRemove={(hubHost) => void remove(hubHost)}
          onAdd={() => {
            go({ name: 'welcome' });
          }}
          {...(phoneReady
            ? {
                onPhoneMode: () => {
                  go({ name: 'phone', setup: false });
                },
              }
            : {})}
        />
      );
    case 'phone':
      return (
        <PhoneApp
          setup={screen.setup}
          hubs={hubs ?? []}
          onSetUpHome={() => {
            go({ name: 'getHub' });
          }}
          onMoveToHub={async (hubHost, json) => {
            const { token } = await hubLauncher.stagePhoneExport({ hubHost, json });
            await open({ hubHost, path: `/import#phone~${token}` });
          }}
          onLeave={() => {
            void isPhoneReady().then((ready) => {
              setPhoneReady(ready);
              if (ready) go({ name: 'phone', setup: false });
              else go({ name: (hubs?.length ?? 0) > 0 ? 'hubs' : 'welcome' });
            });
          }}
        />
      );
    case 'confirmHub':
      return (
        <ConfirmHub
          hubHost={screen.target.hubHost}
          onConfirm={() => void open(screen.target)}
          onCancel={() => {
            go({ name: (hubs?.length ?? 0) > 0 ? 'hubs' : 'welcome' });
          }}
        />
      );
    case 'offline': {
      const hub = hubs?.find((h) => h.hubHost === screen.hubHost);
      if (!hub) return null;
      return (
        <Offline
          hub={hub}
          retrying={busy}
          onRetry={() => void open({ hubHost: hub.hubHost, path: '/' })}
          onSwitch={() => {
            go({ name: 'hubs' });
          }}
        />
      );
    }
    case 'outdated': {
      const hub = hubs?.find((h) => h.hubHost === screen.hubHost);
      if (!hub) return null;
      return (
        <Outdated
          hub={hub}
          side={screen.side}
          storeUrl={STORE_URL}
          onRetry={() => void open({ hubHost: hub.hubHost, path: '/' })}
          onSwitch={() => {
            go({ name: 'hubs' });
          }}
        />
      );
    }
  }
}
