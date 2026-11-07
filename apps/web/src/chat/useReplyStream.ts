/**
 * Sends a message and follows the streamed reply. The UI renders `state`; when the reply
 * finishes, the chat's message list is refetched (the server has saved both messages).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ActiveJobResponse,
  type ErrorCode,
  type Message,
  type NotedRef,
  type StreamEvent,
  type WebPage,
  type WebSearch,
} from '@hemmia/shared';
import { ApiError, api } from '../api/client.ts';
import { followEvents, StreamDroppedError, streamEvents } from '../api/stream.ts';
import { PROFILE_KEY } from '../profile/hooks.ts';

export type ReplyPhase =
  | 'idle'
  | 'sending'
  | 'queued'
  | 'loading'
  | 'thinking'
  | 'streaming'
  | 'painting'
  | 'searching'
  /** Reading a long text before the reply starts. */
  | 'reading'
  /** Reading the pages the user linked. */
  | 'readingPages'
  /** The reply runs on the server but this page isn't following it (app was in the background). */
  | 'background';

export interface ReplyState {
  phase: ReplyPhase;
  /** Jobs ahead of this one while queued. */
  position: number | null;
  /** Reply text so far. */
  text: string;
  /** The user's message as sent (shown immediately, before the server list refreshes). */
  pendingUserText: string | null;
  /** Picture progress when the model creates an image. */
  step: number;
  steps: number;
  error: ErrorCode | 'network' | 'model_error' | null;
  /** Web search query in progress (or null) */
  searchQuery: string | null;
  /** Estimated tokens being read (phase 'reading'). */
  readingTokens: number;
  /** Web searches completed so far */
  searches: WebSearch[];
  /** Profile notes the model saved so far ("Noted" with an undo). */
  noted: NotedRef[];
  /** While a model loads: when it started (ms) and about how long it takes. */
  loadingSince: number;
  loadingExpectedMs: number | null;
  /** Links being read (phase 'readingPages'). */
  readingPages: string[];
  /** Linked pages read so far (shown under the pending user message). */
  pages: WebPage[];
}

const IDLE: ReplyState = {
  phase: 'idle',
  position: null,
  text: '',
  pendingUserText: null,
  step: 0,
  steps: 0,
  error: null,
  searchQuery: null,
  readingTokens: 0,
  searches: [],
  noted: [],
  loadingSince: 0,
  loadingExpectedMs: null,
  readingPages: [],
  pages: [],
};

export interface SendInput {
  content: string;
  attachmentIds?: string[];
  modelId?: string;
  /** Planner: the server adds the morning snapshot, weekly planning or evening check-in. */
  briefing?: 'day' | 'week' | 'evening';
}

export function chatQueryKeys(chatId: string) {
  return { messages: ['chats', chatId, 'messages'] as const, list: ['chats'] as const };
}

