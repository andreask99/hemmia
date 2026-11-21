/**
 * Builds, checks, signs and publishes Hemmia's model catalogue (P11.3, DECISIONS.md
 * 2026-11-21). Runs every night from launchd on the owner's Mac (ops/catalog-job.sh), with no
 * person approving: the checks in check.ts and the guards in select.ts decide.
 *
 *   node scripts/catalog/build.ts [--dry-run] [--no-checks] [--budget-gb 60] [--summary FILE]
 *
 * --dry-run builds and prints the catalogue without signing or publishing; --no-checks skips
 * the download tests (entries without a passed test are then left out). State (test results,
 * last published payload) lives in ~/.local/state/hemmia-catalog/.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, statfsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  type CatalogModel,
  CatalogPayload,
  parseModelName,
  signCatalog,
  verifyCatalog,
} from '@hemmia/relay-protocol';
import { type CheckResult, checkModel } from './check.ts';
import { type LibraryModel, parseLibrary, parseTags } from './library.ts';
import {
  type Chosen,
  changed,
  chooseModels,
  dedupe,
  displayName,
  guard,
  memoryClass,
  memoryFor,
  sizeTags,
} from './select.ts';

const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    'no-checks': { type: 'boolean', default: false },
    'budget-gb': { type: 'string', default: '60' },
    summary: { type: 'string' },
  },
});

const STATE_DIR = join(homedir(), '.local/state/hemmia-catalog');
const STATE_FILE = join(STATE_DIR, 'state.json');
const KEY_FILE =
  process.env['HEMMIA_CATALOG_KEY'] ?? join(homedir(), '.config/hemmia/catalog-signing-key.pem');
const RELAY_SSH = process.env['HEMMIA_RELAY_SSH'] ?? 'ubuntu@api.hemmia.app';
const RELAY_KEY = process.env['HEMMIA_RELAY_SSH_KEY'] ?? join(homedir(), '.ssh/hemmia-relay.key');
const UA = 'hemmia-catalog/1 (+https://hemmia.app)';
/** Tests download at most this much per model; bigger tags rely on a tested sibling. */
const TEST_MAX_BYTES = 20 * 1024 ** 3;
/** Pass a model's test once, and it counts for this long (re-tested when its digest changes). */
const TEST_VALID_DAYS = 90;
/** Publish at least this often, so pull counts stay fresh. */
const REPUBLISH_DAYS = 7;

interface TestRecord extends CheckResult {
  digest: string;
  at: string;
}
interface State {
  tests: Record<string, TestRecord>;
  published: { at: number; entries: CatalogModel[] } | null;
}

const today = new Date().toISOString().slice(0, 10);
const lines: string[] = [];
const say = (s: string) => {
  lines.push(s);
  process.stdout.write(`${s}\n`);
};

function loadState(): State {
  try {
    const s = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as Partial<State>;
    return { tests: s.tests ?? {}, published: s.published ?? null };
  } catch {
    return { tests: {}, published: null };
  }
}

function saveState(s: State): void {
  mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(`${STATE_FILE}.tmp`, JSON.stringify(s, null, 1), { mode: 0o600 });
  renameSync(`${STATE_FILE}.tmp`, STATE_FILE);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function get(url: string, accept = 'text/html'): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA, accept },
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (attempt >= 3) {
        throw new Error(`${url}: ${e instanceof Error ? e.message : 'failed'}`, { cause: e });
      }
      await sleep(2000 * attempt);
    }
  }
}

/** Exact download size and digest of a tag, from Ollama's registry (default variant). */
async function registryFacts(model: string): Promise<{ bytes: number; digest: string } | null> {
  const [name, tag] = model.split(':');
  try {
    const body = await get(
      `https://registry.ollama.ai/v2/library/${name}/manifests/${tag}`,
      'application/vnd.docker.distribution.manifest.v2+json',
    );
    const m = JSON.parse(body) as { config?: { size?: number }; layers?: { size?: number }[] };
    const bytes = (m.config?.size ?? 0) + (m.layers ?? []).reduce((n, l) => n + (l.size ?? 0), 0);
    if (!bytes) return null;
    return { bytes, digest: `sha256:${createHash('sha256').update(body).digest('hex')}` };
  } catch {
    return null;
  }
}

