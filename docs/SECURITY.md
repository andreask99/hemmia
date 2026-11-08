# kchat security design

Status: **implemented (M1)**, 2026-09-30. Claude keeps this current. Everything in this
file is Claude's responsibility and is never delegated to the local model. Code:
`apps/server/src/security/` (crypto, auth, http, rate-limit) and `apps/server/src/db/`.

## Goals

1. Only family members can reach the app at all (network layer).
2. Each person can only see their own chats and photos (app layer).
3. Stored chats and photos can only be decrypted with that person's password (or their
   recovery code, or an active session on their own device). Not by other family members,
   not by the admin, not from a stolen disk or backup.
4. Nothing leaves the house unless the user chooses it: no third-party scripts, fonts or
   analytics, and no cloud AI except a cloud model the user picked for that chat with their
   own API key (2026-10-14, see "Cloud models" below). Web search sends search terms out.

## Threat model

| Threat | Mitigation |
|---|---|
| Stranger on the internet | Not reachable: server binds 127.0.0.1; only Tailscale serve forwards to it; Funnel off. App login still required (defence in depth). |
| Lost or stolen phone | Tailscale device can be removed in the admin console; "sign out everywhere"; sessions expire. |
| Another family member (curious) | Per-user encryption keys, per-user authorisation on every query; admin role has no content access. |
| The admin (you) browsing the database or disk | Content encrypted with keys derived from each user's password; the admin cannot decrypt. |
| Stolen Mac, disk or Time Machine backup | FileVault on; app content additionally encrypted per user. |
| Malicious content in model output | Markdown rendered without raw HTML; strict CSP; links open with `rel="noopener noreferrer"`. |
| Malicious uploads | Size limit, type check by magic bytes, decode + re-encode with sharp, dimension limit; never served with a sniffable type. |
| Password guessing | Argon2id, rate limits per IP and per username, backoff, audit log. |
| CSRF / clickjacking | SameSite=Strict cookies, Origin check on state-changing requests, `frame-ancestors 'none'`. |
| Chat content at a cloud provider | Only chats whose model the user picked from the "Cloud" group (☁) go there; the engine is fixed per model, no fallback between local and cloud; switching a chat with history asks first. Provider retention per their API terms (accepted by the owner). |
| A user's cloud API key leaking | Encrypted with the user's data key (admin can't read or use it), never returned or logged, sent only to its provider's fixed origin. Users also set a limit in the provider's console. |
| Runaway cloud spending | Per-user monthly cap (default $20, estimated from token counts and list prices), checked before each cloud reply; the provider console limit is the backstop. |

**Out of scope (accepted, documented for the family):** someone with admin or root access
to the *running* Mac could read data in memory while users are active: prompts must be
decrypted to send them to the model. Ollama keeps recent prompts in its in-memory cache
until the model unloads. This design protects data at rest and between users, not against
a compromised live server.

## Key hierarchy

```
password ──Argon2id(kdf_salt, kdf_params)──► 64 bytes ─┬─ first 32: KEK (never stored)
                                                        └─ last 32: auth key → SHA-256 → users.auth_hash
recovery code ──Argon2id(recovery_salt, recovery_kdf_params)──► RK (never stored)
session token (32 random bytes, cookie) ──HKDF-SHA256("kchat-session-v1", "session-dek:<id>")──► SK
DEK = random 32 bytes per user (the data key; never stored in clear)

users.wrapped_dek_pw        = AEAD(KEK, DEK, aad "wrap|<user>|password")
users.wrapped_dek_recovery  = AEAD(RK,  DEK, aad "wrap|<user>|recovery")
sessions.wrapped_dek        = AEAD(SK,  DEK, aad "wrap|<user>|session-<session id>")
sessions.token_hash         = SHA-256(token)
```

- **AEAD envelope (v1):** `0x01 ‖ nonce(12) ‖ ciphertext ‖ tag(16)`, AES-256-GCM, random
  nonce per value. AAD is always required and is `kchat|v1|` plus a location string built
  from validated components (`[A-Za-z0-9_-]`, no separators): `col|<user>|<table>|<row>|<column>`
  for columns, `blob|<user>|<attachment>` for files, `wrap|<user>|<slot>` for keys. A
  ciphertext copied to another row, column, user or slot fails to decrypt. The version
  byte allows changing algorithms later.
- **Argon2id parameters** (measured on the Mac mini M6, 2026-09-30): **m = 256 MiB,
  t = 12, p = 4 ≈ 450 ms**. The starting point (64 MiB, t = 3) took only 55 ms on this
  machine. Parameters are stored per user (`kdf_params`), so they can be raised later
  and old accounts keep working. At most 2 derivations run at once (each holds 256 MiB).
  Passwords are NFC-normalised first.
- **Login:** derive KEK + auth key; compare `SHA-256(auth key)` with `users.auth_hash` in
  constant time; unwrap the DEK; create a session. The DEK is wrapped for the session with
  a key derived from the cookie token, so the server can decrypt a user's data only while
  that user's browser presents its cookie. Sessions survive restarts without usable keys
  on disk.
- **Per request:** look up the session by token hash, unwrap the DEK into memory, attach
  it to the request, and zero it when the response has been sent.
- **Change password:** requires the current password; re-wraps the DEK with the new KEK
  (new salt); content is not re-encrypted; all other sessions end.
- **Forgotten password:** reset with username + recovery code (re-wraps the DEK), all
  sessions end, and a **new recovery code** is issued (the old one was just typed on a
  device). Without the code the data is gone by design; the admin can only disable the
  account and invite again.
- **Sign out everywhere:** deletes all the user's sessions (and their wrapped DEKs).
- **Recovery codes:** 25 Crockford base32 characters (125 bits) in 5 groups of 5
  (`7K3QX-M9DPA-…`). No I, L, O, U; input is case-insensitive, ignores spaces/dashes and
  maps O→0, I/L→1, so handwriting errors don't matter.
- **Invite codes and session tokens:** 256-bit random, base64url; only SHA-256 hashes are
  stored.
- **At rest:** SQLite with `secure_delete=ON` (deleted rows are overwritten), data dir 0700,
  database file 0600.

## Authentication and accounts

- No self sign-up. The admin creates single-use invite codes (CLI or admin screen),
  valid 7 days, stored hashed. The invite fixes the role and whether the account is
  **restricted** (teen account: owner decision 2026-09-30; policy to be defined). Admins see
  open invites (role, creator, expiry; never the code) and can withdraw them; disabling an
  account deletes the unused invites it created.
- Usernames: 3–32 of `A–Z a–z 0–9 . _ -`, unique case-insensitively.
- Passwords (passphrases): at least 12 characters (counted as people see them), at most
  256; rejected if on a small built-in list of common English/German passwords, if they
  have fewer than 4 distinct characters, or if they contain the username. The sign-up
  screen suggests a 4-word passphrase.
- Rate limits (in memory): every login/accept/recover attempt counts against the client
  IP (20 per 15 min; IPv6 by /64). Login and recovery attempts count against the username
  from that network (5 per 15 min) and against the username alone (30 per 15 min); each
  limit then blocks for 15 min, doubling on each further round (30, 60 min …), reset by a
  success or a quiet day. From a device already paired to that account, attempts count only
  per device, so guesses from elsewhere (or behind Docker's single gateway address) can't lock
  a family member out on their own phone or computer; a new device can still be blocked by
  the per-username cap. Attempts are recorded before the Argon2 check, so a parallel burst
  can't pass the limit; a request without a passphrase (asking whether one is needed) costs
  no try. Change-password failures count per user. Responses: 429 with `Retry-After`.
- An admin invite (a lasting new admin account) needs a session started with the passphrase
  less than 15 minutes ago, or the passphrase again.
- "Recently signed in" (making a sign-in link without the passphrase within 15 min) counts
  only sessions started with the passphrase (login, setup, invite, recovery), never one from
  a sign-in link (`sessions.via_link`).
- Requests must use origin-form targets (`/path`); absolute-form ones get 400, so the device
  gate and the router always judge the same path.
- A device code redeemed, or a sign-in made, on a device paired to someone else ends that
  person's sessions on it; a device code also counts against the new owner's device limit.
- In the phone app, native plugins treat only the shell as the shell: the bundled demo
  (`/demo/`, same origin) gets no keys, hub launching or staged exports.
- Unknown user, disabled user and wrong password give the same 401 `invalid_credentials`
  after the same Argon2 work (a dummy derivation for unknown users). Recovery does the
  same for wrong/malformed codes.
- Client address: the server trusts `X-Forwarded-For` only from loopback (Tailscale serve
  connects from 127.0.0.1), so rate limits see each phone's tailnet address.
- Sessions: 30 days sliding expiry (written at most every 10 min), 90 days absolute.
  Session list with device labels ("iPhone · Safari") and "sign out everywhere".
- Audit log: `invite_created`, `invite_used`, `login`, `login_failed`, `logout_all`,
  `password_changed`, `password_change_failed`, `password_recovered`, `recover_failed`
  with user id and time; never content or credentials.
- Admin role: manage invites, disable accounts, choose enabled/default models. No endpoint
  returns another user's content, and the admin can't decrypt it anyway.
- Optional later: require the Tailscale identity header (`Tailscale-User-Login`, set by
  Tailscale serve) to match a login bound to the account, as a second factor.

## Transport and browser security

- TLS by Tailscale serve (valid Let's Encrypt certificate for `*.ts.net`). The server binds
  loopback only (config refuses anything else) and answers only to Host names in
  `HEMMIA_PUBLIC_HOSTNAMES`, the relay's hub hosts, the lines of `public-hostnames.txt` in the
  data dir (written by the macOS package's `tailscale.sh`, read once at startup; only the
  hub's own user can write there) plus localhost (others get 421).
- Headers on every response: `Content-Security-Policy: default-src 'self'; img-src 'self'
  blob: data:; script-src 'self'; style-src 'self'; connect-src 'self'; font-src 'self';
  object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`,
  `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy` (camera, microphone, geolocation
  off: photos come through the file input), `Cross-Origin-Opener-Policy: same-origin`,
  `Cross-Origin-Resource-Policy: same-origin`.
- No external resources at all: fonts, icons and scripts are bundled. Lint rules forbid
  `dangerouslySetInnerHTML` and inline `style` in the web app.
- API responses and images: `Cache-Control: no-store`. The service worker never caches
  `/api`.
- Cookie: `__Host-hemmia_session` (production; `Secure`, `Path=/`, no `Domain`),
  `HttpOnly`, `SameSite=Strict`, 30-day `Max-Age`. In development over plain http, and in
  production for requests to `localhost`/`127.0.0.1`/`[::1]` (not via the relay; the
  installer opens setup at `http://localhost`, where Safari drops `Secure` cookies):
  `hemmia_session` without `Secure`. Cookies are per host, so this cookie never reaches the
  hub's https names (2026-10-25). The names before the rename (`__Host-kchat_session`,
  `kchat_session`) are still read when the new one is absent; a valid old cookie is re-issued
  under the new name and the old one cleared (same token, same flags). Logout clears both.
  The same applies to the device cookie (`hemmia_device`, formerly `kchat_device`). Remove the
  fallback 30 days after the family release that introduces it (PLAN P8.2).
- CSRF: state-changing requests (POST/PUT/PATCH/DELETE) need an `Origin` naming one of
  our hosts (https; http only for localhost), and are refused if `Sec-Fetch-Site` is
  present and not `same-origin`/`none`. Only JSON bodies are parsed (the text/plain
  parser is removed; multipart only on the upload route), so HTML form posts can't reach
  a handler. Plus SameSite=Strict.
- Errors: responses carry only an error code (`{ error: { code } }`), never input or
  messages. Client errors are logged as code + status only (JSON parse errors quote the
  body); server errors are logged with the error, which never contains content.
- Body limit 256 KB for JSON (uploads raise it per route).

## Uploads and generated images

- `POST /api/attachments`: multipart only on this route (one file, no other fields, 10 MB),
  Origin-checked like every POST, 100 uploads per user per hour.
- Accepted by magic bytes (never the file name or client MIME type): JPEG, PNG, WebP.
  HEIC isn't decoded on the server (sharp's prebuilt libvips lacks it); the web app
  re-encodes every photo to JPEG in the browser first, which also drops EXIF/GPS.
- Every upload is decoded and re-encoded by sharp: EXIF orientation applied, longest side
  at most 2048 px, JPEG (PNG if transparent), all metadata dropped, 50-megapixel decoder
  limit against decompression bombs. The client's bytes are discarded, so polyglots and
  appended payloads don't survive (tested).
- Stored as AES-GCM envelopes in `<data dir>/blobs/<uuid>.bin` (dir 0700, files 0600), AAD
  `blob|<user>|<attachment>`; swapped or tampered files fail to decrypt (tested).
- Served only to the owner (`WHERE id = ? AND user_id = ?`; others get 404) as
  `image/jpeg`/`image/png` with `nosniff`, `Content-Disposition: inline`,
  `Cache-Control: private, no-store`.
- An upload can be attached to one message only, and only by its owner (checked in the
  same transaction as the message insert). Unsent uploads are deleted after 24 hours.
  Deleting a chat deletes its attachment rows and blob files.
- Generated images: the worker writes a temporary PNG in a private temp dir (0700);
  the server reads, encrypts and deletes it immediately.

## Documents (PDF, Excel, Word)

- Same upload route and limits as photos (20 MB for documents), recognised by content:
  `%PDF-` header, or a ZIP whose entries include `[Content_Types].xml` and `xl/`/`word/`.
- Text is extracted in a worker thread (`security/document-worker.ts`) with a 512 MB heap
  limit and a 60 s timeout; the thread is terminated on any failure. Parser output on
  stdout/stderr is discarded and errors carry no details (they can quote content). Up to
  400k characters are kept. Note: a worker thread shares the process, so this contains
  runaway memory and time, not a parser exploit; the libraries (unpdf/pdf.js, exceljs,
  mammoth) are well maintained and parse only (no macros, no network).
- The original file, the extracted text and the file name are stored encrypted (blob AAD
  `blob|<user>|<id>` and `blob|<user>|<id>-text`; name as column `attachments.name`).
- Downloads are served as `Content-Disposition: attachment` (never rendered inline in the
  app's origin), owner only.
- Documents reach the model as text inside `<document name="…">` blocks in the user's turn,
  within 75% of the model's history budget.
- **Scanned PDFs:** pages with (almost) no text that paint an image of at least 300 px (and
  none over 40 MP; pdf.js `maxImageSize` enforces the same) are drawn in the worker by the
  official pdf.js build (`pdfjs-dist`, with its wasm decoders for JBIG2 and JPEG 2000, which
  run sandboxed in WebAssembly) on `@napi-rs/canvas` at 3200 px, shrunk to 1600 px and
  contrast-stretched by sharp (JPEG, no metadata), at most 10 pages. Drawing the whole page
  keeps scanners' separate text layers. The canvas buffer (≈30 MB) is native memory outside
  the worker's heap limit but bounded by the render size; the time limit still applies.
  The main process checks each result again (JPEG, ≤ 1600 px) because the worker parsed
  untrusted input, then stores them encrypted as `blob|<user>|<id>-p<n>`
  (count in `attachments.scan_pages`). They are read only through an owner check and sent
  to vision models like photos; deleting the document deletes them.

## Push notifications

- Outbound requests besides Web Push are listed where they belong: web search and page
  reading (below), cloud models, the relay (docs/public/RELAY.md) and the update check
  (docs/public/SECURITY.md §6.5). For Web Push: subscriptions are accepted only for HTTPS endpoints on known push
  hosts (Apple, Google, Mozilla, Microsoft; default port, no credentials), which prevents
  using the server to reach arbitrary or internal addresses. Requests don't follow redirects
  and time out after 10 s.
- Payload: `{kind: reply|image, chatId, lang}`, encrypted to the device (RFC 8291 aes128gcm,
  `security/webpush.ts`, checked against the RFC test vector). No content, titles or names;
  the service worker supplies the text. Apple/Google see that a notification was sent, when,
  and its size.
- VAPID key (P-256) generated on first use and kept in the settings table; the JWT `sub` is
  the kchat URL. Subscriptions (`push_subscriptions`) are tied to the session that created
  them and deleted with it (sign-out, expiry, account disabled); sending skips expired
  sessions; 404/410 from the push service deletes the subscription. Not encrypted (needed
  while the user is away); they are delivery addresses, not content. Endpoints are never
  logged (they are capability URLs); logs carry push host and HTTP status.
- A device belongs to whoever signed in on it last; at most 10 devices per user.
- Replies now keep running when the connection drops (phone locked) and are saved as usual;
  stopping is explicit (`POST /api/jobs/:id/cancel`, owner only). Notifications go out only
  when the app wasn't watching when the job finished.
- The service worker caches only the app shell and hashed build files, never `/api/`.

## Web search (SearXNG)

- SearXNG runs as its own LaunchAgent on 127.0.0.1:8888 (`ops/searxng/`), no account, no
  limiter (only kchat uses it), output to /dev/null because it logs failed engine requests
  with the query in the URL. kchat never logs queries, URLs or page text.
- Search terms leave the house: SearXNG forwards them to search engines, which see the Mac's
  public IP but no account or cookies. The model writes the queries; the prompt tells it not
  to include private details, and every search is shown in the reply ("Searched the web").
- Admin setting: off / adults only / everyone; teen accounts always get strict safe search.
- Page reading (`security/webfetch.ts`): http/https on default ports only, no credentials;
  every resolved address must be public (no loopback, RFC 1918, CGNAT/Tailscale 100.64/10,
  link-local incl. 169.254.169.254, ULA, multicast, reserved, IPv4-mapped forms); the socket
  connects to the checked address (custom lookup, no DNS-rebinding window); redirects (max 3)
  are re-checked; 8 s timeout; 2 MB limit before and after decompression; HTML/plain text
  only; linear HTML scanner (no regex backtracking on untrusted input).
- Prompt injection: page text reaches the model inside `<web_results>` with a note that it is
  untrusted and must not be followed. The model's only other tool is create_image, so a
  hijacked reply can at worst search again or draw a picture; it cannot read other chats or
  reach the home network. Residual risk: a page could steer the model to put words from the
  chat into a follow-up query; searches are capped at 3 per reply and all are visible.
- Sources are shown as links (`target=_blank`, `rel=noopener noreferrer`, http/https only);
  the app never loads anything from them.
- Photos from the web (`show_photos`, `tools/webphotos.ts`): image URLs from SearXNG are
  fetched by the server with `fetchImage` (same address, redirect and size rules as pages;
  JPEG/PNG/WebP content types only, 8 MB, 6 s), then decoded and re-encoded by sharp exactly
  like uploads (`saveWebPhoto`: magic-byte check, 50 MP decoder limit, metadata dropped, max
  1600 px), so no foreign bytes are served from the app's origin. Stored encrypted (blob and
  `attachments.source`, column AAD `source`), owner-only like every attachment. The browser
  never contacts image hosts (CSP unchanged). Photos are not sent to the model (no prompt
  injection through image text); its tool result names only the count and host names. Teen
  accounts use strict safe search; image filtering by search engines is imperfect (open point
  for the owner's teen-account policy; "web search: adults only" turns photos off for teens).
- Searches are stored with the reply, encrypted (`messages.searches`, column AAD `searches`).
- Links in the chat (`security/links.ts`, `tools/readpage.ts`): only links the user wrote in
  their own message are read, never URLs chosen by the model, so injected page text can't
  make the server send chat content to a URL. Up to 3 per message; links inside code are
  ignored; local names (`localhost`, `.local`, `.lan`, `.fritz.box`, `.ts.net`, …), private
  IP literals, credentials and explicit ports are skipped before fetching, and the fetcher
  enforces its address rules anyway (above; 10 s timeout). The site sees the Mac's public IP
  and kchat's user agent, no cookies or account. Same permission as web search (admin mode,
  the agent's web switch; "adults only" turns it off for teens). Pages are stored encrypted
  (`web_pages`: url, title, text with column AADs, scoped by user_id, deleted with the
  message); status and failure reason are in clear. Page text reaches the model as
  untrusted `<web_page>` content (attribute quotes replaced, `</web_page` in the text
  defused so a page can't close its block), with a note not to follow instructions in it.
  While a read page is in the chat the remember tool is off (like documents); a hijacked
  reply can otherwise only do what a web search result could (search, show photos, draw,
  planner entries, all visible). The app shows each page as a link and never loads it.

## Cloud models (Claude, OpenAI)

Owner decision 2026-10-14 (DECISIONS.md). Code: `llm/cloudhttp.ts`, `llm/anthropic.ts`,
`llm/openai.ts`, `db/cloud.ts`, `routes/cloud.ts`, the cloud lane in `jobs/scheduler.ts`.

- **Explicit choice:** cloud models (config `cloudModels`) carry `engine: 'anthropic' |
  'openai'`; `chat/reply.ts` picks the client by engine, so a local model's chat never reaches
  a cloud client and a cloud model never reaches Ollama (tested: a local reply makes no
  outbound request even when the user has a key). When a chat's model goes away, the server
  falls back to a local model only, never to a cloud one; agent drafting and the planner
  warm-up stay local; the app's "switch model" suggestions (photos, long texts) offer local
  models only. The picker groups models "On this Mac" / "Cloud", cloud models show ☁ and the
  provider, and switching a chat that has messages from local to cloud needs a confirmation.
- **What is sent:** what the model needs for the reply, as with a local model: system prompt
  (with profile notes, planner goals and plans, town when the chat uses them), the chat history
  within the model's budget, photos and scans (base64), document and page text, tool results.
  Nothing from other chats or other users.
- **Keys:** one per user and provider, added in Settings → Models → Cloud AI. Checked with
  the provider by a request without content (`GET /v1/models`, 10 checks per user and hour),
  then stored as an AES-GCM envelope of `{key, hint}` under the user's data key (column AAD
  `cloud_keys|<provider>|secret`, so a ciphertext copied to another user or provider fails).
  Usable only while the user's session or one of their reply jobs holds the data key; the
  admin can neither read nor use it. Never returned (the app sees the last 4 characters),
  never logged (pino redact paths `key`, `apiKey`, `x-api-key`).
- **Outbound requests:** only to `https://api.anthropic.com`, `https://api.openai.com` and
  `https://openrouter.ai` (2026-10-23, P1.6; fixed in code, not configurable),
  plus admin-added local model servers (P1.7, `security/localengine.ts`): only hosts that
  resolve exclusively to loopback or private addresses (10/8, 172.16/12, 192.168/16,
  fc00::/7; not Tailscale's 100.64/10), checked on save and on every connection with the
  checked address pinned, no redirects, no credentials in the URL, `redirect: 'error'`, no credentials besides the key
  header, bounded by the job's abort signal (cloud timeout 15 min). Response bodies of failed
  requests are discarded unread (they can quote the prompt); errors carry codes only. OpenAI
  requests use `store: false`. OpenRouter requests send no identifying headers (no
  `HTTP-Referer`, `X-Title`) and ask only for providers that don't collect prompts
  (`provider.data_collection: "deny"`). Anthropic Opus/Sonnet requests opt into server-side fallback
  (`fallbacks: "default"`): if the model declines, Anthropic may answer with another of its
  models.
- **Family switch:** admin setting cloud off / adults only / everyone (default everyone); it
  hides cloud models, blocks adding keys and stops cloud replies at once.
- **Spending:** `cloud_usage` keeps token counts and an estimated cost per user, month and
  model, in clear (no content, like token counts on messages). `cloud_settings.cap_cents`
  (default $20, null = no cap) is checked before each cloud reply (409 `over_budget`); a reply
  already running finishes.
- **Scheduler:** cloud replies run in the cloud lane (no GPU queue, also while paused); the
  one-job-per-user rule covers both lanes; cancelling is owner-only as before. A picture from a
  cloud chat takes a GPU turn in the normal queue.
- **Prompt injection:** unchanged: same tools and rules as local models; page and search text
  stays marked untrusted. The tool list stays the same during a cloud reply (calls that are no
  longer allowed, e.g. `remember` after a search, are refused server-side).
- Residual risk (accepted): the provider sees cloud chats in full and keeps them per its API
  data policy; a teen with a key can use cloud models unless the admin sets "adults only".

## Agents

- Personal agents: name, emoji, description, role and examples are one JSON blob encrypted
  with the owner's data key (column AAD `agents.data`); only the owner sees or edits them.
  Model, think and tool switches are plain metadata.
- Family agents (admins only) are stored in clear so every member can use them; members see
  them but cannot change or delete them. The editor says so when sharing.
- Queries always filter by `scope = 'family' OR owner_id = <user>`; a chat can only use an
  agent visible to its user (checked when creating or switching); pins and "last used" are
  per user (`agent_prefs`).
- The role is user-written text in the user's own system prompt; it cannot lift kchat's
  rules: teen-account rules come after it and say they take precedence, and tools stay
  limited by the account (an agent can only switch search or pictures off, not on).
- Drafting runs the user's prompt through the default chat model as a normal queued job;
  the description is not stored or logged.

## Admin system view

- `GET /api/admin/system` (admins only): memory and swap (macOS `memory_pressure`, `sysctl`),
  load, models in memory (Ollama `/api/ps`, image worker), what runs (kind, model, since when)
  and the queue length, service health, disk use (`du`, cached 10 min), and 24-hour counts
  (replies, pictures, searches, active people). No content, titles, user names or ids. The
  commands are fixed argument lists (no shell, no user input).

## Automatic updates

- The monthly job installs upstream code without review: Ollama bottles from Homebrew and
  the newest SearXNG commit from GitHub. Accepted by the owner for convenience; mitigated by
  the end-to-end test with automatic rollback, both services listening on localhost only,
  and no kchat secrets in their processes. kchat's own dependencies stay pinned and are
  updated by Claude with review.
- To decide on the Ollama hold, the job reads one public GitHub issue (unauthenticated
  `api.github.com` request, no data sent; if it fails, the update stays held).

## Ollama installed by Hemmia (Mac)

`apps/server/src/system/ollama.ts`. On a Mac where no Ollama answers, an admin can let the hub
install one (setup's model step, Settings → Models; `POST /api/admin/ollama/install`, audited).

- Pinned: the version and the SHA-256 of Ollama's `ollama-darwin.tgz` are constants in the code,
  updated with Hemmia releases. Downloaded over HTTPS from Ollama's GitHub releases, at most
  400 MB; the checksum is compared before anything is unpacked.
- After unpacking, `codesign --verify --strict` must accept the binary as signed by Ollama's
  Developer ID (team `3MU9H2V9Y9`); otherwise nothing is installed or run.
- Installed into `<data folder>/runtime/ollama-<version>/` (the hub's user only) and run as a
  child of the hub: `ollama serve` with `OLLAMA_HOST=127.0.0.1:<port>` and only `HOME`, `PATH`
  and that variable in its environment (no hub secrets). Only for a loopback Ollama address and
  never in Docker. Restarted with growing pauses if it stops.
- An Ollama that already answers is used as it is; nothing is installed over it.
- Status (`GET /api/admin/ollama`) is admin only and contains no paths or content.

## Planner (goals, plans, horoscope)

- The star sign, every plan (date, time, text) and every goal (area, text, status, planned
  and done day) are encrypted with the user's data key (`daily_settings.sign`, `plans.data`,
  `goals.data`); they can only be read while the user is signed in. So is the optional home
  town (`daily_settings.town`) and up to three towns nearby (`daily_settings.nearby`, a JSON
  array).
- The home town and towns nearby go into the system prompt and, on weekends, into web search queries for
  weather and events (the user's opt-in; the settings hint says so). The schema allows only
  place names (letters, digits, space and `.,'’()/-`, at most 60 characters), so they
  can't carry instructions or line breaks into the prompt; they are quoted there.
- In clear: whether it is on, the notification times, days and switches, so the server can
  send notifications without the key, and a goal's week (its Monday) for lookups: this shows
  how many goals someone has per week, never what they are.
- The notifications (`kind: daily | week | evening`) carry no content. The message is
  written with the user's session key: when the notification arrives, the service worker
  calls `POST /briefings/prepare` with the session cookie (same Origin and session checks as
  every request), and the reply job holds its own copy of the key until it ends, as any
  reply whose app went away. Without a session (signed out, expired) nothing is written
  until the user opens it. The model warm-up three minutes earlier needs no key: it reads
  only clear columns (notification times, restricted flag, default model) and loads a model.
- Plans and goals are created by the chat model (planner tools) or the planner page for the
  signed-in user only; every query is scoped by user id, changes to someone else's goal or
  plan get 404. Limits: 500 plans, 5 goals per area and week; plans older than 30 days and
  goals older than 26 weeks are pruned when a briefing is written.
- The model's goal tool matches goals by short id or text among the user's own goals of
  last, this and next week only.
- Day plan items (`day_tasks.data`: kind, text, linked goal, status) are encrypted the same
  way; only the date is in clear. A linked goal id is only kept if it is the user's own goal.
  At most one must win and two more per day.
- Planner chats (`chats.briefing`, `briefing_on`: kind and day in clear, content encrypted
  like any chat) are hidden from the chat list, reused per kind and day, and deleted with
  their attachments after 7 days.

## Profile

- All notes of a profile are one JSON blob encrypted with the user's data key
  (`profiles.data`, AAD bound to the row); the notes a reply saved are encrypted with the
  message (`messages.notes`). In clear: that a profile exists, its owner and agent, when it
  changed, and each chat's `use_profile` switch. Admins can't read profiles, like chats.
- Per-user isolation: every query is scoped by user id; another user's note id gets 404.
  Agent profiles (not used yet) are per user too, so a family agent never shares what it
  learned about one person with another; they are deleted with the agent.
- Teen accounts: no profile (GET says unavailable, writes are 403, the reply never offers
  the tool or adds profile context). Owner's choice until the teen policy is decided.
- Prompt injection: the profile goes into the system prompt as information about the user,
  marked as not overriding the rules. Saved notes are the risk: the `remember` tool is only
  offered when the turn has no attachments, no document is in the chat, and no web search
  has run in this reply (document and page text are untrusted), the prompt limits notes to the user's own words and excludes health,
  money, passwords/codes and other people's private matters unless the user asks, and every
  saved note is shown under the reply with an undo. At most 3 notes per reply, 60 in all.
- Notes are never logged.

## Logging and privacy

- Never log message content, prompts, titles, image data, passwords, recovery codes,
  tokens or keys (including users' cloud API keys and cloud providers' error bodies). Pino redaction on request bodies; error logs carry ids, not content.
- Ollama must not run with `OLLAMA_DEBUG` (it would log prompts).
- The audit log stores events and a hashed IP, never content.
- Model output is not used for anything except display to its owner.

## Review gates

- All code under `apps/server/src/security/` and every change to auth, sessions, crypto,
  uploads, headers or the scheduler's per-user isolation is written or line-by-line
  reviewed by Claude.
- Before the family gets access (end of M6): run `/security-review` on the whole repo,
  work through the checklist below, and record results in DECISIONS.md.

### Pre-launch checklist

- [x] Another user's chat id, message id or attachment id returns 404 for every endpoint. (route tests: chats, messages, attachments, images, jobs, sessions)
- [x] Admin endpoints return 403 for members; no admin endpoint returns content. (account.test.ts)
- [x] Database and blob files contain no plaintext (grep test with known strings). (`npm run e2e`, attachments.test.ts)
- [x] Wrong password / unknown user responses are identical in body and timing (±). (auth tests)
- [x] Rate limits trigger and recover. (rate-limit and route tests)
- [x] CSP has no violations in the browser console on every screen. (Verified 2026-10-02 with headless Chrome on the production build, phone viewport: sign-in, recovery, 404, invite → account, chat with streaming Markdown/table/code, model sheet, settings incl. admin. Fixed on the way: zod's eval probe (jitless, `apps/web/src/zod-setup.ts`), unnamed form fields, and missing files answered with the app page instead of 404.)
- [x] Markdown with `<script>`, `<img onerror>`, `javascript:` links renders inert. (Markdown.test.tsx)
- [x] Oversized, non-image and polyglot uploads are rejected. (polyglots are re-encoded, payload removed)
- [x] Server not reachable on the LAN IP; only via Tailscale; Funnel off. (Verified 2026-10-01: binds 127.0.0.1; LAN IP refuses connections; `tailscale serve` tailnet only; Funnel off.)
- [x] Logs after a full test session contain no message text. (`npm run e2e`)
- [x] Password change, recovery reset and sign-out-everywhere work and old sessions die. (auth tests)
