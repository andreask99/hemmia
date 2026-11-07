import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useReplyStream } from './useReplyStream.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

function wrapper() {
  const client = new QueryClient();
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const enc = new TextEncoder();
const sse = (obj: object) => enc.encode(`event: x\ndata: ${JSON.stringify(obj)}\n\n`);
const doneMessage = {
  id: 'm2',
  chatId: 'c1',
  role: 'assistant',
  content: 'Hallo!',
  modelId: 'quick',
  status: 'done',
  attachments: [],
  createdAt: 1,
};

/** A fetch mock whose stream is fed by the test. */
function controllableStream() {
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      calls.push(url);
      if (url.includes('/cancel')) return Promise.resolve(new Response(null, { status: 204 }));
      if (url.endsWith('/job')) return Promise.resolve(Response.json({ jobId: null }));
      return Promise.resolve(
        new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
      );
    }),
  );
  return {
    push: (obj: object) => controller?.enqueue(sse(obj)),
    close: () => controller?.close(),
    calls,
  };
}

describe('useReplyStream', () => {
  it('goes through queued, loading, streaming and back to idle', async () => {
    const s = controllableStream();
    const { result } = renderHook(() => useReplyStream('c1'), { wrapper: wrapper() });
    let sent: Promise<unknown> = Promise.resolve();
    act(() => {
      sent = result.current.send({ content: 'Hi' });
    });
    expect(result.current.state.phase).toBe('sending');
    expect(result.current.state.pendingUserText).toBe('Hi');

    s.push({ type: 'started', jobId: 'j1', userMessageId: 'm1' });
    s.push({ type: 'queued', position: 2 });
    await waitFor(() => {
      expect(result.current.state.phase).toBe('queued');
    });
    expect(result.current.state.position).toBe(2);

    s.push({ type: 'loading', modelId: 'quick' });
    await waitFor(() => {
      expect(result.current.state.phase).toBe('loading');
    });
    s.push({ type: 'token', text: 'Hal' });
    s.push({ type: 'token', text: 'lo!' });
    await waitFor(() => {
      expect(result.current.state.text).toBe('Hallo!');
    });
    expect(result.current.busy).toBe(true);
    // A dropped draft: the server sends the reply so far.
    s.push({ type: 'replace', text: 'Ha' });
    s.push({ type: 'token', text: 'i' });
    await waitFor(() => {
      expect(result.current.state.text).toBe('Hai');
    });

    s.push({ type: 'done', message: doneMessage });
    s.close();
    await act(async () => {
      await sent;
    });
    expect(result.current.state.phase).toBe('idle');
    expect(result.current.busy).toBe(false);
  });

  it('stop asks the server to cancel the job', async () => {
    const s = controllableStream();
    const { result } = renderHook(() => useReplyStream('c1'), { wrapper: wrapper() });
    act(() => {
      void result.current.send({ content: 'Hi' });
    });
    s.push({ type: 'started', jobId: 'j1', userMessageId: 'm1' });
    s.push({ type: 'token', text: 'Par' });
    await waitFor(() => {
      expect(result.current.state.text).toBe('Par');
    });
    await act(async () => {
      await result.current.stop();
    });
    expect(s.calls).toContain('/api/jobs/j1/cancel');
    s.push({ type: 'done', message: { ...doneMessage, status: 'cancelled', content: 'Par' } });
    s.close();
    await waitFor(() => {
      expect(result.current.state.phase).toBe('idle');
    });
  });

  it('reports busy and model errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: { code: 'busy' } }), {
            status: 409,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      ),
    );
    const { result } = renderHook(() => useReplyStream('c1'), { wrapper: wrapper() });
    await act(async () => {
      await result.current.send({ content: 'Hi' });
    });
    expect(result.current.state.error).toBe('busy');
    act(() => {
      result.current.clearError();
    });
    expect(result.current.state.error).toBeNull();

    const s = controllableStream();
    let sent: Promise<unknown> = Promise.resolve();
    act(() => {
      sent = result.current.send({ content: 'Hi' });
    });
    s.push({ type: 'error', code: 'model_error' });
    s.close();
    await act(async () => {
      await sent;
    });
    expect(result.current.state.error).toBe('model_error');
    expect(result.current.state.phase).toBe('idle');
  });

  it('picks up a reply still running on the server: the text so far, then the rest', async () => {
    const feed: { c: ReadableStreamDefaultController<Uint8Array> | null } = { c: null };
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        calls.push(url);
        if (url.endsWith('/job')) return Promise.resolve(Response.json({ jobId: 'j9' }));
        if (url.endsWith('/jobs/j9/events')) {
          const body = new ReadableStream<Uint8Array>({
            start(c) {
              feed.c = c;
            },
          });
          return Promise.resolve(new Response(body, { status: 200 }));
        }
        return Promise.resolve(Response.json({ messages: [], nextCursor: null }));
      }),
    );
    const { result } = renderHook(() => useReplyStream('c1'), { wrapper: wrapper() });
    await waitFor(() => {
      expect(feed.c).not.toBeNull();
    });
    feed.c?.enqueue(sse({ type: 'started', jobId: 'j9', userMessageId: 'm1' }));
    feed.c?.enqueue(sse({ type: 'replace', text: 'Es war einmal' }));
    await waitFor(() => {
      expect(result.current.state.text).toBe('Es war einmal');
    });
    expect(result.current.state.phase).toBe('streaming');
    expect(result.current.busy).toBe(true);
    feed.c?.enqueue(sse({ type: 'token', text: ' ein König.' }));
    feed.c?.enqueue(sse({ type: 'done', message: doneMessage }));
    feed.c?.close();
    await waitFor(() => {
      expect(result.current.state.phase).toBe('idle');
    });
    expect(result.current.state.error).toBeNull();
    expect(calls).toContain('/api/jobs/j9/events');
  });

  it('attaches again when iOS drops the stream mid-reply, without an error', async () => {
    const sendFeed: { c: ReadableStreamDefaultController<Uint8Array> | null } = { c: null };
    const attachFeed: { c: ReadableStreamDefaultController<Uint8Array> | null } = { c: null };
    let jobRunning = false;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.endsWith('/job'))
          return Promise.resolve(Response.json({ jobId: jobRunning ? 'j1' : null }));
        if (url.endsWith('/jobs/j1/events')) {
          return Promise.resolve(
            new Response(
              new ReadableStream<Uint8Array>({
                start(c) {
                  attachFeed.c = c;
                },
              }),
              { status: 200 },
            ),
          );
        }
        if (url.endsWith('/messages') && !url.includes('?')) {
          return Promise.resolve(
            new Response(
              new ReadableStream<Uint8Array>({
                start(c) {
                  sendFeed.c = c;
                },
              }),
              { status: 200 },
            ),
          );
        }
        return Promise.resolve(Response.json({ messages: [], nextCursor: null }));
      }),
    );
    const { result } = renderHook(() => useReplyStream('c1'), { wrapper: wrapper() });
    let sent: Promise<unknown> = Promise.resolve();
    act(() => {
      sent = result.current.send({ content: 'Erzähl eine lange Geschichte' });
    });
    await waitFor(() => {
      expect(sendFeed.c).not.toBeNull();
    });
    jobRunning = true;
    sendFeed.c?.enqueue(sse({ type: 'started', jobId: 'j1', userMessageId: 'm1' }));
    sendFeed.c?.enqueue(sse({ type: 'token', text: 'Lange Antwort' }));
    await waitFor(() => {
      expect(result.current.state.text).toBe('Lange Antwort');
    });
    // Safari: "Load failed" when the screen locks.
    sendFeed.c?.error(new TypeError('Load failed'));
    await waitFor(() => {
      expect(attachFeed.c).not.toBeNull();
    });
    attachFeed.c?.enqueue(sse({ type: 'started', jobId: 'j1', userMessageId: 'm1' }));
    attachFeed.c?.enqueue(sse({ type: 'replace', text: 'Lange Antwort, weiter' }));
    await waitFor(() => {
      expect(result.current.state.text).toBe('Lange Antwort, weiter');
    });
    expect(result.current.state.error).toBeNull();
    expect(result.current.state.pendingUserText).toBe('Erzähl eine lange Geschichte');
    jobRunning = false;
    attachFeed.c?.enqueue(sse({ type: 'done', message: doneMessage }));
    attachFeed.c?.close();
    await act(async () => {
      await sent;
    });
    expect(result.current.state.phase).toBe('idle');
    expect(result.current.state.error).toBeNull();
  });

  it('clears the reply when coming back after it ended in the background', async () => {
    const feed: { c: ReadableStreamDefaultController<Uint8Array> | null } = { c: null };
    let jobChecks = 0;
    // The check after the drop waits for the network (the phone just woke up).
    let networkBack: () => void = () => undefined;
    const waking = new Promise<void>((resolve) => {
      networkBack = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/job')) {
          jobChecks++;
          if (jobChecks === 2) await waking;
          return Response.json({ jobId: null });
        }
        if (url.endsWith('/messages') && !url.includes('?')) {
          return Promise.resolve(
            new Response(
              new ReadableStream<Uint8Array>({
                start(c) {
                  feed.c = c;
                },
              }),
              { status: 200 },
            ),
          );
        }
        return Promise.resolve(Response.json({ messages: [], nextCursor: null }));
      }),
    );
    const { result } = renderHook(() => useReplyStream('c1'), { wrapper: wrapper() });
    await waitFor(() => {
      expect(jobChecks).toBe(1); // opening the chat
    });
    let sent: Promise<unknown> = Promise.resolve();
    act(() => {
      sent = result.current.send({ content: 'Wetter in Berlin?' });
    });
    await waitFor(() => {
      expect(feed.c).not.toBeNull();
    });
    feed.c?.enqueue(sse({ type: 'started', jobId: 'j1', userMessageId: 'm1' }));
    feed.c?.enqueue(sse({ type: 'loading', modelId: 'quick', expectedMs: 5000 }));
    await waitFor(() => {
      expect(result.current.state.phase).toBe('loading');
    });
    // Back in the app: the dropped stream asks for the job, then the app becomes visible and
    // asks again (taking over). The reply has ended meanwhile.
    feed.c?.error(new TypeError('Load failed'));
    await waitFor(() => {
      expect(jobChecks).toBe(2);
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    networkBack();
    await act(async () => {
      await sent;
    });
    await waitFor(() => {
      expect(result.current.state.phase).toBe('idle');
    });
    expect(result.current.state.pendingUserText).toBeNull();
    expect(result.current.state.error).toBeNull();
  });

  it('reports a network error only when the server stays unreachable', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const feed: { c: ReadableStreamDefaultController<Uint8Array> | null } = { c: null };
    let online = true;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (!online) return Promise.reject(new TypeError('Load failed'));
        if (url.endsWith('/job')) return Promise.resolve(Response.json({ jobId: null }));
        return Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              start(c) {
                feed.c = c;
              },
            }),
            { status: 200 },
          ),
        );
      }),
    );
    const { result } = renderHook(() => useReplyStream('c1'), { wrapper: wrapper() });
    let sent: Promise<unknown> = Promise.resolve();
    await waitFor(() => {
      expect(result.current.state.phase).toBe('idle');
    });
    act(() => {
      sent = result.current.send({ content: 'Hi' });
    });
    await waitFor(() => {
      expect(feed.c).not.toBeNull();
    });
    feed.c?.enqueue(sse({ type: 'started', jobId: 'j1', userMessageId: 'm1' }));
    online = false;
    feed.c?.error(new TypeError('Load failed'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
      await sent;
    });
    expect(result.current.state.error).toBe('network');
    vi.useRealTimers();
  });

  it('handles web search events', async () => {
    const s = controllableStream();
    const { result } = renderHook(() => useReplyStream('c1'), { wrapper: wrapper() });
    let sent: Promise<unknown> = Promise.resolve();
    act(() => {
      sent = result.current.send({ content: 'Hi' });
    });

    // Push started event
    s.push({ type: 'started', jobId: 'j1', userMessageId: 'm1' });

    // Push search event
    s.push({ type: 'search', query: 'Wetter' });
    await waitFor(() => {
      expect(result.current.state.phase).toBe('searching');
    });
    expect(result.current.state.searchQuery).toBe('Wetter');

    // Push sources event
    s.push({
      type: 'sources',
      search: {
        query: 'Wetter',
        sources: [
          {
            title: 'W',
            url: 'https://w.example/',
          },
        ],
      },
    });
    await waitFor(() => {
      expect(result.current.state.searches.length).toBe(1);
    });

    // Push token and done events to end the stream
    s.push({ type: 'token', text: 'Hello' });
    s.push({ type: 'done', message: doneMessage });
    s.close();
    await act(async () => {
      await sent;
    });

    expect(result.current.state.phase).toBe('idle');
  });

  it('handles reading pages events', async () => {
    const s = controllableStream();
    const { result } = renderHook(() => useReplyStream('c1'), { wrapper: wrapper() });
    let sent: Promise<unknown> = Promise.resolve();
    act(() => {
      sent = result.current.send({ content: 'Hi' });
    });

    // Push started event
    s.push({ type: 'started', jobId: 'j1', userMessageId: 'm1' });

    // Push reading pages event
    s.push({ type: 'reading_pages', urls: ['https://a.example/'] });
    await waitFor(() => {
      expect(result.current.state.phase).toBe('readingPages');
    });
    expect(result.current.state.readingPages).toEqual(['https://a.example/']);

    // Push page event
    s.push({
      type: 'page',
      page: {
        id: 'p1',
        url: 'https://a.example/',
        title: 'A',
        status: 'read',
        reason: null,
      },
    });
    await waitFor(() => {
      expect(result.current.state.pages.length).toBe(1);
    });

    // Push token, done and close events to end the stream
    s.push({ type: 'token', text: 'Hello' });
    s.push({ type: 'done', message: doneMessage });
    s.close();
    await act(async () => {
      await sent;
    });

    expect(result.current.state.phase).toBe('idle');
  });
});
