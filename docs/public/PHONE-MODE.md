# Phone mode: the app without a hub

Read [README.md](README.md) first. Decided by the owner on 2026-10-23 (DECISIONS.md): besides
connecting to a home hub, the app works **on its own** with the user's own OpenAI or Anthropic
API key. Everything stays on the phone. **There is no backend:** no account, no sync server,
no analytics. The owner hosts nothing for this mode.

User-facing names: **"At home"** (the app is connected to a hub) and **"On this phone"** (phone
mode). In code: `mode: 'hub' | 'phone'`, folder `apps/mobile/src/phone/`.

## 1. What phone mode is for

- People who want a private, ad-free AI app with their own key but have no computer to run a
  hub, or want to try Hemmia before setting one up.
- It is a full product on its own (important for App Store review: the app has value without
  a hub).
- It is also the on-ramp: "Move my chats to a home hub" (§8) takes everything to a hub later.

## 2. Scope

**In v1:**

- Providers: **Anthropic** and **OpenAI**, the user's own key. One key per provider, both may
  be set.
- Models: the `cloudModels` list in `config/models.json` (labels and descriptions EN/DE, the
  same list the hub offers), bundled at build time into `apps/mobile/src/phone/models.json` by
  the mobile build. Only models whose provider has a key are shown.
- Chats: new, list (newest first), search by title, rename, delete; streaming replies with
  the web app's Markdown rendering and code highlighting; "think harder" switch; model switch
  per chat (the next reply uses the new model).
- Photos: attach up to 4 per message from camera or library (`<input type="file"
  accept="image/*" capture>` in the web view, no plugin); resized on the phone to a long edge of
  at most 1568 px, JPEG quality 0.85, metadata stripped by re-encoding through a canvas.
- "About me": a short text (≤ 2000 chars) sent as part of the system prompt, like the hub's
  profile.
- Title: the first 60 characters of the first message (cut at a word boundary), editable. No
  extra model call.
- Export all chats (one file, §7) through the share sheet; import that file; delete
  everything.
- Languages EN and DE.

**Not in v1** (each a later decision): web search (the providers' own search tools would be
the way), documents, agents and scheduled briefs, image generation, voice, OpenRouter,
local models on the phone, sync between the user's phones, app lock with Face ID / fingerprint.

## 3. Screens and flow

New mockups (task P9.0) next to M1–M9:

- **M1 Welcome** gets a third choice under the two existing ones: "Just me, on this phone"
  ("Use your own OpenAI or Anthropic key. Your chats stay on this phone.").
