# kchat architecture

kchat is a private chat app for the family. It runs on the Mac mini at home and talks to
local AI models, so conversations and photos never leave the house. Optionally, a family
member can add their own Anthropic or OpenAI API key and pick a cloud model for a chat: only
those chats go to that provider. Family members use it
from their phones (or any browser) over Tailscale.

Features: chat with a choice of local models (with a "think harder" switch), photos in
(the model can see them), pictures out (the model creates or edits them when asked),
documents (PDF, Excel, Word, scanned PDFs), web search via SearXNG on the Mac, long texts
such as error logs, push notifications, English and German. Ideas for later: voice, more
tools (weather, Wikipedia, links), a native iOS app.

Security design is in [SECURITY.md](SECURITY.md), the build plan in [PLAN.md](PLAN.md),
and decisions with their reasons in [DECISIONS.md](DECISIONS.md).

## System overview

```
 Phone / laptop browser (PWA)
   │  HTTPS, only reachable on the family tailnet
   ▼
 Tailscale serve  (https://<mac-name>.<tailnet>.ts.net → 127.0.0.1:8787)
   │
   ▼
 kchat server  (Node 22, Fastify, TypeScript; listens on 127.0.0.1 only)
   ├── serves the built React app (static files)
   ├── /api: auth, chats, messages, attachments, models, image jobs
   ├── crypto: per-user keys, AES-256-GCM for all user content
   ├── job scheduler: one GPU-heavy job at a time, FIFO, per-user limits
   ├──► Ollama  (127.0.0.1:11434) — chat + vision models
   ├──► imagegen worker  (Python child process, stdio JSON lines) — mflux image models
   ├──► SearXNG  (127.0.0.1:8888, own LaunchAgent) — web search ──► search engines
   ├──► api.anthropic.com / api.openai.com — only chats with a cloud model (user's own key)
   ├──► public web pages (web search tool, links in user messages; public addresses only)
   ├──► push services (Apple/Google/Mozilla) — encrypted "reply ready" notifications
   └──► SQLite + encrypted blob files in ~/Library/Application Support/kchat
```

Only the kchat server is reachable from outside, and only through Tailscale. Ollama,
SearXNG and the image worker are never exposed; the image worker has no network port at
all. Outbound traffic is limited to web search, reading public pages, push notifications and,
for chats with a cloud model, that provider's API (see SECURITY.md).

## Components

### Web app (`apps/web`)

- **Stack:** React 19, TypeScript (strict), Vite, Tailwind CSS, TanStack Query,
  React Router. Installable as a home-screen app (manifest, icon and iPhone launch
  screens from `scripts/make-icons.ts`; service worker that serves the app shell and build
  files from cache, never API responses, and shows push notifications).
- **Screens:**
  - Sign in; accept invite (create account, shows recovery code once); reset password
    with recovery code.
  - Chat list (drawer on phones, sidebar on wide screens), newest first; each chat has a
    delete button.
  - Chat view: title and model chip in the header ("⋯" for rename/delete), messages,
    streaming reply with status (queued, loading, reading, thinking, searching, painting),
    composer at the bottom.
  - Sidebar: the kchat logo goes to a new chat (and closes the phone drawer); footer:
    account button (avatar and name; menu with language EN/DE and sign out) and Settings.
    Settings has a back arrow (and Escape) and tabs: Account · Models for everyone,
    plus Family · System for admins (last tab remembered; `?tab=` links).
    Account: profile, planner, notifications, passphrase, devices. Models: default model,
    Cloud AI (own keys, limit) and, for admins, "For the whole family" (on/off, defaults,
    add installed Ollama models, web search and cloud off / adults / everyone). Admin:
    family accounts and invites, system (live memory, models in memory, activity, services,
    disk, 24-hour counts; refreshes every 5 s), pause kchat.
- **Composer:** text box (grows with content, Enter to send on desktop, button on phone)
  and one "+" button for photos (library or camera) and documents (PDF, Excel, Word).
  Scanned PDFs keep their page images (up to 10), which models that can see photos read;
  text documents work with any model.
  Pending attachments show as thumbnails/chips that can be removed before sending.
  There is no image mode: the chat model calls a `create_image` tool when the user asks
  for a picture or a change to a photo (2026-10-01 decision).
