/**
 * Phone mode (PHONE-MODE.md §3): provider and key setup, the chat list, a chat, settings,
 * export/import, moving to a home hub and deleting everything. Keys are read from SecureStore
 * when needed and never kept in state, except masked for the settings screen.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { createAnthropicClient, createOpenAiClient, listModels } from '@hemmia/providers';
import { secureStore } from '../native/secureStore.ts';
import type { StoredHub } from '../shell/hubs.ts';
import type { ChatDeps } from './chat.ts';
import { buildExport, deleteEverything, exportFileName, importExport } from './export.ts';
import { capacitorFiles } from './files.ts';
import { usePhoneText } from './i18n.ts';
import { createKeys, maskKey, type Provider } from './keys.ts';
import { modelsFor, PHONE_MODELS } from './models.ts';
import { PhoneChat } from './PhoneChat.tsx';
import { PhoneHome } from './PhoneHome.tsx';
import { PhoneSettings } from './PhoneSettings.tsx';
import { SetupKey } from './SetupKey.tsx';
import { SetupProvider } from './SetupProvider.tsx';
import { type ChatEntry, createPhoneStore, LimitError, type StoredChat } from './store.ts';

type Screen =
  | { name: 'provider' }
  | { name: 'key'; provider: Provider; back: 'provider' | 'settings' }
  | { name: 'home' }
  | { name: 'chat'; chat: StoredChat }
  | { name: 'settings' }
  | { name: 'move' };

export interface PhoneAppProps {
  /** Set up from the start (no key yet). */
  setup: boolean;
  hubs: readonly StoredHub[];
  /** "Set up kchat at home": the shell's get-a-hub screens. */
  onSetUpHome: () => void;
  /** Hands the export to the shell, which stages it for the hub and opens it. */
  onMoveToHub: (hubHost: string, exportJson: string) => Promise<void>;
  /** After "delete everything" or leaving setup: back to the welcome screen. */
  onLeave: () => void;
}

const newId = () => crypto.randomUUID().replace(/-/g, '');
const PRIVACY = { en: 'https://hemmia.app/privacy/', de: 'https://hemmia.app/de/privacy/' };

/** Links leave the app: with no allowNavigation they open in the system browser. */
const openOutside = (url: string) => {
  window.open(url, '_blank', 'noopener');
};

