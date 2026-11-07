/**
 * End-to-end check against the real stack: server + Ollama (small test model).
 * Usage: node scripts/e2e.ts [ollama-model] [--images]   (default qwen3-vl:2b)
 * --images also generates a picture with the real mflux worker (FLUX.2 Klein 4B).
 *
 * Starts the server on a spare port with a throwaway data dir, creates an invite with the
 * admin CLI, signs up over HTTP, creates a chat, sends a message and reads the streamed
 * reply. Then checks that the database and blobs hold no plaintext and that the server
 * log contains no message text.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanJpeg, scannedPdf } from '../apps/server/src/security/document-fixtures.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const IMAGES = process.argv.includes('--images');
/** Also send a long error log (~120k characters) with the model's real window size. */
const LONG = process.argv.includes('--long');
const MODEL = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'qwen3-vl:2b';
const PORT = 8799;
const BASE = `http://127.0.0.1:${String(PORT)}`;
const ORIGIN = 'http://localhost:5173';
const SECRET = `MARKER-${String(Date.now())}`;

const dir = mkdtempSync(join(tmpdir(), 'kchat-e2e-'));
const dataDir = join(dir, 'data');
const modelsFile = join(dir, 'models.json');
writeFileSync(
  modelsFile,
  JSON.stringify({
    chatModels: [
      {
        id: 'quick',
        label: { en: 'Test', de: 'Test' },
        ollamaModel: MODEL,
        contextTokens: LONG ? 65536 : 4096,
        memoryGiB: 3,
      },
    ],
    imageModels: IMAGES
      ? [
          {
            id: 'image',
            label: { en: 'P', de: 'B' },
            mfluxModel: 'flux2-klein-4b',
            steps: 4,
            width: 512,
            height: 512,
            memoryGiB: 23,
          },
        ]
      : [],
    defaultChatModel: 'quick',
    defaultImageModel: IMAGES ? 'image' : null,
  }),
);
const env = {
  ...process.env,
  NODE_ENV: 'development',
  HEMMIA_PORT: String(PORT),
  HEMMIA_DATA_DIR: dataDir,
  HEMMIA_MODELS_FILE: modelsFile,
  HEMMIA_LOG_LEVEL: 'info',
};

let failures = 0;
function check(ok: boolean, what: string): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures++;
}