export function useReplyStream(chatId: string) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ReplyState>(IDLE);
  const abortRef = useRef<AbortController | null>(null);
  const jobRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const keys = chatQueryKeys(chatId);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.messages }),
      queryClient.invalidateQueries({ queryKey: keys.list }),
    ]);
  }, [chatId, queryClient]);

  /** Shows one event of a running reply. */
  const apply = useCallback(
    (event: StreamEvent) => {
      switch (event.type) {
        case 'started':
          jobRef.current = event.jobId;
          break;
        case 'queued':
          setState((s) => ({ ...s, phase: 'queued', position: event.position }));
          break;
        case 'loading':
          setState((s) => ({
            ...s,
            phase: 'loading',
            position: null,
            loadingSince: Date.now(),
            loadingExpectedMs: event.expectedMs ?? null,
          }));
          break;
        case 'thinking':
          setState((s) => ({
            ...s,
            phase: event.active ? 'thinking' : 'streaming',
            position: null,
          }));
          break;
        case 'token':
          setState((s) => ({
            ...s,
            phase: 'streaming',
            position: null,
            text: s.text + event.text,
          }));
          break;
        case 'replace':
          // Also the reply so far when attaching again: it is being written now.
          setState((s) => ({
            ...s,
            text: event.text,
            phase: s.phase === 'background' ? 'streaming' : s.phase,
          }));
          break;
        case 'done':
          break;
        case 'error':
          setState((s) => ({ ...s, error: event.code }));
          break;
        case 'progress':
          setState((s) => ({
            ...s,
            phase: 'painting',
            position: null,
            step: event.step,
            steps: event.steps,
          }));
          break;
        case 'reading':
          setState((s) => ({
            ...s,
            phase: 'reading',
            position: null,
            readingTokens: event.tokens,
          }));
          break;
        case 'search':
          setState((s) => ({
            ...s,
            phase: 'searching',
            position: null,
            searchQuery: event.query,
          }));
          break;
        case 'sources':
          setState((s) => ({ ...s, searches: [...s.searches, event.search] }));
          break;
        case 'noted':
          setState((s) => ({ ...s, noted: [...s.noted, event.note] }));
          void queryClient.invalidateQueries({ queryKey: PROFILE_KEY });
          break;
        case 'reading_pages':
          setState((s) => ({
            ...s,
            phase: 'readingPages',
            position: null,
            readingPages: event.urls,
          }));
          break;
        case 'page':
          setState((s) => ({ ...s, pages: [...s.pages, event.page] }));
          break;
        case 'image':
          break;
      }
    },
    [queryClient],
  );

  /**
   * Follows a reply still running in this chat (the server keeps going when the app is in
   * the background, or when iOS dropped this page's stream): attaches to its events, which
   * start with the reply so far, and attaches again whenever the stream drops, until it
   * ends. 'followed' if there was one, 'idle' if not, 'unreachable' if the server can't be
   * reached.
   */
  const watchRef = useRef(0);
  /** Whether a reply is shown (state not idle), for clearing one that ended unseen. */
  const shownRef = useRef(false);
  useEffect(() => {
    shownRef.current = state.phase !== 'idle';
  }, [state.phase]);
  const streaming = (): boolean => abortRef.current !== null;
  const watch = useCallback(async (): Promise<'followed' | 'idle' | 'unreachable'> => {
    if (!chatId || abortRef.current) return 'idle';
    const token = ++watchRef.current;
    const active = async () =>
      (await api(`/chats/${encodeURIComponent(chatId)}/job`, { schema: ActiveJobResponse })).jobId;
    // Right after the phone wakes up the network may need a moment: ask a few times.
    let jobId: string | null | undefined;
    for (let tries = 0; tries < 4 && token === watchRef.current; tries++) {
      jobId = await active().catch(() => undefined);
      if (jobId !== undefined) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    // Another call took over (the app became visible while a dropped stream was handled),
    // or this page is already streaming the reply (e.g. the first message of a new chat).
    if (token !== watchRef.current || streaming()) return 'followed';
    if (jobId === undefined) return 'unreachable';
    if (!jobId) return 'idle';
    const controller = new AbortController();
    abortRef.current = controller;
    jobRef.current = jobId;
    try {
      while (jobId && token === watchRef.current) {
        if (document.visibilityState === 'visible') {
          // The attached stream starts with the reply so far: start from a clean state.
          setState((s) => ({ ...IDLE, pendingUserText: s.pendingUserText, phase: 'background' }));
          try {
            for await (const event of followEvents(
              `/jobs/${encodeURIComponent(jobId)}/events`,
              controller.signal,
            )) {
              apply(event);
            }
            break; // the reply has ended
          } catch (err) {
            if (controller.signal.aborted) return 'followed';
            if (err instanceof ApiError && err.status === 404) break; // ended meanwhile
            // Dropped again or unreachable for now: check and attach again below.
          }
        }
        await new Promise((r) => setTimeout(r, 2000));
        jobId = await active().catch(() => jobId);
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      jobRef.current = null;
    }
    if (token !== watchRef.current) return 'followed';
    await refresh();
    setState((s) => (s.error ? { ...IDLE, error: s.error } : IDLE));
    return 'followed';
  }, [apply, chatId, refresh]);

  // Opening a chat (or coming back to the app) picks up a reply that is still running.
  // Leaving the chat stops following; the reply itself keeps running on the server.
  // Coming back to the app may take over from the call that follows a dropped stream (see
  // send). If the reply ended meanwhile, nobody else clears it: without this the sent message
  // and the last status (e.g. the loading bar) stay under the saved messages.
  const clearEnded = useCallback(
    async (watched: 'followed' | 'idle' | 'unreachable') => {
      if (watched === 'followed' || !shownRef.current || streaming()) return;
      if (watched === 'unreachable') {
        setState({ ...IDLE, error: 'network' });
        return;
      }
      await refresh();
      if (!streaming()) setState((s) => (s.error ? { ...IDLE, error: s.error } : IDLE));
    },
    [refresh],
  );

  useEffect(() => {
    const watching = watchRef;
    void watch();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void watch().then(clearEnded);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      watching.current++;
      abortRef.current?.abort();
    };
  }, [watch, clearEnded]);

  const send = useCallback(
    async (input: SendInput): Promise<Message | null> => {
      if (abortRef.current) return null; // one reply at a time
      const controller = new AbortController();
      abortRef.current = controller;
      setState({ ...IDLE, phase: 'sending', pendingUserText: input.content });
      let finalMessage: Message | null = null;
      try {
        for await (const event of streamEvents(
          `/chats/${encodeURIComponent(chatId)}/messages`,
          {
            content: input.content,
            attachmentIds: input.attachmentIds ?? [],
            ...(input.modelId ? { modelId: input.modelId } : {}),
            ...(input.briefing ? { briefing: input.briefing } : {}),
          },
          controller.signal,
        )) {
          if (event.type === 'done') finalMessage = event.message;
          apply(event);
        }
        setState((s) => (s.error ? { ...IDLE, error: s.error } : IDLE));
      } catch (err) {
        if (controller.signal.aborted) {
          setState(IDLE);
        } else if (err instanceof ApiError) {
          setState({ ...IDLE, error: err.code });
        } else if (err instanceof StreamDroppedError) {
          // The stream broke (iOS: screen locked, app switched, network change); the reply
          // goes on on the server. Follow it again; if it has already ended, the refresh
          // below shows it.
          abortRef.current = null;
          jobRef.current = null;
          const watched = await watch();
          if (watched === 'idle') setState(IDLE);
          if (watched === 'unreachable') setState({ ...IDLE, error: 'network' });
        } else {
          setState({ ...IDLE, error: 'network' });
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        jobRef.current = null;
        await refresh();
      }
      return finalMessage;
    },
    [apply, chatId, refresh, watch],
  );

  /** Stops the reply: asks the server to cancel (it saves the partial text), keeps following
   *  the stream until the server's final event arrives. */
  const stop = useCallback(async () => {
    const jobId = jobRef.current;
    if (!jobId) {
      abortRef.current?.abort();
      return;
    }
    try {
      await api(`/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST', body: {} });
    } catch {
      abortRef.current?.abort();
    }
  }, []);

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
  }, []);

  return { state, send, stop, clearError, busy: state.phase !== 'idle' };
}
