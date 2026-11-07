/**
 * A streaming client for the OpenAI Chat Completions protocol (`POST <base>/chat/completions`),
 * spoken by OpenRouter and by local servers (LM Studio, llama.cpp, vLLM). Owned by Claude: for
 * OpenRouter it sends chat content out of the house. Never logs content, keys or error bodies.
 *
 * The base URL comes from the caller (a fixed constant for OpenRouter, an address checked by
 * security/localengine.ts for local servers). No redirects, no cookies. Response bodies of
 * failed requests are discarded unread.
 */
import { z } from 'zod';
import {
  type FetchLike,
  imageMediaType,
  parseData,
  sseEvents,
  statusError,
  TOOL_NOT_RUN,
} from './cloudhttp.ts';
import {
  type ChatChunk,
  type ChatTurn,
  LlmError,
  type ThinkLevel,
  type ToolSpec,
} from './types.ts';

export interface ChatCompletionsOptions {
  /** e.g. "https://openrouter.ai/api/v1" or "http://127.0.0.1:1234/v1" (no trailing slash). */
  baseUrl: string;
  apiKey?: string;
  fetch?: FetchLike;
  extraHeaders?: Record<string, string>;
  /** Time allowed until the response headers arrive, ms. Default 60 s. */
  timeoutMs?: number;
  /** Extra body fields for a request (e.g. OpenRouter's `reasoning`). */
  extraBody?: (req: ChatCompletionsRequest) => Record<string, unknown>;
}

export interface ChatCompletionsRequest {
  model: string;
  messages: readonly ChatTurn[];
  think: ThinkLevel;
  maxOutputTokens: number;
  tools?: ToolSpec[];
  format?: Record<string, unknown>;
  signal: AbortSignal;
}

type Message = Record<string, unknown>;

/** Turns kchat's turns into Chat Completions messages (one result for every tool call). */
export function toChatCompletions(turns: readonly ChatTurn[]): Message[] {
  const out: Message[] = [];
  const system = turns
    .filter((t) => t.role === 'system')
    .map((t) => t.content)
    .filter((c) => c !== '')
    .join('\n\n');
  if (system !== '') out.push({ role: 'system', content: system });
  let pending: string[] = [];
  let generated = 0;
  const flush = (): void => {
    for (const id of pending) out.push({ role: 'tool', tool_call_id: id, content: TOOL_NOT_RUN });
    pending = [];
  };

  for (const turn of turns) {
    if (turn.role === 'system') continue;
    if (turn.role === 'tool') {
      // Engines without call ids: results answer the calls in order.
      const id =
        turn.toolCallId && pending.includes(turn.toolCallId) ? turn.toolCallId : pending[0];
      if (id === undefined) continue;
      out.push({ role: 'tool', tool_call_id: id, content: turn.content });
      pending = pending.filter((p) => p !== id);
      continue;
    }
    flush();
    if (turn.role === 'user') {
      const images = turn.images ?? [];
      if (images.length === 0) {
        out.push({ role: 'user', content: turn.content });
      } else {
        out.push({
          role: 'user',
          content: [
            ...(turn.content.trim() !== '' ? [{ type: 'text', text: turn.content }] : []),
            ...images.map((data) => ({
              type: 'image_url',
              image_url: { url: `data:${imageMediaType(data)};base64,${data}` },
            })),
          ],
        });
      }
      continue;
    }
    const calls = (turn.toolCalls ?? []).map((c) => {
      generated += 1;
      return {
        id: c.id ?? `call_${String(generated)}`,
        type: 'function',
        function: { name: c.name, arguments: JSON.stringify(c.arguments ?? {}) },
      };
    });
    if (turn.content === '' && calls.length === 0) continue;
    out.push({
      role: 'assistant',
      content: turn.content,
      ...(calls.length > 0 ? { tool_calls: calls } : {}),
    });
    pending = calls.map((c) => c.id);
  }
  flush();
  return out;
}

const ToolCallDelta = z.object({
  index: z.number().int().min(0).max(63).optional(),
  id: z.string().optional(),
  function: z.object({ name: z.string().optional(), arguments: z.string().optional() }).optional(),
});

