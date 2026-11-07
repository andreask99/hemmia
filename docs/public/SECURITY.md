# Security design for the public hub, apps and relay

Extends [../SECURITY.md](../SECURITY.md), which stays valid for everything not mentioned
here (key hierarchy, sessions, uploads, documents, web search, cloud models, logging). Owned by
Claude: every task that implements a section of this document is [C].

## 1. What changes

Today the hub is reachable only on the family's tailnet. With Hemmia Connect it becomes
reachable **from the whole internet** through the relay, and its hostname appears in public
Certificate Transparency logs, so attackers can find it. Strangers will run hubs we never see,
on machines we don't control, set up by people who aren't security minded. The design answers
with three rules:

1. **Nothing reachable without a paired device.** Through the relay, a hub answers only to
   devices that redeemed a one-time code handed over in person or by the admin (§3). A guessed
   or leaked passphrase alone gets an attacker nowhere.
2. **The relay can route, not read.** TLS ends on the hub; the relay never has a hub key
   (§5). What a compromised relay *could* still do is stated plainly (§5.3).
3. **Safe defaults that need no understanding.** Loopback binding, setup only with a setup
   code, Connect off until the admin turns it on, deny-by-default outbound rules.

## 2. Attackers considered

| Attacker | Can | Must not be able to |
| --- | --- | --- |
| Internet stranger | Find the hub's hostname (CT logs), connect through the relay, send any request | Reach anything but the app shell and the redeem endpoint; guess codes; brute-force passphrases |
| Holder of a leaked invite or link | Redeem it once before the intended person | Use it after it was used or expired; use a sign-in link without it being fresh (10 min) |
| Compromised or malicious relay operator | See which hub is connected, when, from which IPs, how many bytes; drop traffic; send spam pushes to known handles | Read traffic or push content (see §5.3 for the certificate caveat) |
| Malicious hub operator | Use the relay for their own hub | Reach other hubs, push to devices registered with other hubs, exhaust the relay (quotas) |
| Thief with an unlocked phone | What the signed-in user can do | Create a sign-in link for another device without the passphrase (§4.2) |
| Family member | Their own data | Other members' data (unchanged; per-user keys) |

## 3. Device gate (hub)

Implemented in `apps/server/src/security/gate.ts` (P3.5), registered right after the Host
check in `registerSecurity`.

- **Paths** are judged percent-decoded, as the router sees them (`/%61pi/me` is an API path).
- **When it applies:** only to requests whose socket came from the relay client
  (`isViaRelay(req.socket)`, RELAY.md §4.7). Requests over Tailscale serve or from the local
  machine are not gated (Tailscale is already an authenticated network).
- **Device cookie:** `__Host-hemmia_device` (formerly `__Host-kchat_device`, still read and
  moved to the new name; see docs/SECURITY.md), 32 random bytes b64url, `HttpOnly`, `Secure`,
  `SameSite=Strict`, `Path=/`, `Max-Age` 400 days, reissued (same value) when older than 30
  days (on `http://localhost` plain `hemmia_device` without `Secure`, like the session
  cookie). Only `SHA-256(value)` is stored (`devices.token_hash`). `last_seen_at` is written at most
  once an hour.
- **Allowed without a valid device cookie** (exact list, everything else → `403
  device_required`):
  - `GET` of static files and SPA routes (the app shell: `/`, `/index.html`, `/assets/*`,
    `/manifest.webmanifest`, `/sw.js`, `/icons/*`, and any path the SPA serves `index.html`
    for);
  - `GET /api/health`, `GET /api/gate` (`{ "device": false }`);
  - `POST /api/links/redeem`;
  - `GET /api/setup/state`, `POST /api/setup/account` (these answer `404` outside setup mode).
- **Login, recovery and invite acceptance require a device** when coming through the relay:
  an attacker can't even try a passphrase without a code.
- **Devices** are created by redeeming a code (§4). A device belongs to the user who signed in
  on it last (`devices.user_id`); sessions record their device (`sessions.device_id`, new
  nullable column, `ON DELETE CASCADE`), so removing a device also ends its sessions and its
  push subscriptions.
- **Limits:** 20 devices per user (redeeming beyond that answers `409 too_many_devices`; the
  user removes one in Settings); devices not bound to a user after 24 hours are deleted; redeem
  attempts: 10 per IP per 15 minutes and 100 per hub per hour (`429` with `Retry-After`).
