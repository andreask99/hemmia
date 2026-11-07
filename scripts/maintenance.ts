/**
 * Monthly maintenance (LaunchAgent app.hemmia.maintenance, 1st of the month at 03:30):
 * updates Ollama (Homebrew) and SearXNG (git), runs the end-to-end test, rolls back what was
 * updated if the test fails, records the outcome for Settings → System and notifies admins.
 *
 *   npm run maintenance              # do it now
 *   npm run maintenance -- --check   # only report what would be updated
 *
 * Output goes to ~/Library/Logs/Hemmia/maintenance.log when run by the LaunchAgent.
 */
import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { loadConfig } from '../apps/server/src/config/load.ts';
import { publicBaseUrl } from '../apps/server/src/config/urls.ts';
import { openDatabase } from '../apps/server/src/db/database.ts';
import { createOverrideStore } from '../apps/server/src/models/overrides.ts';
import { createPush } from '../apps/server/src/security/push.ts';

const run = promisify(execFile);
const REPO = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SEARXNG = join(homedir(), '.local', 'share', 'kchat', 'searxng', 'src');
const CHECK_ONLY = process.argv.includes('--check');
const TEST_MODEL = 'gemma4:26b';
const env = { ...process.env, HOMEBREW_NO_INSTALL_CLEANUP: '1', HOMEBREW_NO_ENV_HINTS: '1' };

interface Step {
  component: 'Ollama' | 'SearXNG';
  from: string;
  to: string;
}
type Outcome = 'nothing-to-do' | 'updated' | 'rolled-back' | 'skipped-busy' | 'failed';

