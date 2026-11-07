# Relay service and protocols

The relay ("Hemmia Connect") makes a hub reachable at `https://<hub-id>.h.<relay-domain>`,
issues the hub's certificate, delivers native push notifications and serves the join page. It
**never holds a hub's TLS key** and can't read traffic between apps and hubs. Security
reasoning is in [SECURITY.md](SECURITY.md) §5; this document is the exact specification. All
schemas named here live in `packages/relay-protocol/src/` (task P2.1) and are the single
source of truth; if this text and the schemas disagree, fix the text.

Conventions: all integers big-endian; `b64url` = base64url without padding; times are Unix
seconds unless named `…Ms`; JSON bodies are UTF-8 and at most 16 KiB unless stated; every
error body is `{ "error": { "code": "<code>" } }` (as in the hub).

## 1. Constants

| Name | Value |
| --- | --- |
| Hub zone | `h.<relay-domain>` |
| Relay hosts | `api.<relay-domain>`, `tunnel.<relay-domain>`, `join.<relay-domain>` |
| Hub id alphabet | `0123456789abcdefghjkmnpqrstvwxyz` (Crockford base32, lower case) |
| Hub id length | 12 characters (60 bits) |
| Hub host pattern | `^[0-9a-hjkmnp-tv-z]{12}\.h\.<relay-domain>$` |
| Protocol version | `1` (in every handshake and signed string) |
| Clock skew allowed | ±300 s |

## 2. Hub identity

