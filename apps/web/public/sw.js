/* Hemmia service worker: instant start from cache, and "reply ready" notifications.
 * Never caches /api/ (private data); only the app's own static files. */

const SHELL = 'kchat-shell-v3';
const ASSETS = 'kchat-assets-v3';
/** Hashed build files accumulate across updates; keep the newest ones. */
const MAX_ASSETS = 80;

/** Planner notifications and the page each opens. */
const PLANNER = { daily: '/daily', week: '/daily?kind=week', evening: '/daily?kind=evening' };
/** Planner chat kind for each planner notification. */
const BRIEFING = { daily: 'day', week: 'week', evening: 'evening' };

/**
 * Starts today's planner chat on the server when its notification arrives, so the answer is
 * ready when the user taps it. Uses the session cookie; failures (signed out, offline) are
 * fine: opening the chat starts it as before.
 */
function prepareBriefing(kind) {
  return fetch('/api/briefings/prepare', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind }),
  }).catch(() => undefined);
}

const TEXT = {
  en: {
    reply: 'Your reply is ready',
    image: 'Your picture is ready',
    daily: '☀️ Your day: goals and appointments',
    week: '📋 Plan your week: 5 minutes for what matters',
    evening: '🌙 How did today go?',
    maintained: 'Maintenance: updates installed and tested',
    connectDown: 'Hemmia Connect is down: phones away from home can’t reach Hemmia',
    connectUp: 'Hemmia Connect works again',
    rolledBack: 'Maintenance: an update failed, the previous version was restored',
  },
  de: {
    reply: 'Deine Antwort ist da',
    image: 'Dein Bild ist fertig',
    daily: '☀️ Dein Tag: Ziele und Termine',
    week: '📋 Plane deine Woche: 5 Minuten für das Wichtige',
    evening: '🌙 Wie war dein Tag?',
    maintained: 'Wartung: Updates installiert und getestet',
    connectDown: 'Hemmia Connect ist ausgefallen: Unterwegs ist Hemmia nicht erreichbar',
    connectUp: 'Hemmia Connect funktioniert wieder',
    rolledBack:
      'Wartung: Ein Update ist fehlgeschlagen, die vorherige Version wurde wiederhergestellt',
  },
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(['/', '/manifest.webmanifest']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => n !== SHELL && n !== ASSETS).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(key);
}

/** The app page: answer from cache at once, refresh the cached copy in the background. */
async function shell(event) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match('/');
  const fresh = fetch('/', { cache: 'no-cache' })
    .then(async (res) => {
      if (res.ok && res.headers.get('content-type')?.includes('text/html')) {
        await cache.put('/', res.clone());
      }
      return res;
    })
    .catch(() => undefined);
  event.waitUntil(fresh);
  return cached ?? (await fresh) ?? Response.error();
}

/** Build files have content hashes in their names: cache forever once seen. */
async function asset(request) {
  const cache = await caches.open(ASSETS);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  // Never keep an HTML page under a script/style address (e.g. an error page).
  if (res.ok && !res.headers.get('content-type')?.includes('text/html')) {
    await cache.put(request, res.clone());
    void trim(cache);
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(shell(event));
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(asset(request));
  }
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    if (event.data) data = event.data.json();
  } catch {
    // Not JSON: show the generic text.
  }
  const text = TEXT[data.lang] ?? TEXT.en;
  const body =
    data.kind === 'maintenance'
      ? data.ok
        ? text.maintained
        : text.rolledBack
      : data.kind === 'connect'
        ? data.ok
          ? text.connectUp
          : text.connectDown
        : data.kind === 'daily' || data.kind === 'week' || data.kind === 'evening'
          ? text[data.kind]
          : data.kind === 'image'
            ? text.image
            : text.reply;
  const plannerUrl =
    typeof data.kind === 'string' && Object.hasOwn(PLANNER, data.kind) ? PLANNER[data.kind] : null;
  const chatId =
    typeof data.chatId === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(data.chatId)
      ? data.chatId
      : null;
  const briefing = plannerUrl ? BRIEFING[data.kind] : null;
  // iOS requires every push to show a notification.
  event.waitUntil(
    Promise.all([
      briefing ? prepareBriefing(briefing) : undefined,
      self.registration.showNotification('Hemmia', {
        body,
        icon: '/icons/icon-192.png',
        tag:
          plannerUrl || data.kind === 'maintenance' || data.kind === 'connect'
            ? data.kind
            : (chatId ?? 'kchat'),
        data: {
          url:
            data.kind === 'maintenance' || data.kind === 'connect'
              ? '/settings?tab=system'
              : plannerUrl
                ? plannerUrl
                : chatId
                  ? `/chats/${chatId}`
                  : '/',
        },
      }),
    ]),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      const open = windows[0];
      if (open) {
        await open.focus();
        open.postMessage({ type: 'open', url });
        return;
      }
      await self.clients.openWindow(url);
    }),
  );
});