- **Revocation:** Settings → Account → Devices (own devices), Settings → Family (admin: any
  user's devices, labels only). Sign out everywhere also removes the user's devices except the
  current one. Sign out everywhere, a passphrase change, a recovery reset and disabling the
  account also delete the user's unused sign-in links and device codes.

## 4. One-time codes and links

All codes are 32 random bytes, b64url (43 characters), stored only as `SHA-256(code)`, looked up
by that hash, single use, and shown as a QR code and a link (RELAY.md §8 for the format). The
fragment (`#…`) carries the code, so it never reaches a server log, the relay or the join
page's server. Redeeming: `POST /api/links/redeem { kind: 'i' | 'l' | 'd', code }`.

### 4.1 Invites (`i`)

The existing invites (7 days, role and restriction fixed). Redeeming an invite **does not
consume it**: it checks that it exists, is unused and unexpired, creates an unbound device and
sets the device cookie, and answers `{ next: 'invite' }`; the web app then shows the existing
invite screen, whose accept call consumes the invite and binds the device to the new user.

### 4.2 Sign-in links (`l`)

"Sign in another device" for an existing user (H6 during setup, Settings later).

- Created by `POST /api/links { kind: 'signin', password? }` from a signed-in session. The
  passphrase is **required unless the session is younger than 15 minutes** (true for H6 right
  after setup); it is checked with the normal Argon2 path and its own rate limit.
- The new session needs the user's data key. The hub wraps it for the link:
  `LK = HKDF-SHA256(code, salt = "kchat-link-v1", info = "link-dek:<link id>")`,
  `link_codes.wrapped_dek = AEAD(LK, DEK, aad "wrap|<user>|link-<link id>")`. Without the code
  nobody (not even the hub at rest) can unwrap it.
- Lifetime 10 minutes; at most 3 unused links per user (creating a 4th deletes the oldest).
- Redeeming unwraps the DEK, creates a session (`insertSession` as at login), creates and binds
  a device, sets both cookies, marks the link used and wipes key material. Audit:
  `link_created`, `link_redeemed`.

### 4.3 Device codes (`d`)

For a user who has their passphrase but no device (new phone, browser through the relay).
Created by the user for themselves or by an admin for any user (`POST /api/links { kind:
'device', userId? }`), 24 hours, no key material. Redeeming creates a device bound to that user
and sets the device cookie; the person then signs in normally (or recovers with their recovery
code). Gives no access to data by itself.

## 5. Relay

### 5.1 What the relay sees and stores

- Per hub: public key, hub id, creation time, truncated creating IP, last connect time,
  monthly byte count, push handles (tokens encrypted at rest), pending certificate orders.
- Per connection, in memory only: client IP, SNI (always a hub host or a relay host), byte
  counts. Logs as in RELAY.md §10 (truncated IPs, no tokens).
- It never sees: TLS keys of hubs, request contents, cookies, passphrases, chat ids (push `ref`
  is encrypted by the hub), message text.

### 5.2 Hardening

- One process, no shell-outs, no dependencies beyond the approved ones; runs as a non-root
  user in its container with `CAP_NET_BIND_SERVICE` only, read-only root filesystem, data in
  one volume.
- Every input from the network is length-bounded and schema-validated before use (ClientHello
  parser, frames, API bodies). The ClientHello parser and frame decoder get fuzz-style tests
  (random and truncated inputs must never throw outside the defined error results).
- Secrets (`CLOUDFLARE_API_TOKEN` scoped to DNS edit of the one zone, APNs key, FCM service
  account, `RELAY_DATA_KEY`) come from files with mode 0600 or the Compose `env_file`, never
  from the image.
- VPS: SSH keys only, `ufw` allowing 22 (owner's IPs if fixed, else all) and 443, unattended
  security upgrades on.
- The hub zone is `h.hemmia.app`, on the website's domain to save cost (owner, 2026-11-07;
  a separate registered domain was the plan before). Safeguards: hubs never directly under
  `hemmia.app`; `h.hemmia.app` on the Public Suffix List; an answered abuse contact and the
  relay's per-hub switch-off. Accepted: an abuse report or blocklisting against one hub can hit
  the whole domain, website and email included (DECISIONS.md 2026-11-07).

### 5.3 Residual risk: the relay controls DNS for the hub zone

Whoever controls the relay (or its Cloudflare token) can obtain a valid certificate for any
`<hub-id>.h.<relay-domain>` and could then intercept connections to that hub as a
man-in-the-middle, seeing passphrases and content of users connecting during the attack. This
is the same trust users place in any hosted service's TLS. With one domain (§5.2) the token can also change
the website's and mail's records, so a compromised relay could redirect the website too.
Mitigations in this plan: the token is scoped to one zone; every issued certificate appears in public CT logs; the docs state the
trust plainly and offer Tailscale for those who don't want it. Planned later (not in this
plan): the hub watches CT logs for certificates it didn't request and warns the admin; the
native app pins the hub's TLS public key learned at pairing.

### 5.4 Abuse of the relay

Anyone can register a hub. The relay limits what one hub can cost (quotas, RELAY.md §9) and the
owner can block a hub (`block-hub`). The join page names an abuse contact address (P5.9). A
blocked hub's tunnel and certificate orders are refused; its existing certificate stays valid
until it expires, but traffic can no longer reach it.

