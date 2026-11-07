# Target architecture: Hemmia hub, apps and relay

Read [README.md](README.md) first. The current system is described in
[../ARCHITECTURE.md](../ARCHITECTURE.md); this document describes what is added or changed.
Wire formats are in [RELAY.md](RELAY.md), security rules in [SECURITY.md](SECURITY.md).

## 1. Overview

The app has **two modes** (owner decision 2026-10-23):

- **At home (`hub`):** the app connects to the family's hub, the main design below.
- **On this phone (`phone`):** no hub. The user's own Anthropic or OpenAI key, requests
  straight from the phone to the provider, chats stored encrypted on the phone. Nothing hosted
  by the owner is involved. Full design: [PHONE-MODE.md](PHONE-MODE.md).

One phone can use both: "On this phone" appears as the first row of the hub list. The rest of
this document describes the hub mode unless it says otherwise.

```
  Phone (Hemmia app: native shell + hub's web app)        Browser (any device)
        │  HTTPS to https://<hub-id>.h.<relay-domain>          │  same URL
        ▼                                                      ▼
 ┌──────────────────────────── relay (owner's VPS) ───────────────────────────┐
 │ :443 SNI router ── *.h.<relay-domain> ──► raw TLS bytes into the hub's tunnel│
 │                 ── tunnel.<relay-domain> ─► tunnel server (hubs connect here)│
 │                 ── api.<relay-domain> ───► control API: register, certs, push│
 │                 ── join.<relay-domain> ──► static join page, app link files  │
 │ ACME client (Let's Encrypt, DNS-01 via Cloudflare DNS API)                  │
 │ push sender ──► APNs (Apple) / FCM (Google)                                 │
 └──────────────────────────────────────────────────────────────────────────────┘
        ▲ one outbound TLS connection, kept open by the hub
        │ (frames: OPEN / DATA / WINDOW / FIN / RESET / PING)
 ┌───────────── hub (user's computer: macOS pkg or Docker) ─────────────────────┐
 │ relay client: terminates the client's TLS with the hub's own certificate,   │
 │               hands the decrypted connection to the HTTP server             │
 │ Hemmia server (Fastify) on 127.0.0.1:8787 ─ unchanged API + new routes       │
 │   device gate · setup · link codes · native push · engines · update check   │
 │ Ollama / LM Studio (optional) · SearXNG (optional) · mflux (Apple only)     │
 └──────────────────────────────────────────────────────────────────────────────┘
```

Key properties:

