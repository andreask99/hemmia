import { useEffect } from 'react';
import { useUiText } from './text.tsx';
import { CloseIcon, DownloadIcon } from './icons.tsx';

export function ImageViewer({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useUiText();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const button =
    'inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-white hover:bg-white/10';
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex flex-col bg-black/92">
      <div className="flex justify-end gap-1 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <a href={`/api/attachments/${id}`} download="hemmia-image.png" className={button}>
          <DownloadIcon size={18} />
          {t('image.save')}
        </a>
        <button type="button" onClick={onClose} className={button}>
          <CloseIcon size={18} />
          {t('image.close')}
        </button>
      </div>
      <img
        src={`/api/attachments/${id}`}
        alt=""
        className="min-h-0 flex-1 object-contain p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      />
    </div>
  );
}