## 6. Hub additions

### 6.1 Setup mode

- The hub is in setup mode exactly while the `users` table is empty.
- On startup in setup mode, if there is no setup code or it is older than 24 hours, the hub
  creates one: 20 characters of the recovery-code alphabet (100 bits), stores
  `{ codeHash, createdAt }` in `settings.setup`, writes it to `<dataDir>/setup-code.txt`
  (0600) and prints one line to **stderr** (not pino):
  `Hemmia setup: open http://localhost:8787/setup#<code>` (plus the relay URL when Connect is
  already on, §6.4). This is the only place a secret is ever printed, by design.
- `POST /api/setup/account { setupCode, username, password, familyName, lang }`: compares
  `SHA-256(code)` in constant time, applies the login rate limits, validates the account like
  an invite acceptance, creates the first admin (`auth.createFirstAdmin`), deletes the setup
  code and file, sets session and device cookies, audits `setup_completed`, returns
  `{ recoveryCode }`. Any request after setup → `404`.

### 6.2 Identity and certificate keys

`<dataDir>/relay/identity.pem` (Ed25519) and `relay/tls-key.pem` (P-256) are created with mode
0600 in a 0700 directory, never logged, never sent anywhere. They are not encrypted with user
keys because the hub needs them unattended (like the VAPID key today). Backups of the data dir
include them; restoring keeps the hub's address. "Forget this address" (M9) deletes them after
`DELETE /v1/hubs/self`.

### 6.3 Engines

- **OpenRouter:** fixed base `https://openrouter.ai/api/v1`, the user's own key (same storage
  and rules as Anthropic/OpenAI keys: encrypted under the user's DEK, key check by `GET
  /models`, family cloud switch, monthly cap). Added to the outbound list in
  `../SECURITY.md`.
- **Custom local servers** (LM Studio, llama.cpp, vLLM): admin sets a base URL. Allowed only
  when the host resolves exclusively to loopback (`127.0.0.0/8`, `::1`) or private addresses
  (`10/8`, `172.16/12`, `192.168/16`, `fc00::/7`); `http` or `https`; no credentials in the
  URL; no redirects. Checked on save and on every connection with the resolved address pinned
  (the inverse of `webfetch.ts`'s public-only rule, same mechanism). No API key in this plan.
  They are local engines: never counted as "cloud", never subject to the cloud switch.

### 6.4 Container mode and first-start Connect

- `HEMMIA_CONTAINER=1` allows `HEMMIA_HOST=0.0.0.0` (still refused otherwise) and turns off
  `X-Forwarded-For` trust entirely. The Compose file maps the port to `127.0.0.1` only.
- `HEMMIA_CONNECT=1` (for headless machines) turns Connect on at first start, before an admin
  exists, so setup can be done through `https://<hub-id>.h.<relay-domain>/setup#<code>`. The
  setup code still protects it; the device gate allows only the setup routes.

### 6.5 Update check

Packaged builds only (`HEMMIA_UPDATE_CHECK=1`, set by the macOS package and the Docker image):
once a day `GET https://api.<relay-domain>/v1/manifest?v=<version>&p=<mac|docker>&c=<channel>`
(no redirects, 10 s, reading stops past 64 KiB). The answer is the signed update manifest
(P6.7, `packages/relay-protocol/src/manifest.ts`): Ed25519 over `"hemmia-manifest-v1\n"` +
the payload bytes, checked against the public key built into the hub before anything in it is
used; a manifest older than the last one seen is ignored (no rollback by replay). Admins see
"Update available" with the release notes link, and a warning when this version is below the
manifest's minimum safe version. Nothing is downloaded or run (automatic updates: P6.6).

What the request tells us: the version, platform and channel. The relay counts checks per
day, version, platform and channel (`install-stats`); the client address is used only in
memory to count one address at most three times a day and is never stored or logged.
Turning the update check off stops both. The signing key is on the owner's Mac
(`~/.config/hemmia/manifest-signing-key.pem`, 0600) until CI signs releases (P8.4); losing it
means hubs need a release with a new public key, so it is backed up offline by the owner.

## 7. Native app

- The web view never navigates to another site: it shows either the bundled shell or one
  paired hub loaded as the bridge's server URL (HubLauncher, P5.1/P5.4), and every link to
  another origin opens in the system browser. There is no `allowNavigation`, because iOS
  injects the bridge into any main-frame page the web view shows (found in P7.1). Which hosts
  can be hubs (`*.h.<relay-domain>`, `*.ts.net`, dev hosts) is HubLauncher's own config.
