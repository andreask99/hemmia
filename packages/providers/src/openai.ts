/**
 * OpenAI models through the Responses API (streaming), with the user's own API key. Owned by
 * Claude: it sends chat content out of the house. Never logs content, keys or error bodies.
 *
 * - `store: false`: OpenAI keeps no conversation state for kchat; each round sends what the
 *   model needs, and reasoning items come back encrypted so they can be passed back
 *   unchanged during tool rounds (`replay`), each function call followed by its output.
 * - The chat's "think harder" switch sets the reasoning effort. Reasoning isn't shown.
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

type Item = Record<string, unknown>;

const OutputItem = z.object({ type: z.string() }).loose();
const ResponseObject = z
  .object({
    output: z.array(OutputItem).optional(),
    usage: z
      .object({ input_tokens: z.number().optional(), output_tokens: z.number().optional() })
      .nullable()
      .optional(),
    error: z.object({ code: z.string().nullable().optional() }).nullable().optional(),
    incomplete_details: z
      .object({ reason: z.string().nullable().optional() })
      .nullable()
      .optional(),
  })
  .loose();

const StreamData = z.object({
  type: z.string(),
  delta: z.unknown().optional(),
  item: OutputItem.optional(),
  response: ResponseObject.optional(),
  code: z.string().nullable().optional(),
});

/** An error code from a failed response or an error event. */
function codeError(code: string | null | undefined): LlmError {
  if (code === 'rate_limit_exceeded' || code === 'insufficient_quota') {
    return new LlmError('rate_limited');
  }
  if (code === 'server_error' || code === 'server_is_overloaded' || code === 'slow_down') {
    return new LlmError('overloaded');
  }
  if (code === 'invalid_api_key') return new LlmError('auth');
  return new LlmError('bad_response');
}

/** Turns kchat's turns into the Responses API's instructions and input items. */
export function toOpenAi(turns: readonly ChatTurn[]): { instructions: string; input: Item[] } {
  const instructions = turns
    .filter((t) => t.role === 'system')
    .map((t) => t.content)
    .filter((c) => c !== '')
    .join('\n\n');
  const input: Item[] = [];
  /** Calls of the latest assistant round that still need an output. */
  let pending: string[] = [];
  const flush = (): void => {
    for (const id of pending) {
      input.push({ type: 'function_call_output', call_id: id, output: TOOL_NOT_RUN });
    }
    pending = [];
  };

  for (const turn of turns) {
    if (turn.role === 'system') continue;
    if (turn.role === 'tool') {
      if (!turn.toolCallId) continue;
      input.push({ type: 'function_call_output', call_id: turn.toolCallId, output: turn.content });
      pending = pending.filter((id) => id !== turn.toolCallId);
      continue;
    }
    flush();
    if (turn.role === 'user') {
      const images = turn.images ?? [];
      if (images.length === 0) {
        if (turn.content.trim() !== '') input.push({ role: 'user', content: turn.content });
      } else {
        input.push({
          role: 'user',
          content: [
            ...(turn.content.trim() !== '' ? [{ type: 'input_text', text: turn.content }] : []),
            ...images.map((data) => ({
              type: 'input_image',
              image_url: `data:${imageMediaType(data)};base64,${data}`,
            })),
          ],
        });
      }
    } else if (Array.isArray(turn.replay)) {
      for (const item of turn.replay as Item[]) {
        input.push({ ...item });
        if (item.type === 'function_call' && typeof item.call_id === 'string') {
          pending.push(item.call_id);
        }
      }
    } else {
      if (turn.content.trim() !== '') input.push({ role: 'assistant', content: turn.content });
      for (const c of turn.toolCalls ?? []) {
        if (!c.id) continue;
        input.push({
          type: 'function_call',
          call_id: c.id,
          name: c.name,
          arguments: JSON.stringify(c.arguments ?? {}),
        });
        pending.push(c.id);
      }
    }
  }
  flush();
  return { instructions, input };
}

/** The response's output as it goes back next round: reasoning as is, the rest minimal. */
export function replayOf(output: readonly Item[]): Item[] {
  return output.flatMap((item): Item[] => {
    if (item.type === 'reasoning') return [item];
    if (item.type === 'function_call') {
      return [
        {
          type: 'function_call',
          call_id: item.call_id,
          name: item.name,
          arguments: item.arguments,
        },
      ];
    }
    if (item.type === 'message' && Array.isArray(item.content)) {
      const text = (item.content as Item[])
        .map((p) => (typeof p.text === 'string' ? p.text : ''))
        .join('');
      return text === '' ? [] : [{ role: 'assistant', content: text }];
    }
    return [];
  });
}

