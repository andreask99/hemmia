import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useMatch, useNavigate, useParams, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChatSummary,
  type ErrorCode,
  MAX_MESSAGE_CHARS,
  OpenBriefingResponse,
} from '@hemmia/shared';
import { api } from '../api/client.ts';
import { useMe } from '../auth/hooks.ts';
import {
  chatTitle,
  flattenOldestFirst,
  modelLabel,
  useChats,
  useCreateChat,
  useMessages,
  useModels,
} from '../chat/hooks.ts';
import { type ReplyState, useReplyStream } from '../chat/useReplyStream.ts';
import type { PendingAttachment } from '../components/AttachmentPicker.tsx';
import { useAgents } from '../agents/hooks.ts';
import { useDaily, useWeek } from '../daily/hooks.ts';
import { AgentChips, AgentSheet } from '../components/AgentPicker.tsx';
import { ChatActions } from '../components/ChatActions.tsx';
import { pickSuggestionIndexes, SUGGESTIONS } from '../chat/suggestions.ts';
import { Composer } from '../components/Composer.tsx';
import { ArrowUpRightIcon, CloseIcon, SparkIcon } from '@hemmia/ui';
import { PageHeader } from '../components/layout.tsx';
import { LoadingBar } from '@hemmia/ui';
import { Markdown } from '@hemmia/ui';
import { MessageBubble } from '../components/MessageBubble.tsx';
import { NotedNotes } from '../components/NotedNotes.tsx';
import { ModelChip, ModelSheet } from '../components/ModelSheet.tsx';
import { Logo } from '@hemmia/ui';
import { type TFunction, useI18n } from '../i18n/index.tsx';
import { WebSearches } from '../components/WebSearches.tsx';

function errorText(code: ErrorCode | 'network' | 'model_error', t: TFunction): string {
  switch (code) {
    case 'busy':
      return t('chat.busy');
    case 'paused':
      return t('chat.paused');
    case 'machine_busy':
      return t('chat.machineBusy');
    case 'forbidden':
      return t('image.notAllowed');
    case 'model_error':
      return t('chat.failed');
    case 'network':
      return t('error.network');
    case 'unauthenticated':
      return t('error.unauthenticated');
    case 'rate_limited':
      return t('error.rate_limited', { minutes: 1 });
    case 'payload_too_large':
    case 'too_long':
      return t('chat.tooLarge');
    case 'cloud_key':
      return t('chat.cloudKey');
    case 'cloud_unavailable':
      return t('chat.cloudUnavailable');
    case 'model_unsupported':
      return t('chat.modelUnsupported');
    case 'model_too_large':
      return t('chat.modelTooLarge');
    case 'refused':
      return t('chat.refused');
    case 'over_budget':
      return t('chat.overBudget');
    case 'no_model':
      return t('noModel.member');
    default:
      return t('error.generic');
  }
}

/** The host names of links being read, for the status line. */
function hosts(urls: readonly string[]): string {
  return urls
    .flatMap((url) => {
      try {
        return [new URL(url).hostname];
      } catch {
        return [];
      }
    })
    .join(', ');
}

function statusText(
  state: ReplyState,
  model: string,
  t: TFunction,
  modelLoaded: boolean,
): string | null {
  switch (state.phase) {
    case 'sending':
      return t('chat.sending');
    case 'background':
      return t('chat.background');
    case 'reading':
      return t('chat.reading', {
        minutes: Math.max(1, Math.round(state.readingTokens / 200 / 60)),
      });
    case 'queued':
      return modelLoaded
        ? t('chat.queued', { position: state.position ?? 1 })
        : `${t('chat.queued', { position: state.position ?? 1 })} · ${t('chat.thenLoads', { model })}`;
    case 'loading':
      return t('chat.loadingModel', { model });
    case 'thinking':
      return t('chat.thinking');
    case 'painting':
      return t('image.progress', { step: state.step, steps: state.steps });
    case 'searching':
      return t('search.searching', { query: state.searchQuery ?? '' });
    case 'readingPages':
      return t('pages.reading', { hosts: hosts(state.readingPages) });
    default:
      return null;
  }
}

/** First message waiting for a new chat to exist (survives the route change). */
let pendingFirstMessage: {
  chatId: string;
  text: string;
  attachmentIds: string[];
  briefing?: 'day' | 'week' | 'evening';
} | null = null;
/** Set while /daily creates its chat (survives StrictMode's double effects). */
let dailyStarting = false;