- The bridge (push token, QR scan, share, switch hub) answers only on the origin of a hub the
  user paired (checked natively against the stored hub list, not by the page). The app starts
  its bridge with the chosen hub as server URL (P5.1); since iOS injects the bridge into every
  main-frame page, `HubLauncher` and the app's own plugins also check natively that the
  calling page's origin is the current hub, so a hub page navigating to another allowed host
  (another tailnet name) does not get the bridge.
- No code is downloaded besides what the paired hub serves; the hub's web app is the same code
  the browser runs, with the same CSP.
- Cookies stay in the app's own web view store (not shared with Safari/Chrome).
- Screens with a recovery code or a QR of a sign-in link set `FLAG_SECURE` on Android and hide
  content in the iOS app switcher snapshot (P5.6).

### 7.1 Phone mode

Design in [PHONE-MODE.md](PHONE-MODE.md) §5–§7. Rules:

- **No server of ours.** Phone mode makes requests only to the provider origins in
  `CLOUD_ORIGINS` (`https://api.anthropic.com`, `https://api.openai.com`). The shell's CSP:
  `default-src 'self'; connect-src 'self' https://api.anthropic.com https://api.openai.com
  https://*.h.<relay-domain> https://*.ts.net; img-src 'self' blob: data:; script-src 'self';
  style-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'`. (It is set in a
  `<meta>` tag, which can't carry `frame-ancestors`; the shell is never framed.)
- **Keys** only in the Keychain/Keystore (`SecureStore`), which answers only the bundled shell:
  on both platforms the plugin checks natively that the page in the web view is the shell's own
  origin (and no hub is loaded). API keys device-only and not in backups; read per request, never in React state, files, logs or crash reports; shown
  masked.
- **Chats and photos** encrypted at rest with AES-256-GCM (WebCrypto), data key in
  `SecureStore`, AAD bound to the file path. iOS data protection applies on top.
- **Rendering** uses the same Markdown component as the web app: no raw HTML, links open in
  the system browser, images in replies only as `data:`/`blob:` from the phone's own store
  (no remote images, which would leak the user's IP to arbitrary hosts).
- **Export files are unencrypted by design** and say so; import validates with zod and never
  overwrites existing chats.
- **Bridge:** the shell stages its export in `HubLauncher.stagePhoneExport` (shell only, for one
  saved hub) and opens `/import#phone~<token>`; `HubLauncher.takePhoneExport` answers only on that
  hub's page, once, within 5 minutes, with a constant-time token check. The export is held in
  memory only.
- `POST /api/import/phone` on the hub: signed-in user only, body limit 200 MB, zod schema,
  every photo through the normal upload validation, rate limit 3 per hour per user, audit event
  `phone_import` (counts only).
- Residual risk: a malicious or compromised provider sees what the user sends (as with any
  cloud model); a jailbroken/rooted phone can read the keys. Stated on the privacy page.

## 8. Logging additions

Never log: setup codes, link codes, device cookies, hub identity or TLS keys, CSRs, push
handles, push refs, relay signatures. Add to `LOG_REDACT_PATHS`: `setupCode`, `code`, `csr`,
`handle`, `ref`, `*.setupCode`, `*.code`, `*.csr`, `*.handle`, `*.ref`. Audit events added:
`setup_completed`, `link_created`, `link_redeemed`, `device_added`, `device_removed`,
`remote_enabled`, `remote_disabled`, `phone_import`.

## 9. Review gates

Claude reviews before each merge of: anything in `security/`, the relay, the tunnel client,
`relay-protocol`, migrations, setup, gate, links, push changes, the mobile bridge, phone mode (`SecureStore`, `store.ts`, `keys.ts`, the import route). Tests that
must exist before Connect is offered to anyone outside the family (P2.15):

- Gate: every route not on the allow list returns 403 via a relay socket and works over
  loopback; the allow list is exactly as in §3.
- Links: expired, used, wrong-kind and malformed codes all fail the same way; a sign-in link
  can't be redeemed twice even concurrently; the DEK never appears in the database unwrapped.
- Setup: wrong code, second setup after the first, setup with users present.
- Relay: fuzzed ClientHello and frames; stream window violations; a hub can't push to another
  hub's handle; replayed signed requests are refused; blocked hub can't connect.
- End to end (P2.14): browser-like client → relay → hub with a test CA; the relay process
  never has the hub's key (asserted by reading the relay's data dir in the test).

### Pre-launch checklist (public)

- [ ] External review of the relay and tunnel code by a second model run (`/code-review max`)
      and the owner's sign-off.
- [ ] Relay VPS hardened as in §5.2; secrets only in 0600 files.
- [ ] Public Suffix List entry for the hub zone requested.
- [ ] Privacy policy and imprint published (join page, app stores).
- [x] Docs state the relay trust (§5.3) and offer Tailscale as the alternative (website
      privacy page, P10.3; published with the website).
- [ ] Abuse contact works.