function sh(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/** True when the Mac is free for tests: nobody else holds the pause, no admin pause. */
function macIsFree(): boolean {
  try {
    const out = sh('kchat-pause', ['status']);
    const holders = /holders:\s*(.*)$/m.exec(out)?.[1]?.trim() ?? '';
    return holders === '' && !/is paused/.test(out);
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const state = loadState();
  const previous = state.published?.entries ?? null;

  // 1. Ollama's library.
  const popularPage = await get('https://ollama.com/library?sort=popular');
  const newestPage = await get('https://ollama.com/library?sort=newest');
  const popular = parseLibrary(popularPage);
  const newest = parseLibrary(newestPage);
  const chosen = chooseModels(popular, newest, today);
  say(`Library: ${popular.length} models; chosen ${chosen.length}.`);

  // 2. Tags, sizes and digests.
  const entries: CatalogModel[] = [];
  const modelOf = new Map<string, Chosen>();
  for (const c of chosen) {
    await sleep(400);
    let tags;
    try {
      tags = parseTags(await get(`https://ollama.com/library/${c.model.name}/tags`), c.model.name);
    } catch (e) {
      say(`  skipped ${c.model.name}: ${e instanceof Error ? e.message : 'failed'}`);
      continue;
    }
    for (const t of sizeTags(c.model, tags)) {
      const facts = await registryFacts(t.model);
      if (!facts) {
        say(`  no registry facts for ${t.model}`);
        continue;
      }
      const entry = toEntry(
        c.model,
        t.model,
        t.contextTokens,
        t.vision,
        Math.max(facts.bytes, t.sizeBytes),
        facts.digest,
        previous,
      );
      if (entry) {
        entries.push(entry);
        modelOf.set(entry.ollamaModel, c);
      }
    }
  }
  let candidates = dedupe(entries);
  say(`Tags: ${entries.length} found, ${candidates.length} after keeping the newest per family.`);
  if (values['dry-run']) for (const e of candidates) say(`  candidate ${short(e)}`);

  // 3. Checks: one tested tag per model (the smallest), within tonight's download budget.
  const byBase = new Map<string, CatalogModel[]>();
  for (const e of candidates) {
    const base = parseModelName(e.ollamaModel).base;
    byBase.set(base, [...(byBase.get(base) ?? []), e]);
  }
  const validTest = (base: string): TestRecord | null => {
    const fresh = Object.entries(state.tests).filter(
      ([m, r]) =>
        parseModelName(m).base === base &&
        (Date.parse(today) - Date.parse(r.at)) / 86_400_000 <= TEST_VALID_DAYS &&
        candidates.some((e) => e.ollamaModel === m && e.digest === r.digest),
    );
    return fresh.map(([, r]) => r).find((r) => r.ok) ?? fresh.map(([, r]) => r)[0] ?? null;
  };
  const toTest = [...byBase.entries()]
    .filter(([base]) => !validTest(base))
    .map(([, es]) => [...es].sort((a, b) => a.downloadBytes - b.downloadBytes)[0])
    .filter((e): e is CatalogModel => e !== undefined && e.downloadBytes <= TEST_MAX_BYTES)
    .sort((a, b) => b.pulls - a.pulls);

  if (values['no-checks']) {
    say(`Checks skipped (--no-checks); ${toTest.length} models wait for a test.`);
  } else if (toTest.length === 0) {
    say('Checks: nothing new to test.');
  } else if (!macIsFree()) {
    say(`Checks: Mac busy (local model or admin pause); ${toTest.length} models wait.`);
  } else {
    let budget = Number(values['budget-gb']) * 1024 ** 3;
    sh('kchat-pause', ['acquire', 'hemmia-catalog']);
    try {
      for (const e of toTest) {
        if (e.downloadBytes > budget) continue;
        const free = statfsSync(homedir());
        if (free.bavail * free.bsize < e.downloadBytes + 30 * 1024 ** 3) {
          say('Checks: stopped, less than 30 GB disk space would be left.');
          break;
        }
        budget -= e.downloadBytes;
        const r = await checkModel(e.ollamaModel, { claimsTools: e.tools, claimsVision: e.vision });
        state.tests[e.ollamaModel] = { ...r, digest: e.digest, at: today };
        saveState(state);
        say(
          `  ${r.ok ? 'passed' : 'FAILED'} ${e.ollamaModel} (${r.seconds}s` +
            `${r.ok ? `, tools ${r.tools ? 'yes' : 'no'}, pictures ${r.vision ? 'yes' : 'no'}` : `: ${r.error ?? ''}`})`,
        );
      }
    } finally {
      sh('kchat-pause', ['release', 'hemmia-catalog']);
    }
  }

  // 4. Only models with a passed test; their real abilities and memory.
  const published: CatalogModel[] = [];
  let waiting = 0;
  for (const [base, es] of byBase) {
    const t = validTest(base);
    if (!t?.ok) {
      waiting += es.length;
      continue;
    }
    for (const e of es) {
      const own = state.tests[e.ollamaModel];
      const tested = own?.ok === true && own.digest === e.digest;
      const memoryGiB =
        tested && own.memoryGiB ? Math.max(e.memoryGiB, own.memoryGiB + 1) : e.memoryGiB;
      const cls = memoryClass(memoryGiB);
      if (cls === null) continue;
      published.push({
        ...e,
        tested,
        tools: e.tools && t.tools,
        vision: e.vision && t.vision,
        memoryGiB,
        minTotalMemoryGiB: cls,
      });
    }
  }
  candidates = published;
  say(`Publishable: ${candidates.length} entries; ${waiting} wait for a passed test.`);

  // 5. Guards, then sign and publish.
  const g = guard(candidates, previous, popular.length);
  if (!g.ok) {
    say(`NOT published: ${g.reason}.`);
    return;
  }
  const stale = !state.published || Date.now() - state.published.at > REPUBLISH_DAYS * 86_400_000;
  if (!changed(candidates, previous) && !stale) {
    say('Unchanged since the last catalogue; nothing published.');
    return;
  }
  describeChanges(candidates, previous);
  const payload = CatalogPayload.parse({ v: 1, signedAt: Date.now(), entries: candidates });
  if (values['dry-run']) {
    say('Dry run: not signed or published.');
    process.stdout.write(`${JSON.stringify(payload.entries.map(short), null, 1)}\n`);
    return;
  }
  const envelope = signCatalog(payload, readFileSync(KEY_FILE, 'utf8'));
  if (!verifyCatalog(envelope)) throw new Error('the built-in public key does not match this key');
  const file = '/srv/relay/data/catalog.json';
  execFileSync(
    'ssh',
    [
      '-i',
      RELAY_KEY,
      '-o',
      'BatchMode=yes',
      RELAY_SSH,
      `sudo tee ${file}.tmp >/dev/null && sudo chown 10002:10002 ${file}.tmp && sudo chmod 644 ${file}.tmp && sudo mv ${file}.tmp ${file}`,
    ],
    { input: JSON.stringify(envelope), stdio: ['pipe', 'inherit', 'inherit'] },
  );
  mkdirSync(join(STATE_DIR, 'history'), { recursive: true, mode: 0o700 });
  writeFileSync(join(STATE_DIR, 'history', `${payload.signedAt}.json`), JSON.stringify(envelope));
  state.published = { at: payload.signedAt, entries: candidates };
  saveState(state);
  say(`Published ${candidates.length} entries.`);
}

function toEntry(
  m: LibraryModel,
  ollamaModel: string,
  contextTokens: number,
  tagVision: boolean,
  downloadBytes: number,
  digest: string,
  previous: CatalogModel[] | null,
): CatalogModel | null {
  const memoryGiB = memoryFor(downloadBytes);
  const cls = memoryClass(memoryGiB);
  if (cls === null) return null;
  const p = parseModelName(ollamaModel);
  const family = (p.version.length ? p.family : p.base).replace(/[^a-z0-9-]/g, '-').slice(0, 41);
  return {
    ollamaModel,
    name: displayName(ollamaModel),
    family,
    version: p.version.join('.'),
    params: p.tag.split('-')[0]?.slice(0, 20) ?? '',
    downloadBytes,
    digest,
    memoryGiB,
    minTotalMemoryGiB: cls,
    contextTokens: contextTokens || 8192,
    vision: tagVision || m.capabilities.includes('vision'),
    tools: m.capabilities.includes('tools'),
    think: m.capabilities.includes('thinking'),
    pulls: m.pulls,
    releasedAt: m.updatedAt,
    addedAt: previous?.find((e) => e.ollamaModel === ollamaModel)?.addedAt ?? today,
    tested: false,
    supersedes: [],
    description: m.description.slice(0, 300),
  };
}

function short(e: CatalogModel) {
  return `${e.ollamaModel} ${(e.downloadBytes / 1e9).toFixed(1)} GB, ${e.minTotalMemoryGiB} GB+${e.tested ? ', tested' : ''}`;
}

function describeChanges(next: CatalogModel[], previous: CatalogModel[] | null): void {
  const prev = new Map((previous ?? []).map((e) => [e.ollamaModel, e]));
  const now = new Map(next.map((e) => [e.ollamaModel, e]));
  const added = next.filter((e) => !prev.has(e.ollamaModel));
  const removed = (previous ?? []).filter((e) => !now.has(e.ollamaModel));
  const updated = next.filter((e) => {
    const p = prev.get(e.ollamaModel);
    return p !== undefined && p.digest !== e.digest;
  });
  if (added.length) say(`Added: ${added.map((e) => e.ollamaModel).join(', ')}`);
  if (updated.length) say(`New weights: ${updated.map((e) => e.ollamaModel).join(', ')}`);
  if (removed.length) say(`Removed: ${removed.map((e) => e.ollamaModel).join(', ')}`);
}

try {
  await main();
} catch (e) {
  say(`FAILED: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
} finally {
  if (values.summary) writeFileSync(values.summary, `${lines.join('\n')}\n`);
}