- **Web search:** models with tool support get a `web_search` tool (SearXNG on this Mac,
  `ops/searxng/`). The server runs up to 3 searches per reply, reads the top 3 pages of each,
  gives the text back to the model and streams `search`/`sources` events; the reply shows
  "Searched the web" with the sources.
- **Photos from the web:** with web search, the model also gets `show_photos` (one call per
  reply): a SearXNG image search; the server downloads the best few images itself (same
  public-address rules as page reading, 8 candidates in parallel, original then the engine's
  thumbnail), re-encodes them like uploads (max 1600 px) and stores up to 3 as encrypted
  attachments of kind `web` with their source page. They show in a grid under the reply,
  credited with links to the pages; the model is told how many were shown, not their content.
- **Links in the chat:** links in the user's own message (up to 3, not inside code, hosts
  that look public) are read by the server before the model runs (`security/links.ts`,
  `tools/readpage.ts`), whether or not the model has tools, when web search is allowed for
  the user and the chat's agent. Reading starts when the message is sent (while the job
  waits for the Mac); `reading_pages` and `page` events show "Reading host…" and chips under
  the user message. Each page's title, readable text (main content, up to 60k characters)
  and link list (40 links, legal and contact links first) are stored encrypted in
  `web_pages`; the context builder puts them in the user turn as `<web_page>` blocks
  (pages of the 3 newest linked messages, sharing the documents' budget), so follow-ups work
  without refetching. Unreadable pages get a block with the reason, so the model says why
  instead of guessing.
- **Agents (managed only from the start screen's "All" sheet):** a role (short system prompt) with an emoji, description, example questions
  and optional model, think, search and picture settings. Personal (encrypted) or family
  (admin, shared). The start screen shows chips: "Standard", pinned agents in order, then the
  most recently used (up to 5), and "All…" (sheet with search, pin and edit). The editor
  drafts an agent from one sentence with the model (structured JSON) and can revise it.
  The chat header shows the agent; it can be switched from the "⋯" menu.
- **Planner ("My week"):** weekly goals for work and home (school and home for teens, at
  most 5 per area, kchat suggests 3), appointments, a morning snapshot (week progress,
  today's focus, appointments, optional horoscope), weekly planning (default Monday 07:30;
  Friday–Sunday plans next week) and an optional evening check-in. Settings → Account →
  Planner; page `/planner` (sidebar entry, start-screen card with progress). A server timer
  sends content-free pushes (`daily`, `week`, `evening`; on the planning day a morning
  snapshot at or after the planning time is folded into it); they open `/daily[?kind=…]`,
  which opens today's planner chat of that kind via `POST /briefings` (reused all day, kept
  out of the chat list, deleted after 7 days) and sends `briefing: day|week|evening`, and the server adds the matching
  instructions with the user's goals and plans to the system prompt. Ready on tap: when the
  push arrives, the service worker calls `POST /briefings/prepare` with the session cookie,
  which starts that chat's first message as a background job (nothing if it has messages or
  the user has a job running; a start that ends without an answer deletes the chat so
  opening starts over); the app then finds the running reply via `GET /chats/:id/job`. Three
  minutes before a notification a timer loads the user's planner model with an empty chat
  in a scheduler job (user `system:warm`, keep-alive 10 min; skipped when loaded or paused).
  Tools for any
  tool-capable model: `save_plan`, `list_plans`, `add_goal`, `update_goal` (by short id or
  text: done, dropped, day, move week), `list_goals`, `set_day_plan`, `update_day_item`.
- **Day plan:** one ⭐ must win (the next concrete step toward a weekly goal) plus up to two
  more items per day, each optionally linked to a goal. Proposed in the morning snapshot and
  saved when the user agrees; with the evening check-in on, tomorrow's is asked the evening
  before. Leftovers are suggested again, never copied silently. "Days won" = days whose must
  win got done. Every chat's system prompt carries this week's goals and today's and
  tomorrow's items with short ids.