const StreamChunk = z.object({
  choices: z
    .array(
      z.object({
        delta: z
          .object({
            content: z.string().nullable().optional(),
            reasoning: z.string().nullable().optional(),
            reasoning_content: z.string().nullable().optional(),
            tool_calls: z.array(ToolCallDelta).nullable().optional(),
          })
          .optional(),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .optional(),
  usage: z
    .object({ prompt_tokens: z.number().optional(), completion_tokens: z.number().optional() })
    .nullable()
    .optional(),
  error: z.object({ code: z.union([z.number(), z.string()]).nullable().optional() }).optional(),
});

/** An error reported inside the stream (OpenRouter sends the HTTP-like code). */
function streamError(code: number | string | null | undefined): LlmError {
  const n = typeof code === 'number' ? code : Number(code);
  if (n === 401 || n === 403) return new LlmError('auth');
  if (n === 402 || n === 429 || code === 'rate_limit_exceeded') return new LlmError('rate_limited');
  if (n >= 500) return new LlmError('overloaded');
  return new LlmError('bad_response');
}

export async function* chatCompletions(
  options: ChatCompletionsOptions,
  req: ChatCompletionsRequest,
): AsyncGenerator<ChatChunk> {
  const fetchImpl: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
  const messages = toChatCompletions(req.messages);
  if (!messages.some((m) => m.role === 'user')) throw new LlmError('bad_response');
  const body = {
    model: req.model,
    stream: true,
    stream_options: { include_usage: true },
    messages,
    max_tokens: req.maxOutputTokens,
    ...(req.tools && req.tools.length > 0
      ? {
          tools: req.tools.map((t) => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.parameters },
          })),
        }
      : {}),
    ...(req.format
      ? {
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'answer', schema: req.format },
          },
        }
      : {}),
    ...(options.extraBody?.(req) ?? {}),
  };

  // The timeout covers waiting for the response headers; the stream itself runs as long as
  // the job's signal allows.
  const headersTimeout = new AbortController();
  const timer = setTimeout(() => {
    headersTimeout.abort();
  }, options.timeoutMs ?? 60_000);
  const signal = AbortSignal.any([req.signal, headersTimeout.signal]);
  let res: Response;
  try {
    res = await fetchImpl(`${options.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {}),
        ...options.extraHeaders,
      },
      body: JSON.stringify(body),
      signal,
      redirect: 'error',
      credentials: 'omit',
    });
  } catch {
    throw new LlmError(req.signal.aborted ? 'aborted' : 'unavailable');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok || !res.body) throw statusError(res);

  const calls = new Map<number, { id?: string; name: string; args: string }>();
  let usage: { prompt_tokens?: number; completion_tokens?: number } | null = null;
  let finished = false;
  for await (const ev of sseEvents(res.body, req.signal)) {
    if (ev.data === '[DONE]') {
      finished = true;
      break;
    }
    const parsed = StreamChunk.safeParse(parseData(ev.data));
    if (!parsed.success) continue;
    const chunk = parsed.data;
    if (chunk.error) throw streamError(chunk.error.code);
    if (chunk.usage) usage = chunk.usage;
    for (const choice of chunk.choices ?? []) {
      const d = choice.delta;
      const thinking = d?.reasoning ?? d?.reasoning_content;
      if (thinking) yield { type: 'thinking', text: thinking };
      if (d?.content) yield { type: 'content', text: d.content };
      for (const tc of d?.tool_calls ?? []) {
        const index = tc.index ?? 0;
        const call = calls.get(index) ?? { name: '', args: '' };
        if (tc.id) call.id = tc.id;
        if (tc.function?.name) call.name += tc.function.name;
        if (tc.function?.arguments) call.args += tc.function.arguments;
        calls.set(index, call);
      }
      if (choice.finish_reason === 'content_filter') throw new LlmError('refused');
      if (choice.finish_reason) finished = true;
    }
  }
  if (!finished) throw new LlmError(req.signal.aborted ? 'aborted' : 'unavailable');

  for (const [index, call] of [...calls.entries()].sort((a, b) => a[0] - b[0])) {
    if (call.name === '') continue;
    let args: unknown;
    try {
      args = call.args === '' ? {} : (JSON.parse(call.args) as unknown);
    } catch {
      args = null;
    }
    yield {
      type: 'tool_call',
      id: call.id ?? `call_${String(index + 1)}`,
      name: call.name,
      arguments: args,
    };
  }
  yield {
    type: 'done',
    promptTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
    loadMs: 0,
  };
}