- **M10 Choose provider:** two cards (Anthropic: "Claude", OpenAI: "ChatGPT models"), each
  with one line on cost ("You pay the provider directly for what you use. Hemmia adds
  nothing."). Link "What is an API key?" → the website guide `/guides/api-keys/` (WEBSITE.md §3)
  in the system browser.
- **M11 Paste your key:** a single field (paste button, masked after paste, "Show"), a link
  "Get a key from Anthropic/OpenAI" (opens `https://platform.claude.com/settings/keys` or
  `https://platform.openai.com/api-keys` in the system browser), button "Check and save".
  Checking calls the provider's model list (§5); errors in plain words: "This key was
  refused", "No internet", "The provider is busy, try again".
- **M12 Phone home:** the chat list with a top bar "On this phone" and a small card at the
  bottom: "Set up Hemmia at home for your family, local models and more" → M2. Settings
  (gear) → M13.
- **M13 Phone settings:** keys (per provider: "Replace", "Remove"), About me, language,
  "Export chats", "Import chats", "Move to a home hub" (§8), "Delete everything on this phone"
  (two-step confirm), "How your data is handled" (opens the website privacy page).
- The chat screen itself reuses the web app's chat components (§4); no new mockup.

App start rules (extending P5.4): phone mode set up and no hubs → M12. Hubs saved and phone
mode set up → HubList, where "On this phone" is the first row. Nothing set up → M1.

## 4. Code structure

- **`packages/providers`** (new workspace `@hemmia/providers`, task P9.1): the existing cloud
  clients move here from `apps/server/src/llm/`: `anthropic.ts`, `openai.ts`, `cloudhttp.ts`
  and the cloud parts of `types.ts`. They use only `fetch`, `AbortSignal`, `TextDecoder` and
  zod, so they run in Node and in the web view unchanged. The server imports them from the
  package (its other files keep their imports through a re-export in `apps/server/src/llm/`).
  The P1.5 Chat Completions client and the P1.6 OpenRouter client are created in this package
  too (if P1.5/P1.6 are done first, P9.1 moves them as well). Ollama stays in the server
  (it uses `node:http`).
- **Browser access header:** the Anthropic client gains an option
  `browser: boolean` that adds `anthropic-dangerous-direct-browser-access: true` (needed for
  calls from a web view). The server never sets it.
- **`packages/ui`** (new workspace `@hemmia/ui`, task P9.2): presentational chat components
  move out of `apps/web/src/components/` so the hub web app and phone mode share them:
  `Markdown.tsx`, `CodeBlock.tsx`, `MessageBubble.tsx`, `Composer.tsx`, `ImageViewer.tsx`,
  `LoadingBar.tsx`, `icons.tsx`, `ui.tsx`, and the colour variables and fonts of
  `index.css` (as `@hemmia/ui/theme.css`). Rule for the move: a component goes to `ui` only if
  it takes all data through props and calls no API; anything that uses react-query or
  `apps/web/src/api` stays in `apps/web`. Where a component mixes both, split it into a
  presentational part (moved) and a container (stays). Behaviour and look must not change;
  the existing tests move with the components.
- **`apps/mobile/src/phone/`** (P9.3–P9.7): `store.ts` (encrypted files, §6),
  `keys.ts` (secure storage, §5), `chat.ts` (sends a turn with `@hemmia/providers`, streams
  into the store), `PhoneHome.tsx`, `PhoneChat.tsx`, `PhoneSettings.tsx`, `Setup*.tsx` (M10,
  M11), `export.ts`. State with React state and a small context; no react-query (there is no
  server).
- **Message shape:** phone chats store the same `ChatTurn` shape the providers take
  (`packages/providers` types), plus `{ id, createdAt, model }` per message. Tool rounds don't
  occur in v1 (no tools).

## 5. API keys

- Stored with a small own Capacitor plugin **`SecureStore`** in `apps/mobile` (Swift and
  Kotlin, about 100 lines each; no third-party plugin):
  - iOS: Keychain, `kSecClassGenericPassword`, service `<bundle-id>.secure`,
    `kSecAttrSynchronizable = false`. API keys: `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`
    (not in backups; a new phone needs the key pasted again). The data key (§6):
    `kSecAttrAccessibleAfterFirstUnlock` (included in encrypted backups, so an iPhone restored
    from an encrypted backup can read its chats).
  - Android: a non-exportable AES-256-GCM key in the Android Keystore wraps each value, stored
    in app-private `SharedPreferences`; `android:allowBackup="false"` (Android chats move only
    by export/import).
  - Methods: `get(name)`, `set(name, value)`, `remove(name)`, names fixed:
    `apiKey.anthropic`, `apiKey.openai`, `dataKey`. Plan B (P5.1) exposes the same three
    methods through its bridge.
- **Key check:** `GET https://api.anthropic.com/v1/models` (headers `x-api-key`,
  `anthropic-version`, the browser header) or `GET https://api.openai.com/v1/models`
  (`Authorization: Bearer`). 200 → save. 401/403 → "refused". Anything else → "try again".
- The key is read from `SecureStore` for each request and not kept in React state or any
  file. It is shown only masked (`sk-…` + last 4).
- Requests go **only** to the fixed origins in `cloudhttp.ts` `CLOUD_ORIGINS`; the shell's CSP
  (`connect-src`) lists exactly those plus the hub hosts (SECURITY.md §7.1).

## 6. Storage on the phone

- Files through `@capacitor/filesystem` (to be approved in P0.1) in `Directory.Data`, under
  `phone/v1/`:
  - `index.enc`: `{ chats: { id, title, model, updatedAt }[], aboutMe, language }`
  - `chats/<chatId>.enc`: `{ id, title, createdAt, messages: StoredMessage[] }`
  - `photos/<photoId>.enc`: JPEG bytes.
- **Encryption:** AES-256-GCM with WebCrypto (`crypto.subtle`). The data key is 32 random bytes
  created on first use and stored in `SecureStore` as `dataKey`. File format: byte `1`
  (version), 12-byte random IV, ciphertext with tag. AAD: `kchat|phone|v1|<path relative to
  phone/v1>` (a protocol constant: not renamed in P8.2). A file that fails to decrypt is
  skipped and reported once ("1 chat could not be read"), never deleted automatically.
- Writes go to `<file>.tmp` first, then rename (no half-written chats if the app is killed).
- Limits: 2000 chats, 2000 messages per chat, 200 MB of photos; beyond that the app asks the
  user to delete old chats (no silent deletion).
- "Delete everything" removes `phone/v1/`, the data key and both API keys.

## 7. Export file

- One JSON file `hemmia-chats-YYYY-MM-DD.json` , schema `PhoneExport` in `packages/shared` (zod):
  `{ format: 'kchat-phone-export', version: 1, exportedAt, aboutMe, chats: [{ id, title,
  createdAt, model, messages: [{ role, text, createdAt, model?, photos?: base64 JPEG[] }] }] }`.
- **Not encrypted** (it is meant to be moved and opened elsewhere). The export screen says so
  in one sentence ("This file is not protected. Keep it somewhere safe.").
- Import validates with the schema, refuses other formats and versions, and adds chats with
  new ids (never overwrites).

## 8. Moving to a home hub

- In M13: "Move to a home hub" → pick a hub from the saved list (pair one first if there is
  none) → the shell builds the export, stages it natively for that hub
  (`HubLauncher.stagePhoneExport`, one-time token, 5 minutes) and opens
  `https://<hubHost>/import#phone~<token>`; the hub page takes it once
  (`HubLauncher.takePhoneExport`) and posts it to **`POST /api/import/phone`** (new hub route, task P9.8, [C]: it writes encrypted
  per-user data). The hub stores each chat for the signed-in user, encrypted as usual,
  model mapped to the same cloud model id (or the hub default if the hub doesn't offer it),
  photos as attachments through the normal upload validation.
- Afterwards the app offers "Delete the chats on this phone" (not automatic).
- The API key is **not** moved; the hub has its own keys (H4).

## 9. Privacy statement (for the store listings and the website)

"In phone mode, your chats, photos and API key stay on your phone. Messages go straight from
your phone to the provider you chose (Anthropic or OpenAI) under that provider's terms. Hemmia's
developer receives nothing: there is no account, no server and no analytics."

App privacy labels for phone mode: data not collected. The provider is a third party the
user contracts with directly.

## 10. App review

Phone mode gives reviewers something to test without a hub. The review notes (P5.10) include
an Anthropic API key from a separate owner workspace with a $5 spend limit, created for the
review and revoked after approval, plus the existing demo hub.
