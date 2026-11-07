import { useState } from 'react';
import type { Message } from '@hemmia/shared';
import { useI18n } from '../i18n/index.tsx';
import { DocIcon, SparkIcon } from '@hemmia/ui';
import { ImageViewer } from '@hemmia/ui';
import { Markdown } from '@hemmia/ui';
import { NotedNotes } from './NotedNotes.tsx';
import { WebPhotos } from './WebPhotos.tsx';
import { WebSearches } from './WebSearches.tsx';
import { LinkedPages } from './LinkedPages.tsx';

type Attachment = Message['attachments'][number];

function DocumentChip({ a }: { a: Attachment }) {
  const { t } = useI18n();
  const count =
    a.pages === null
      ? null
      : a.mime.includes('spreadsheet')
        ? t('attach.sheets', { pages: a.pages })
        : t('attach.pages', { pages: a.pages });
  return (
    <a
      href={`/api/attachments/${a.id}`}
      download={a.name ?? 'document'}
      className="flex max-w-full items-center gap-2 rounded-xl bg-champagne px-3 py-2 text-sm text-on-champagne"
    >
      <DocIcon size={18} />
      <span className="truncate">{a.name ?? 'document'}</span>
      {count && <span className="shrink-0 opacity-70">· {count}</span>}
      {a.scanPages > 0 && <span className="shrink-0 opacity-70">· {t('attach.scanned')}</span>}
    </a>
  );
}

export function MessageBubble({
  message,
}: {
  message: Pick<Message, 'role' | 'content' | 'status'> & {
    attachments?: Message['attachments'];
    searches?: Message['searches'];
    pages?: Message['pages'];
    notes?: Message['notes'];
  };
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  const attachments = message.attachments ?? [];
  const photos = attachments.filter((a) => a.kind === 'upload');
  const webPhotos = attachments.filter((a) => a.kind === 'web');
  const documents = attachments.filter((a) => a.kind === 'document');
  const generated = attachments.filter((a) => a.kind === 'generated');
  const isUser = message.role === 'user';

  return (
    <div
      aria-label={isUser ? t('chat.you') : t('chat.assistant')}
      className={`flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}
    >
      {photos.length > 0 && (
        <div className="flex max-w-[85%] flex-wrap justify-end gap-2">
          {photos.map((a) => (
            <button
              key={a.id}
              type="button"
              aria-label={t('image.open')}
              onClick={() => {
                setOpen(a.id);
              }}
            >
              <img
                src={`/api/attachments/${a.id}`}
                alt=""
                loading="lazy"
                className="max-h-56 rounded-2xl"
              />
            </button>
          ))}
        </div>
      )}
      {documents.length > 0 && (
        <div className="flex max-w-[85%] flex-col items-end gap-1.5">
          {documents.map((a) => (
            <DocumentChip key={a.id} a={a} />
          ))}
        </div>
      )}
      {!isUser && <WebSearches searches={message.searches ?? []} />}
      {isUser && <LinkedPages pages={message.pages ?? []} />}
      {isUser
        ? message.content !== '' && (
            <div className="max-w-[85%] rounded-[22px] rounded-br-md bg-forest px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words text-on-forest">
              {message.content}
            </div>
          )
        : message.content !== '' && (
            <div className="w-full max-w-prose text-[15px]">
              <Markdown text={message.content} />
            </div>
          )}
      {!isUser && <WebPhotos photos={webPhotos} onOpen={setOpen} />}
      {generated.map((a) => (
        <figure key={a.id} className="flex flex-col gap-1.5">
          <button
            type="button"
            aria-label={t('image.open')}
            onClick={() => {
              setOpen(a.id);
            }}
          >
            <img
              src={`/api/attachments/${a.id}`}
              alt=""
              className="max-h-[28rem] max-w-full rounded-2xl shadow-sm"
            />
          </button>
          <figcaption className="flex items-center gap-1.5 text-xs text-muted">
            <SparkIcon size={13} />
            {t('image.created', { model: 'Hemmia' })}
          </figcaption>
        </figure>
      ))}
      {!isUser && <NotedNotes notes={message.notes ?? []} />}
      {message.status === 'cancelled' && <p className="text-xs text-muted">{t('chat.stopped')}</p>}
      {message.status === 'error' && <p className="text-xs text-danger">{t('chat.failed')}</p>}
      {open && (
        <ImageViewer
          id={open}
          onClose={() => {
            setOpen(null);
          }}
        />
      )}
    </div>
  );
}
