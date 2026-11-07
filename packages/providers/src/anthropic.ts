/**
 * Claude through Anthropic's Messages API (streaming), with the user's own API key. Owned by
 * Claude: it sends chat content out of the house. Never logs content, keys or error bodies.
 *
 * - Thinking: adaptive (the API's default on current models); the chat's "think harder"
 *   switch sets the effort. Thinking text isn't shown, only that the model thinks.
 * - Tool rounds: the assistant's content blocks (thinking with signatures, text, tool_use)
 *   go back unchanged as `replay`, followed by one tool_result per tool_use.
 * - Server-side fallback (`fallbacks: "default"`): when the model declines, the API may
 *   answer with another model in the same stream. Echo rules for a fallback mid-output:
 *   thinking and tool_use blocks before the last `fallback` block are dropped.
 */
import { z } from 'zod';
import {
  cloudFetch,
  effortOf,
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
  type CloudChatRequest,
  type CloudClient,
  LlmError,
} from './types.ts';

const API_VERSION = '2023-06-01';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

type Block = Record<string, unknown> & { type: string };
interface Message {
  role: 'user' | 'assistant';
  content: Block[];
}

const Usage = z.object({
  input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
  cache_creation_input_tokens: z.number().nullable().optional(),
  cache_read_input_tokens: z.number().nullable().optional(),
});

const StreamData = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('message_start'),
    message: z.object({ usage: Usage.optional() }),
  }),
  z.object({
    type: z.literal('content_block_start'),
    index: z.number().int().min(0),
    content_block: z.object({ type: z.string() }).loose(),
  }),
  z.object({
    type: z.literal('content_block_delta'),
    index: z.number().int().min(0),
    delta: z.object({ type: z.string() }).loose(),
  }),
  z.object({ type: z.literal('content_block_stop'), index: z.number().int().min(0) }),
  z.object({
    type: z.literal('message_delta'),
    delta: z.object({ stop_reason: z.string().nullable().optional() }).loose(),
    usage: Usage.optional(),
  }),
  z.object({ type: z.literal('message_stop') }),
  z.object({ type: z.literal('ping') }),
  z.object({
    type: z.literal('error'),
    error: z.object({ type: z.string() }).loose(),
  }),
]);

/** Turns kchat's turns into the Messages API's system prompt and messages. */
export function toAnthropic(turns: readonly ChatTurn[]): { system: string; messages: Message[] } {
  const system = turns
    .filter((t) => t.role === 'system')
    .map((t) => t.content)
    .filter((c) => c !== '')
    .join('\n\n');
  const messages: Message[] = [];
  const push = (role: Message['role'], content: Block[]): void => {
    if (content.length === 0) return;
    const last = messages.at(-1);
    if (last?.role === role) last.content.push(...content);
    else messages.push({ role, content });
  };

  for (const turn of turns) {
    if (turn.role === 'system') continue;
    if (turn.role === 'user') {
      push('user', [
        ...(turn.images ?? []).map((data) => ({
          type: 'image',
          source: { type: 'base64', media_type: imageMediaType(data), data },
        })),
        ...(turn.content.trim() !== '' ? [{ type: 'text', text: turn.content }] : []),
      ]);
    } else if (turn.role === 'assistant') {
      if (Array.isArray(turn.replay)) {
        push(
          'assistant',
          (turn.replay as Block[]).map((b) => ({ ...b })),
        );
      } else {
        push('assistant', [
          ...(turn.content.trim() !== '' ? [{ type: 'text', text: turn.content }] : []),
          ...(turn.toolCalls ?? []).flatMap((c) =>
            c.id ? [{ type: 'tool_use', id: c.id, name: c.name, input: c.arguments ?? {} }] : [],
          ),
        ]);
      }
    } else if (turn.toolCallId) {
      push('user', [
        { type: 'tool_result', tool_use_id: turn.toolCallId, content: turn.content || '(empty)' },
      ]);
    }
  }

  // Every tool_use needs a tool_result in the next user message, results first.
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m?.role !== 'assistant') continue;
    const ids = m.content.filter((b) => b.type === 'tool_use').map((b) => String(b.id));
    if (ids.length === 0) continue;
    let next = messages[i + 1];
    if (next?.role !== 'user') {
      next = { role: 'user', content: [] };
      messages.splice(i + 1, 0, next);
    }
    const answered = new Set(
      next.content.filter((b) => b.type === 'tool_result').map((b) => String(b.tool_use_id)),
    );
    const missing = ids
      .filter((id) => !answered.has(id))
      .map((id) => ({
        type: 'tool_result',
        tool_use_id: id,
        content: TOOL_NOT_RUN,
        is_error: true,
      }));
    const results = [...next.content.filter((b) => b.type === 'tool_result'), ...missing];
    next.content = [...results, ...next.content.filter((b) => b.type !== 'tool_result')];
  }
  // The conversation starts with the user and ends with them (no prefill on current models).
  while (messages[0]?.role === 'assistant') messages.shift();
  while (messages.at(-1)?.role === 'assistant') messages.pop();
  return { system, messages };
}

/** The response's blocks as they go back next round (fallback echo rules applied). */
export function replayOf(blocks: readonly Block[]): Block[] {
  const lastFallback = blocks.findLastIndex((b) => b.type === 'fallback');
  return blocks.filter((b, i) => {
    if (b.type === 'fallback') return false;
    if (i < lastFallback) {
      return b.type !== 'thinking' && b.type !== 'redacted_thinking' && b.type !== 'tool_use';
    }
    return true;
  });
}

/** Header Anthropic needs for requests from a browser or web view (phone mode). */
export const BROWSER_ACCESS_HEADER = 'anthropic-dangerous-direct-browser-access';
export const ANTHROPIC_VERSION = API_VERSION;