export function ChatPage() {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t, language } = useI18n();
  const chats = useChats();
  const models = useModels();
  const me = useMe().data;
  const createChat = useCreateChat();
  const reply = useReplyStream(chatId ?? '');
  const messagesQuery = useMessages(chatId);
  const [draftModel, setDraftModel] = useState<string | null>(null);
  const [draftThink, setDraftThink] = useState(false);
  /** "Use my profile" for a chat not created yet; off starts a fresh chat. */
  const [draftUseProfile, setDraftUseProfile] = useState(true);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [sheet, setSheet] = useState(false);
  const [composerSeed, setComposerSeed] = useState<string | null>(null);
  const agentsQuery = useAgents();
  const agents = agentsQuery.data?.agents ?? [];
  // "Save and try" in the agent editor opens a new chat with ?agent=<id>.
  const [searchParams, setSearchParams] = useSearchParams();
  const [draftAgentId, setDraftAgentId] = useState<string | null>(() => searchParams.get('agent'));
  const [agentSheet, setAgentSheet] = useState(false);
  useEffect(() => {
    if (searchParams.has('agent')) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);
  // Different ideas each time the start screen opens (the page renders fresh for a new chat).
  const [suggestionIndexes] = useState(() => pickSuggestionIndexes());
  const suggestions = suggestionIndexes.map((i) => SUGGESTIONS[language][i] ?? '');

  const listed = chatId ? chats.data?.chats.find((c) => c.id === chatId) : undefined;
  // Planner chats aren't in the list: load them on their own.
  const single = useQuery({
    queryKey: ['chats', chatId ?? '', 'summary'],
    queryFn: () => api(`/chats/${encodeURIComponent(chatId ?? '')}`, { schema: ChatSummary }),
    enabled: chatId !== undefined && chats.isSuccess && !listed,
    retry: false,
  });
  const chat = listed ?? single.data;
  const chatModels = models.data?.chatModels ?? [];
  const ownDefault = chatModels.some((m) => m.id === me?.defaultModelId)
    ? me?.defaultModelId
    : undefined;
  const agentId = chat ? chat.agentId : draftAgentId;
  const agent = agents.find((a) => a.id === agentId);
  const agentModel = chatModels.some((m) => m.id === agent?.modelId) ? agent?.modelId : undefined;
  const modelId =
    chat?.modelId ?? draftModel ?? agentModel ?? ownDefault ?? models.data?.defaultChatModel ?? '';
  const model = chatModels.find((m) => m.id === modelId);
  const think = chat?.think ?? draftThink;
  const useProfile = chat?.useProfile ?? draftUseProfile;
  const modelName = model ? modelLabel(model, language) : modelId;
  // Suggestions (a model that sees photos, one that reads longer texts) stay on this Mac:
  // going to the cloud is only ever the user's own pick in the model sheet.
  const localModels = chatModels.filter((m) => !m.cloud);
  const visionModel =
    localModels.find((m) => m.vision && m.id === models.data?.defaultChatModel) ??
    localModels.find((m) => m.vision);
  const photosAttached = attachments.some((a) => a.kind === 'photo');
  // Scanned PDF pages are read as images too.
  const scansAttached = attachments.some((a) => (a.attachment?.scanPages ?? 0) > 0);
  const visionMismatch = (photosAttached || scansAttached) && model !== undefined && !model.vision;
  // A pause frees the Mac; cloud models still answer.
  const paused = models.data?.paused === true && model?.cloud !== true;
  const longestModel = localModels.reduce<(typeof chatModels)[number] | undefined>(
    (best, m) => (!best || m.maxMessageChars > best.maxMessageChars ? m : best),
    undefined,
  );

  // "/daily" (planner notifications): start a new chat with the morning snapshot,
  // weekly planning (?kind=week) or the evening check-in (?kind=evening).
  const isDaily = useMatch('/daily') !== null;
  const kindParam = searchParams.get('kind');
  const briefing = kindParam === 'week' || kindParam === 'evening' ? kindParam : 'day';
  const dailyPrompt = t(
    briefing === 'week'
      ? 'daily.promptWeek'
      : briefing === 'evening'
        ? 'daily.promptEvening'
        : 'daily.prompt',
  );
  useEffect(() => {
    if (!isDaily || dailyStarting) return;
    dailyStarting = true;
    // Today's chat of this kind if it exists (kept out of the chat list), else a new one.
    void api('/briefings', {
      method: 'POST',
      body: { kind: briefing },
      schema: OpenBriefingResponse,
    })
      .then(({ chat, created }) => {
        if (created) {
          pendingFirstMessage = { chatId: chat.id, text: dailyPrompt, attachmentIds: [], briefing };
        }
        queryClient.setQueryData(['chats', chat.id, 'summary'], chat);
        void navigate(`/chats/${chat.id}`, { replace: true });
      })
      .catch(() => undefined)
      .finally(() => {
        dailyStarting = false;
      });
  }, [isDaily, briefing, dailyPrompt, navigate, queryClient]);
  const dailyOn = useDaily().data?.enabled === true;
  const weekGoals = useWeek().data?.goals.filter((g) => g.status !== 'dropped') ?? [];
  const weekDone = weekGoals.filter((g) => g.status === 'done').length;
  // Queued behind someone else: check which model is loaded, for the waiting message.
  const queued = reply.state.phase === 'queued';
  const { refetch: refetchModels } = models;
  useEffect(() => {
    if (queued) void refetchModels();
  }, [queued, refetchModels]);

  // Send the first message of a chat created on "/".
  const { send } = reply;
  useEffect(() => {
    if (chatId && pendingFirstMessage?.chatId === chatId) {
      const { text, attachmentIds, briefing: kind } = pendingFirstMessage;
      pendingFirstMessage = null;
      void send({ content: text, attachmentIds, ...(kind ? { briefing: kind } : {}) });
    }
  }, [chatId, send]);

  // Stay at the bottom while new content arrives, unless the user scrolled up.
  const logRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const messages = flattenOldestFirst(messagesQuery.data?.pages ?? []);
  // When the iPhone keyboard opens or closes the visible height changes: stay at the end.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const onResize = () => {
      const el = logRef.current;
      if (el && nearBottom.current) el.scrollTo({ top: el.scrollHeight });
    };
    viewport.addEventListener('resize', onResize);
    return () => {
      viewport.removeEventListener('resize', onResize);
    };
  }, []);
  useLayoutEffect(() => {
    const el = logRef.current;
    if (el && nearBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages.length, reply.state.text, reply.state.phase]);

  if (chatId && chats.isSuccess && !chat && single.isError) {
    return (
      <>
        <PageHeader>
          <span className="font-display text-lg">Hemmia</span>
        </PageHeader>
        <p className="m-auto p-6 text-muted">{t('chat.notFound')}</p>
      </>
    );
  }

  const updateChat = (changes: {
    modelId?: string;
    think?: boolean;
    agentId?: string | null;
    useProfile?: boolean;
  }) => {
    if (!chat) return;
    void api(`/chats/${encodeURIComponent(chat.id)}`, {
      method: 'PATCH',
      body: changes,
      schema: ChatSummary,
    }).then(() => queryClient.invalidateQueries({ queryKey: ['chats'] }));
  };
  const selectModel = (id: string) => {
    if (chat) updateChat({ modelId: id });
    else setDraftModel(id);
  };
  const setThink = (on: boolean) => {
    if (chat) updateChat({ think: on });
    else setDraftThink(on);
  };
  const selectAgent = (id: string | null) => {
    setAgentSheet(false);
    if (chat) {
      updateChat({ agentId: id });
      return;
    }
    setDraftAgentId(id);
    const picked = agents.find((a) => a.id === id);
    if (picked && picked.think !== null) setDraftThink(picked.think);
  };

  const onSend = (text: string, attachmentIds: string[]) => {
    setComposerSeed(null);
    // Sending always jumps to the end, so the message and the reply's progress are in view.
    nearBottom.current = true;
    if (chatId) {
      void send({ content: text, attachmentIds });
      return;
    }
    createChat
      // An explicit model choice wins; with an agent the server applies its model;
      // before the model list has loaded, the server picks its default.
      .mutateAsync({
        ...(draftModel ? { modelId: draftModel } : !draftAgentId && modelId ? { modelId } : {}),
        ...(draftAgentId ? { agentId: draftAgentId } : {}),
        ...(draftUseProfile ? {} : { useProfile: false }),
      })
      .then(async (created) => {
        if (created.think !== draftThink) {
          await api(`/chats/${encodeURIComponent(created.id)}`, {
            method: 'PATCH',
            body: { think: draftThink },
            schema: ChatSummary,
          });
        }
        pendingFirstMessage = { chatId: created.id, text, attachmentIds };
        void navigate(`/chats/${created.id}`, { replace: true });
      })
      .catch(() => undefined);
  };

  const { state } = reply;
  const last = messages.at(-1);
  const pendingText = state.pendingUserText;
  const showPendingUser =
    pendingText !== null && !(last?.role === 'user' && last.content === pendingText);
  const status = statusText(state, modelName, t, models.data?.loaded.includes(modelId) ?? true);
  const empty = messages.length === 0 && !reply.busy && !showPendingUser;

  // Check if there's no model available (either from models data or from error)
  const noModel =
    (models.data !== undefined && models.data.chatModels.length === 0) ||
    state.error === 'no_model';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        actions={
          chat && (
            <ChatActions
              chat={chat}
              onChooseAgent={() => {
                setAgentSheet(true);
              }}
            />
          )
        }
      >
        <h1 className="truncate font-display text-[19px] leading-tight font-semibold">
          {chat ? chatTitle(chat, t) : t('chat.newChat')}
        </h1>
        <div className="flex min-w-0 items-center gap-1.5">
          {agent && (
            <button
              type="button"
              onClick={() => {
                setAgentSheet(true);
              }}
              aria-label={`${t('agents.choose')}: ${agent.name}`}
              className="inline-flex max-w-[50%] shrink-0 items-center gap-1 rounded-full py-0.5 text-[13px] font-semibold text-ink"
            >
              <span aria-hidden="true">{agent.emoji}</span>
              <span className="truncate">{agent.name}</span>
              <span aria-hidden="true" className="font-normal text-muted">
                ·
              </span>
            </button>
          )}
          <ModelChip
            model={model}
            think={think}
            disabled={reply.busy || chatModels.length === 0}
            onClick={() => {
              setSheet(true);
              void models.refetch();
            }}
          />
          {me && !me.restricted && (
            <button
              type="button"
              aria-pressed={useProfile}
              aria-label={t('profile.use')}
              title={t('profile.use')}
              onClick={() => {
                if (chat) updateChat({ useProfile: !useProfile });
                else setDraftUseProfile(!useProfile);
              }}
              className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[13px] ${
                useProfile
                  ? 'text-muted hover:text-ink'
                  : 'bg-champagne font-semibold text-on-champagne'
              }`}
            >
              {useProfile ? `· ${t('profile.on')}` : t('profile.off')}
            </button>
          )}
        </div>
      </PageHeader>

      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        onScroll={(e) => {
          const el = e.currentTarget;
          nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
        className="flex-1 overflow-y-auto px-4 py-5"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          {messagesQuery.hasNextPage && (
            <button
              type="button"
              onClick={() => {
                void messagesQuery.fetchNextPage();
              }}
              className="min-h-11 self-center text-sm font-medium text-forest"
            >
              {t('chat.loadOlder')}
            </button>
          )}
          {empty && (
            <div className="mt-[8vh] flex flex-col items-center gap-4 text-center">
              {agent ? (
                <span aria-hidden="true" className="text-5xl leading-none">
                  {agent.emoji}
                </span>
              ) : (
                <Logo size={56} />
              )}
              <h2 className="font-display text-3xl font-semibold">
                {agent ? agent.name : t('chat.greeting')}
              </h2>
              <p className="max-w-sm text-[15px] text-balance text-muted">
                {agent ? agent.description || t('chat.hint') : t('chat.hint')}
              </p>
              {!chatId && (
                <div className="w-full">
                  <AgentChips
                    agents={agents}
                    selectedId={draftAgentId}
                    onSelect={selectAgent}
                    onAll={() => {
                      setAgentSheet(true);
                    }}
                  />
                </div>
              )}
              <ul className="mt-2 flex w-full max-w-md flex-col gap-2">
                {(dailyOn || weekGoals.length > 0) && !agent && (
                  <li className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void navigate('/planner');
                      }}
                      className="flex min-h-12 flex-1 items-center gap-3 rounded-2xl border border-forest/40 bg-champagne px-4 py-2.5 text-left text-[15px] font-semibold text-on-champagne transition-colors hover:border-forest"
                    >
                      <span className="flex-1">{t('planner.card')}</span>
                      {weekGoals.length > 0 && (
                        <span className="text-sm font-medium">
                          {t('planner.progress', { done: weekDone, total: weekGoals.length })}
                        </span>
                      )}
                      <ArrowUpRightIcon size={16} className="shrink-0" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void navigate('/daily');
                      }}
                      className="flex min-h-12 shrink-0 items-center rounded-2xl border border-forest/40 bg-champagne px-4 py-2.5 text-[15px] font-semibold text-on-champagne transition-colors hover:border-forest"
                    >
                      {t('daily.card')}
                    </button>
                  </li>
                )}
                {(agent && agent.examples.length > 0 ? agent.examples : suggestions).map((text) => (
                  <li key={text}>
                    <button
                      type="button"
                      onClick={() => {
                        setComposerSeed(text);
                      }}
                      className="group flex min-h-12 w-full items-center gap-3 rounded-2xl border border-line bg-card px-4 py-2.5 text-left text-[15px] text-ink transition-colors hover:border-forest/50"
                    >
                      <span className="flex-1">{text}</span>
                      <ArrowUpRightIcon
                        size={16}
                        className="shrink-0 text-muted transition-colors group-hover:text-forest"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {showPendingUser && (
            <MessageBubble
              message={{ role: 'user', content: pendingText, status: 'done', pages: state.pages }}
            />
          )}
          {reply.busy && (
            <div
              aria-label={t('chat.assistant')}
              className="flex max-w-prose flex-col gap-2 text-[15px]"
            >
              <WebSearches searches={state.searches} />
              {state.text !== '' && <Markdown text={state.text} />}
              <NotedNotes notes={state.noted} />
              {status && (
                <p className="flex items-center gap-2 text-sm text-muted">
                  <SparkIcon size={15} className="animate-pulse text-forest" />
                  {status}
                </p>
              )}
              {state.phase === 'loading' && state.loadingExpectedMs !== null && (
                <LoadingBar since={state.loadingSince} expectedMs={state.loadingExpectedMs} />
              )}
            </div>
          )}
        </div>
      </div>

      {state.error && state.error !== 'no_model' && (
        <div className="px-3">
          <div
            role="alert"
            className="mx-auto mb-1 flex max-w-3xl items-center justify-between gap-2 rounded-2xl bg-danger-soft px-4 py-2 text-sm text-danger"
          >
            <span>{errorText(state.error, t)}</span>
            <button
              type="button"
              onClick={reply.clearError}
              aria-label={t('image.close')}
              className="inline-flex h-9 w-9 items-center justify-center"
            >
              <CloseIcon size={18} />
            </button>
          </div>
        </div>
      )}

      {paused && (
        <div className="px-3">
          <p
            role="status"
            className="mx-auto mb-1 max-w-3xl rounded-2xl bg-champagne px-4 py-2.5 text-sm text-on-champagne"
          >
            {t('chat.paused')}
          </p>
        </div>
      )}

      {noModel && (
        <div className="px-3">
          <p
            role="status"
            className="mx-auto mb-1 max-w-3xl rounded-2xl bg-champagne px-4 py-2.5 text-sm text-on-champagne"
          >
            {me?.role === 'admin' ? (
              <>
                {t('noModel.admin')}
                <br />
                <Link to="/settings?tab=models" className="font-semibold underline">
                  {t('noModel.openSettings')}
                </Link>
              </>
            ) : (
              t('noModel.member')
            )}
          </p>
        </div>
      )}

      {visionMismatch && visionModel && (
        <div className="px-3">
          <div className="mx-auto mb-1 flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl bg-champagne px-4 py-2 text-sm text-on-champagne">
            <span>
              {photosAttached
                ? t('photo.noVision', { model: modelName })
                : t('photo.noVisionScan', { model: modelName })}
            </span>
            <button
              type="button"
              onClick={() => {
                selectModel(visionModel.id);
              }}
              className="rounded-full bg-forest px-3 py-1 text-xs font-semibold text-on-forest"
            >
              {t('photo.switchTo', { model: modelLabel(visionModel, language) })}
            </button>
          </div>
        </div>
      )}

      <Composer
        key={composerSeed ?? 'composer'}
        initialText={composerSeed ?? ''}
        busy={reply.busy}
        onSend={onSend}
        onStop={() => {
          void reply.stop();
        }}
        attachments={attachments}
        onAttachmentsChange={setAttachments}
        blocked={visionMismatch || paused}
        limit={{ model: modelName, chars: model?.maxMessageChars ?? MAX_MESSAGE_CHARS }}
        {...(longestModel && model && longestModel.maxMessageChars > model.maxMessageChars
          ? {
              longer: {
                model: modelLabel(longestModel, language),
                chars: longestModel.maxMessageChars,
                onSwitch: () => {
                  selectModel(longestModel.id);
                },
              },
            }
          : {})}
      />

      {agentSheet && (
        <AgentSheet
          agents={agents}
          templates={agentsQuery.data?.templates ?? []}
          selectedId={agentId}
          onSelect={selectAgent}
          onClose={() => {
            setAgentSheet(false);
          }}
        />
      )}

      {sheet && (
        <ModelSheet
          models={chatModels}
          value={modelId}
          think={think}
          loaded={models.data?.loaded ?? []}
          hasHistory={chat !== undefined && messages.length > 0}
          cloudAllowed={models.data?.cloudAllowed === true}
          onSelect={selectModel}
          onThink={setThink}
          onClose={() => {
            setSheet(false);
          }}
        />
      )}
    </div>
  );
}
