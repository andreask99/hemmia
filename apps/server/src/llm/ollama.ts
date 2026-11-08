/**
 * Ollama client: streaming chat over /api/chat (NDJSON), loaded models, unload, and
 * capabilities. Errors carry codes only, never content.
 */
import http from 'node:http';
import { Readable } from 'node:stream';
import { z } from 'zod';
import {
  type ChatChunk,
  type ChatRequest,
  LlmError,
  type LlmClient,
  type PullProgress,
} from './types.ts';

const ChatLine = z.object({
  error: z.string().optional(),
  message: z
    .object({
      content: z.string().optional(),
      thinking: z.string().optional(),
      tool_calls: z
        .array(z.object({ function: z.object({ name: z.string(), arguments: z.unknown() }) }))
        .optional(),
    })
    .optional(),
  done: z.boolean().optional(),
  prompt_eval_count: z.number().optional(),
  eval_count: z.number().optional(),
  load_duration: z.number().optional(),
});

const ErrorBody = z.object({ error: z.string() });

/** Ollama's error when its runner can't load a model (e.g. "unknown model architecture"). */
const UNSUPPORTED = /unknown model architecture|unsupported (model )?architecture/i;
/** "model requires 6.9 GiB but only 4.8 GiB are available", "requires more system memory". */
const TOO_LARGE = /requires (more system memory|[\d.]+ ?[kmgt]i?b but only)/i;

const PsResponse = z.object({
  models: z.array(z.object({ name: z.string(), size: z.number() })),
});

const ShowResponse = z.object({ capabilities: z.array(z.string()).optional() });

const PullLine = z.object({
  status: z.string().optional(),
  digest: z.string().optional(),
  total: z.number().optional(),
  completed: z.number().optional(),
  error: z.string().optional(),
});

const TagsResponse = z.object({
  models: z.array(z.object({ name: z.string(), size: z.number() })),
});