export function createAnthropicClient(
  options: { fetch?: FetchLike; browser?: boolean } = {},
): CloudClient {
  const fetchImpl: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));

  const headers = (apiKey: string, fallback: boolean): Record<string, string> => ({
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': API_VERSION,
    ...(fallback ? { 'anthropic-beta': FALLBACK_BETA } : {}),
    // Only the phone app sets this; the hub server never does.
    ...(options.browser ? { [BROWSER_ACCESS_HEADER]: 'true' } : {}),
  });

  return {
    provider: 'anthropic',

    async *chat(req: CloudChatRequest): AsyncGenerator<ChatChunk> {
      const { system, messages } = toAnthropic(req.messages);
      if (messages.length === 0) throw new LlmError('bad_response');
      const fallback = req.serverFallback === true;
      const body = {
        model: req.model,
        max_tokens: req.maxOutputTokens,
        stream: true,
        ...(system !== '' ? { system } : {}),
        messages,
        ...(req.tools && req.tools.length > 0
          ? {
              tools: req.tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.parameters,
              })),
            }
          : {}),
        output_config: {
          effort: effortOf(req.think),
          ...(req.format ? { format: { type: 'json_schema', schema: req.format } } : {}),
        },
        ...(fallback ? { fallbacks: 'default' } : {}),
      };
      const res = await cloudFetch(fetchImpl, 'anthropic', '/v1/messages', {
        method: 'POST',
        headers: headers(req.apiKey, fallback),
        body: JSON.stringify(body),
        signal: req.signal,
      });
      if (!res.ok || !res.body) throw statusError(res);

      const blocks: (Block | undefined)[] = [];
      const toolJson = new Map<number, string>();
      let promptTokens = 0;
      let outputTokens = 0;
      let stopReason: string | null = null;
      let stopped = false;

      for await (const ev of sseEvents(res.body, req.signal)) {
        const parsed = StreamData.safeParse(parseData(ev.data));
        if (!parsed.success) continue; // event types added later
        const d = parsed.data;
        if (d.type === 'message_start') {
          const u = d.message.usage;
          promptTokens =
            (u?.input_tokens ?? 0) +
            (u?.cache_creation_input_tokens ?? 0) +
            (u?.cache_read_input_tokens ?? 0);
          outputTokens = u?.output_tokens ?? outputTokens;
        } else if (d.type === 'content_block_start') {
          const block: Block = { ...d.content_block };
          blocks[d.index] = block;
          if (block.type === 'tool_use') toolJson.set(d.index, '');
          if (block.type === 'thinking' || block.type === 'redacted_thinking') {
            yield { type: 'thinking', text: '' };
          }
          if (block.type === 'text' && typeof block.text === 'string' && block.text !== '') {
            yield { type: 'content', text: block.text };
          }
        } else if (d.type === 'content_block_delta') {
          const block = blocks[d.index];
          if (!block) throw new LlmError('bad_response');
          const delta = d.delta;
          if (delta.type === 'text_delta' && typeof delta.text === 'string') {
            block.text = `${typeof block.text === 'string' ? block.text : ''}${delta.text}`;
            yield { type: 'content', text: delta.text };
          } else if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
            block.thinking = `${typeof block.thinking === 'string' ? block.thinking : ''}${delta.thinking}`;
            yield { type: 'thinking', text: delta.thinking };
          } else if (delta.type === 'signature_delta' && typeof delta.signature === 'string') {
            block.signature = delta.signature;
          } else if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
            toolJson.set(d.index, (toolJson.get(d.index) ?? '') + delta.partial_json);
          }
        } else if (d.type === 'content_block_stop') {
          const block = blocks[d.index];
          const json = toolJson.get(d.index);
          if (block?.type === 'tool_use' && json !== undefined) {
            try {
              block.input = json.trim() === '' ? {} : (JSON.parse(json) as unknown);
            } catch {
              // Kept as an empty object for the replay; the call itself is reported invalid.
              block.input = {};
              block.kchatInvalid = true;
            }
          }
        } else if (d.type === 'message_delta') {
          stopReason = d.delta.stop_reason ?? stopReason;
          outputTokens = d.usage?.output_tokens ?? outputTokens;
        } else if (d.type === 'message_stop') {
          stopped = true;
          break;
        } else if (d.type === 'error') {
          const t = d.error.type;
          if (t === 'overloaded_error' || t === 'api_error') throw new LlmError('overloaded');
          if (t === 'rate_limit_error') throw new LlmError('rate_limited');
          throw new LlmError('bad_response');
        }
      }
      if (!stopped) throw new LlmError(req.signal.aborted ? 'aborted' : 'unavailable');
      if (stopReason === 'refusal') throw new LlmError('refused');

      const replay = replayOf(blocks.filter((b): b is Block => b !== undefined));
      for (const b of replay) {
        if (b.type !== 'tool_use' || typeof b.id !== 'string' || typeof b.name !== 'string') {
          continue;
        }
        const invalid = b.kchatInvalid === true;
        delete b.kchatInvalid;
        yield { type: 'tool_call', id: b.id, name: b.name, arguments: invalid ? null : b.input };
      }
      yield { type: 'done', promptTokens, outputTokens, loadMs: 0, replay };
    },

    async checkKey(apiKey, signal) {
      const res = await cloudFetch(fetchImpl, 'anthropic', '/v1/models?limit=1', {
        method: 'GET',
        headers: headers(apiKey, false),
        signal,
      });
      await res.body?.cancel().catch(() => undefined);
      if (res.ok) return true;
      if (res.status === 401 || res.status === 403) return false;
      throw statusError(res);
    },
  };
}