- **Weekend (Saturday, Sunday):** no work reminders unless the user asks. The morning
  snapshot becomes a weekend snapshot: a nudge to relax, a day plan the user set for today
  and open home goals in one light line, appointments, and 2–3 relaxing ideas fitted to the
  weather and local events (`web_search` for the weather and this weekend's events in the
  optional home town from the planner settings, plus one events search in each of up to 3
  towns nearby listed there, with the search cap raised to fit; without a town it asks,
  without search it doesn't claim either). The evening check-in asks how the day off was; tomorrow's must win
  is asked only Monday to Thursday. Every planner chat gets a weekend note; weekly planning
  on the user's chosen day is unchanged (choosing a weekend day is the explicit ask).
- **Rewards:** ticking an item off on the planner page gives a confetti burst from the
  checkbox; a won day, the last open item of the day, a weekly goal and the last weekly goal
  get fireworks and a short cheer (`role="status"`). `components/celebrate.ts` adds a
  temporary overlay to the DOM (styles via the CSSOM, which `style-src 'self'` allows;
  animations in `index.css`). With "reduce motion" only the cheer shows. Ticking off in the
  chat (planner tools) has no animation.
- **Profile ("what kchat knows about you"):** short notes about the user (family, work,
  interests, how they like answers) that every chat with the profile switched on gets in its
  system prompt. The model adds notes with the `remember` tool while answering (at most 3 per
  reply, only from the user's own words: not offered in a turn with attachments, while a document is
  in the chat, or after a web search); the reply shows "Noted: …" with an undo (`noted` stream event, saved with the
  message). Settings → Account → Profile shows the notes one per line to edit, or wipe. A
  "Profile / Fresh chat" switch in the chat header (new chats default on) turns it off per
  chat: no profile in, nothing learned. Adults only. Limits: 60 notes, 200 characters each,
  4000 in total (about 1000 tokens of context). Profiles are stored per user and optionally per
  agent (`profiles.agent_id`); today every chat uses the user's own profile, and
  `profileScopeFor()` in `db/profile.ts` is the one place to switch to per-agent profiles.
- **Suggestions:** three random ideas from a pool of 24 per language on the start screen
  (an agent's own example questions replace them).
- **Model choice:** a chip under the chat title opens a sheet with the real models
  (name, size/speed, photo support) and a per-chat "think harder" switch. With a cloud key,
  the sheet has two groups, "On this Mac" and "Cloud (your own key)"; cloud models show ☁ and
  the provider (also on the chip), and moving a chat with messages to a cloud model asks
  first ("Send this chat to Anthropic?"). Suggestions to switch (photos, long texts) only
  offer local models. Without a key (and with cloud allowed) the sheet links to Settings →
  Models.
- **Cloud AI (Settings → Models):** each person's own Anthropic and OpenAI keys (checked
  with the provider, stored encrypted, shown as "…abcd"), a monthly limit in dollars (default
  20, empty = none) and this month's estimated cost.
- **Rendering:** assistant replies are Markdown rendered with `react-markdown` +
  `remark-gfm` + `rehype-highlight`. Raw HTML is never rendered (no `rehype-raw`).
  Code blocks get a copy button; tables scroll horizontally on phones; long replies
  keep a readable line length. Thinking output from reasoning models is hidden behind a
  small "Thinking…" indicator, not shown as text.
- **Photos:** before upload the client re-encodes photos through a canvas to JPEG,
  longest side at most 2048 px. This shrinks phone photos from ~5 MB to ~500 KB and drops
  EXIF metadata, including GPS location.
- **Streaming:** replies stream token by token over Server-Sent Events. The UI shows the
  queue position when the Mac is busy ("2 requests ahead of you"), then "Loading model…"
  when a model has to be swapped in, then the text. On phones, sending closes the keyboard
  and keeps the chat scrolled to the end.
- **Long texts:** each model has a message limit derived from its context window
  (`maxMessageChars` in packages/shared); the composer shows it and offers the model that
  can read the text.
- **Design goals:** big touch targets, one obvious action per screen, works one-handed
  on a phone, light and dark mode, no clutter. Look: "Forest & Champagne" (warm
  champagne paper, deep forest green, Fraunces headings, Manrope text, bundled fonts);
  colours are CSS variables in `index.css`.

### Server (`apps/server`)

- **Stack:** Node 22, Fastify, TypeScript (strict), zod for all request validation,
  better-sqlite3, `@node-rs/argon2`, `node:crypto` (AES-256-GCM), `sharp` for image
  checks. Pino logging with content redaction.
- **Modules:**
  - `security/`: crypto primitives, key management, auth, sessions, CSRF/origin check,
    rate limits, security headers. **Owned by Claude, never delegated** (see CLAUDE.md).
  - `db/`: schema, migrations, repositories. Repositories take plaintext in and return
    plaintext out, and do encryption/decryption through `security/crypto` with the
    user's key from the request context.
  - `models/`: model registry (config + live capabilities from Ollama `/api/show`).
  - `llm/`: Ollama client over node:http (streaming `/api/chat`, images as base64, tool
    calls, `think` level, `keep_alive`, cancel via AbortController). Not fetch: fetch gives
    up after 300 s of silence while a long prompt is read. Cloud clients over HTTPS with the
    user's key, no SDK: `anthropic.ts` (Messages API, adaptive thinking with effort from
    "think harder", server-side fallback) and `openai.ts` (Responses API, `store: false`,
    reasoning effort). Both stream, send images and tools, give tool calls ids, and return
    the provider's own output as `replay`, which goes back unchanged in the next tool round
    (thinking blocks, encrypted reasoning). Shared HTTPS/SSE code in `cloudhttp.ts`.
  - `chat/`: reply loop (context, tools: `create_image`, `web_search`), system prompts.
  - `tools/`: the web search tool (SearXNG client, result formatting), photos from the web,
    reading linked pages, planner and profile tools.
  - `imagegen/`: manages the Python worker process (start on demand, stop after idle).
  - `jobs/`: the scheduler (below).
  - `routes/`: HTTP handlers, thin; validation + call into the modules above.
