import { NavLink, useMatch, useNavigate } from 'react-router';
import { useAgents } from '../agents/hooks.ts';
import { chatTitle, useChats, useDeleteChat } from '../chat/hooks.ts';
import { useT } from '../i18n/index.tsx';
import { CalendarIcon, PenIcon, TrashIcon } from '@hemmia/ui';

export function ChatSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const { data, isLoading } = useChats();
  const remove = useDeleteChat();
  const openChatId = useMatch('/chats/:chatId')?.params.chatId;
  const chats = data?.chats ?? [];
  const agentEmoji = new Map((useAgents().data?.agents ?? []).map((a) => [a.id, a.emoji]));

  return (
    <div className="flex min-h-0 flex-1 flex-col px-3">
      <button
        type="button"
        onClick={() => {
          void navigate('/');
          onNavigate?.();
        }}
        className="my-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-forest px-4 text-[15px] font-semibold text-on-forest hover:bg-forest-hover"
      >
        <PenIcon size={18} />
        {t('chat.newChat')}
      </button>
      <NavLink
        to="/planner"
        onClick={onNavigate}
        className={({ isActive }) =>
          `mb-2 inline-flex min-h-11 items-center gap-2.5 rounded-xl px-3 text-[15px] font-medium hover:bg-champagne ${isActive ? 'bg-champagne text-forest' : 'text-ink'}`
        }
      >
        <CalendarIcon size={19} />
        {t('nav.planner')}
      </NavLink>
      <nav aria-label={t('nav.chats')} className="-mx-1 flex-1 overflow-y-auto px-1 pb-3">
        {isLoading ? (
          <p className="p-3 text-sm text-muted">{t('common.loading')}</p>
        ) : chats.length === 0 ? (
          <p className="p-3 text-sm text-muted">{t('chat.noChats')}</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {chats.map((chat) => (
              <li key={chat.id} className="group relative">
                <NavLink
                  to={`/chats/${chat.id}`}
                  onClick={() => onNavigate?.()}
                  className={({ isActive }) =>
                    `flex min-h-11 items-center rounded-xl py-1 pr-11 pl-3 text-[15px] ${
                      isActive
                        ? 'bg-champagne font-semibold text-ink'
                        : 'text-ink/85 hover:bg-champagne/60'
                    }`
                  }
                >
                  {chat.agentId && agentEmoji.has(chat.agentId) && (
                    <span aria-hidden="true" className="mr-2 shrink-0">
                      {agentEmoji.get(chat.agentId)}
                    </span>
                  )}
                  <span className="truncate">{chatTitle(chat, t)}</span>
                </NavLink>
                {/* Always visible on touch screens; on hover or focus with a mouse. */}
                <button
                  type="button"
                  aria-label={`${t('chat.delete')}: ${chatTitle(chat, t)}`}
                  title={t('chat.delete')}
                  disabled={remove.isPending}
                  onClick={() => {
                    if (!window.confirm(t('chat.deleteConfirm'))) return;
                    remove.mutate(chat.id, {
                      onSuccess: () => {
                        if (openChatId === chat.id) void navigate('/', { replace: true });
                      },
                    });
                  }}
                  className="absolute top-0 right-0 inline-flex h-11 w-11 items-center justify-center rounded-xl text-muted hover:text-danger focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100"
                >
                  <TrashIcon size={17} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </div>
  );
}
