import { useEffect, useLayoutEffect, useRef, type ChangeEvent } from 'react';
import { type AttachmentRef, MAX_ATTACHMENTS_PER_MESSAGE } from '@hemmia/shared';
import {
  ACCEPT,
  isPhotoFile,
  MAX_DOCUMENT_BYTES,
  preparePhoto,
  uploadPhoto,
} from '../chat/photos.ts';
import { useT } from '../i18n/index.tsx';
import { CloseIcon, DocIcon, PlusIcon } from '@hemmia/ui';

export interface PendingAttachment {
  key: string;
  kind: 'photo' | 'document';
  name: string;
  /** Object URL for photo previews. */
  previewUrl: string | null;
  progress: number;
  attachment: AttachmentRef | null;
  failed: boolean;
}

export const isUploading = (p: PendingAttachment) => p.attachment === null && !p.failed;

/** The "+" button: picks photos and documents and uploads them. */
export function AttachButton({
  items,
  onChange,
  onNotice,
  disabled,
}: {
  items: PendingAttachment[];
  onChange: (items: PendingAttachment[]) => void;
  onNotice: (message: string | null) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef(items);
  useLayoutEffect(() => {
    latest.current = items;
  }, [items]);
  const update = (key: string, patch: Partial<PendingAttachment>) => {
    latest.current = latest.current.map((p) => (p.key === key ? { ...p, ...patch } : p));
    onChange(latest.current);
  };

  const onSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    const room = MAX_ATTACHMENTS_PER_MESSAGE - latest.current.length;
    onNotice(files.length > room ? t('attach.tooMany') : null);
    const added: { file: File; item: PendingAttachment }[] = [];
    for (const file of files.slice(0, Math.max(0, room))) {
      const photo = isPhotoFile(file);
      if (!photo && file.size > MAX_DOCUMENT_BYTES) {
        onNotice(t('attach.tooBig'));
        continue;
      }
      added.push({
        file,
        item: {
          key: crypto.randomUUID(),
          kind: photo ? 'photo' : 'document',
          name: file.name,
          previewUrl: photo ? URL.createObjectURL(file) : null,
          progress: 0,
          attachment: null,
          failed: false,
        },
      });
    }
    if (added.length === 0) return;
    latest.current = [...latest.current, ...added.map((a) => a.item)];
    onChange(latest.current);
    for (const { file, item } of added) {
      const blob = item.kind === 'photo' ? preparePhoto(file) : Promise.resolve(file);
      blob
        .then((b) =>
          uploadPhoto(
            b,
            (progress) => {
              update(item.key, { progress });
            },
            undefined,
            item.kind === 'photo' ? 'photo.jpg' : file.name,
          ),
        )
        .then((attachment) => {
          update(item.key, { attachment, progress: 1 });
        })
        .catch(() => {
          update(item.key, { failed: true });
        });
    }
  };

  return (
    <>
      <input
        name="attachments"
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        onChange={onSelect}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        aria-label={t('attach.add')}
        title={t('attach.add')}
        disabled={disabled === true || items.length >= MAX_ATTACHMENTS_PER_MESSAGE}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-champagne disabled:opacity-40"
      >
        <PlusIcon />
      </button>
    </>
  );
}

/** Thumbnails and document chips of the attachments waiting to be sent. */
export function PendingAttachments({
  items,
  onChange,
}: {
  items: PendingAttachment[];
  onChange: (items: PendingAttachment[]) => void;
}) {
  const t = useT();
  // Revoke preview URLs when items go away or the composer unmounts.
  const urls = useRef(new Map<string, string>());
  useEffect(() => {
    for (const i of items) if (i.previewUrl) urls.current.set(i.key, i.previewUrl);
  }, [items]);
  useEffect(() => {
    const all = urls.current;
    return () => {
      for (const url of all.values()) URL.revokeObjectURL(url);
    };
  }, []);

  if (items.length === 0) return null;
  const remove = (item: PendingAttachment) => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    urls.current.delete(item.key);
    onChange(items.filter((p) => p.key !== item.key));
  };

  return (
    <div className="flex flex-wrap gap-2 px-3 pt-3">
      {items.map((item) => (
        <div key={item.key} className="relative">
          {item.kind === 'photo' && item.previewUrl ? (
            <img
              src={item.previewUrl}
              alt=""
              title={item.failed ? t('attach.failed') : item.name}
              className={`h-16 w-16 rounded-xl object-cover ${item.failed ? 'ring-2 ring-danger' : ''}`}
            />
          ) : (
            <div
              title={item.failed ? t('attach.failed') : item.name}
              className={`flex h-16 max-w-56 items-center gap-2 rounded-xl bg-champagne px-3 text-sm text-on-champagne ${item.failed ? 'ring-2 ring-danger' : ''}`}
            >
              <DocIcon size={20} />
              <span className="truncate">{item.name}</span>
            </div>
          )}
          {isUploading(item) && (
            <progress
              value={item.progress}
              max={1}
              className="absolute right-1 bottom-1 left-1 h-1 w-auto accent-[var(--forest)]"
            />
          )}
          <button
            type="button"
            onClick={() => {
              remove(item);
            }}
            aria-label={t('attach.remove')}
            className="absolute -top-2 -right-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-ink text-paper shadow"
          >
            <CloseIcon size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
