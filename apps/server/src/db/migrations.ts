/**
 * Database migrations, applied in order. Never edit a migration once committed; add a new
 * one. Migrations touching encrypted columns are written by Claude only (see CLAUDE.md).
 *
 * Conventions: ids are TEXT (random UUIDs), times are INTEGER milliseconds since the epoch,
 * booleans are INTEGER 0/1, encrypted values are BLOB envelopes from security/crypto.ts.
 */
export interface Migration {
  id: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    id: 1,
    name: 'auth',
    sql: `
CREATE TABLE users (
  id                    TEXT PRIMARY KEY,
  username              TEXT NOT NULL UNIQUE COLLATE NOCASE,
  role                  TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  restricted            INTEGER NOT NULL DEFAULT 0 CHECK (restricted IN (0, 1)),
  language              TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'de')),
  default_model_id      TEXT,
  -- password slot: Argon2id(password, kdf_salt, kdf_params) -> KEK | auth key
  auth_hash             BLOB NOT NULL,
  kdf_salt              BLOB NOT NULL,
  kdf_params            TEXT NOT NULL,
  wrapped_dek_pw        BLOB NOT NULL,
  -- recovery slot: Argon2id(recovery code, recovery_salt, recovery_kdf_params) -> RK
  recovery_salt         BLOB NOT NULL,
  recovery_kdf_params   TEXT NOT NULL,
  wrapped_dek_recovery  BLOB NOT NULL,
  created_at            INTEGER NOT NULL,
  password_changed_at   INTEGER NOT NULL,
  disabled_at           INTEGER
) STRICT;

CREATE TABLE sessions (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash            BLOB NOT NULL UNIQUE,
  wrapped_dek           BLOB NOT NULL,
  created_at            INTEGER NOT NULL,
  last_seen_at          INTEGER NOT NULL,
  expires_at            INTEGER NOT NULL,
  absolute_expires_at   INTEGER NOT NULL,
  user_agent_label      TEXT NOT NULL DEFAULT ''
) STRICT;
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE invites (
  id                    TEXT PRIMARY KEY,
  code_hash             BLOB NOT NULL UNIQUE,
  role                  TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  restricted            INTEGER NOT NULL DEFAULT 0 CHECK (restricted IN (0, 1)),
  created_by            TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at            INTEGER NOT NULL,
  expires_at            INTEGER NOT NULL,
  used_by               TEXT REFERENCES users(id) ON DELETE SET NULL,
  used_at               INTEGER
) STRICT;

CREATE TABLE audit_log (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id               TEXT REFERENCES users(id) ON DELETE SET NULL,
  event                 TEXT NOT NULL,
  ip_hash               BLOB,
  created_at            INTEGER NOT NULL
) STRICT;
CREATE INDEX audit_log_user ON audit_log(user_id, created_at);
`,
  },
  {
    id: 2,
    name: 'chats',
    sql: `
CREATE TABLE chats (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title                 BLOB,              -- encrypted; NULL until set
  model_id              TEXT NOT NULL,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL
) STRICT;
CREATE INDEX chats_user_updated ON chats(user_id, updated_at DESC);

-- seq orders messages within a chat and is the paging cursor.
CREATE TABLE messages (
  seq                   INTEGER PRIMARY KEY AUTOINCREMENT,
  id                    TEXT NOT NULL UNIQUE,
  chat_id               TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role                  TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content               BLOB NOT NULL,     -- encrypted
  model_id              TEXT,
  status                TEXT NOT NULL CHECK (status IN ('done', 'error', 'cancelled')),
  prompt_tokens         INTEGER,
  output_tokens         INTEGER,
  created_at            INTEGER NOT NULL
) STRICT;
CREATE INDEX messages_chat ON messages(chat_id, seq);

-- Photo uploads and generated images. The bytes live encrypted in blobs/<id>.
-- message_id is NULL between upload and send; unsent uploads are cleaned up.
CREATE TABLE attachments (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id            TEXT REFERENCES messages(id) ON DELETE CASCADE,
  kind                  TEXT NOT NULL CHECK (kind IN ('upload', 'generated')),
  mime                  TEXT NOT NULL CHECK (mime IN ('image/jpeg', 'image/png')),
  width                 INTEGER NOT NULL,
  height                INTEGER NOT NULL,
  bytes                 INTEGER NOT NULL,
  created_at            INTEGER NOT NULL
) STRICT;
CREATE INDEX attachments_message ON attachments(message_id);
CREATE INDEX attachments_user ON attachments(user_id, created_at);
`,
  },
  {
    id: 3,
    name: 'settings',
    sql: `
-- Family-wide settings chosen by an admin (no personal data, not encrypted).
CREATE TABLE settings (
  key                   TEXT PRIMARY KEY,
  value                 TEXT NOT NULL,
  updated_at            INTEGER NOT NULL
) STRICT;
`,
  },
  {
    id: 4,
    name: 'chat-think',
    sql: `ALTER TABLE chats ADD COLUMN think INTEGER NOT NULL DEFAULT 0 CHECK (think IN (0, 1));`,
  },
  {
    id: 5,
    name: 'documents',
    // SQLite can't change CHECK constraints: rebuild attachments to allow documents.
    sql: `
CREATE TABLE attachments_new (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id            TEXT REFERENCES messages(id) ON DELETE CASCADE,
  kind                  TEXT NOT NULL CHECK (kind IN ('upload', 'generated', 'document')),
  mime                  TEXT NOT NULL CHECK (mime IN (
                          'image/jpeg', 'image/png', 'application/pdf',
                          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                          'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  width                 INTEGER NOT NULL,
  height                INTEGER NOT NULL,
  bytes                 INTEGER NOT NULL,
  name                  BLOB,              -- encrypted file name (documents)
  pages                 INTEGER,           -- pages (PDF) or sheets (Excel)
  text_chars            INTEGER,           -- length of the extracted text
  created_at            INTEGER NOT NULL
) STRICT;
INSERT INTO attachments_new (id, user_id, message_id, kind, mime, width, height, bytes, created_at)
  SELECT id, user_id, message_id, kind, mime, width, height, bytes, created_at FROM attachments;
DROP TABLE attachments;
ALTER TABLE attachments_new RENAME TO attachments;
CREATE INDEX attachments_message ON attachments(message_id);
CREATE INDEX attachments_user ON attachments(user_id, created_at);
`,
  },
  {
    id: 6,
    name: 'scanned-pages',
    // Scanned PDF pages stored as encrypted JPEG blobs `<id>-p<n>` (n = 1..scan_pages).
    sql: `ALTER TABLE attachments ADD COLUMN scan_pages INTEGER NOT NULL DEFAULT 0;`,
  },
  {
    id: 7,
    name: 'push-subscriptions',
    // One browser push subscription per device, tied to the session that registered it:
    // signing out (or the session expiring and being removed) stops notifications.
    // Not encrypted: the server must send while the user is away (no data key then);
    // these are delivery addresses, not content.
    sql: `
CREATE TABLE push_subscriptions (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id            TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  endpoint              TEXT NOT NULL UNIQUE,
  p256dh                BLOB NOT NULL,
  auth                  BLOB NOT NULL,
  created_at            INTEGER NOT NULL
) STRICT;
CREATE INDEX push_subscriptions_user ON push_subscriptions(user_id);
`,
  },
  {
    id: 8,
    name: 'message-searches',
    // Web searches behind a reply: JSON, encrypted like content (column AAD 'searches').
    sql: `ALTER TABLE messages ADD COLUMN searches BLOB;`,
  },
  {
    id: 9,
    name: 'agents',
    // Agents (roles). Personal agents: `data` is the owner's encrypted JSON (name, emoji,
    // description, instructions, examples; column AAD 'data'). Family agents (admin-made,
    // shared): `data` is plain UTF-8 JSON so every member can use them.
    sql: `
CREATE TABLE agents (
  id                    TEXT PRIMARY KEY,
  scope                 TEXT NOT NULL CHECK (scope IN ('personal', 'family')),
  owner_id              TEXT REFERENCES users(id) ON DELETE CASCADE,
  data                  BLOB NOT NULL,
  model_id              TEXT,
  think                 INTEGER CHECK (think IN (0, 1)),
  web_search            INTEGER NOT NULL DEFAULT 1 CHECK (web_search IN (0, 1)),
  images                INTEGER NOT NULL DEFAULT 1 CHECK (images IN (0, 1)),
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  CHECK ((scope = 'personal' AND owner_id IS NOT NULL) OR (scope = 'family' AND owner_id IS NULL))
) STRICT;
CREATE INDEX agents_owner ON agents(owner_id);
-- Each user's own choices for any agent they can see (personal or family).
CREATE TABLE agent_prefs (
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id              TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  pinned                INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  pin_order             INTEGER,
  last_used_at          INTEGER,
  PRIMARY KEY (user_id, agent_id)
) STRICT;
ALTER TABLE chats ADD COLUMN agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL;
`,
  },
  {
    id: 10,
    name: 'daily',
    // "Your day": per-user settings (the sign encrypted; time and switches in clear so the
    // server knows when to send the content-free notification) and plans the user told
    // kchat (one encrypted JSON blob each: date, time, text).
    sql: `
CREATE TABLE daily_settings (
  user_id               TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled               INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  time                  TEXT NOT NULL DEFAULT '07:30',
  horoscope             INTEGER NOT NULL DEFAULT 1 CHECK (horoscope IN (0, 1)),
  plans                 INTEGER NOT NULL DEFAULT 1 CHECK (plans IN (0, 1)),
  sign                  BLOB,
  last_sent_on          TEXT,
  updated_at            INTEGER NOT NULL
) STRICT;
CREATE TABLE plans (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data                  BLOB NOT NULL,
  created_at            INTEGER NOT NULL
) STRICT;
CREATE INDEX plans_user ON plans(user_id);
`,
  },
  {
    id: 11,
    name: 'planner',
    // The planner: weekly goals (week in clear for lookups; area, text, status and days in one
    // encrypted JSON blob), weekly planning and evening check-in times, and which of the three
    // content-free notifications went out today.
    sql: `
ALTER TABLE daily_settings ADD COLUMN goals INTEGER NOT NULL DEFAULT 1 CHECK (goals IN (0, 1));
ALTER TABLE daily_settings ADD COLUMN week_day INTEGER NOT NULL DEFAULT 1 CHECK (week_day BETWEEN 0 AND 6);
ALTER TABLE daily_settings ADD COLUMN week_time TEXT NOT NULL DEFAULT '07:30';
ALTER TABLE daily_settings ADD COLUMN evening INTEGER NOT NULL DEFAULT 0 CHECK (evening IN (0, 1));
ALTER TABLE daily_settings ADD COLUMN evening_time TEXT NOT NULL DEFAULT '20:00';
ALTER TABLE daily_settings ADD COLUMN week_sent_on TEXT;
ALTER TABLE daily_settings ADD COLUMN evening_sent_on TEXT;
CREATE TABLE goals (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week                  TEXT NOT NULL,
  data                  BLOB NOT NULL,
  created_at            INTEGER NOT NULL
) STRICT;
CREATE INDEX goals_user_week ON goals(user_id, week);
`,
  },
  {
    id: 12,
    name: 'briefing_chats',
    // Chats opened from the planner (morning snapshot, weekly planning, evening check-in):
    // kept out of the chat list, reused for the rest of the day, deleted after a week.
    sql: `
ALTER TABLE chats ADD COLUMN briefing TEXT CHECK (briefing IN ('day', 'week', 'evening'));
ALTER TABLE chats ADD COLUMN briefing_on TEXT;
CREATE INDEX chats_briefing ON chats(user_id, briefing, briefing_on);
`,
  },
  {
    id: 13,
    name: 'day_tasks',
    // The planner's daily items: one must win and up to two more per day. The date is in
    // clear for lookups; kind, text, linked goal and status are one encrypted JSON blob.
    sql: `
CREATE TABLE day_tasks (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date                  TEXT NOT NULL,
  data                  BLOB NOT NULL,
  created_at            INTEGER NOT NULL
) STRICT;
CREATE INDEX day_tasks_user_date ON day_tasks(user_id, date);
`,
  },
  {
    id: 14,
    name: 'planner_town',
    // The planner's home town for weekend weather and events, encrypted like the star sign.
    sql: `
ALTER TABLE daily_settings ADD COLUMN town BLOB;
`,
  },
  {
    id: 15,
    name: 'profiles',
    // Profiles: notes about the user that the model gets as context. One encrypted JSON blob
    // per profile; agent_id NULL is the user's own profile (per-agent profiles are possible
    // later, and private per user even for family agents). A chat's use_profile switch is in
    // clear; the notes a reply saved are encrypted with the message (column AAD 'notes').
    sql: `
CREATE TABLE profiles (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id              TEXT REFERENCES agents(id) ON DELETE CASCADE,
  data                  BLOB NOT NULL,
  updated_at            INTEGER NOT NULL
) STRICT;
CREATE UNIQUE INDEX profiles_owner ON profiles(user_id, coalesce(agent_id, ''));
ALTER TABLE chats ADD COLUMN use_profile INTEGER NOT NULL DEFAULT 1 CHECK (use_profile IN (0, 1));
ALTER TABLE messages ADD COLUMN notes BLOB;
`,
  },
  {
    id: 16,
    name: 'planner_nearby',
    // Towns near the home town for weekend events: an encrypted JSON array like the town.
    sql: `
ALTER TABLE daily_settings ADD COLUMN nearby BLOB;
`,
  },
  {
    id: 17,
    name: 'web-photos',
    // Photos from an image search shown with a reply (kind 'web'), with the page they came
    // from as encrypted JSON {title, url} (column AAD 'source'). SQLite can't change CHECK
    // constraints: rebuild attachments as in migration 5, keeping every column.
    sql: `
CREATE TABLE attachments_new (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id            TEXT REFERENCES messages(id) ON DELETE CASCADE,
  kind                  TEXT NOT NULL CHECK (kind IN ('upload', 'generated', 'document', 'web')),
  mime                  TEXT NOT NULL CHECK (mime IN (
                          'image/jpeg', 'image/png', 'application/pdf',
                          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                          'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  width                 INTEGER NOT NULL,
  height                INTEGER NOT NULL,
  bytes                 INTEGER NOT NULL,
  name                  BLOB,              -- encrypted file name (documents)
  pages                 INTEGER,           -- pages (PDF) or sheets (Excel)
  text_chars            INTEGER,           -- length of the extracted text
  created_at            INTEGER NOT NULL,
  scan_pages            INTEGER NOT NULL DEFAULT 0,
  source                BLOB               -- encrypted {title, url} (web photos)
) STRICT;
INSERT INTO attachments_new (id, user_id, message_id, kind, mime, width, height, bytes, name,
                             pages, text_chars, created_at, scan_pages)
  SELECT id, user_id, message_id, kind, mime, width, height, bytes, name,
         pages, text_chars, created_at, scan_pages FROM attachments;
DROP TABLE attachments;
ALTER TABLE attachments_new RENAME TO attachments;
CREATE INDEX attachments_message ON attachments(message_id);
CREATE INDEX attachments_user ON attachments(user_id, created_at);
`,
  },
  {
    id: 18,
    name: 'web-pages',
    // Pages the user linked in a message, read by the server for the model. url, title and
    // text (the page's readable text and link list) are encrypted (column AADs 'url',
    // 'title', 'text'); status and reason are in clear (no content). Deleted with the message.
    sql: `
CREATE TABLE web_pages (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id            TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  position              INTEGER NOT NULL,
  status                TEXT NOT NULL CHECK (status IN ('read', 'unreadable')),
  reason                TEXT,
  url                   BLOB NOT NULL,
  title                 BLOB NOT NULL,
  text                  BLOB,
  created_at            INTEGER NOT NULL
) STRICT;
CREATE INDEX web_pages_message ON web_pages(message_id, position);
`,
  },
  {
    id: 19,
    name: 'cloud',
    // Cloud models with each person's own API key. The key is stored encrypted with the
    // user's data key as JSON {key, hint} (column AAD 'secret', row = provider), so only that
    // user's session can use it; in clear only which providers have a key and when it was
    // added. Spending per month and model as token counts and an estimated cost in millionths
    // of a US dollar (no content). The cap is in US cents; no row = the default cap, NULL = no cap.
    sql: `
CREATE TABLE cloud_keys (
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider              TEXT NOT NULL CHECK (provider IN ('anthropic', 'openai')),
  secret                BLOB NOT NULL,
  created_at            INTEGER NOT NULL,
  PRIMARY KEY (user_id, provider)
) STRICT;
CREATE TABLE cloud_usage (
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month                 TEXT NOT NULL,
  provider              TEXT NOT NULL,
  model                 TEXT NOT NULL,
  input_tokens          INTEGER NOT NULL DEFAULT 0,
  output_tokens         INTEGER NOT NULL DEFAULT 0,
  cost_micros           INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, month, provider, model)
) STRICT;
CREATE TABLE cloud_settings (
  user_id               TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  cap_cents             INTEGER CHECK (cap_cents IS NULL OR cap_cents > 0)
) STRICT;
`,
  },
  {
    id: 20,
    name: 'cloud-openrouter',
    // OpenRouter as a third provider: the provider CHECK is widened by recreating the table.
    // Rows are copied as they are (the encrypted secret's AAD names user and provider, which
    // don't change).
    sql: `
CREATE TABLE cloud_keys_new (
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider              TEXT NOT NULL CHECK (provider IN ('anthropic', 'openai', 'openrouter')),
  secret                BLOB NOT NULL,
  created_at            INTEGER NOT NULL,
  PRIMARY KEY (user_id, provider)
) STRICT;
INSERT INTO cloud_keys_new (user_id, provider, secret, created_at)
  SELECT user_id, provider, secret, created_at FROM cloud_keys;
DROP TABLE cloud_keys;
ALTER TABLE cloud_keys_new RENAME TO cloud_keys;
`,
  },
  {
    id: 21,
    name: 'devices-and-link-codes',
    // Public edition (docs/public/ARCHITECTURE.md §5, SECURITY.md §3–§4). devices: paired
    // devices allowed through the relay gate; only SHA-256 of the device cookie is stored.
    // link_codes: one-time sign-in links and device codes (hash only); a sign-in link carries
    // the user's DEK wrapped with a key derived from the code, so nobody without the code can
    // unwrap it. sessions.device_id ties a session to its device (removing the device ends it).
    sql: `
CREATE TABLE devices (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT REFERENCES users(id) ON DELETE CASCADE,
  token_hash            BLOB NOT NULL UNIQUE,
  label                 TEXT NOT NULL DEFAULT '',
  created_at            INTEGER NOT NULL,
  last_seen_at          INTEGER NOT NULL,
  revoked_at            INTEGER
) STRICT;
CREATE INDEX devices_user ON devices(user_id);
CREATE TABLE link_codes (
  id                    TEXT PRIMARY KEY,
  kind                  TEXT NOT NULL CHECK (kind IN ('signin', 'device')),
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash             BLOB NOT NULL UNIQUE,
  wrapped_dek           BLOB,
  created_by            TEXT NOT NULL,
  created_at            INTEGER NOT NULL,
  expires_at            INTEGER NOT NULL,
  used_at               INTEGER
) STRICT;
CREATE INDEX link_codes_user ON link_codes(user_id, kind);
ALTER TABLE sessions ADD COLUMN device_id TEXT REFERENCES devices(id) ON DELETE CASCADE;
CREATE INDEX sessions_device ON sessions(device_id);
`,
  },
  {
    id: 22,
    name: 'native-push',
    // Native app push through the relay (P4.4): a subscription is either a Web Push endpoint
    // ('web', as before) or a relay handle ('native'; endpoint is then 'native:<id>' and the
    // key columns are empty). No content in either.
    sql: `
ALTER TABLE push_subscriptions ADD COLUMN kind TEXT NOT NULL DEFAULT 'web' CHECK (kind IN ('web', 'native'));
ALTER TABLE push_subscriptions ADD COLUMN relay_handle TEXT;
`,
  },
  {
    id: 23,
    name: 'session-via-link',
    // Sessions started with a sign-in link are never "recently signed in" (security review
    // 2026-11-07): only a passphrase makes a session fresh. No encrypted columns.
    sql: `
ALTER TABLE sessions ADD COLUMN via_link INTEGER NOT NULL DEFAULT 0 CHECK (via_link IN (0, 1));
`,
  },
];