- **Data directory:** `~/Library/Application Support/kchat/` holds `kchat.db` and
  `blobs/` (encrypted attachments), outside the repo. FileVault is on for the whole disk.

### Image worker (`services/imagegen`)

- Python 3.12+ project managed with `uv`, using **mflux** (Apple MLX image generation).
  Ollama removed its own image generation in v0.32.6; see DECISIONS.md.
- Runs as a child process of the server. Protocol: one JSON object per line on stdin
  (`{"id", "op": "generate", "prompt", "width", "height", "steps", "seed"}` or
  `{"op": "unload"}`), one JSON object per line on stdout (`progress`, `done` with a
  temp file path, `error`). The server reads the PNG, encrypts it, stores it and deletes
  the temp file.
- The model is loaded on the first request and the process exits after 5 idle minutes,
  which returns all its memory.
- The engine sits behind an `ImageEngine` interface in the server, so Ollama (if image
  generation returns) or another engine can replace it.

### Shared (`packages/shared`)

zod schemas and TypeScript types for every API request, response and SSE event, used by
both server and web app. This is the contract that makes delegated work safe: Claude
writes or reviews these first, then the local model implements against them.

## Models

Configured in `config/models.json` (not user data, committed to git). Each entry has an
id, a friendly label, the Ollama model tag, overrides (context size, thinking level) and
whether it is the default. Capabilities (vision, thinking, tools) are read live from
Ollama `/api/show`, so the UI only offers photo upload for models that can see.

Current set (measured choices, see DECISIONS.md):

| Model | Engine | Notes |
|---|---|---|
| Gemma 4 26B (default) | `gemma4:26b` | MoE, ~45 tok/s, sees photos, tools; 128k-token window (~310k characters per message) |
| Gemma 4 12B | `gemma4:12b` | Smaller, leaves room for the image model |
| Qwen3-Coder 30B | `qwen3-coder:30b` | Fastest, programming |
| Qwen3.8 27B | `qwen3.8:27b-mlx` | Dense, slow, strongest reasoning; unloaded after every reply (MLX leak); 64k window |
| Pictures | mflux FLUX.2 Klein 4B | ~14 s per image; creates and edits photos |
| Pictures with text | mflux Z-Image Turbo | Readable text on cards and signs, ~2 min |

Admins can add any other installed Ollama model from Settings.

