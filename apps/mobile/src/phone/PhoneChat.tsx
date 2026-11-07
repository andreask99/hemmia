/** One phone-mode chat (PLAN.md P9.5): messages, streaming reply, photos, model and think switch. */
import { useEffect, useRef, useState } from 'react';
import { Markdown } from '@hemmia/ui';
import type { ShellLanguage } from '../shell/i18n.ts';
import { type ChatDeps, type ChatErrorCode, resizePhoto, sendTurn } from './chat.ts';
import { usePhoneText } from './i18n.ts';
import type { PhoneModel } from './models.ts';
import { LimitError, type StoredChat, type StoredMessage } from './store.ts';

const MAX_PHOTOS = 4;

export interface PhoneChatProps {
  deps: ChatDeps;
  chat: StoredChat;
  models: readonly PhoneModel[];
  aboutMe: string;
  onBack: () => void;
  onSaved: (chat: StoredChat) => void;
  /** Called when the app goes to the background; the screen stops a running reply. */
  subscribeBackground: (fn: () => void) => () => void;
  language?: ShellLanguage;
}

function Photo({ deps, id, alt }: { deps: ChatDeps; id: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let made: string | null = null;
    let live = true;
    void deps.store.getPhoto(id).then((jpeg) => {
      if (!jpeg || !live) return;
      made = URL.createObjectURL(new Blob([jpeg], { type: 'image/jpeg' }));
      setUrl(made);
    });
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [deps, id]);
  return url ? <img src={url} alt={alt} className="max-h-40 rounded-xl" /> : null;
}

function Bubble({ m, deps }: { m: StoredMessage; deps: ChatDeps }) {
  const { t } = usePhoneText();
  if (m.role === 'user') {
    return (
      <div className="ml-10 flex flex-col items-end gap-2">
        {m.photoIds?.map((id) => (
          <Photo key={id} deps={deps} id={id} alt={t('chat.photo')} />
        ))}
        <p className="rounded-2xl bg-forest px-4 py-2 whitespace-pre-wrap text-on-forest">
          {m.content}
        </p>
      </div>
    );
  }
  return (
    <div className="mr-4">
      <Markdown text={m.content} />
      {m.stopped && <p className="text-xs text-muted">{t('chat.stopped')}</p>}
    </div>
  );
}

export function PhoneChat(props: PhoneChatProps) {
  const { t, language } = usePhoneText(props.language);
  const [chat, setChat] = useState(props.chat);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<Uint8Array<ArrayBuffer>[]>([]);
  const [modelId, setModelId] = useState(props.chat.model);
  const [think, setThink] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<ChatErrorCode | 'limit' | null>(null);
  const abort = useRef<AbortController | null>(null);
  const model = props.models.find((m) => m.id === modelId) ?? props.models[0];
  const busy = reply !== null;

  useEffect(() => props.subscribeBackground(() => abort.current?.abort()), [props]);
  useEffect(() => () => abort.current?.abort(), []);

  const send = async () => {
    const message = text.trim();
    if (!model || busy || (message === '' && photos.length === 0)) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setError(null);
    setReply('');
    setText('');
    const attached = photos;
    setPhotos([]);
    try {
      const r = await sendTurn(props.deps, chat, {
        text: message,
        photos: attached,
        model,
        think,
        aboutMe: props.aboutMe,
        language,
        signal: ctrl.signal,
        onReply: setReply,
      });
      setChat(r.chat);
      props.onSaved(r.chat);
      setError(r.error);
    } catch (e) {
      setError(e instanceof LimitError ? 'limit' : 'unavailable');
    } finally {
      abort.current = null;
      setReply(null);
    }
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    const room = MAX_PHOTOS - photos.length;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    const resized = await Promise.all(picked.map((f) => resizePhoto(f).catch(() => null)));
    setPhotos((p) =>
      [...p, ...resized.filter((x): x is Uint8Array<ArrayBuffer> => x !== null)].slice(
        0,
        MAX_PHOTOS,
      ),
    );
  };

  return (
    <div className="flex min-h-screen flex-col supports-[height:100dvh]:min-h-dvh">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <button type="button" onClick={props.onBack} className="min-h-11 px-2 text-sm font-medium">
          ‹ {t('chat.back')}
        </button>
        <h1 className="flex-1 truncate font-display text-lg font-semibold">{chat.title}</h1>
        <label className="sr-only" htmlFor="phone-model">
          {t('chat.model')}
        </label>
        <select
          id="phone-model"
          value={model?.id ?? ''}
          disabled={busy}
          onChange={(e) => {
            setModelId(e.target.value);
          }}
          className="max-w-36 rounded-lg border border-line bg-card px-2 py-1 text-sm"
        >
          {props.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label[language]}
            </option>
          ))}
        </select>
      </header>

      <main className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {chat.messages.length === 0 && reply === null && (
          <p className="pt-16 text-center text-muted">{t('chat.empty')}</p>
        )}
        {chat.messages.map((m) => (
          <Bubble key={m.id} m={m} deps={props.deps} />
        ))}
        {reply !== null && (
          <div className="mr-4" aria-live="polite">
            <Markdown text={reply || '…'} />
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {t(`chat.error.${error}`)}
          </p>
        )}
      </main>

      <footer className="flex flex-col gap-2 border-t border-line p-3">
        {photos.length > 0 && (
          <ul className="flex gap-2">
            {photos.map((_, i) => (
              <li key={i}>
                <button
                  type="button"
                  aria-label={t('chat.removePhoto')}
                  onClick={() => {
                    setPhotos((all) => all.filter((_, j) => j !== i));
                  }}
                  className="rounded-lg border border-line px-2 py-1 text-xs"
                >
                  {t('chat.photo')} {String(i + 1)} ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-2">
          {model?.vision && (
            <label className="flex min-h-11 cursor-pointer items-center rounded-xl border border-line px-3 text-sm">
              <span>+</span>
              <span className="sr-only">{t('chat.addPhoto')}</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                disabled={busy || photos.length >= MAX_PHOTOS}
                onChange={(e) => {
                  void addPhotos(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
          )}
          <label className="sr-only" htmlFor="phone-message">
            {t('chat.placeholder')}
          </label>
          <textarea
            id="phone-message"
            rows={1}
            value={text}
            placeholder={t('chat.placeholder')}
            onChange={(e) => {
              setText(e.target.value);
            }}
            className="max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-line bg-card px-3 py-2"
          />
          {busy ? (
            <button
              type="button"
              onClick={() => abort.current?.abort()}
              className="min-h-11 rounded-xl border border-line px-4 font-semibold"
            >
              {t('chat.stop')}
            </button>
          ) : (
            <button
              type="button"
              disabled={!model || (text.trim() === '' && photos.length === 0)}
              onClick={() => void send()}
              className="min-h-11 rounded-xl bg-forest px-4 font-semibold text-on-forest disabled:opacity-50"
            >
              {t('chat.send')}
            </button>
          )}
        </div>
        {model?.thinking && (
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={think}
              disabled={busy}
              onChange={(e) => {
                setThink(e.target.checked);
              }}
            />
            {t('chat.think')}
          </label>
        )}
      </footer>
    </div>
  );
}
