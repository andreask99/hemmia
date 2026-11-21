/**
 * The automatic check that stands in for a person approving the catalogue (P11.3): download a
 * model into this Mac's Ollama, make it answer, try a tool call and a picture when it claims
 * them, note how much memory it took, then delete it again unless it was there before. Runs at
 * night while the family hub is paused (build.ts). Prompts are fixed test strings; nothing
 * about anyone is sent.
 */
import { crc32, deflateSync } from 'node:zlib';

export interface CheckResult {
  ok: boolean;
  tools: boolean;
  vision: boolean;
  /** Memory Ollama reported while loaded (GiB), or null. */
  memoryGiB: number | null;
  seconds: number;
  error: string | null;
}

interface Options {
  ollama?: string;
  claimsTools: boolean;
  claimsVision: boolean;
  /** Per request; downloads get `pullTimeoutMs`. */
  timeoutMs?: number;
  pullTimeoutMs?: number;
  log?: (line: string) => void;
}

async function call(
  base: string,
  path: string,
  body: unknown,
  timeoutMs: number,
  method = 'POST',
): Promise<unknown> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const text = await res.text();
  return text ? (JSON.parse(text) as unknown) : null;
}

/** A string field of a JSON value, or "". */
function str(v: unknown, ...path: string[]): string {
  const f = field(v, ...path);
  return typeof f === 'string' ? f : '';
}

function field(v: unknown, ...path: string[]): unknown {
  let cur = v;
  for (const p of path) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** A 32×32 solid red PNG, built here so no file or download is needed. */
export function redPng(): string {
  const w = 32;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, Buffer.from([220, 20, 20]))]);
  const raw = Buffer.concat(Array.from({ length: w }, () => row));
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(w, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

export async function installedModels(ollama = 'http://127.0.0.1:11434'): Promise<Set<string>> {
  const tags = await call(ollama, '/api/tags', undefined, 10_000, 'GET');
  const models = field(tags, 'models');
  const names = Array.isArray(models) ? models.map((m) => field(m, 'name')) : [];
  return new Set(names.filter((n): n is string => typeof n === 'string'));
}

export async function checkModel(model: string, o: Options): Promise<CheckResult> {
  const base = o.ollama ?? 'http://127.0.0.1:11434';
  const timeout = o.timeoutMs ?? 300_000;
  const log = o.log ?? (() => undefined);
  const started = Date.now();
  const result: CheckResult = {
    ok: false,
    tools: false,
    vision: false,
    memoryGiB: null,
    seconds: 0,
    error: null,
  };
  const before = await installedModels(base);
  const had = before.has(model);
  try {
    if (!had) {
      log(`downloading ${model}`);
      await call(base, '/api/pull', { model, stream: false }, o.pullTimeoutMs ?? 3_600_000);
    }
    const chat = (body: Record<string, unknown>) =>
      call(
        base,
        '/api/chat',
        { model, stream: false, options: { num_ctx: 8192 }, ...body },
        timeout,
      );

    const hello = await chat({
      messages: [{ role: 'user', content: 'Reply with the single word OK and nothing else.' }],
    });
    const content = str(hello, 'message', 'content');
    if (!/\bok\b/i.test(content)) throw new Error('no answer');

    const ps = await call(base, '/api/ps', undefined, 10_000, 'GET');
    const loaded = field(ps, 'models');
    if (Array.isArray(loaded)) {
      const me: unknown = loaded.find(
        (m: unknown) => field(m, 'name') === model || field(m, 'model') === model,
      );
      const size = field(me, 'size');
      if (typeof size === 'number') result.memoryGiB = Math.round((size / 1024 ** 3) * 10) / 10;
    }
    result.ok = true;

    if (o.claimsTools) {
      const r = await chat({
        messages: [
          { role: 'user', content: 'What is the weather in Paris right now? Use the tool.' },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Current weather for a city',
              parameters: {
                type: 'object',
                properties: { city: { type: 'string' } },
                required: ['city'],
              },
            },
          },
        ],
      }).catch(() => null);
      const calls = field(r, 'message', 'tool_calls');
      result.tools =
        Array.isArray(calls) && calls.some((c) => field(c, 'function', 'name') === 'get_weather');
    }
    if (o.claimsVision) {
      const r = await chat({
        messages: [
          {
            role: 'user',
            content: 'What colour is this picture? Answer with one word.',
            images: [redPng()],
          },
        ],
      }).catch(() => null);
      result.vision = /\bred\b/i.test(str(r, 'message', 'content'));
    }
  } catch (e) {
    result.error = e instanceof Error ? e.message.slice(0, 200) : 'failed';
  } finally {
    await call(base, '/api/generate', { model, keep_alive: 0 }, 30_000).catch(() => null);
    if (!had) {
      await call(base, '/api/delete', { model }, 60_000, 'DELETE').catch(() => null);
    }
    result.seconds = Math.round((Date.now() - started) / 1000);
  }
  return result;
}