**Cloud models** (`cloudModels` in config/models.json; offered only to users with a key for
the provider, when the admin's cloud switch allows): capabilities and list prices are
declared in the config. History budget 40k tokens (cost grows with it), up to 32k output
tokens (reasoning counts as output), timeout 15 minutes.

| Model | Provider id | Price in / out per M tokens |
|---|---|---|
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | $2 / $10 |
| Claude Opus 5.5 | `claude-opus-5-5` | $4 / $20 |
| GPT-6.1 Sol | `gpt-6.1-sol` | $2 / $10 |
| GPT-6 Astra | `gpt-6-astra` | $10 / $50 |

When a user attaches a photo to a model without vision, the app offers to switch to the
default vision model instead of silently failing.

## Job scheduler (the Mac is the bottleneck)

32 GB of memory holds one large model at a time: a 20 GB chat model plus a 6–8 GB image
model plus macOS does not fit. So every model call goes through one scheduler:

- One **GPU lane**, FIFO queue, one job running at a time. Queue position is streamed
  to the client.
- **At most one queued or running job per user**, so one person can't block everyone.
  The UI disables send while a reply is in progress; a Stop button cancels it.
- Before a job runs, the memory planner unloads kchat's least recently used models until
  the needed one fits in a 22 GiB budget (configured sizes win over Ollama's reports).
- MLX-format Ollama models are unloaded after each reply batch goes idle (Ollama issue
  #18131/#18620: their prompt cache grows until the Mac swaps). GGUF models use Ollama's
  default 5-minute keep-alive.
- Jobs keep running when the client disconnects (a locked phone drops the connection);
  the app picks them up again via `GET /api/chats/:id/job` ("Still working on it…") and
  the user's devices get a push notification if nobody was watching when the job finished.
  Stop is explicit (cancel endpoint).
- Jobs have timeouts: image 3 min; chat 5 min plus reading time for long messages
  (estimated at 120 tokens/s, at most 30 min); cloud chat 15 min.
- **Cloud lane:** replies with a cloud model don't use the Mac: they start at once, side by
  side, without memory planning, also while kchat is paused. One job per user still holds
  across both lanes. If a cloud reply makes a picture, it takes a turn in the GPU queue like
  any job (queue position shown) and holds the GPU until it ends.
- **Sharing the Mac with other work** (e.g. `local-dev` coding models): kchat only
  unloads models it owns (config/models.json, admin-added models, the image worker).
  Other Ollama models count against the 22 GiB budget; if they leave too little room the
  job ends with `machine_busy` ("the Mac is busy, try again in a few minutes") before
  anything is unloaded.
- **Pause** (admin: Settings or `npm run admin -- pause|resume|status`): stored in the
  settings table; sends are refused with `paused`, the chat shows a notice, and a sweep
  every 20 s unloads kchat's models once no job runs (also picks up a pause from the CLI).
- **Idle:** chat models are unloaded by Ollama 5 min after the last reply (MLX models
  right after each reply); the image worker exits 5 min after its last job.

## Data model (SQLite)

Encrypted fields are AES-256-GCM envelopes (version + nonce + ciphertext + tag) under the
user's data key; see SECURITY.md. Tables are SQLite `STRICT`; migrations live in
`apps/server/src/db/migrations.ts`. Metadata needed for listing and sorting stays in clear.

| Table | Columns (enc = encrypted) |
|---|---|
| `users` | id, username, role (`admin`/`member`), restricted (teen account), language (`en`/`de`), default_model_id, auth_hash, kdf salts and params, wrapped data keys (password, recovery), created_at, password_changed_at, disabled_at |
| `sessions` | id, user_id, token_hash, wrapped_dek, created_at, last_seen_at, expires_at, absolute_expires_at, user_agent_label |
| `invites` | id, code_hash, role, restricted, created_by, created_at, expires_at, used_by, used_at |
| `chats` | id, user_id, title (enc), model_id, think, agent_id, use_profile, briefing (planner kind or null), briefing_on, created_at, updated_at |
| `messages` | id, chat_id, user_id, role, content (enc), model_id, status (`done`/`error`/`cancelled`), token counts, searches (enc, web searches behind a reply), notes (enc, profile notes saved with a reply), created_at |
| `web_pages` | id, user_id, message_id, position, status (`read`/`unreadable`), reason, url (enc), title (enc), text (enc: readable text and link list), created_at; deleted with the message |
| `profiles` | id, user_id, agent_id (null = the user's own profile), data (enc: the notes), updated_at |
| `attachments` | id, message_id, user_id, kind (`upload`/`generated`/`document`/`web`), mime, width, height, bytes, name (enc), pages, text_chars, scan_pages, source (enc, page of a web photo), created_at; content in encrypted blobs `<id>`, `<id>-text`, `<id>-p<n>` |
| `agents` | id, scope (`personal`/`family`), owner_id (null for family), data (enc for personal: name, emoji, description, role, examples), model_id, think, web_search, images, timestamps |
| `agent_prefs` | user_id, agent_id, pinned, pin_order, last_used_at |
| `daily_settings` | user_id, enabled, time, horoscope, plans, goals, week_day, week_time, evening, evening_time, sign (enc), last_sent_on, week_sent_on, evening_sent_on |
| `plans` | id, user_id, data (enc: date, time, text), created_at |
| `goals` | id, user_id, week (its Monday), data (enc: area, text, status, day, done_on), created_at |
| `day_tasks` | id, user_id, date, data (enc: kind must/also, text, goal_id, status), created_at |
| `push_subscriptions` | id, user_id, session_id, endpoint, p256dh, auth, created_at (deleted with the session) |
| `settings` | key, value (JSON), updated_at: admin choices (models, defaults, pause, web search) and the VAPID key; no personal data |
| `cloud_keys` | user_id, provider, secret (enc: the API key and its hint), created_at |
| `cloud_usage` | user_id, month, provider, model, input_tokens, output_tokens, cost_micros (no content) |
| `cloud_settings` | user_id, cap_cents (monthly limit; no row = $20, NULL = none) |
| `audit_log` | id, user_id, event (`login`, `login_failed`, `invite_used`, `password_changed`, …), ip_hash, created_at (never content) |

Deleting a chat deletes its messages and attachment blobs (hard delete, not a flag, for
anything encrypted).

## API outline

All under `/api`, JSON, cookie-authenticated, validated with shared zod schemas.

| Method & path | Purpose |
|---|---|
| `POST /auth/login`, `/auth/logout`, `/auth/logout-all` | Session management |
| `POST /auth/invite/accept` | Create account from invite code → returns recovery code once |
| `POST /auth/recover`, `POST /auth/password` | Reset with recovery code; change passphrase (re-wraps the data key) |
| `GET /me`, `PATCH /me`, `GET/DELETE /me/sessions[/:id]` | Account, language, default model, devices |
| `GET /models` | Models for this user with limits and capabilities; image models; paused flag |
| `GET/POST /chats`, `PATCH/DELETE /chats/:id` | Chat list and management (model, think, title) |
| `GET /chats/:id/messages` | Messages of a chat (paged) |
| `POST /chats/:id/messages` | Send a message (text + attachment ids); SSE stream |
| `GET /chats/:id/job` | The user's reply still running in this chat, if any |
| `POST /chats/:id/images` | Generate an image from a prompt (older direct route); SSE stream |
| `POST /jobs/:id/cancel` | Stop a running reply or image (owner only) |
| `GET /jobs/:id/events` | Attach to a running reply again (owner only, SSE): the reply so far (`page`, `sources`, `noted`, `image` events, `replace` with the text, the current status), then the live events. Used when a stream drops (iOS ends long fetch streams on screen lock or app switch) and when a chat with a running reply is opened |
| `POST /attachments`, `GET /attachments/:id` | Upload photo or document; decrypted download, owner only |
| `GET /push/key`, `POST/DELETE /push/subscription` | Notifications for this device |
| `GET/PUT /daily`, `GET /plans`, `DELETE /plans/:id` | Planner settings and upcoming plans |
| `GET/PUT/DELETE /profile`, `DELETE /profile/notes/:id` | The user's profile: view, edit, wipe; undo a noted note |
| `GET /week?week=`, `POST /goals`, `PATCH/DELETE /goals/:id` | A week's goals and appointments; goal changes |
| `POST /tasks`, `PATCH/DELETE /tasks/:id` | Day plan items (409 `day_full`) |
| `POST /briefings`, `GET /chats/:id` | Today's planner chat (created if needed); one chat (planner chats aren't listed) |
| `POST /briefings/prepare` | Service worker on a planner push: start today's planner chat in the background (202) |
| `GET/POST /agents`, `PUT/DELETE /agents/:id`, `PUT /agents/:id/pin`, `POST /agents/draft` | Agents (with templates), pins, drafting with the model |
| `GET /cloud`, `PUT/DELETE /cloud/keys/:provider`, `PUT /cloud/cap` | The user's cloud keys (checked, then stored encrypted; never returned), monthly limit, this month's use |
| `/admin/invites`, `/admin/users`, `/admin/models` (+ `/extra`), `/admin/pause`, `/admin/web-search`, `/admin/cloud`, `GET /admin/system` | Admin only, no access to any content |

SSE events: `started`, `reading_pages`, `page`, `queued`, `loading`, `reading`, `thinking`,
`token`, `search`, `sources`, `progress`, `image`, `done`, `error` (schemas in `packages/shared/src/chat.ts`).
Cloud replies can end with the errors `cloud_key` (key missing or rejected),
`cloud_unavailable` (provider busy, rate or quota limit), `refused` (the model declined);
sending is refused with 409 `over_budget` at the monthly limit.
Leak guard: every 60 s, a kchat model whose Ollama-reported size grew > 3 GB since loading is
unloaded when the scheduler is idle (Ollama MLX leak, see DECISIONS.md).

`loading` carries `expectedMs`: the model's last measured load time (Ollama's
`load_duration`, kept in memory), else about 0.6 s per GB; the app's bar follows it and
waits at 95% until the first output.

Conversation context: the server sends the chat history newest-first until the model's
history budget is reached (the newest message always goes in), documents within 75% of
that budget, and images only from the latest few messages.

## Repository layout (created in M0)

```
kchat/
  apps/web/            React PWA
  apps/server/         Fastify API + static hosting
  packages/shared/     zod schemas + types (the API contract)
  services/imagegen/   Python mflux worker (uv project)
  config/models.json   model registry
  scripts/             e2e and restore tests, icon generator, model spikes
  ops/                 LaunchAgent, install script, SearXNG setup (ops/searxng/)
  docs/                these documents
  CLAUDE.md            instructions for Claude sessions
  .local-dev.md        conventions passed to the local model
```

npm workspaces for the TypeScript packages. One root command, `npm run check`, runs type
checking, lint and tests for everything and must pass before any commit.

## Deployment on the Mac mini

Commands are in [ops/README.md](../ops/README.md).

- **Processes:** Ollama (Homebrew service); kchat server as the user LaunchAgent
  `app.hemmia.server` (started at login, restarted on crash); SearXNG as
  `app.hemmia.searxng`. The server starts and stops the image worker itself.
- **Network:** the server binds `127.0.0.1:8787`; `tailscale serve --bg --https=443
  http://127.0.0.1:8787` publishes it at the Mac's tailnet address (`https://<mac>.<tailnet>.ts.net`), tailnet
  only. **Tailscale Funnel (public internet) must stay off.**
- **Family access:** each family member installs Tailscale and joins the tailnet (or the
  Mac is shared to their tailnet), then opens the URL and adds it to the home screen.
- **Power:** sleep is off and the Mac restarts after a power cut (`pmset`, done
  2026-10-02). With FileVault on, someone must log in after a reboot before the
  LaunchAgents run (in the family guide).
- **Backups:** Time Machine; the database and blobs are encrypted per user
  (`npm run restore-test` checks a restore).
- **Pause:** `npm run admin -- pause` frees the Mac for other work.

## Development on this machine

- Claude (cloud) designs, owns security, reviews; the local model (`qwen3-coder-dev` via
  `local-dev`) implements well-specified tasks. See CLAUDE.md.
- **Memory while developing:** `local-dev` loads a 20 GB model. Don't run the app against
  a large chat model at the same time. For integration tests, use a tiny model
  (pull one in M0, e.g. a 1–4B model) and a stub image engine.