export function createOllamaClient(baseUrl: string): LlmClient {
  const base = baseUrl.replace(/\/$/, '');

  /**
   * Requests go through node:http rather than fetch: fetch gives up after 300 s without a
   * byte, and Ollama sends nothing while it reads a long prompt (several minutes for long
   * logs). The job's own timeout (and its abort signal) bounds every request instead.
   */
  async function request(path: string, init: RequestInit): Promise<Response> {
    try {
      return await new Promise<Response>((resolve, reject) => {
        const body = typeof init.body === 'string' ? init.body : undefined;
        const req = http.request(
          `${base}${path}`,
          {
            method: init.method ?? 'GET',
            headers: {
              ...(init.headers as Record<string, string> | undefined),
              ...(body !== undefined ? { 'content-length': String(Buffer.byteLength(body)) } : {}),
            },
            ...(init.signal ? { signal: init.signal } : {}),
          },
          (res) => {
            const status = res.statusCode ?? 500;
            const noBody = status === 204 || status === 304;
            if (noBody) res.resume();
            resolve(
              new Response(noBody ? null : (Readable.toWeb(res) as ReadableStream<Uint8Array>), {
                status,
              }),
            );
          },
        );
        req.on('error', reject);
        req.end(body);
      });
    } catch {
      if (init.signal?.aborted) throw new LlmError('aborted');
      throw new LlmError('unavailable');
    }
  }

  function postJson(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
    return request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  }

  async function json(res: Response): Promise<unknown> {
    try {
      return await res.json();
    } catch {
      throw new LlmError('bad_response');
    }
  }

  /**
   * The code for a failed response. Ollama answers 500 with {"error": "..."}; the text is
   * matched only for a model it can't load, and never logged.
   */
  async function failure(res: Response): Promise<LlmError> {
    const body = ErrorBody.safeParse(await res.json().catch(() => null));
    if (body.success && UNSUPPORTED.test(body.data.error)) return new LlmError('model_unsupported');
    if (body.success && TOO_LARGE.test(body.data.error)) return new LlmError('model_too_large');
    return new LlmError('bad_response');
  }

  function parseLine(line: string): z.infer<typeof ChatLine> {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new LlmError('bad_response');
    }
    const parsed = ChatLine.safeParse(value);
    if (!parsed.success || parsed.data.error !== undefined) throw new LlmError('bad_response');
    return parsed.data;
  }

  return {
    async *chat(req: ChatRequest): AsyncGenerator<ChatChunk> {
      const res = await postJson(
        '/api/chat',
        {
          model: req.model,
          messages: req.messages.map((m) => ({
            role: m.role,
            content: m.content,
            ...(m.images && m.images.length > 0 ? { images: m.images } : {}),
            ...(m.toolCalls && m.toolCalls.length > 0
              ? {
                  tool_calls: m.toolCalls.map((c) => ({
                    function: { name: c.name, arguments: c.arguments },
                  })),
                }
              : {}),
            ...(m.toolName ? { tool_name: m.toolName } : {}),
          })),
          stream: true,
          think: req.think,
          ...(req.tools && req.tools.length > 0
            ? {
                tools: req.tools.map((t) => ({
                  type: 'function',
                  function: { name: t.name, description: t.description, parameters: t.parameters },
                })),
              }
            : {}),
          ...(req.format ? { format: req.format } : {}),
          keep_alive: req.keepAliveSeconds,
          options: { num_ctx: req.contextTokens, num_predict: req.maxOutputTokens },
        },
        req.signal,
      );
      if (res.status === 404) throw new LlmError('model_not_found');
      if (res.status === 501) throw new LlmError('unsupported');
      if (!res.ok) throw await failure(res);
      if (!res.body) throw new LlmError('bad_response');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      function* handle(line: string): Generator<ChatChunk, boolean> {
        if (line.trim() === '') return false;
        const obj = parseLine(line);
        const thinking = obj.message?.thinking;
        if (thinking) yield { type: 'thinking', text: thinking };
        const content = obj.message?.content;
        if (content) yield { type: 'content', text: content };
        for (const call of obj.message?.tool_calls ?? []) {
          yield { type: 'tool_call', name: call.function.name, arguments: call.function.arguments };
        }
        if (obj.done === true) {
          yield {
            type: 'done',
            promptTokens: obj.prompt_eval_count ?? 0,
            outputTokens: obj.eval_count ?? 0,
            loadMs: Math.round((obj.load_duration ?? 0) / 1e6),
          };
          return true;
        }
        return false;
      }

      try {
        for (;;) {
          let chunk: Awaited<ReturnType<typeof reader.read>>;
          try {
            chunk = await reader.read();
          } catch {
            throw new LlmError(req.signal.aborted ? 'aborted' : 'unavailable');
          }
          if (chunk.done) break;
          const bytes: unknown = chunk.value;
          if (!(bytes instanceof Uint8Array)) throw new LlmError('bad_response');
          buffer += decoder.decode(bytes, { stream: true });
          let newline = buffer.indexOf('\n');
          while (newline >= 0) {
            const line = buffer.slice(0, newline);
            buffer = buffer.slice(newline + 1);
            if (yield* handle(line)) return;
            newline = buffer.indexOf('\n');
          }
        }
        buffer += decoder.decode();
        if (yield* handle(buffer)) return;
        throw new LlmError(req.signal.aborted ? 'aborted' : 'bad_response');
      } finally {
        reader.cancel().catch(() => undefined);
      }
    },

    async *pull(model: string, signal: AbortSignal): AsyncGenerator<PullProgress> {
      const res = await postJson('/api/pull', { model, stream: true }, signal);
      if (res.status === 404) throw new LlmError('model_not_found');
      if (!res.ok || !res.body) {
        await res.body?.cancel().catch(() => undefined);
        throw new LlmError(res.status >= 500 ? 'unavailable' : 'bad_response');
      }
      const layers = new Map<string, { total: number; completed: number }>();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const state = { succeeded: false };
      const handle = (line: string): PullProgress | null => {
        if (line.trim() === '') return null;
        let value: unknown;
        try {
          value = JSON.parse(line);
        } catch {
          throw new LlmError('bad_response');
        }
        const parsed = PullLine.safeParse(value);
        if (!parsed.success) throw new LlmError('bad_response');
        const p = parsed.data;
        if (p.error !== undefined) {
          throw new LlmError(
            /not found|does not exist|manifest unknown/i.test(p.error)
              ? 'model_not_found'
              : 'bad_response',
          );
        }
        if (p.digest && p.total !== undefined) {
          layers.set(p.digest, { total: p.total, completed: p.completed ?? 0 });
        }
        if (p.status === 'success') state.succeeded = true;
        let total = 0;
        let completed = 0;
        for (const l of layers.values()) {
          total += l.total;
          completed += Math.min(l.completed, l.total);
        }
        return { status: p.status ?? '', completed, total };
      };
      try {
        for (;;) {
          let chunk: Awaited<ReturnType<typeof reader.read>>;
          try {
            chunk = await reader.read();
          } catch {
            throw new LlmError(signal.aborted ? 'aborted' : 'unavailable');
          }
          if (chunk.done) break;
          const bytes: unknown = chunk.value;
          if (!(bytes instanceof Uint8Array)) throw new LlmError('bad_response');
          buffer += decoder.decode(bytes, { stream: true });
          let newline = buffer.indexOf('\n');
          while (newline >= 0) {
            const progress = handle(buffer.slice(0, newline));
            buffer = buffer.slice(newline + 1);
            if (progress) yield progress;
            newline = buffer.indexOf('\n');
          }
        }
        const last = handle(buffer + decoder.decode());
        if (last) yield last;
        if (!state.succeeded) throw new LlmError(signal.aborted ? 'aborted' : 'bad_response');
      } finally {
        reader.cancel().catch(() => undefined);
      }
    },

    async loaded() {
      const res = await request('/api/ps', { method: 'GET' });
      if (!res.ok) throw new LlmError('bad_response');
      const parsed = PsResponse.safeParse(await json(res));
      if (!parsed.success) throw new LlmError('bad_response');
      return parsed.data.models.map((m) => ({ model: m.name, memoryGiB: m.size / 1024 ** 3 }));
    },

    async unload(model: string) {
      const res = await postJson('/api/generate', { model, keep_alive: 0 });
      await res.body?.cancel().catch(() => undefined);
      if (res.status === 404) return;
      if (!res.ok) throw new LlmError('bad_response');
    },

    async check(model: string, signal: AbortSignal) {
      // No prompt and a short keep_alive: Ollama only loads the model, then frees it.
      const res = await postJson('/api/generate', { model, keep_alive: 1 }, signal);
      if (res.status === 404) throw new LlmError('model_not_found');
      if (!res.ok) throw await failure(res);
      await res.body?.cancel().catch(() => undefined);
    },

    async installed() {
      const res = await request('/api/tags', { method: 'GET' });
      if (!res.ok) throw new LlmError('bad_response');
      const parsed = TagsResponse.safeParse(await json(res));
      if (!parsed.success) throw new LlmError('bad_response');
      return parsed.data.models.map((m) => ({ model: m.name, sizeGiB: m.size / 1024 ** 3 }));
    },

    async capabilities(model: string) {
      const res = await postJson('/api/show', { model });
      if (res.status === 404) throw new LlmError('model_not_found');
      if (!res.ok) throw new LlmError('bad_response');
      const parsed = ShowResponse.safeParse(await json(res));
      if (!parsed.success) throw new LlmError('bad_response');
      const caps = parsed.data.capabilities ?? [];
      return {
        vision: caps.includes('vision'),
        thinking: caps.includes('thinking'),
        tools: caps.includes('tools'),
      };
    },
  };
}
