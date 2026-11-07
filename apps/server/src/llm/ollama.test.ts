import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createOllamaClient } from './ollama.ts';
import { type ChatChunk, type ChatRequest, LlmError } from './types.ts';

type Handler = (req: IncomingMessage, body: unknown, res: ServerResponse) => void | Promise<void>;

let server: Server | null = null;
const seen: { method: string; url: string; body: unknown }[] = [];

async function serve(handler: Handler): Promise<string> {
  seen.length = 0;
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c: Buffer) => {
      raw += c.toString();
    });
    req.on('end', () => {
      const body: unknown = raw ? JSON.parse(raw) : null;
      seen.push({ method: req.method ?? '', url: req.url ?? '', body });
      void handler(req, body, res);
    });
  });
  await new Promise<void>((resolve) => {
    server?.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${String(port)}/`;
}

afterEach(async () => {
  server?.closeAllConnections();
  await new Promise<void>((resolve) => {
    if (server)
      server.close(() => {
        resolve();
      });
    else resolve();
  });
  server = null;
});

function req(extra: Partial<ChatRequest> = {}): ChatRequest {
  return {
    model: 'm:1b',
    messages: [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'look', images: ['aGk='] },
    ],
    think: 'low',
    contextTokens: 8192,
    maxOutputTokens: 512,
    keepAliveSeconds: 300,
    signal: new AbortController().signal,
    ...extra,
  };
}

async function collect(it: AsyncIterable<ChatChunk>): Promise<ChatChunk[]> {
  const out: ChatChunk[] = [];
  for await (const c of it) out.push(c);
  return out;
}

const line = (o: object) => `${JSON.stringify(o)}\n`;

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    return err instanceof LlmError ? err.code : 'not-llm-error';
  }
  return 'no-error';
}

describe('ollama chat', () => {
  it('streams thinking, content and done, with the right request body', async () => {
    const url = await serve((_r, _b, res) => {
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      res.write(line({ message: { thinking: 'hmm' }, done: false }));
      res.write(line({ message: { content: 'Hel' }, done: false }));
      res.write(line({ message: { content: 'lo' }, done: false }));
      res.end(line({ done: true, prompt_eval_count: 12, eval_count: 2, load_duration: 2_500_000 }));
    });
    const out = await collect(createOllamaClient(url).chat(req()));
    expect(out).toEqual([
      { type: 'thinking', text: 'hmm' },
      { type: 'content', text: 'Hel' },
      { type: 'content', text: 'lo' },
      { type: 'done', promptTokens: 12, outputTokens: 2, loadMs: 3 },
    ]);
    expect(seen[0]).toMatchObject({
      method: 'POST',
      url: '/api/chat',
      body: {
        model: 'm:1b',
        stream: true,
        think: 'low',
        keep_alive: 300,
        options: { num_ctx: 8192, num_predict: 512 },
        messages: [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'look', images: ['aGk='] },
        ],
      },
    });
    const body = seen[0]?.body as { messages: object[] };
    expect(body.messages[0]).not.toHaveProperty('images');
  });

  it('handles lines split across chunks and several lines per chunk', async () => {
    const url = await serve((_r, _b, res) => {
      res.writeHead(200);
      const a = line({ message: { content: 'A' } });
      res.write(a.slice(0, 7));
      res.write(a.slice(7) + line({ message: { content: 'B' } }));
      res.end(JSON.stringify({ done: true })); // final line without newline
    });
    const out = await collect(createOllamaClient(url).chat(req()));
    expect(out.map((c) => c.type)).toEqual(['content', 'content', 'done']);
  });

  it('maps 404 to model_not_found', async () => {
    const url = await serve((_r, _b, res) => {
      res.writeHead(404).end(JSON.stringify({ error: "model 'x' not found" }));
    });
    expect(await code(collect(createOllamaClient(url).chat(req())))).toBe('model_not_found');
  });

  it('maps 501 (e.g. no structured output on MLX) to unsupported', async () => {
    const url = await serve((_r, _b, res) => {
      res.writeHead(501).end(JSON.stringify({ error: 'structured output is unavailable' }));
    });
    expect(await code(collect(createOllamaClient(url).chat(req())))).toBe('unsupported');
  });

  it('maps an error line to bad_response without leaking its text', async () => {
    const url = await serve((_r, _b, res) => {
      res.writeHead(200);
      res.write(line({ message: { content: 'x' } }));
      res.end(line({ error: 'boom secret' }));
    });
    const err = await collect(createOllamaClient(url).chat(req())).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect((err as LlmError).code).toBe('bad_response');
    expect(String(err)).not.toContain('boom');
  });

  it('treats a stream without done as bad_response', async () => {
    const url = await serve((_r, _b, res) => {
      res.writeHead(200).end(line({ message: { content: 'x' } }));
    });
    expect(await code(collect(createOllamaClient(url).chat(req())))).toBe('bad_response');
  });

  it('reports aborts', async () => {
    const url = await serve((_r, _b, res) => {
      res.writeHead(200);
      res.write(line({ message: { content: 'first' } }));
      // then hang
    });
    const controller = new AbortController();
    const it = createOllamaClient(url).chat(req({ signal: controller.signal }));
    const got = await (async () => {
      const out: string[] = [];
      try {
        for await (const c of it) {
          out.push(c.type);
          controller.abort();
        }
      } catch (err) {
        out.push(err instanceof LlmError ? err.code : 'other');
      }
      return out;
    })();
    expect(got).toEqual(['content', 'aborted']);
  });

  it('reports an unreachable engine', async () => {
    const url = await serve(() => undefined);
    await new Promise<void>((resolve) => {
      server?.close(() => {
        resolve();
      });
    });
    server = null;
    expect(await code(collect(createOllamaClient(url).chat(req())))).toBe('unavailable');
  });
});

describe('ollama models', () => {
  it('lists loaded models with sizes in GiB', async () => {
    const url = await serve((_r, _b, res) => {
      res
        .writeHead(200)
        .end(JSON.stringify({ models: [{ name: 'm:1b', size: 2 * 1024 ** 3, size_vram: 1 }] }));
    });
    expect(await createOllamaClient(url).loaded()).toEqual([{ model: 'm:1b', memoryGiB: 2 }]);
  });

  it('unloads with keep_alive 0 and ignores 404', async () => {
    let status = 200;
    const url = await serve((_r, _b, res) => {
      res.writeHead(status).end('{}');
    });
    const client = createOllamaClient(url);
    await client.unload('m:1b');
    expect(seen[0]).toMatchObject({ url: '/api/generate', body: { model: 'm:1b', keep_alive: 0 } });
    status = 404;
    await expect(client.unload('gone')).resolves.toBeUndefined();
  });

  it('checks a model by loading it briefly, and spots one Ollama cannot run', async () => {
    const unknown = JSON.stringify({
      error:
        "llama-server process has terminated: exit status 1: error loading model: unknown model architecture: 'kolibri1'",
    });
    const url = await serve((_r, body, res) => {
      const model = (body as { model: string }).model;
      if (model === 'kolibri:78b') res.writeHead(500).end(unknown);
      else if (model === 'broken:1b') res.writeHead(500).end(JSON.stringify({ error: 'boom' }));
      else res.writeHead(200).end(JSON.stringify({ done: true, done_reason: 'load' }));
    });
    const client = createOllamaClient(url);
    const signal = new AbortController().signal;
    await client.check?.('m:1b', signal);
    expect(seen[0]).toMatchObject({ url: '/api/generate', body: { model: 'm:1b', keep_alive: 1 } });
    await expect(client.check?.('kolibri:78b', signal)).rejects.toMatchObject({
      code: 'model_unsupported',
    });
    await expect(client.check?.('broken:1b', signal)).rejects.toMatchObject({
      code: 'bad_response',
    });
    await expect(collect(client.chat(req({ model: 'kolibri:78b' })))).rejects.toMatchObject({
      code: 'model_unsupported',
    });
  });

  it('maps capabilities and missing models', async () => {
    const url = await serve((_r, body, res) => {
      const model = (body as { model: string }).model;
      if (model === 'gone') res.writeHead(404).end('{}');
      else
        res
          .writeHead(200)
          .end(JSON.stringify({ capabilities: ['completion', 'vision', 'thinking'] }));
    });
    const client = createOllamaClient(url);
    expect(await client.capabilities('m:1b')).toEqual({
      vision: true,
      thinking: true,
      tools: false,
    });
    expect(await code(client.capabilities('gone'))).toBe('model_not_found');
  });
});
