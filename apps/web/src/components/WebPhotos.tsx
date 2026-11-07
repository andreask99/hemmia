import type { AttachmentRef } from '@hemmia/shared';
import { useT } from '../i18n/index.tsx';

/** Host name of an http(s) URL without "www.", or null for anything else. */
function webHost(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Photos from the web under a reply: loaded from kchat itself, credited with their pages. */
export function WebPhotos({
  photos,
  onOpen,
}: {
  photos: readonly AttachmentRef[];
  onOpen: (id: string) => void;
}) {
  const t = useT();
  if (photos.length === 0) return null;

  const single = photos.length === 1;
  const columns = single ? 'grid-cols-1' : photos.length === 2 ? 'grid-cols-2' : 'grid-cols-3';
  const credits: { host: string; url: string }[] = [];
  for (const photo of photos) {
    const host = photo.source ? webHost(photo.source.url) : null;
    if (photo.source && host && !credits.some((c) => c.host === host)) {
      credits.push({ host, url: photo.source.url });
    }
  }

  return (
    <figure className="flex w-full max-w-prose flex-col gap-1.5">
      <div className={`grid ${columns} gap-2`}>
        {photos.map((photo) => (
          <button
            key={photo.id}
            type="button"
            aria-label={t('image.open')}
            onClick={() => {
              onOpen(photo.id);
            }}
          >
            <img
              src={`/api/attachments/${photo.id}`}
              alt=""
              loading="lazy"
              className={`${single ? 'max-h-[28rem]' : 'aspect-square'} w-full rounded-xl object-cover`}
            />
          </button>
        ))}
      </div>
      <figcaption className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
        {t('photos.fromWeb')}
        {credits.map((c) => (
          <a
            key={c.host}
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            {c.host}
          </a>
        ))}
      </figcaption>
    </figure>
  );
}
