import { useEffect, useRef, useState } from 'react';
import type { ChatSummary } from '@hemmia/shared';
import { useNavigate } from 'react-router';
import { useDeleteChat, useRenameChat } from '../chat/hooks.ts';
import { useT } from '../i18n/index.tsx';
import { PenIcon, SparkIcon, TrashIcon } from '@hemmia/ui';
import { IconButton } from '@hemmia/ui';

/** "⋯" menu in the chat header: rename and delete. */
export function ChatActions({
  chat,
  onChooseAgent,
}: {
  chat: ChatSummary;
  /** Opens the agent picker for this chat. */
  onChooseAgent?: () => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const rename = useRenameChat();
  const remove = useDeleteChat();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => {
      document.removeEventListener('mousedown', close);
    };
  }, [open]);

  const item =
    'flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] hover:bg-champagne';
  return (
    <div ref={box} className="relative">
      <IconButton
        aria-label={t('chat.more')}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="19" cy="12" r="1.7" />
        </svg>
      </IconButton>
      {open && (
        <div className="absolute top-12 right-0 z-30 w-52 rounded-2xl border border-line bg-card p-1.5 shadow-xl">
          {onChooseAgent && (
            <button
              type="button"
              className={item}
              onClick={() => {
                setOpen(false);
                onChooseAgent();
              }}
            >
              <SparkIcon size={18} />
              {t('agents.choose')}
            </button>
          )}
          <button
            type="button"
            className={item}
            onClick={() => {
              setOpen(false);
              const title = window.prompt(t('chat.renamePrompt'), chat.title ?? '')?.trim();
              if (title) rename.mutate({ chatId: chat.id, title });
            }}
          >
            <PenIcon size={18} />
            {t('chat.rename')}
          </button>
          <button
            type="button"
            className={`${item} text-danger`}
            onClick={() => {
              setOpen(false);
              if (!window.confirm(t('chat.deleteConfirm'))) return;
              remove.mutate(chat.id, {
                onSuccess: () => {
                  void navigate('/', { replace: true });
                },
              });
            }}
          >
            <TrashIcon size={18} />
            {t('chat.delete')}
          </button>
        </div>
      )}
    </div>
  );
}