export function createOpenAiClient(options: { fetch?: FetchLike } = {}): CloudClient {
  const fetchImpl: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));

  return {
    provider: 'openai',

    async *chat(req: CloudChatRequest): AsyncGenerator<ChatChunk> {
      const { instructions, input } = toOpenAi(req.messages);
      if (input.length === 0) throw new LlmError('bad_response');
      const body = {
        model: req.model,
        stream: true,
        store: false,
        include: ['reasoning.encrypted_content'],
        ...(instructions !== '' ? { instructions } : {}),
        input,
        reasoning: { effort: effortOf(req.think) },
        max_output_tokens: req.maxOutputTokens,
        ...(req.tools && req.tools.length > 0
          ? {
              tools: req.tools.map((t) => ({
                type: 'function',
                name: t.name,
                description: t.description,
                parameters: t.parameters,
              })),
            }
          : {}),
        ...(req.format
          ? { text: { format: { type: 'json_schema', name: 'answer', schema: req.format } } }
          : {}),
      };
      const res = await cloudFetch(fetchImpl, 'openai', '/v1/responses', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${req.apiKey}` },
        body: JSON.stringify(body),
        signal: req.signal,
      });
      if (!res.ok || !res.body) throw statusError(res);

      let final: z.infer<typeof ResponseObject> | null = null;
      for await (const ev of sseEvents(res.body, req.signal)) {
        if (ev.data === '[DONE]') break;
        const parsed = StreamData.safeParse(parseData(ev.data));
        if (!parsed.success) continue;
        const d = parsed.data;
        if (d.type === 'response.output_text.delta' || d.type === 'response.refusal.delta') {
          if (typeof d.delta === 'string' && d.delta !== '')
            yield { type: 'content', text: d.delta };
        } else if (d.type === 'response.output_item.added' && d.item?.type === 'reasoning') {
          yield { type: 'thinking', text: '' };
        } else if (d.type === 'response.reasoning_summary_text.delta') {
          if (typeof d.delta === 'string') yield { type: 'thinking', text: d.delta };
        } else if (d.type === 'response.completed' && d.response) {
          final = d.response;
          break;
        } else if (d.type === 'response.incomplete' && d.response) {
          // Out of output tokens: keep what came. A content filter is a refusal.
          if (d.response.incomplete_details?.reason === 'content_filter') {
            throw new LlmError('refused');
          }
          final = d.response;
          break;
        } else if (d.type === 'response.failed') {
          throw codeError(d.response?.error?.code);
        } else if (d.type === 'error') {
          throw codeError(d.code);
        }
      }
      if (!final) throw new LlmError(req.signal.aborted ? 'aborted' : 'unavailable');

      const output = (final.output ?? []) as Item[];
      if (
        output.some(
          (i) =>
            i.type === 'message' &&
            Array.isArray(i.content) &&
            (i.content as Item[]).some((p) => p.type === 'refusal'),
        )
      ) {
        throw new LlmError('refused');
      }
      const replay = replayOf(output);
      for (const item of replay) {
        if (
          item.type !== 'function_call' ||
          typeof item.call_id !== 'string' ||
          typeof item.name !== 'string'
        ) {
          continue;
        }
        let args: unknown;
        try {
          args =
            typeof item.arguments === 'string' ? (JSON.parse(item.arguments) as unknown) : null;
        } catch {
          args = null;
        }
        yield { type: 'tool_call', id: item.call_id, name: item.name, arguments: args };
      }
      yield {
        type: 'done',
        promptTokens: final.usage?.input_tokens ?? 0,
        outputTokens: final.usage?.output_tokens ?? 0,
        loadMs: 0,
        replay,
      };
    },

    async checkKey(apiKey, signal) {
      const res = await cloudFetch(fetchImpl, 'openai', '/v1/models', {
        method: 'GET',
        headers: { authorization: `Bearer ${apiKey}` },
        signal,
      });
      await res.body?.cancel().catch(() => undefined);
      if (res.ok) return true;
      if (res.status === 401 || res.status === 403) return false;
      throw statusError(res);
    },
  };
}