- Each hub generates an **Ed25519** key pair once (`crypto.generateKeyPairSync('ed25519')`)
  and stores the private key as PKCS#8 PEM in `<dataDir>/relay/identity.pem` (0600). It never
  leaves the hub. Losing it means re-registering under a new hub id (the hub's address
  changes; the app's saved hubs need re-pairing).
- `publicKeyRaw` = the 32 bytes of the JWK `x` member (`key.export({ format: 'jwk' }).x`,
  b64url-decoded).
- **Hub id** = SHA-256(`publicKeyRaw`), take the first 60 bits, encode as 12 base32 characters
  (5 bits each, most significant first) with the alphabet above. Function
  `hubIdFromPublicKey(raw: Uint8Array): string` in `relay-protocol/src/identity.ts`; test
  vector generated in P2.1 and fixed in the test file.

## 3. SNI router (relay, port 443)

For each accepted TCP connection:

1. Read until a complete ClientHello is available: TLS records of type `0x16` (handshake),
   record version `0x03 0x01`–`0x03 0x04`, record length ≤ 16384; concatenate record payloads
   until the handshake message (type `0x01`, 24-bit length) is complete. Limits: 16 KiB total,
   5 s. Anything else (other record type, malformed lengths, timeout) → destroy the socket.
2. Parse the ClientHello: skip legacy version (2), random (32), session id (u8 length), cipher
   suites (u16 length), compression methods (u8 length); walk extensions (u16 type, u16
   length) within the u16 extensions length; the `server_name` extension (type 0) holds a u16
   list length and entries of name type (u8, must be 0) + u16 length + name. Take the first
   host name entry. Bounds-check every length against the remaining bytes.
3. Normalize: lower-case ASCII; must match `^[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})*$` and be at
   most 253 characters. Otherwise destroy.
4. Route:
   - `api.`, `tunnel.`, `join.<relay-domain>` → push the buffered bytes back
     (`socket.unshift(buf)`) and hand the socket to the relay's own TLS server
     (`tlsServer.emit('connection', socket)`), which serves the matching module by SNI.
   - matches the hub host pattern → §4.6 (forward into that hub's tunnel).
   - anything else → destroy.
5. Per client IP: at most 64 concurrent connections and 120 new connections per minute
   (in-memory counters); over the limit → destroy.

The parser is `relay-protocol/src/clienthello.ts` (`parseClientHelloSni(buf): { sni: string } |
{ need: number } | { error: string }`) so it can be fuzz-tested without sockets. Encrypted
Client Hello: hub hosts publish no ECH configuration, so clients send the real SNI.

## 4. Tunnel protocol (hub ↔ `tunnel.<relay-domain>`)

The hub opens a TLS connection to `tunnel.<relay-domain>:443` (normal certificate checks
against the system roots), ALPN `kchat-tunnel/1`. Inside it, both sides exchange **frames**.

### 4.1 Frame format

```
+--------+------------------+------------------+----------------------+
| type   | stream id        | length           | payload              |
| 1 byte | 4 bytes (u32 BE) | 4 bytes (u32 BE) | `length` bytes       |
+--------+------------------+------------------+----------------------+
```

- Stream id `0` is the connection itself; streams are numbered from 1 by the relay,
  increasing, never reused on one connection.
- Maximum payload: 32768 bytes for `DATA`, 4096 bytes for every other type. A frame over the
  limit, an unknown type, or a frame on the wrong stream id → the receiver closes the whole
  connection (relay: destroy; hub: reconnect per §4.5).
- JSON payloads are validated with the zod schema of that frame type.

### 4.2 Frame types

| Type | Name | Dir | Stream | Payload |
| --- | --- | --- | --- | --- |
| `0x01` | CHALLENGE | relay → hub | 0 | `{ v: 1, nonce: b64url(32 bytes) }` |
| `0x02` | AUTH | hub → relay | 0 | `{ v: 1, hubId, sig: b64url, agent: string ≤ 64 }` |
| `0x03` | READY | relay → hub | 0 | `{ v: 1, hostname, maxStreams: 256, initialWindow: 262144, pingSeconds: 25 }` |
| `0x04` | ERROR | relay → hub | 0 | `{ code: 'unknown_hub' \| 'blocked' \| 'bad_signature' \| 'bad_version' \| 'timeout' \| 'outdated' }`, then close |
| `0x05` | GOAWAY | relay → hub | 0 | `{ reason: 'shutdown' \| 'replaced' }`, then close |
| `0x06` | PING | both | 0 | 8 opaque bytes |
| `0x07` | PONG | both | 0 | the 8 bytes of the PING |
| `0x10` | OPEN | relay → hub | n | `{ clientIp: string, sni: string }` |
| `0x11` | DATA | both | n | raw bytes (1–32768) |
| `0x12` | WINDOW | both | n | u32 increment (4 bytes, 1 … 2^31−1) |
| `0x13` | FIN | both | n | empty: the sender sends no more DATA on n |
| `0x14` | RESET | both | n | `{ code: 'refused' \| 'timeout' \| 'error' \| 'quota' }`: n ends in both directions |

### 4.3 Handshake

1. After TLS, the relay sends CHALLENGE. The hub must answer within 10 s.
2. The hub signs the UTF-8 string
   `kchat-tunnel-v1\n<hubId>\ntunnel.<relay-domain>\n<nonce>` with its Ed25519 key
   (`crypto.sign(null, data, privateKey)`) and sends AUTH.
3. The relay looks up the hub (§5.2) and verifies the signature with the stored public key.
   Unknown → ERROR `unknown_hub`; blocked → `blocked`; bad signature → `bad_signature`;
   `v` ≠ 1 → `bad_version`; a hub below the minimum version → `outdated` (P2.17: the AUTH
   `agent` is `hemmia-hub/<x.y.z>`; hubs that send no version count as below any minimum; no
   minimum is set by default). The hub doesn't retry `outdated` and tells its admin.
4. Success → READY. If the hub already had a tunnel, the old one gets GOAWAY `replaced` and its
   streams are reset. Exactly one tunnel per hub.

### 4.4 Streams and flow control

- A stream exists from OPEN until both sides sent FIN, or either sent RESET.
- Each side may have at most `initialWindow` bytes of DATA unacknowledged per stream. The
  receiver sends WINDOW with the number of bytes it has consumed once that is at least half of
  `initialWindow`. Sending beyond the window → the receiver sends RESET `error` for that
  stream.
- The relay stops reading the client's socket while the stream's send window is exhausted and
  resumes on WINDOW. The hub does the same with its local TLS socket. (TCP back-pressure
  covers the tunnel connection as a whole.)
- The hub answers OPEN beyond `maxStreams` open streams with RESET `refused`.
- A stream with no DATA in either direction for 10 minutes → RESET `timeout` (the hub's SSE
  `: ping` every 15 s keeps live replies open).

### 4.5 Liveness and reconnect

- Each side sends PING every `pingSeconds` (25 s); no frame received for 60 s → close.
- The hub reconnects after any close: delays 1, 2, 4, 8, 16, 32, 60 s (then 60 s), each with
  ±20 % jitter; reset to 1 s after a READY that lasted more than 60 s. After GOAWAY `shutdown`
  it reconnects after 1–5 s (random). After ERROR `blocked` or `unknown_hub` it stops and
  reports the state to the admin UI (no retry until the admin acts).

### 4.6 Client connections (relay side)

On a client connection routed to hub `<hub-id>` (§3 step 4):

1. No tunnel for that hub, or the hub's monthly quota (§9) is used up → destroy the client
   socket.
2. Otherwise allocate a stream id, send OPEN `{ clientIp, sni }` (`clientIp` = the socket's
   remote address, IPv4-mapped IPv6 converted to IPv4), then DATA with the buffered ClientHello
   bytes, then pipe both ways with flow control.
3. Client socket ends → FIN; client socket error → RESET `error`. Stream FIN from the hub →
   `socket.end()`; RESET → `socket.destroy()`.
4. Count DATA payload bytes in both directions against the hub's month (§9).

### 4.7 Hub side

For each OPEN:

1. Validate `clientIp` with `net.isIP`; if invalid, loopback, unspecified or link-local, use
   `192.0.2.1` (a documentation address, so such clients share one rate-limit bucket).
2. Create a `Duplex` for the stream (writes → DATA frames within the window; FIN/RESET mapped
   as above).
3. Wrap it in `new tls.TLSSocket(duplex, { isServer: true, secureContext })` with the hub's
   certificate and key, `minVersion: 'TLSv1.2'`, ALPN `http/1.1`.
4. Mark the socket as "via relay" in a module-level `WeakSet` and set its client address with
   `Object.defineProperty(tlsSocket, 'remoteAddress', { value: clientIp })`.
5. `fastify.server.emit('connection', tlsSocket)`. Fastify's `req.ip` is then the client's
   address (it is not loopback, so `X-Forwarded-For` is ignored), and the device gate
   (SECURITY.md §3) recognizes the request as coming through the relay with
   `isViaRelay(req.socket)`.

## 5. Control API (`https://api.<relay-domain>`)

HTTP/1.1 over TLS (relay's own certificate), JSON in and out, body limit 16 KiB, every
response `Cache-Control: no-store`. Unknown routes → 404 `not_found`.

### 5.1 Signed requests

Hub requests (all except registration) carry:

```
X-Kchat-Hub: <hubId>
X-Kchat-Time: <unix seconds>
X-Kchat-Signature: b64url(Ed25519 signature)
```

over the UTF-8 string

```
kchat-api-v1\n<METHOD>\n<path with query>\napi.<relay-domain>\n<time>\n<hex SHA-256 of the raw body bytes>
```

The relay rejects (401 `bad_signature`) when the hub is unknown, the time is more than 300 s
off, the signature is wrong, or the same signature was seen in the last 600 s (in-memory
replay cache). Ed25519 signatures are deterministic, so a client never sends the same request
(method, path, body) twice within one second; it waits for the next second instead (polling
an order, for example). Blocked hubs get 403 `blocked` on every signed route. Implementation:
`signRequest()` / `verifyRequest()` in `relay-protocol/src/signing.ts`, shared by both sides.

### 5.2 Hubs

`POST /v1/hubs` — register (unsigned, but proves key possession)

```json
{ "publicKey": "<b64url 32 bytes>", "time": 1792330000, "proof": "<b64url sig>" }
```

`proof` signs `kchat-register-v1\n<publicKey>\n<time>`. Responses: `201` (new) or `200`
(already registered with this key) with
`{ "hubId": "…", "hostname": "<hub-id>.h.<relay-domain>", "tunnelHost": "tunnel.…", "apiHost": "api.…" }`;
`403 blocked`; `409 hub_id_taken` (60-bit collision with another key: practically never; the
hub then generates a new key and retries once); `429 rate_limited` (per client IP: 5
registrations per 24 h; all IPs: 1000 per 24 h).

`GET /v1/hubs/self` (signed) → `{ hubId, hostname, connected: boolean, quota: { month:
"2026-10", bytes: number, limitBytes: number }, blocked: false }`.

`DELETE /v1/hubs/self` (signed) → `204`; deletes the hub, its push handles and orders, closes
its tunnel. (Used by "Turn off Connect and forget this address".)

Relay table:

```sql
CREATE TABLE hubs (
  id               TEXT PRIMARY KEY,
  public_key       BLOB NOT NULL UNIQUE,
  created_at       INTEGER NOT NULL,
  created_ip       TEXT NOT NULL,          -- truncated: IPv4 /24, IPv6 /48
  last_connected_at INTEGER,
  blocked_at       INTEGER,
  blocked_reason   TEXT
) STRICT;
CREATE TABLE usage (hub_id TEXT NOT NULL, month TEXT NOT NULL, bytes INTEGER NOT NULL,
                    PRIMARY KEY (hub_id, month)) STRICT;
```

### 5.3 Certificates

`POST /v1/hubs/self/certificate` (signed)

```json
{ "csr": "<b64url DER PKCS#10, ≤ 4096 bytes>" }
```

→ `202 { "orderId": "<uuid>" }`; `409 order_pending` (one pending order per hub);
`429 rate_limited` (5 orders per hub per 7 days, 300 per relay per 3 h).

`GET /v1/hubs/self/certificate/:orderId` (signed) →
`{ "status": "pending" }` | `{ "status": "ready", "chainPem": "…" }` |
`{ "status": "failed", "code": "csr_rejected" | "dns_failed" | "acme_failed" | "timeout" }`.
Orders are kept 7 days, then deleted.

The relay doesn't need to parse the CSR: it creates the ACME order for exactly
`<hub-id>.h.<relay-domain>`, and the CA refuses a CSR whose names differ
(`csr_rejected`). The hub builds the CSR itself (P2.10): ECDSA P-256 key, subject
`CN=<hostname>`, `subjectAltName` = that DNS name only, signed with SHA-256.

## 6. ACME and DNS (relay)

RFC 8555 client in `apps/relay/src/acme/`, built on `fetch` and `node:crypto` only.

- Directory: `RELAY_ACME_DIRECTORY` (production
  `https://acme-v02.api.letsencrypt.org/directory`; staging
  `https://acme-staging-v02.api.letsencrypt.org/directory` until P2.15).
- Account key: ECDSA P-256 in `<RELAY_DATA_DIR>/acme/account.pem`, created on first start;
  account created with `contact: ["mailto:<RELAY_ACME_EMAIL>"]` if set (optional, 2026-11-07),
  `termsOfServiceAgreed: true`; the account URL is stored next to it.
- JWS: flattened JSON, `alg: "ES256"`, signature in IEEE P1363 form
  (`crypto.sign('sha256', data, { key, dsaEncoding: 'ieee-p1363' })`), `jwk` for newAccount,
  `kid` otherwise, fresh `nonce` from the previous response's `Replay-Nonce` (or `newNonce`).
  On `urn:ietf:params:acme:error:badNonce` retry once with the nonce from that response.
  POST-as-GET for every read.
- Order flow: `newOrder` → for each authorization: pick the `dns-01` challenge, compute
  `b64url(SHA-256(token + "." + b64url(SHA-256(JWK thumbprint))))` (thumbprint per RFC 7638
  over `{"crv","kty","x","y"}` in that order), create the TXT record
  `_acme-challenge.<name>` with that value (TTL 60), wait until **both** of the zone's
  authoritative name servers return it (`dns.Resolver` with `setServers` = the NS addresses,
  resolved at startup; poll every 2 s, at most 90 s), POST `{}` to the challenge URL, poll the
  authorization every 2 s (at most 120 s) until `valid` (→ next) or `invalid` (→ fail
  `acme_failed`). Then `finalize` with the CSR, poll the order every 2 s until `valid`,
  download the certificate (`Accept: application/pem-certificate-chain`). Always delete the
  TXT record afterwards (also on failure).
- At most 3 orders run at once; the rest queue (FIFO). Each order has an overall timeout of
  5 minutes (`timeout`).
- **The relay's own certificate** covers `api.`, `tunnel.` and `join.<relay-domain>` (one
  order, three authorizations, key in `<RELAY_DATA_DIR>/tls/relay-key.pem`). Obtained on first
  start before listening, renewed when less than a third of its lifetime is left (checked every
  12 h); the TLS server's `SecureContext` is swapped in place (`server.setSecureContext`).
- DNS: `apps/relay/src/dns/cloudflare.ts` implements
  `interface DnsProvider { setTxt(name, value): Promise<string /* record id */>; deleteTxt(id): Promise<void> }`
  with `POST /client/v4/zones/<CLOUDFLARE_ZONE_ID>/dns_records` (`type: "TXT"`, `ttl: 60`) and
  `DELETE …/dns_records/<id>`, `Authorization: Bearer <CLOUDFLARE_API_TOKEN>`. A
  `FakeDnsProvider` and a fake ACME server back the tests (P2.6).
- CA rate limits: Let's Encrypt allows about 50 new certificates per registered domain per
  week. That is enough for the beta. Before the public launch the hub zone `h.<relay-domain>`
  is submitted to the Public Suffix List (P2.0, [U]), after which each hub counts on its own.

## 7. Push

### 7.1 Handles

`POST /v1/push/handles` (signed)

```json
{ "platform": "ios", "token": "<APNs token, hex 64–200>", "env": "production", "appId": "<bundle-id>" }
{ "platform": "android", "token": "<FCM token, [A-Za-z0-9_:-]{1,4096}>", "appId": "<bundle-id>" }
```

→ `201 { "handle": "<b64url 32 random bytes>" }`; `400 bad_app` (appId isn't the configured
app); `409 too_many` (50 handles per hub). The relay stores `SHA-256(handle)` → hub id,
platform, env, token encrypted with `RELAY_DATA_KEY` (AES-256-GCM, AAD
`push|<hubId>|<handle hash hex>`), `created_at`, `last_used_at`. Handles unused for 90 days
are deleted.

`DELETE /v1/push/handles/:handle` (signed) → `204` (also when unknown).

### 7.2 Send

`POST /v1/push/send` (signed)

```json
{ "handle": "…", "kind": "reply", "ref": "<b64url ≤ 200 chars>" }
```

`kind` ∈ `reply`, `image`, `daily`, `week`, `evening`, `maintenance_ok`,
`maintenance_failed`. → `202` (handed to Apple/Google), `404 unknown_handle` (also when the
handle belongs to another hub), `410 gone` (the provider says the token is dead; the relay
deleted the handle; the hub deletes its subscription), `429 rate_limited` (per hub 2000 per
day; per handle 60 per hour), `502 provider_error`.

- **APNs** (iOS): HTTP/2 session to `https://api.push.apple.com` (env `sandbox`:
  `https://api.sandbox.push.apple.com`), `POST /3/device/<token>`, headers
  `authorization: bearer <JWT>`, `apns-topic: <bundle-id>`, `apns-push-type: alert`,
  `apns-priority: 10`, `apns-expiration: <now + 86400>`, `apns-collapse-id: <kind>`. JWT:
  header `{ alg: "ES256", kid: APNS_KEY_ID }`, claims `{ iss: APNS_TEAM_ID, iat }`, signed with
  the `.p8` key (P1363), reused for 50 minutes. Body:
  `{ "aps": { "alert": { "title-loc-key": "push_<kind>_title", "loc-key": "push_<kind>_body" }, "sound": "default", "thread-id": "<hubId>" }, "k": "<kind>", "r": "<ref>", "h": "<hub hostname>" }`.
  `410`, or `400` with reason `BadDeviceToken` / `DeviceTokenNotForTopic` → gone. `5xx` →
  one retry after 2 s, then `502`.
- **FCM** (Android): OAuth access token from the service account (JWT RS256, claims
  `{ iss: client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600 }`,
  exchanged at `https://oauth2.googleapis.com/token` with
  `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`), cached until 5 minutes before
  expiry. `POST https://fcm.googleapis.com/v1/projects/<FCM_PROJECT_ID>/messages:send` with
  `{ "message": { "token": "…", "data": { "k": "<kind>", "r": "<ref>", "h": "<hub hostname>" }, "android": { "priority": "HIGH", "ttl": "86400s", "collapse_key": "<kind>", "notification": { "title_loc_key": "push_<kind>_title", "body_loc_key": "push_<kind>_body", "channel_id": "replies", "tag": "<kind>" } } } }`.
  `404` or error status `UNREGISTERED`, or `INVALID_ARGUMENT` naming the token → gone.
- The texts for the `push_*` keys live in the app (iOS `Localizable.strings`, Android
  `strings.xml`, English and German), copied from the service worker's texts in
  `apps/web/public/sw.js`.
- Neither Apple nor Google nor the relay sees a chat id: `ref` is
  `b64url(AES-256-GCM(hub pushKey, chatId))` (hub-side, P4.4), opaque to everyone else.

## 8. Join page and app links (`https://join.<relay-domain>`)

Static files from `apps/relay/static/join/`, served by the relay's `join` module:

| Path | Content |
| --- | --- |
| `/`, `/j` | `join.html` (the M6 screen) |
| `/join.js`, `/join.css`, `/icon.svg` | its assets |
| `/.well-known/apple-app-site-association` | `{"applinks":{"details":[{"appIDs":["<TEAM_ID>.<bundle-id>"],"components":[{"/":"/j*"}]}]}}`, `Content-Type: application/json` |
| `/.well-known/assetlinks.json` | `[{"relation":["delegate_permission/common.handle_all_urls"],"target":{"namespace":"android_app","package_name":"<bundle-id>","sha256_cert_fingerprints":["<ANDROID_CERT_SHA256>"]}}]` |

Headers: CSP `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self';
base-uri 'none'; form-action 'none'; frame-ancestors 'none'`, `Referrer-Policy: no-referrer`,
`X-Content-Type-Options: nosniff`, HSTS. No cookies, no analytics, no logging of paths
(fragments never reach the server anyway).

**Link payload** (`relay-protocol/src/links.ts`, used by the hub, the join page's copy of the
parser, the app and the web app):

- Shared link / QR: `https://join.<relay-domain>/j#1~<hubHost>~<kind>~<code>`
- Direct (hub without Connect, e.g. Tailscale only): `https://<hubHost>/join#<kind>~<code>`
- `kind`: `i` invite, `l` sign-in link, `d` device code. `code`: b64url of 32 bytes
  (43 characters).
- `hubHost` must match the hub host pattern (§1) or end in `.ts.net`, with the hostname rules
  of §3 step 3. Anything else → "This link isn't valid" (the join page never redirects to
  other hosts).

`join.js`: parses `location.hash`; shows M6 with "Download on the App Store" / "Get it on
Google Play" (by user agent; both on desktop), "Open in Hemmia" (`hemmia://join#<payload>`) and
"Continue on the web" (`https://<hubHost>/join#<kind>~<code>`). Texts in English or German by
`navigator.language`.

## 9. Limits and quotas

| What | Limit |
| --- | --- |
| Client connections per client IP | 64 concurrent, 120 new per minute |
| Streams per hub tunnel | 256 |
| Stream window | 256 KiB |
| Hub registrations | 5 per IP per 24 h, 1000 per relay per 24 h |
| Certificate orders | 1 pending per hub, 5 per hub per 7 days, 300 per relay per 3 h |
| Push | 50 handles per hub, 2000 sends per hub per day, 60 per handle per hour |
| Relayed traffic | 20 GiB per hub per calendar month (UTC), `RELAY_MONTHLY_GIB`; the whole relay at most 3 TB a month (host cap, P2.8) |
| Control API body | 16 KiB |

## 10. Logging and retention (relay)

Logged (pino, JSON): tunnel connect/disconnect (hub id, duration), stream close (hub id,
bytes in/out, duration, client IP truncated to /24 or /48), registrations (hub id, truncated
IP), certificate orders (hub id, outcome code), push sends (hub id, kind, outcome), rate-limit
hits (hub id or truncated IP). **Never** logged: full client IPs, SNI names other than
`<hub-id>` hosts, push tokens, handles, refs, CSRs, signatures, API bodies. Logs go to the
systemd journal (Docker `journald` driver), kept at most 14 days (journald `MaxRetentionSec`;
syslog rotated daily, 14 kept). SQLite holds no traffic metadata beyond the monthly byte count.
Deletion (`retention.ts`, hourly): byte counts after 3 months, hubs not connected for 12 months
(not blocked ones) with their orders and push handles, idle push handles after 90 days, the push
rate log after a day, certificate orders after 7 days.

## 11. Configuration (relay environment)

| Variable | Example / default | Notes |
| --- | --- | --- |
| `RELAY_DOMAIN` | `<relay-domain>` | required |
| `RELAY_DATA_DIR` | `/data` | SQLite, keys, certificates |
| `RELAY_PORT` | `443` | |
| `RELAY_ACME_DIRECTORY` | staging URL | production after P2.15 |
| `RELAY_ACME_EMAIL` | none | optional; Let's Encrypt sends no expiry emails since 2025 |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID` | | token scoped to DNS edit of this zone only |
| `RELAY_DATA_KEY` | 32 bytes b64url | encrypts push tokens |
| `RELAY_MONTHLY_GIB` | `20` | |
| `APNS_KEY_FILE`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APP_ID` | | P4.0 |
| `FCM_SERVICE_ACCOUNT_FILE`, `FCM_PROJECT_ID` | | P4.0 |
| `ANDROID_CERT_SHA256`, `APP_STORE_URL`, `PLAY_STORE_URL` | | join page, P5 |
| `RELAY_LOG_LEVEL` | `info` | |

Validated with zod at startup (`apps/relay/src/config.ts`); missing push or store settings
disable only that feature (with one warning line), never the tunnel.

## 12. Operations

- `docker compose up -d` on the VPS (`apps/relay/deploy/compose.yaml`); the image is built in
  CI or on the Mac (`docker buildx build --platform linux/amd64`).
- Admin CLI inside the container: `docker compose exec relay node src/cli.ts <command>` with
  `list-hubs [--blocked]`, `block-hub <id> <reason>`, `unblock-hub <id>`, `stats` (hubs,
  connected tunnels, bytes this month, orders and pushes in 24 h), `min-hub-version
  [<x.y.z> | none]` (show, set or clear the minimum hub version, P2.17).
- Backups: nightly `sqlite3 .backup` into the backup volume (7 kept). Keys in
  `RELAY_DATA_DIR` are part of the backup; the backup volume is not world-readable.
- Health: `GET https://api.<relay-domain>/v1/health` → `{ "status": "ok" }`; an external
  uptime monitor (owner's choice, P2.15) polls it.
