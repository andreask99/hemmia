/**
 * Test double for the Python image worker (PROTOCOL.md). Behaviour via env:
 * FAKE_LOAD_FAIL, FAKE_IGNORE_CANCEL, FAKE_BAD_PATH, FAKE_CRASH (all "1").
 */
import { existsSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
// Like the Python worker, report resolved paths.
const out = realpathSync(process.env.HEMMIA_IMAGEGEN_OUTDIR ?? '.');
const env = (k: string) => process.env[k] === '1';
const emit = (o: object) => process.stdout.write(`${JSON.stringify(o)}\n`);
let loaded: string | null = null;
let cancelled = new Set<string>();

emit({ type: 'ready', protocol: 1 });

async function generate(job: { id: string; model: string; steps: number; image?: string }) {
  if (job.image) process.stderr.write(`source ${existsSync(job.image) ? 'present' : 'missing'}\n`);
  if (env('FAKE_LOAD_FAIL')) {
    emit({ type: 'error', id: job.id, code: 'model_load_failed' });
    return;
  }
  if (loaded !== job.model) {
    emit({ type: 'loading', id: job.id });
    loaded = job.model;
  }
  for (let step = 1; step <= job.steps; step++) {
    await new Promise((r) => setTimeout(r, 10));
    if (cancelled.has(job.id) && !env('FAKE_IGNORE_CANCEL')) {
      emit({ type: 'error', id: job.id, code: 'cancelled' });
      return;
    }
    emit({ type: 'progress', id: job.id, step, steps: job.steps });
    if (env('FAKE_CRASH')) process.exit(1);
  }
  if (env('FAKE_IGNORE_CANCEL') && cancelled.has(job.id)) {
    await new Promise((r) => setTimeout(r, 60_000));
  }
  const path = join(out, `${job.id}.png`);
  writeFileSync(path, PNG);
  emit({
    type: 'done',
    id: job.id,
    path: env('FAKE_BAD_PATH') ? '/etc/passwd' : path,
    seconds: 0.1,
  });
}

createInterface({ input: process.stdin })
  .on('line', (line) => {
    const msg = JSON.parse(line) as {
      op: string;
      id: string;
      model: string;
      steps: number;
      image?: string;
    };
    if (msg.op === 'generate') void generate(msg);
    else if (msg.op === 'cancel') cancelled = new Set([...cancelled, msg.id]);
    else if (msg.op === 'unload') {
      emit({ type: 'unloaded' });
      process.exit(0);
    } else if (msg.op === 'shutdown') process.exit(0);
  })
  .on('close', () => process.exit(0));