export function PhoneApp(props: PhoneAppProps) {
  const keys = useMemo(() => createKeys(secureStore), []);
  const [language, setLanguage] = useState<'en' | 'de'>(() =>
    navigator.languages[0]?.toLowerCase().startsWith('de') ? 'de' : 'en',
  );
  const store = useMemo(
    () => createPhoneStore(capacitorFiles, () => keys.dataKey(), { language }),
    [keys, language],
  );
  const { t } = usePhoneText(language);
  const [screen, setScreen] = useState<Screen>(
    props.setup ? { name: 'provider' } : { name: 'home' },
  );
  const [chats, setChats] = useState<ChatEntry[]>([]);
  const [aboutMe, setAboutMe] = useState('');
  const [masked, setMasked] = useState<{ anthropic: string | null; openai: string | null }>({
    anthropic: null,
    openai: null,
  });
  const [notice, setNotice] = useState<string | null>(null);

  const deps: ChatDeps = useMemo(
    () => ({
      store,
      keys,
      clients: {
        anthropic: createAnthropicClient({ browser: true }),
        openai: createOpenAiClient(),
      },
      now: () => Date.now(),
      newId,
    }),
    [store, keys],
  );

  const reload = useCallback(async () => {
    const index = await store.loadIndex();
    setChats(index.chats);
    setAboutMe(index.aboutMe);
    setLanguage(index.language);
    const [a, o] = await Promise.all([keys.apiKey('anthropic'), keys.apiKey('openai')]);
    setMasked({ anthropic: a ? maskKey(a) : null, openai: o ? maskKey(o) : null });
    const unreadable = store.takeUnreadable();
    if (unreadable > 0) setNotice(String(unreadable));
  }, [store, keys]);

  useEffect(() => {
    // reload sets state only after its first await, never synchronously in the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const providers = useMemo(() => {
    const s = new Set<Provider>();
    if (masked.anthropic) s.add('anthropic');
    if (masked.openai) s.add('openai');
    return s;
  }, [masked]);
  const models = modelsFor(providers);

  const checkKey = (provider: Provider) => async (key: string) => {
    const r = await listModels(
      provider,
      key,
      (url, init) => fetch(url, init),
      AbortSignal.timeout(15_000),
    );
    if (r === 'ok') await keys.setApiKey(provider, key);
    return r;
  };

  const exportChats = async () => {
    const { data } = await buildExport(store, Date.now());
    const path = `exports/${exportFileName(new Date())}`;
    const file = await Filesystem.writeFile({
      path,
      directory: Directory.Cache,
      data: JSON.stringify(data),
      encoding: Encoding.UTF8,
      recursive: true,
    });
    try {
      await Share.share({ files: [file.uri] });
    } finally {
      await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => undefined);
    }
  };

  const importChats = async (file: File) => {
    try {
      const r = await importExport(store, await file.text(), newId);
      setNotice(r.ok ? null : 'import');
    } catch (e) {
      setNotice(e instanceof LimitError ? 'limit' : 'import');
    }
    await reload();
  };

  switch (screen.name) {
    case 'provider':
      return (
        <SetupProvider
          language={language}
          onChoose={(provider) => {
            setScreen({ name: 'key', provider, back: 'provider' });
          }}
          onBack={props.onLeave}
          onOpenUrl={openOutside}
        />
      );
    case 'key':
      return (
        <SetupKey
          language={language}
          provider={screen.provider}
          checkKey={checkKey(screen.provider)}
          onSaved={() => {
            void reload().then(() => {
              setScreen(screen.back === 'settings' ? { name: 'settings' } : { name: 'home' });
            });
          }}
          onOpenUrl={openOutside}
          onBack={() => {
            setScreen(screen.back === 'settings' ? { name: 'settings' } : { name: 'provider' });
          }}
        />
      );
    case 'chat':
      return (
        <PhoneChat
          language={language}
          deps={deps}
          chat={screen.chat}
          models={models}
          aboutMe={aboutMe}
          onBack={() => {
            void reload();
            setScreen({ name: 'home' });
          }}
          onSaved={() => undefined}
          subscribeBackground={(fn) => {
            const sub = CapApp.addListener('appStateChange', ({ isActive }) => {
              if (!isActive) fn();
            });
            return () => {
              void sub.then((s) => s.remove());
            };
          }}
        />
      );
    case 'settings':
      return (
        <PhoneSettings
          language={language}
          keys={masked}
          onSetKey={(provider) => {
            setScreen({ name: 'key', provider, back: 'settings' });
          }}
          onRemoveKey={(provider) => {
            void keys.removeApiKey(provider).then(reload);
          }}
          aboutMe={aboutMe}
          onSaveAboutMe={(text) => {
            void store.setProfile({ aboutMe: text }).then(reload);
          }}
          phoneLanguage={language}
          onLanguage={(l) => {
            void store.setProfile({ language: l }).then(reload);
          }}
          onExport={() => void exportChats()}
          onImport={(file) => void importChats(file)}
          onMoveToHub={() => {
            setScreen({ name: 'move' });
          }}
          onPrivacy={() => {
            openOutside(PRIVACY[language]);
          }}
          onDeleteEverything={() => {
            void deleteEverything(store, keys).then(props.onLeave);
          }}
          onBack={() => {
            setScreen({ name: 'home' });
          }}
        />
      );
    case 'move':
      return (
        <div className="flex flex-col gap-4 p-6">
          <button
            type="button"
            onClick={() => {
              setScreen({ name: 'settings' });
            }}
            className="self-start text-sm font-medium"
          >
            ‹ {t('settings.title')}
          </button>
          <h1 className="font-display text-2xl font-semibold">{t('move.title')}</h1>
          <p className="text-sm text-muted">{t('move.intro')}</p>
          {props.hubs.length === 0 ? (
            <button
              type="button"
              onClick={props.onSetUpHome}
              className="min-h-12 rounded-xl bg-forest font-semibold text-on-forest"
            >
              {t('move.pairFirst')}
            </button>
          ) : (
            <ul className="flex flex-col gap-2">
              {props.hubs.map((h) => (
                <li key={h.hubHost}>
                  <button
                    type="button"
                    onClick={() => {
                      void buildExport(store, Date.now()).then(({ data }) =>
                        props.onMoveToHub(h.hubHost, JSON.stringify(data)),
                      );
                    }}
                    className="w-full rounded-xl border border-line bg-card p-3 text-left"
                  >
                    <span className="block font-semibold">{h.name}</span>
                    <span className="block text-sm text-muted">{h.hubHost}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    case 'home':
      return (
        <>
          {notice && (
            <p role="alert" className="m-4 rounded-xl border border-line bg-card p-3 text-sm">
              {notice === 'limit'
                ? t('chat.error.limit')
                : notice === 'import'
                  ? t('move.importFailed')
                  : t('home.unreadable', { count: notice })}
            </p>
          )}
          <PhoneHome
            language={language}
            chats={chats}
            onOpen={(id) => {
              void store.getChat(id).then((chat) => {
                if (chat) setScreen({ name: 'chat', chat });
              });
            }}
            onNew={() => {
              const model = models[0] ?? PHONE_MODELS[0];
              if (!model) return;
              setScreen({
                name: 'chat',
                chat: {
                  id: newId(),
                  title: '',
                  createdAt: Date.now(),
                  model: model.id,
                  messages: [],
                },
              });
            }}
            onRename={(id, title) => {
              void store.renameChat(id, title).then(reload);
            }}
            onDelete={(id) => {
              void store.deleteChat(id).then(reload);
            }}
            onSettings={() => {
              setScreen({ name: 'settings' });
            }}
            onSetUpHome={props.onSetUpHome}
          />
        </>
      );
  }
}