- **TLS ends on the hub, not the relay.** The hub holds the private key of its certificate
  (`<hub-id>.h.<relay-domain>`, Let's Encrypt). The relay routes by the unencrypted SNI name in
  the TLS ClientHello and forwards bytes it can't read. Browsers see a normal, valid HTTPS site.
- **The hub never listens on a public port.** It dials out to the relay. The server still
  binds loopback (or the container's interface in Docker, mapped to the host's loopback).
- **The app loads the hub's own web app** (same origin, same cookies, same version as the hub).
  The app's own code is only a shell: welcome, scan, hub list, offline screen, push, links.
- **Tailscale keeps working** exactly as today and can be used instead of, or next to, the relay.

## 2. Hostnames

| Name | Served by | Purpose |
| --- | --- | --- |
| `<hub-id>.h.<relay-domain>` | the hub (via relay passthrough) | The hub's address for browsers and apps |
| `tunnel.<relay-domain>` | relay | Hubs connect here (TLS terminated by the relay) |
| `api.<relay-domain>` | relay | Control API: hub registration, certificates, push |
| `join.<relay-domain>` | relay | Join page for invite/sign-in links; `apple-app-site-association`, `assetlinks.json` |

DNS (Cloudflare, set up in P2.0): `A`/`AAAA` for `tunnel`, `api`, `join` and the wildcard
`*.h` → relay IP. ACME creates and deletes `TXT _acme-challenge.<hub-id>.h` records itself.

## 3. Components

### 3.1 Hub (this repo: `apps/server`, `apps/web`)

Unchanged at its core. Additions (task ids in brackets):

- **Runs anywhere** [P1.1–P1.3]: container mode (`HEMMIA_CONTAINER=1`: binds `0.0.0.0` inside
  the container, never trusts `X-Forwarded-For`), platform data dirs, and a hub that starts
  with zero configured models (public builds ship `config/models.public.json`, with an empty
  chat list and the cloud catalogue).
- **Capabilities** [P1.4]: the hub detects what this machine can do (Ollama reachable, image
  engine available = macOS arm64 + `uv` + `services/imagegen`, SearXNG reachable) and the API
  reports it. The UI hides features the hub doesn't have.
- **Engines** [P1.5–P1.7]: besides Ollama, Anthropic and OpenAI: **OpenRouter** (cloud, the
  user's own key, OpenAI Chat Completions protocol) and **custom local servers** (LM Studio,
  llama.cpp, vLLM: admin-configured base URL on loopback or the private LAN, no key). Model
  pulls from the admin UI with progress [P1.8]; a recommendation catalogue by memory size
  [P1.9].
- **First-run setup** [P3.1–P3.4]: a hub without users is in setup mode. A setup code
  (printed to the console and written to `<dataDir>/setup-code.txt`; the macOS installer opens
  `http://localhost:8787/setup#<code>`) unlocks the wizard H1–H6, which creates the admin.
- **Device gate** [P3.5]: requests that come through the relay need a device cookie, which a
  device only gets by redeeming an invite, a sign-in link or a device code. Without it, only
  the app shell and the redeem endpoint answer. See SECURITY.md §3.
- **Link codes** [P3.6–P3.8]: one-time codes for "sign in this device" (from an existing
  session, carries the data key to the new session), "device only" (admin adds a device for a
  user, who then signs in) and the existing invites, all shareable as QR codes and links.
- **Relay client** [P2.9–P2.12]: identity key, registration, certificate (CSR built in-house,
  issued via the relay), tunnel connection with reconnect, TLS termination, handing
  connections to Fastify, status for the admin UI (M9).
- **Native push** [P4.4–P4.5]: device tokens registered through the relay; notifications sent
  through the relay, content-free as today.
- **Keeping awake** [P6.3]: on macOS the hub runs `caffeinate -s -w <pid>` while Connect or
  Tailscale mode is on and the machine is on AC power.
- **Update check** [P6.4, P6.7]: packaged builds check a signed update manifest once a day
  (only version, platform and channel are sent; daily counts give install statistics) and
  show admins a notice. **Automatic updates** [P6.6]: on by default for the macOS package
  (a root updater installs signed, notarized releases at night, with rollback); Docker gets a
  notice and an optional auto-update profile. **Version handshake** [P5.11] between app and
  hub; the relay refuses Connect below a minimum hub version [P2.17].

### 3.2 Relay (`apps/relay`, new workspace `@hemmia/relay`)

One Node 22 process, no dependencies beyond `zod`, `pino`, `better-sqlite3` (all approved) and
`packages/relay-protocol`. Listens on :443 only. Modules:

- `sni/`: reads the ClientHello, extracts SNI, routes (RELAY.md §3).
- `tunnel/`: accepts hub connections on `tunnel.`, authenticates them, multiplexes client
  connections as streams (RELAY.md §4).
- `api/`: HTTP server for `api.` (registration, certificates, push), signed requests
  (RELAY.md §5–§7).
- `acme/`: RFC 8555 client for its own certificate and for hubs' CSRs; `dns/cloudflare.ts`
  for TXT records (RELAY.md §6).
- `push/`: APNs (HTTP/2, token auth) and FCM HTTP v1 senders (RELAY.md §7).
- `join/`: the static join page and app-link files (RELAY.md §8).
- `cli/`: admin commands run on the VPS (`list-hubs`, `block-hub`, `unblock-hub`, `stats`).

State: SQLite in `RELAY_DATA_DIR` (hubs, certificate orders, push handles, monthly byte
counters). Push tokens are encrypted at rest with `RELAY_DATA_KEY`.

Deployment: Docker Compose on one VM (Oracle Always Free in Zurich, Ubuntu 24.04), `restart: always`, data in
a volume, nightly SQLite backup to a second volume. One instance; the protocol allows more
regions later (a hub would connect to one, `<hub-id>` DNS would point there).

### 3.3 Shared protocol (`packages/relay-protocol`, new workspace `@hemmia/relay-protocol`)

Zod schemas for every control-API body, the frame codec, request signing and verification,
hub-id derivation, link-payload parse/format. Used by both the hub and the relay, so both sides
agree by construction. Pure TypeScript, no I/O.

### 3.4 Mobile app (`apps/mobile`, new workspace `@hemmia/mobile`)

(Hub mode; phone mode in §3.4a.)

- **Shell** (bundled, React + Vite + Tailwind like `apps/web`, same look): M1 welcome, M2 get
  the hub, M3 scan / paste link, the hub list ("Switch to another hub"), M8 offline. Stores
  paired hubs (`hubHost`, display name, last reached) in Capacitor Preferences.
- **Version handshake** [P5.11]: the shell reads `https://<hubHost>/api/health` with native HTTP
  (8 s): `bridge` (the hub web app's bridge level) and `minShell` (the oldest shell it
  supports), compared with the shell's `SHELL_LEVEL` and `MIN_HUB_BRIDGE`
  (`apps/mobile/src/shell/version.ts`). Too old on either side: the shell shows "Please update
  the Hemmia app" (store link) or "<hub> needs an update" instead of opening the hub. The web
  app reads the shell level from the user agent (`HemmiaShell/<n>`) and shows "Please update
  the Hemmia app" itself when the hub was updated while the app stayed open.
- **Hub view:** after a successful check the shell
  asks the native `HubLauncher` plugin (P5.4) to restart the Capacitor bridge with
  `https://<hubHost>/` as its server URL (decided in spike P5.1, DECISIONS.md 2026-10-23:
  Capacitor on Android gives the full bridge only to the app's own origin). From then on the
  hub's own web app runs as the app origin, with its normal cookies and every plugin. "Switch
  hub", a failed load and the offline screen restart the bridge on the bundled shell.
- **Bridge** (`apps/web/src/native/bridge.ts`): the web app detects the native shell and uses
  it for push registration, QR scanning (sign in another device), share sheet and "switch hub".
  In the native shell the web app does not register its service worker or Web Push.
- **Platform:** plan A (Capacitor) per spike P5.1, with the hub loaded as the bridge's server
  URL rather than by navigation. Plan B (thin native shells) is not needed.
- **Links:** universal links / app links on `https://join.<relay-domain>/j` (opens the app if
  installed) and a custom scheme `hemmia://` (used by the join page's "Open in Hemmia" button).

### 3.4a Phone mode (`apps/mobile/src/phone/`)

See [PHONE-MODE.md](PHONE-MODE.md). It runs in the bundled shell (not on a hub origin) and is
built from two new shared workspaces:

- **`packages/providers`** (`@hemmia/providers`): the fetch-only cloud clients (Anthropic,
  OpenAI, later Chat Completions/OpenRouter), moved from `apps/server/src/llm/` and used by
  both the server and phone mode [P9.1].
- **`packages/ui`** (`@hemmia/ui`): presentational chat components and the theme, moved from
  `apps/web` and used by both the web app and phone mode [P9.2].

Storage: encrypted files via `@capacitor/filesystem`, keys in the Keychain/Keystore via an own
small `SecureStore` plugin. Optional move to a hub: `POST /api/import/phone` [P9.8].

### 3.5 Hub packaging

- **macOS** [P6.1]: signed and notarized `.pkg` for Apple silicon. Installs to
  `/Library/Application Support/Hemmia/<version>/` with a `current` symlink, a bundled Node
  22 runtime, production `node_modules`, the built web app, a LaunchAgent for the console user
  (`app.hemmia.hub`), and opens the setup URL. Data stays in
  `~/Library/Application Support/Hemmia`. Picture generation needs `uv` (the wizard explains;
  installing it is optional).
- **Docker** [P6.2]: image `ghcr.io/<org>/hemmia-hub` (multi-arch amd64/arm64), Compose file
  with optional profiles `ollama` and `searxng`. No picture generation (mflux is Apple-only).
- **Windows**: via Docker Desktop for now. A native Windows installer is not in this plan.
- **The family hub** keeps `ops/install.sh` from a git checkout (README "Repository
  strategy").

## 4. Flows

### 4.1 Setup (mockups M1, M2, H1–H6)

1. Admin installs the app, taps "I don't have Hemmia at home yet" (M1 → M2) and sends themselves the
   download link.
2. On the computer: installs the hub. The installer (or `docker compose logs`) shows
   `http://localhost:8787/setup#<setup-code>`; the macOS installer opens it.
3. H1: family name, language (machine facts from `GET /api/setup/state`). H2: admin account
   (`POST /api/setup/account` with the setup code; sets session and device cookies). H3:
   recovery code (from that response). H4: engines and models (`/api/admin/engines`,
   `/api/admin/catalog`, `/api/admin/models/pull`, cloud key form reused from Settings). H5:
   remote access (`POST /api/admin/remote` → registers with the relay, gets the certificate,
   connects; or Tailscale instructions; or not now). H6: `POST /api/links` (kind `signin`)
   → QR with the sign-in link.
4. Phone: scan (M3) → app parses the link → navigates to `https://<hubHost>/join#l~<code>` →
   web app redeems (`POST /api/links/redeem`) → device cookie + session → M4 (in the web app):
   allow notifications (native push registration), invite family.

### 4.2 Invite (M5, M6, M7)

1. Admin: Settings → Family → Invite (M5) creates an invite (existing API) and shows it as QR
   and link `https://join.<relay-domain>/j#1~<hubHost>~i~<code>`.
2. Family member taps the link: app installed → app opens (universal link) → navigates to the
   hub's `/join#i~<code>`. Not installed → join page (M6) with store buttons, "Open the invite
   in Hemmia" (`hemmia://join#…`) and "Continue on the web" (`https://<hubHost>/join#i~<code>`).
3. `/join` with an invite: the existing invite screen (M7 look), which on success also gets
   the device cookie.

### 4.3 Daily use through the relay

Phone → TLS ClientHello with SNI `<hub-id>.h.<relay-domain>` → relay finds the hub's tunnel →
`OPEN` stream with the client's IP → hub's relay client runs a TLS server on the stream with
its certificate → passes the decrypted socket to the HTTP server → device gate → normal Hemmia.
SSE replies stream through the same connection; the existing `: ping` every 15 s keeps it
alive.

### 4.4 Push

1. App gets a native token (APNs on iOS, FCM on Android) and posts it to the hub
   (`POST /api/push/native`).
2. Hub registers it at the relay (`POST /v1/push/handles`, signed) → opaque handle; stores the
   handle in `push_subscriptions` (kind `native`) tied to the session, as web subscriptions are.
3. When a reply is ready, the hub sends `POST /v1/push/send` (signed) with the handle, the
   `kind` and an opaque `ref` (the chat id encrypted with the hub's push key). The relay sends
   a localized, content-free notification via APNs/FCM.
4. Tap → app opens `https://<hubHost>/push-open#<ref>` → web app calls
   `POST /api/push/resolve` → navigates to the chat (only if it belongs to the signed-in user).

### 4.5 Certificate renewal

The hub's relay client checks daily; when less than a third of the certificate's lifetime is
left (or on any TLS key change), it sends a new CSR with the **same** key, polls the order, and
swaps the certificate in place (new connections use it; open ones continue).

## 5. Data model additions (hub)

All in new migrations (P3.5, P3.6, P2.9, P4.4). Owned by Claude.

```sql
-- P3.5: devices allowed through the gate
CREATE TABLE devices (
  id            TEXT PRIMARY KEY,           -- uuid
  user_id       TEXT REFERENCES users(id) ON DELETE CASCADE, -- null until someone signs in on it
  token_hash    BLOB NOT NULL UNIQUE,       -- SHA-256 of the device cookie value
  label         TEXT NOT NULL DEFAULT '',   -- "iPhone · Hemmia app", from the user agent
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,
  revoked_at    INTEGER
) STRICT;

-- P3.6: one-time link codes (sign-in links and device codes; invites stay in `invites`)
CREATE TABLE link_codes (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('signin', 'device')),
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash     BLOB NOT NULL UNIQUE,       -- SHA-256 of the code
  wrapped_dek   BLOB,                       -- signin only: DEK wrapped with a key from the code
  created_by    TEXT NOT NULL,              -- user id
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  used_at       INTEGER
) STRICT;

-- P4.4: push_subscriptions gets a kind and a relay handle
ALTER TABLE push_subscriptions ADD COLUMN kind TEXT NOT NULL DEFAULT 'web'
  CHECK (kind IN ('web', 'native'));
ALTER TABLE push_subscriptions ADD COLUMN relay_handle TEXT;
```

Settings (the existing `settings` table, JSON values, zod-validated):

- `setup`: `{ codeHash: string (hex), createdAt: number }`, deleted when setup completes.
- `remote`: `{ connect: boolean, hubId: string | null, registeredAt: number | null,
  relayDomain: string | null }`.
- `engines`: `{ custom: { id: string, label: string, baseUrl: string }[] }`.
- `family`: `{ name: string }` (H1).
- `pushKey`: 32-byte key (base64url) for push `ref` values, created on first use.

Files in the data dir (0600, dir 0700): `relay/identity.pem` (Ed25519 private key),
`relay/tls-key.pem` (P-256 key of the hub certificate), `relay/tls-chain.pem`,
`setup-code.txt` (only while in setup mode).

## 6. Web app additions

Routes: `/setup` (wizard H1–H6), `/join` (redeem links: invite, sign-in, device),
`/push-open` (resolve a push ref). Settings: Account → Devices (paired devices with remove,
M9 lower part), System → Remote access (M9 upper part, admins), Family → Invite (M5: QR and
share), "Sign in another device" (QR of a sign-in link). New component `QrCode` (P3.9).

Strings in English and German as everywhere else (`i18n/en.ts`, `i18n/de.ts`).

## 6a. Website (`apps/site`)

Static, prerendered, bilingual website with user guides, privacy explanations, downloads and
a press kit; served locally (`npm run site:preview`) until hosting is decided. See
[WEBSITE.md](WEBSITE.md) and [MARKETING.md](MARKETING.md) [P10].

## 7. Not in this plan

Shared family spaces and boards (needs a key-sharing design first), end-to-end certificate pinning in the app (SECURITY.md §7 residual risks), a native Windows installer, several relay regions, paid plans and billing, phone-mode
features beyond PHONE-MODE.md §2 (sync between phones, web search, tools). Each is a
later decision for the owner.