const log = (line: string) => {
  process.stdout.write(`${new Date().toISOString()} ${line}\n`);
};
async function sh(cmd: string, args: string[], timeoutMs = 10 * 60_000): Promise<string> {
  const { stdout } = await run(cmd, args, {
    cwd: REPO,
    env,
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout.trim();
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Quiet: no model in memory and no picture being made. */
async function idle(ollamaUrl: string): Promise<boolean> {
  try {
    const ps = (await (await fetch(`${ollamaUrl}/api/ps`)).json()) as { models?: unknown[] };
    if ((ps.models ?? []).length > 0) return false;
  } catch {
    // Ollama down: nothing is running on it
  }
  try {
    await sh('pgrep', ['-f', 'python -m kchat_imagegen']);
    return false; // the image worker is alive
  } catch {
    return true;
  }
}

async function ollamaVersion(ollamaUrl: string): Promise<string | null> {
  for (let i = 0; i < 30; i++) {
    try {
      const v = (await (await fetch(`${ollamaUrl}/api/version`)).json()) as { version?: string };
      if (v.version) return v.version;
    } catch {
      // starting
    }
    await sleep(1000);
  }
  return null;
}

/**
 * Ollama versions from `fromVersion` on are skipped while the GitHub issue is open: the MLX
 * runner leaks memory per tool call (#18620), and 0.40 runs Gemma on MLX too. kchat's leak
 * guard limits the damage, but the default model shouldn't be exposed. The hold lifts by
 * itself when the issue is closed. Homebrew's pin keeps manual upgrades from slipping it in.
 */
const OLLAMA_HOLD = { fromVersion: '0.40.0', issue: 18620 };

/** "0.35.1_1" < "0.40.0" (Homebrew revision suffixes ignored). */
function versionBelow(a: string, b: string): boolean {
  const parts = (v: string) => v.replace(/_\d+$/, '').split('.').map(Number);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d < 0;
  }
  return false;
}

/** Whether this Ollama version is held back (unknown issue state: held, to be safe). */
async function ollamaHeld(to: string): Promise<boolean> {
  if (versionBelow(to, OLLAMA_HOLD.fromVersion)) return false;
  try {
    const res = await fetch(
      `https://api.github.com/repos/ollama/ollama/issues/${String(OLLAMA_HOLD.issue)}`,
      {
        headers: { 'User-Agent': 'kchat-maintenance', Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(15_000),
      },
    );
    const issue = (await res.json()) as { state?: string };
    return issue.state !== 'closed';
  } catch {
    return true;
  }
}

async function ollamaUpdate(): Promise<{ from: string; to: string } | null> {
  await sh('brew', ['update', '--quiet']);
  // `brew outdated` exits with 1 exactly when something is outdated; its JSON is on stdout.
  const json = await sh('brew', ['outdated', '--json=v2', 'ollama']).catch(
    (err: unknown) => (err as { stdout?: string }).stdout?.trim() ?? '',
  );
  const out = JSON.parse(json || '{"formulae":[]}') as {
    formulae: { installed_versions: string[]; current_version: string }[];
  };
  const f = out.formulae[0];
  if (!f) return null;
  return { from: f.installed_versions.at(-1) ?? '?', to: f.current_version };
}

async function e2e(): Promise<boolean> {
  const started = Date.now();
  log(`end-to-end test with ${TEST_MODEL}…`);
  try {
    await sh(process.execPath, ['scripts/e2e.ts', TEST_MODEL], 20 * 60_000);
    log(`end-to-end test: passed (${String(Math.round((Date.now() - started) / 1000))} s)`);
    return true;
  } catch (err) {
    const out = (err as { stdout?: string }).stdout ?? '';
    log(
      `end-to-end test failed:\n${out
        .split('\n')
        .filter((l) => l.startsWith('FAIL'))
        .join('\n')}`,
    );
    return false;
  }
}

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const db = openDatabase(config.dataDir);
  const overrides = createOverrideStore(db);
  const steps: Step[] = [];
  let outcome: Outcome = 'nothing-to-do';
  let ok = true;

  // What would change?
  let ollama = await ollamaUpdate();
  let held: string | null = null;
  if (ollama && (await ollamaHeld(ollama.to))) {
    held = `Ollama ${ollama.to} (#${String(OLLAMA_HOLD.issue)})`;
    log(`Ollama ${ollama.to} held back: issue #${String(OLLAMA_HOLD.issue)} is still open`);
    ollama = null;
  }
  await sh('git', ['-C', SEARXNG, 'fetch', '-q', 'origin']);
  const searxFrom = await sh('git', ['-C', SEARXNG, 'rev-parse', 'HEAD']);
  const searxTo = await sh('git', ['-C', SEARXNG, 'rev-parse', 'origin/HEAD']).catch(() =>
    sh('git', ['-C', SEARXNG, 'rev-parse', 'origin/master']),
  );
  log(`Ollama: ${ollama ? `${ollama.from} -> ${ollama.to}` : held ? 'held back' : 'up to date'}`);
  log(
    `SearXNG: ${searxFrom === searxTo ? 'up to date' : `${searxFrom.slice(0, 7)} -> ${searxTo.slice(0, 7)}`}`,
  );
  if (CHECK_ONLY) return;
  if (!ollama && searxFrom === searxTo) {
    record(config.dataDir, { ok, outcome, steps, held });
    return;
  }

  // Wait for a quiet moment (up to an hour), then pause kchat unless it already is.
  let quiet = false;
  for (let i = 0; i < 6 && !(quiet = await idle(config.ollamaUrl)); i++) await sleep(10 * 60_000);
  if (!quiet) {
    log('kchat stayed busy; trying again next month');
    record(config.dataDir, { ok: true, outcome: 'skipped-busy', steps, held });
    return;
  }
  const wasPaused = overrides.get().paused;
  if (!wasPaused) overrides.set({ ...overrides.get(), paused: true });
  try {
    if (ollama) {
      log('updating Ollama');
      await sh('brew', ['cleanup', 'ollama']); // keep only the current version for rollback
      await sh('brew', ['unpin', 'ollama']).catch(() => ''); // pinned while a hold was active
      await sh('brew', ['upgrade', 'ollama']);
      await sh('brew', ['services', 'restart', 'ollama']);
      const v = await ollamaVersion(config.ollamaUrl);
      steps.push({ component: 'Ollama', from: ollama.from, to: v ?? ollama.to });
    }
    if (searxFrom !== searxTo) {
      log('updating SearXNG');
      await sh(join(REPO, 'ops/searxng/install.sh'), [searxTo]);
      steps.push({ component: 'SearXNG', from: searxFrom.slice(0, 7), to: searxTo.slice(0, 7) });
    }
    outcome = 'updated';
    if (!(await e2e())) {
      log('rolling back');
      ok = false;
      outcome = 'rolled-back';
      if (steps.some((s) => s.component === 'SearXNG')) {
        await sh(join(REPO, 'ops/searxng/install.sh'), [searxFrom]);
      }
      if (steps.some((s) => s.component === 'Ollama')) {
        await sh('brew', ['uninstall', '--ignore-dependencies', 'ollama']); // removes the new version
        await sh('brew', ['link', 'ollama']); // the kept previous version
        await sh('brew', ['services', 'restart', 'ollama']);
        await ollamaVersion(config.ollamaUrl);
      }
      if (!(await e2e())) outcome = 'failed';
    }
  } catch (err) {
    ok = false;
    outcome = 'failed';
    log(`maintenance error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (!wasPaused) overrides.set({ ...overrides.get(), paused: false });
  }
  record(config.dataDir, { ok, outcome, steps, held });
  await notifyAdmins(config, db, ok);
  db.close();
}

function record(
  dataDir: string,
  r: { ok: boolean; outcome: Outcome; steps: Step[]; held: string | null },
): void {
  writeFileSync(join(dataDir, 'maintenance.json'), JSON.stringify({ at: Date.now(), ...r }), {
    mode: 0o600,
  });
  log(`done: ${r.outcome}`);
}

async function notifyAdmins(
  config: ReturnType<typeof loadConfig>,
  db: ReturnType<typeof openDatabase>,
  ok: boolean,
): Promise<void> {
  const push = createPush({
    db,
    subject: publicBaseUrl(config.allowedHosts),
    log: {
      info: (o, msg) => {
        log(`${msg} ${JSON.stringify(o)}`);
      },
      warn: (o, msg) => {
        log(`${msg} ${JSON.stringify(o)}`);
      },
    },
  });
  const admins = db
    .prepare<[], { id: string; language: 'en' | 'de' }>(
      "SELECT id, language FROM users WHERE role = 'admin' AND disabled_at IS NULL",
    )
    .all();
  for (const a of admins)
    await push.notify(a.id, { kind: 'maintenance', chatId: '', lang: a.language, ok });
  log(`notified ${String(admins.length)} admin(s)`);
}

main().catch((err: unknown) => {
  log(`maintenance crashed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