const server = spawn(process.execPath, [join(ROOT, 'apps/server/src/main.ts')], { env });
let log = '';
server.stdout.on('data', (d: Buffer) => (log += d.toString()));
server.stderr.on('data', (d: Buffer) => (log += d.toString()));

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/api/health`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server did not start');
}

async function main(): Promise<void> {
  await waitForServer();

  const cli = spawnSync(
    process.execPath,
    [join(ROOT, 'apps/server/src/cli/admin-main.ts'), 'create-invite'],
    {
      env,
      encoding: 'utf8',
    },
  );
  const code = /invite#([A-Za-z0-9_-]{43})/.exec(cli.stdout)?.[1];
  check(code !== undefined, 'admin CLI created an invite');

  const accept = await fetch(`${BASE}/api/auth/invite/accept`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ code, username: 'e2e', password: 'blue tractor sings loudly' }),
  });
  check(accept.status === 200, 'account created from invite');
  const cookie = (accept.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const headers = { origin: ORIGIN, 'content-type': 'application/json', cookie };

  const models = (await (await fetch(`${BASE}/api/models`, { headers })).json()) as {
    chatModels: { id: string }[];
  };
  check(
    models.chatModels.some((m) => m.id === 'quick'),
    'model registry lists the test model',
  );

  const chat = (await (
    await fetch(`${BASE}/api/chats`, { method: 'POST', headers, body: '{}' })
  ).json()) as { id: string };
  await fetch(`${BASE}/api/chats/${chat.id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ title: `Title ${SECRET}` }),
  });

  const started = Date.now();
  const res = await fetch(`${BASE}/api/chats/${chat.id}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ content: `Reply with one short word. ${SECRET}` }),
  });
  const body = await res.text();
  const events = body
    .split('\n\n')
    .filter((b) => b.includes('data: '))
    .map((b) => JSON.parse(b.slice(b.indexOf('data: ') + 6)) as { type: string });
  const types = events.map((e) => e.type);
  check(types[0] === 'started', 'stream starts with "started"');
  // The tiny test model sometimes only "thinks"; either shows streaming works.
  check(types.includes('token') || types.includes('thinking'), 'tokens or thinking streamed');
  check(
    types.at(-1) === 'done',
    `stream ends with "done" (${String(Math.round((Date.now() - started) / 1000))} s)`,
  );

  const list = (await (
    await fetch(`${BASE}/api/chats/${chat.id}/messages`, { headers })
  ).json()) as { messages: { role: string; content: string }[] };
  check(list.messages.length === 2, 'both messages saved');
  check(list.messages[1]?.content.includes(SECRET) === true, 'user message decrypts for its owner');

  // A PDF: upload it and ask about it.
  const pdf = Buffer.from(
    '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 48>>stream\nBT /F1 18 Tf 20 60 Td (Abschlag 86 EUR) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
    'latin1',
  );
  const form = new FormData();
  form.append('file', new Blob([pdf]), 'Rechnung.pdf');
  const up = await fetch(`${BASE}/api/attachments`, {
    method: 'POST',
    headers: { origin: ORIGIN, cookie },
    body: form,
  });
  const doc = (await up.json()) as { id?: string; kind?: string };
  check(up.status === 201 && doc.kind === 'document', 'PDF uploaded as a document');
  const ask = await fetch(`${BASE}/api/chats/${chat.id}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      content: 'Wie hoch ist der Abschlag laut PDF? Nur die Zahl.',
      attachmentIds: [doc.id],
    }),
  });
  const answer = (await ask.text())
    .split('\n\n')
    .filter((b) => b.includes('"type":"token"'))
    .map((b) => (JSON.parse(b.slice(b.indexOf('data: ') + 6)) as { text: string }).text)
    .join('');
  check(answer.includes('86'), `answer uses the document ("${answer.trim().slice(0, 40)}")`);

  // A scanned PDF: the text exists only as a page image; vision models read it.
  const scan = scannedPdf([
    {
      jpeg: await scanJpeg(['Stadtwerke Musterstadt', 'Zählerstand: 4711 kWh']),
      width: 1240,
      height: 1754,
    },
  ]);
  const scanForm = new FormData();
  scanForm.append('file', new Blob([scan]), 'Scan.pdf');
  const scanUp = await fetch(`${BASE}/api/attachments`, {
    method: 'POST',
    headers: { origin: ORIGIN, cookie },
    body: scanForm,
  });
  const scanDoc = (await scanUp.json()) as { id?: string; scanPages?: number };
  check(
    scanUp.status === 201 && scanDoc.scanPages === 1,
    'scanned PDF uploaded with its page image',
  );
  const scanAsk = await fetch(`${BASE}/api/chats/${chat.id}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      content: 'Welcher Zählerstand steht in dem gescannten PDF? Nur die Zahl.',
      attachmentIds: [scanDoc.id],
    }),
  });
  const scanAnswer = (await scanAsk.text())
    .split('\n\n')
    .filter((b) => b.includes('"type":"token"'))
    .map((b) => (JSON.parse(b.slice(b.indexOf('data: ') + 6)) as { text: string }).text)
    .join('');
  check(
    scanAnswer.includes('4711'),
    `answer reads the scanned page ("${scanAnswer.trim().slice(0, 40)}")`,
  );

  if (LONG) {
    const lines: string[] = [];
    for (let i = 0; lines.join('\n').length < 120_000; i++) {
      lines.push(
        `2026-10-02T10:${String(i % 60).padStart(2, '0')}:00Z ERROR [db] query ${String(i)} failed: SQLITE_BUSY: database is locked`,
        `    at Statement.run (/app/src/db/chats.ts:${String(280 + (i % 40))}:12)`,
      );
    }
    const started = Date.now();
    const longRes = await fetch(`${BASE}/api/chats/${chat.id}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: `${lines.join('\n')}\n\nWas ist die Ursache dieser Fehler? Ein Satz.`,
      }),
    });
    const longEvents = (await longRes.text())
      .split('\n\n')
      .filter((b) => b.includes('data: '))
      .map(
        (b) =>
          JSON.parse(b.slice(b.indexOf('data: ') + 6)) as {
            type: string;
            message?: { content: string };
          },
      );
    const answer = longEvents.find((e) => e.type === 'done')?.message?.content ?? '';
    check(
      longEvents.some((e) => e.type === 'reading'),
      'long text: "reading" status sent',
    );
    check(
      /locked|busy|gesperrt|sperr/i.test(answer),
      `long text answered in ${String(Math.round((Date.now() - started) / 1000))} s ("${answer.slice(0, 60)}")`,
    );
  }

  // Web search (SearXNG on this Mac): a question that needs current information. Tiny test
  // models rarely call tools, so this runs with real models only.
  if (MODEL === 'qwen3-vl:2b') {
    console.log('skip web search (the tiny test model does not use tools reliably)');
  } else {
    // Web search (SearXNG on this Mac): a question that needs current information.
    const web = await fetch(`${BASE}/api/chats/${chat.id}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content:
          'Suche im Web: Welche Node.js-Version ist aktuell die neueste LTS? Kurz, mit Quelle.',
      }),
    });
    const webEvents = (await web.text())
      .split('\n\n')
      .filter((b) => b.includes('data: '))
      .map(
        (b) =>
          JSON.parse(b.slice(b.indexOf('data: ') + 6)) as {
            type: string;
            search?: { sources: unknown[] };
          },
      );
    const found = webEvents.find((e) => e.type === 'sources');
    check(
      webEvents.some((e) => e.type === 'search'),
      'model searched the web',
    );
    check((found?.search?.sources.length ?? 0) > 0, 'search returned sources');
    check(webEvents.at(-1)?.type === 'done', 'answer after searching');

    // Planner: a plan told in a chat, weekly planning, ticking off a goal, the morning snapshot.
    await fetch(`${BASE}/api/daily`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        enabled: true,
        time: '07:30',
        sign: 'leo',
        horoscope: true,
        plans: true,
        goals: true,
        weekDay: 1,
        weekTime: '07:30',
        evening: false,
        eveningTime: '20:00',
      }),
    });
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const todayIso = `${String(today.getFullYear())}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    /** Sends a message and returns the reply text. */
    const say = async (chatId: string, body: object): Promise<string> => {
      const res = await fetch(`${BASE}/api/chats/${chatId}/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const text = (await res.text())
        .split('\n\n')
        .filter((b) => b.includes('"type":"token"'))
        .map((b) => (JSON.parse(b.slice(b.indexOf('data: ') + 6)) as { text: string }).text)
        .join('');
      if (process.env.E2E_DEBUG) console.log(`--- ${JSON.stringify(body).slice(0, 80)}\n${text}`);
      return text;
    };
    const goalsNow = async () =>
      (
        (await (await fetch(`${BASE}/api/week`, { headers })).json()) as {
          goals: { area: string; text: string; status: string }[];
        }
      ).goals;

    await say(chat.id, { content: 'Merk dir bitte: heute um 18 Uhr Yoga.' });
    const planList = (await (await fetch(`${BASE}/api/plans`, { headers })).json()) as {
      plans: { date: string; text: string }[];
    };
    check(
      planList.plans.some((p) => p.date === todayIso && /yoga/i.test(p.text)),
      `plan saved from the chat (${JSON.stringify(planList.plans).slice(0, 80)})`,
    );

    /** Today's planner chat of that kind, as the app opens it. */
    const briefingChat = async (kind: string) =>
      (
        (await (
          await fetch(`${BASE}/api/briefings`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ kind }),
          })
        ).json()) as { chat: { id: string } }
      ).chat.id;
    const planning = await briefingChat('week');
    // Planning for next week from Friday on: the goals land there, not in /api/week.
    const weekend = today.getDay() >= 5 || today.getDay() === 0;
    if (!weekend) {
      await say(planning, { content: 'Lass uns meine Woche planen.', briefing: 'week' });
      await say(planning, {
        content: 'Arbeit: die Präsentation an den Kunden schicken. Zuhause: den Keller ausräumen.',
      });
      await say(planning, { content: 'Ja, passt so, speichere das bitte.' });
      const goals = await goalsNow();
      check(
        goals.some((g) => g.area === 'work') && goals.some((g) => g.area === 'home'),
        `weekly goals saved after the OK (${JSON.stringify(goals).slice(0, 120)})`,
      );
      await say(planning, { content: 'Der Keller ist übrigens erledigt!' });
      const after = await goalsNow();
      check(
        after.some((g) => g.area === 'home' && g.status === 'done'),
        'goal ticked off from the chat',
      );
    }

    const morning = await briefingChat('day');
    const dayText = await say(morning, {
      content: 'Guten Morgen! Wie sieht mein Tag aus?',
      briefing: 'day',
    });
    check(
      /löwe|leo/i.test(dayText) && /yoga/i.test(dayText),
      'morning snapshot has the horoscope and the appointment',
    );
    if (!weekend) {
      check(
        /1 von 2/.test(dayText) && !/Today's focus|Horoscope for/i.test(dayText),
        'morning snapshot shows the week’s progress',
      );
    }
    if (!weekend) {
      // The snapshot proposed a day plan: agree, then tick off the must win.
      await say(morning, { content: 'Ok, passt so.' });
      const tasksNow = async () =>
        (
          (await (await fetch(`${BASE}/api/week`, { headers })).json()) as {
            tasks: { date: string; kind: string; text: string; status: string }[];
          }
        ).tasks.filter((t) => t.date === todayIso);
      const mustWin = (await tasksNow()).find((t) => t.kind === 'must');
      check(
        mustWin !== undefined,
        `day plan saved after the OK (${JSON.stringify(await tasksNow()).slice(0, 120)})`,
      );
      if (mustWin) {
        await say(morning, { content: `${mustWin.text}: erledigt!` });
        check(
          (await tasksNow()).some((t) => t.kind === 'must' && t.status === 'done'),
          'must win ticked off from the chat',
        );
      }
    }
  }

  if (IMAGES) {
    // Picture from plain chat: the model calls create_image.
    const draw = await fetch(`${BASE}/api/chats/${chat.id}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content: `Mal mir bitte ein rotes Fahrrad. ${SECRET}` }),
    });
    const drawEvents = (await draw.text())
      .split('\n\n')
      .filter((b) => b.includes('data: '))
      .map((b) => JSON.parse(b.slice(b.indexOf('data: ') + 6)) as { type: string });
    check(
      drawEvents.some((e) => e.type === 'image'),
      'picture created from a chat request (tool call)',
    );

    const img = await fetch(`${BASE}/api/chats/${chat.id}/images`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ prompt: `a red bicycle ${SECRET}` }),
    });
    const evs = (await img.text())
      .split('\n\n')
      .filter((b) => b.includes('data: '))
      .map(
        (b) =>
          JSON.parse(b.slice(b.indexOf('data: ') + 6)) as {
            type: string;
            attachment?: { id: string };
          },
      );
    if (process.env.E2E_DEBUG) console.log(JSON.stringify(evs), img.status);
    const image = evs.find((e) => e.type === 'image');
    check(
      evs.some((e) => e.type === 'progress') && image !== undefined,
      'image generated with progress events',
    );
    const bytes = Buffer.from(
      await (
        await fetch(`${BASE}/api/attachments/${image?.attachment?.id ?? 'x'}`, { headers })
      ).arrayBuffer(),
    );
    check(
      bytes.subarray(1, 4).toString() === 'PNG',
      'generated image served (decrypted) to its owner',
    );
  }

  server.kill('SIGTERM');
  await new Promise((r) => server.once('exit', r));

  // At rest: nothing readable in the data dir.
  const files: string[] = [];
  const walk = (d: string): void => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(dataDir);
  const leaked = files.filter((f) => readFileSync(f).includes(SECRET));
  check(leaked.length === 0, `no plaintext in ${String(files.length)} data files`);
  check(
    !readFileSync(join(dataDir, 'kchat.db')).includes('blue tractor'),
    'no password in the database',
  );
  check(!log.includes(SECRET), 'server log contains no message text or titles');
  check(!log.includes('blue tractor'), 'server log contains no password');
}

main()
  .then(() => {
    if (process.env.E2E_DEBUG)
      console.log(
        log
          .split('\n')
          .filter((l) => l.includes('"level":50'))
          .join('\n'),
      );
  })
  .catch((err: unknown) => {
    console.log('FAIL', err instanceof Error ? err.message : 'error');
    failures++;
  })
  .finally(() => {
    server.kill('SIGKILL');
    spawnSync('ollama', ['stop', MODEL]);
    rmSync(dir, { recursive: true, force: true });
    console.log(failures === 0 ? 'E2E PASSED' : `E2E FAILED (${String(failures)})`);
    process.exit(failures === 0 ? 0 : 1);
  });
