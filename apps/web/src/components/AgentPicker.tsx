/** Choosing agents: chips on the start screen, the full list (search, pin, edit) in a sheet. */
import { type ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { Agent, AgentTemplate } from '@hemmia/shared';
import { usePinAgent, visibleAgents } from '../agents/hooks.ts';
import { useT } from '../i18n/index.tsx';
import { CloseIcon, PenIcon, PlusIcon, StarIcon } from '@hemmia/ui';
import { Ghost, IconButton } from '@hemmia/ui';

const chip =
  'inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors';
const chipOff = 'border-line bg-card text-ink hover:border-forest/50';

/** One round avatar with its name underneath (start-screen agent row). */
function Avatar({
  label,
  selected,
  onClick,
  children,
  role = 'radio',
}: {
  label: string;
  selected?: boolean;
  onClick: () => void;
  children: ReactNode;
  role?: 'radio' | 'button';
}) {
  return (
    <button
      type="button"
      role={role}
      {...(role === 'radio' ? { 'aria-checked': selected === true } : {})}
      aria-label={label}
      onClick={onClick}
      className="group flex w-16 shrink-0 flex-col items-center gap-1.5"
    >
      <span
        aria-hidden="true"
        className={`flex h-12 w-12 items-center justify-center rounded-full border text-[22px] leading-none transition-colors ${
          selected
            ? 'border-forest bg-champagne ring-2 ring-forest ring-offset-2 ring-offset-paper'
            : 'border-line bg-card group-hover:border-forest/50'
        }`}
      >
        {children}
      </span>
      <span
        aria-hidden="true"
        className={`w-full truncate text-center text-xs ${selected ? 'font-semibold text-ink' : 'text-muted'}`}
      >
        {label}
      </span>
    </button>
  );
}

/** "Standard", the visible agents (pinned, then recent), and "All": centred, scrolls if needed. */
export function AgentChips({
  agents,
  selectedId,
  onSelect,
  onAll,
}: {
  agents: readonly Agent[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAll: () => void;
}) {
  const t = useT();
  const shown = visibleAgents(agents);
  // The selected agent stays visible even when it isn't pinned or recent.
  const selected = agents.find((a) => a.id === selectedId);
  const list = selected && !shown.includes(selected) ? [...shown, selected] : shown;
  return (
    <div className="no-scrollbar -mx-4 w-[calc(100%+2rem)] overflow-x-auto">
      <div
        role="radiogroup"
        aria-label={t('agents.choose')}
        className="mx-auto flex w-max gap-3 px-4 pt-1 pb-1"
      >
        <Avatar
          label={t('agents.standard')}
          selected={selectedId === null}
          onClick={() => {
            onSelect(null);
          }}
        >
          <Ghost size={30} />
        </Avatar>
        {list.map((a) => (
          <Avatar
            key={a.id}
            label={a.name}
            selected={a.id === selectedId}
            onClick={() => {
              onSelect(a.id);
            }}
          >
            {a.emoji}
          </Avatar>
        ))}
        <Avatar label={t('agents.allShort')} role="button" onClick={onAll}>
          <span className="text-base tracking-widest text-muted">•••</span>
        </Avatar>
      </div>
    </div>
  );
}

/** Every agent with search, pin and edit; templates and "New agent" at the end. */
export function AgentList({
  agents,
  templates,
  selectedId,
  onSelect,
}: {
  agents: readonly Agent[];
  templates: readonly AgentTemplate[];
  selectedId?: string | null;
  /** Without it the list only manages (pin, edit). */
  onSelect?: (id: string) => void;
}) {
  const t = useT();
  const pin = usePinAgent();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const match = (a: Agent) =>
    q === '' || a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q);
  const pinned = agents
    .filter((a) => a.pinned && match(a))
    .sort((a, b) => (a.pinOrder ?? 0) - (b.pinOrder ?? 0));
  const mine = agents.filter((a) => !a.pinned && a.scope === 'personal' && match(a));
  const family = agents.filter((a) => !a.pinned && a.scope === 'family' && match(a));

  const row = (a: Agent) => (
    <li key={a.id} className="flex items-center gap-1">
      <button
        type="button"
        disabled={!onSelect}
        onClick={() => onSelect?.(a.id)}
        aria-current={a.id === selectedId ? 'true' : undefined}
        className={`flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 text-left ${
          a.id === selectedId ? 'bg-champagne' : onSelect ? 'hover:bg-champagne/60' : ''
        }`}
      >
        <span aria-hidden="true" className="shrink-0 text-2xl">
          {a.emoji}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold">{a.name}</span>
          {a.description && (
            <span className="block truncate text-sm text-muted">{a.description}</span>
          )}
        </span>
      </button>
      <IconButton
        aria-label={`${a.pinned ? t('agents.unpin') : t('agents.pin')}: ${a.name}`}
        aria-pressed={a.pinned}
        onClick={() => {
          pin.mutate({ id: a.id, pinned: !a.pinned });
        }}
        className={a.pinned ? 'text-forest' : 'text-muted'}
      >
        <StarIcon size={19} filled={a.pinned} />
      </IconButton>
      <Link
        to={`/agents/${a.id}`}
        aria-label={`${t('agents.edit')}: ${a.name}`}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-champagne"
      >
        <PenIcon size={18} />
      </Link>
    </li>
  );
  const section = (title: string, list: Agent[]) =>
    list.length > 0 && (
      <section className="flex flex-col gap-1">
        <h3 className="px-3 text-xs font-semibold tracking-wide text-muted uppercase">{title}</h3>
        <ul className="flex flex-col">{list.map(row)}</ul>
      </section>
    );

  return (
    <div className="flex flex-col gap-4">
      {agents.length > 6 && (
        <input
          type="search"
          name="agentSearch"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
          aria-label={t('agents.search')}
          placeholder={t('agents.search')}
          className="min-h-11 rounded-xl border border-line bg-paper px-3.5 text-base text-ink focus:border-forest focus:outline-none"
        />
      )}
      {agents.length === 0 && <p className="px-3 text-sm text-muted">{t('agents.none')}</p>}
      {section(t('agents.pinned'), pinned)}
      {section(t('agents.mine'), mine)}
      {section(t('agents.family'), family)}
      <Link
        to="/agents/new"
        className="inline-flex min-h-11 items-center gap-2 self-start rounded-xl bg-forest px-4 text-[15px] font-semibold text-on-forest hover:bg-forest-hover"
      >
        <PlusIcon size={18} />
        {t('agents.new')}
      </Link>
      {templates.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="px-1 text-xs font-semibold tracking-wide text-muted uppercase">
            {t('agents.templates')}
          </h3>
          <div className="flex flex-wrap gap-2">
            {templates.map((tpl) => (
              <Link
                key={tpl.key}
                to={`/agents/new?template=${tpl.key}`}
                className={`${chip} ${chipOff}`}
              >
                <span aria-hidden="true">{tpl.emoji}</span>
                {tpl.name}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Bottom sheet on phones, dialog on wide screens. */
export function AgentSheet({
  agents,
  templates,
  selectedId,
  onSelect,
  onClose,
}: {
  agents: readonly Agent[];
  templates: readonly AgentTemplate[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label={t('image.close')}
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-ink/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('agents.title')}
        className="relative flex max-h-[85dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-3xl border border-line bg-paper px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl sm:p-6"
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-line sm:hidden" />
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-semibold">{t('agents.title')}</h2>
          <IconButton aria-label={t('image.close')} onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </div>
        <button
          type="button"
          onClick={() => {
            onSelect(null);
          }}
          aria-current={selectedId === null ? 'true' : undefined}
          className={`flex min-h-12 items-center gap-3 rounded-2xl px-3 text-left text-[15px] font-semibold ${selectedId === null ? 'bg-champagne' : 'hover:bg-champagne/60'}`}
        >
          {t('agents.standard')}
        </button>
        <AgentList
          agents={agents}
          templates={templates}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}
