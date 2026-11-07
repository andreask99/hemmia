import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createOllamaClient } from './ollama.ts';
import type { PullProgress } from './types.ts';

// Shape of a real `ollama pull` stream (Ollama 0.40), shortened.
const PULL = [
  { status: 'pulling manifest' },
  { status: 'pulling 4e30e2665218', digest: 'sha256:4e30', total: 1000, completed: 0 },
  { status: 'pulling 4e30e2665218', digest: 'sha256:4e30', total: 1000, completed: 600 },
  { status: 'pulling e0a42594d802', digest: 'sha256:e0a4', total: 200, completed: 200 },
  { status: 'pulling 4e30e2665218', digest: 'sha256:4e30', total: 1000, completed: 1000 },
  { status: 'verifying sha256 digest' },
  { status: 'writing manifest' },
  { status: 'success' },
];

let server: Server;
let url = '';
const bodies: unknown[] = [];
beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString()));
    req.on('end', () => {
      const parsed = JSON.parse(body) as { model: string };
      bodies.push(parsed);
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      if (parsed.model === 'nope:1b') {
        res.end(
          `${JSON.stringify({ status: 'pulling manifest' })}\n${JSON.stringify({ error: 'pull model manifest: file does not exist' })}\n`,
        );
        return;
      }
      if (parsed.model === 'cut:1b') {
        res.end(`${JSON.stringify(PULL[1])}\n`);
        return;
      }
      // Split a line across writes.
      const text = PULL.map((l) => JSON.stringify(l)).join('\n') + '\n';
      res.write(text.slice(0, 50));
      res.end(text.slice(50));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
});
afterAll(async () => {
  await new Promise<void>((r) =>
    server.close(() => {
      r();
    }),
  );
});

function pullFrom(base: string) {
  const client = createOllamaClient(base);
  return (model: string, signal: AbortSignal) => {
    if (!client.pull) throw new Error('no pull');
    return client.pull(model, signal);
  };
}

async function collect(it: AsyncIterable<PullProgress>): Promise<PullProgress[]> {
  const out: PullProgress[] = [];
  for await (const p of it) out.push(p);
  return out;
}

describe('ollama pull', () => {
  it('sums progress over all layers and ends on success', async () => {
    const out = await collect(pullFrom(url)('gemma4:e2b', new AbortController().signal));
    expect(bodies.at(-1)).toEqual({ model: 'gemma4:e2b', stream: true });
    expect(out.map((p) => [p.completed, p.total])).toEqual([
      [0, 0],
      [0, 1000],
      [600, 1000],
      [800, 1200],
      [1200, 1200],
      [1200, 1200],
      [1200, 1200],
      [1200, 1200],
    ]);
    expect(out.at(-1)?.status).toBe('success');
  });

  it('reports an unknown model as model_not_found', async () => {
    const pull = pullFrom(url);
    await expect(collect(pull('nope:1b', new AbortController().signal))).rejects.toMatchObject({
      code: 'model_not_found',
    });
  });

  it('fails when the stream ends without success', async () => {
    const pull = pullFrom(url);
    await expect(collect(pull('cut:1b', new AbortController().signal))).rejects.toMatchObject({
      code: 'bad_response',
    });
  });
});
