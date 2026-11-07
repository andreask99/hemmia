/** Phone mode, M12: the chat list with search, rename and delete, and the "at home" card. */
import { useState } from 'react';
import type { ShellLanguage } from '../shell/i18n.ts';
import { usePhoneText } from './i18n.ts';
import type { ChatEntry } from './store.ts';

export function PhoneHome(props: {
  chats: ChatEntry[];
  onOpen: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onSettings: () => void;
  onSetUpHome: () => void;
  language?: ShellLanguage;
}) {
  const { t, language } = usePhoneText(props.language);
  const [search, setSearch] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);

  const needle = search.trim().toLowerCase();
  const shown =
    needle === '' ? props.chats : props.chats.filter((c) => c.title.toLowerCase().includes(needle));
  const date = (ms: number) =>
    new Date(ms).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-GB', {
      day: 'numeric',
      month: 'short',
    });

  const saveRename = () => {
    if (!renaming) return;
    const title = renaming.title.trim();
    if (title !== '') props.onRename(renaming.id, title);
    setRenaming(null);
    setMenuFor(null);
  };

  return (
    <div className="flex min-h-screen flex-col gap-4 p-6 supports-[height:100dvh]:min-h-dvh">
      <div className="flex min-h-11 items-center justify-between">
        <h1 className="font-display text-xl font-semibold text-ink">{t('home.title')}</h1>
        <button
          type="button"
          onClick={props.onSettings}
          aria-label={t('home.settings')}
          className="min-h-11 rounded-lg border border-line px-3 text-sm"
        >
          ⚙︎
        </button>
      </div>

      <input
        type="search"
        aria-label={t('home.search')}
        placeholder={t('home.search')}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
        }}
        className="min-h-11 rounded-xl border border-line bg-card px-3"
      />

      <button
        type="button"
        onClick={props.onNew}
        className="min-h-12 rounded-xl bg-forest font-semibold text-on-forest"
      >
        {t('home.newChat')}
      </button>

      {props.chats.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">{t('home.empty')}</p>
      ) : shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">{t('home.noChats')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((chat) => {
            const title = chat.title || t('home.untitled');
            return (
              <li key={chat.id} className="rounded-xl border border-line bg-card">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      props.onOpen(chat.id);
                    }}
                    className="flex min-h-12 flex-1 items-center justify-between gap-2 p-3 text-left"
                  >
                    <span className="truncate font-semibold text-ink">{title}</span>
                    <span className="text-sm whitespace-nowrap text-muted">
                      {date(chat.updatedAt)}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={t('home.more', { title })}
                    aria-expanded={menuFor === chat.id}
                    onClick={() => {
                      setMenuFor(menuFor === chat.id ? null : chat.id);
                      setRenaming(null);
                    }}
                    className="min-h-11 px-3 text-ink"
                  >
                    ⋯
                  </button>
                </div>
                {menuFor === chat.id && (
                  <div className="flex flex-col gap-2 border-t border-line p-3">
                    {renaming?.id === chat.id ? (
                      <>
                        <input
                          aria-label={t('home.newTitle')}
                          value={renaming.title}
                          maxLength={200}
                          onChange={(e) => {
                            setRenaming({ id: chat.id, title: e.target.value });
                          }}
                          className="min-h-11 rounded-lg border border-line bg-paper px-3"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={saveRename}
                            className="min-h-10 flex-1 rounded-lg bg-forest text-sm font-semibold text-on-forest"
                          >
                            {t('home.save')}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRenaming(null);
                            }}
                            className="min-h-10 flex-1 rounded-lg border border-line text-sm"
                          >
                            {t('home.cancel')}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setRenaming({ id: chat.id, title: chat.title });
                          }}
                          className="min-h-10 flex-1 rounded-lg border border-line text-sm"
                        >
                          {t('home.rename')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(t('home.deleteConfirm'))) {
                              props.onDelete(chat.id);
                              setMenuFor(null);
                            }
                          }}
                          className="min-h-10 flex-1 rounded-lg border border-line text-sm text-danger"
                        >
                          {t('home.delete')}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex-1" />

      <button
        type="button"
        onClick={props.onSetUpHome}
        className="flex flex-col gap-1 rounded-xl border border-line bg-card p-4 text-left"
      >
        <span className="font-semibold text-ink">{t('home.setUp')}</span>
        <span className="text-sm text-muted">{t('home.setUpIntro')}</span>
      </button>
    </div>
  );
}
