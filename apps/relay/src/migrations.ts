/** Relay database schema (RELAY.md §5.2, §5.3, §7.1). Append only; never edit an applied entry. */
export interface Migration {
  id: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    id: 1,
    name: 'initial',
    sql: `
CREATE TABLE hubs (
  id                TEXT PRIMARY KEY,
  public_key        BLOB NOT NULL UNIQUE,
  created_at        INTEGER NOT NULL,
  created_ip        TEXT NOT NULL,
  last_connected_at INTEGER,
  blocked_at        INTEGER,
  blocked_reason    TEXT
) STRICT;
CREATE TABLE usage (
  hub_id            TEXT NOT NULL,
  month             TEXT NOT NULL,
  bytes             INTEGER NOT NULL,
  PRIMARY KEY (hub_id, month)
) STRICT;
CREATE TABLE cert_orders (
  id                TEXT PRIMARY KEY,
  hub_id            TEXT NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
  status            TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
  csr               BLOB NOT NULL,
  chain_pem         TEXT,
  failure           TEXT,
  created_at        INTEGER NOT NULL,
  finished_at       INTEGER
) STRICT;
CREATE INDEX cert_orders_hub ON cert_orders(hub_id, created_at);
CREATE TABLE push_handles (
  handle_hash       BLOB PRIMARY KEY,
  hub_id            TEXT NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
  platform          TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  env               TEXT NOT NULL CHECK (env IN ('production', 'sandbox')),
  token             BLOB NOT NULL,
  created_at        INTEGER NOT NULL,
  last_used_at      INTEGER NOT NULL
) STRICT;
CREATE INDEX push_handles_hub ON push_handles(hub_id);
CREATE TABLE push_log (
  hub_id            TEXT NOT NULL,
  handle_hash       BLOB NOT NULL,
  at                INTEGER NOT NULL
) STRICT;
CREATE INDEX push_log_hub ON push_log(hub_id, at);
CREATE INDEX push_log_handle ON push_log(handle_hash, at);
`,
  },
  {
    id: 2,
    name: 'settings',
    sql: `
CREATE TABLE settings (
  key               TEXT PRIMARY KEY,
  value             TEXT NOT NULL
) STRICT;
`,
  },
  {
    id: 3,
    name: 'manifest checks',
    sql: `
CREATE TABLE manifest_checks (
  day               TEXT NOT NULL,
  version           TEXT NOT NULL,
  platform          TEXT NOT NULL,
  channel           TEXT NOT NULL,
  count             INTEGER NOT NULL,
  PRIMARY KEY (day, version, platform, channel)
) STRICT;
`,
  },
];
