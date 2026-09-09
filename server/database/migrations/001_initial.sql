CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin', 'owner')),
  display_name TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_canonical ON users (lower(trim(email)));

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'discord')),
  provider_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (provider, provider_user_id),
  UNIQUE (user_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts(user_id);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent_hash TEXT NOT NULL CHECK (length(user_agent_hash) = 64),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS auth_failures (
  identifier_hash TEXT PRIMARY KEY CHECK (length(identifier_hash) = 64),
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  window_started INTEGER NOT NULL DEFAULT (unixepoch()),
  locked_until INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_auth_failures_locked_until ON auth_failures(locked_until);

CREATE TABLE IF NOT EXISTS webhook_events (
  scope TEXT NOT NULL,
  event_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (scope, event_id)
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON webhook_events(created_at);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  email TEXT,
  discord TEXT,
  initials TEXT NOT NULL DEFAULT 'AG',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1)),
  description TEXT,
  roblox_url TEXT,
  image_key TEXT,
  team_group TEXT CHECK (team_group IN ('owner', 'co_owners', 'developers', 'contributors', 'testers', 'community')),
  joined_at TEXT,
  roblox_user_id TEXT,
  discord_username TEXT
);
CREATE INDEX IF NOT EXISTS idx_contacts_team_group ON contacts (team_group, display_order);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_roblox_user_id ON contacts (roblox_user_id) WHERE roblox_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO site_settings (key, value) VALUES
  ('studio_name', 'Another Game More Studio'),
  ('hero_description', 'Creamos experiencias que dan ganas de jugar una partida más. Innovación, creatividad y pasión en cada juego.'),
  ('about_description', 'Another Game More Studio nace con la misión de crear experiencias únicas que conecten y entretengan a jugadores de todo el mundo.'),
  ('worker_enabled', '1');

CREATE TABLE IF NOT EXISTS weekly_stats (
  week TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  spent INTEGER NOT NULL DEFAULT 0,
  revenue INTEGER NOT NULL DEFAULT 0,
  single_count INTEGER NOT NULL DEFAULT 0,
  bulk_count INTEGER NOT NULL DEFAULT 0,
  donations INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS daily_stats (
  day TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  spent INTEGER NOT NULL DEFAULT 0,
  revenue INTEGER NOT NULL DEFAULT 0,
  single_count INTEGER NOT NULL DEFAULT 0,
  bulk_count INTEGER NOT NULL DEFAULT 0,
  donations INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS discord_message_blocklist (
  user_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS game_stat_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  spent INTEGER NOT NULL DEFAULT 0 CHECK (spent >= 0),
  revenue INTEGER NOT NULL DEFAULT 0 CHECK (revenue >= 0),
  single_count INTEGER NOT NULL DEFAULT 0 CHECK (single_count >= 0),
  bulk_count INTEGER NOT NULL DEFAULT 0 CHECK (bulk_count >= 0),
  donations INTEGER NOT NULL DEFAULT 0 CHECK (donations >= 0),
  devproduct_normal_count INTEGER NOT NULL DEFAULT 0 CHECK (devproduct_normal_count >= 0),
  devproduct_gift_count INTEGER NOT NULL DEFAULT 0 CHECK (devproduct_gift_count >= 0),
  gamepass_normal_count INTEGER NOT NULL DEFAULT 0 CHECK (gamepass_normal_count >= 0),
  gamepass_gift_count INTEGER NOT NULL DEFAULT 0 CHECK (gamepass_gift_count >= 0),
  user_id TEXT,
  source_event_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (game_key, event_type, source_event_id)
);
CREATE INDEX IF NOT EXISTS idx_game_stat_events_game_created ON game_stat_events (game_key, created_at);
CREATE INDEX IF NOT EXISTS idx_game_stat_events_type_created ON game_stat_events (game_key, event_type, created_at);

CREATE TABLE IF NOT EXISTS mobile_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id_hash TEXT NOT NULL,
  device_name TEXT NOT NULL,
  platform TEXT,
  app_version TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'revoked')),
  requested_at INTEGER NOT NULL DEFAULT (unixepoch()),
  approved_at INTEGER,
  approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  revoked_at INTEGER,
  revoked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  last_seen_at INTEGER,
  ip_hash TEXT NOT NULL,
  user_agent_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mobile_sessions_user_status ON mobile_sessions (user_id, status);
CREATE TABLE IF NOT EXISTS mobile_refresh_tokens (
  token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64),
  mobile_session_id TEXT NOT NULL REFERENCES mobile_sessions(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  replaced_by_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_mobile_refresh_tokens_session ON mobile_refresh_tokens (mobile_session_id, expires_at);

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  mobile_session_id TEXT REFERENCES mobile_sessions(id) ON DELETE SET NULL,
  device_name TEXT,
  action TEXT NOT NULL,
  target TEXT,
  result TEXT NOT NULL CHECK (result IN ('success', 'failure', 'denied')),
  metadata TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events (created_at DESC);

CREATE TABLE IF NOT EXISTS application_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL')),
  message TEXT NOT NULL,
  metadata TEXT,
  request_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_application_logs_query ON application_logs (created_at DESC, service, level);
CREATE TABLE IF NOT EXISTS request_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  method TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  status INTEGER NOT NULL,
  response_ms INTEGER NOT NULL,
  origin_hash TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs (created_at DESC);
CREATE TABLE IF NOT EXISTS request_metric_buckets (
  bucket_start INTEGER NOT NULL,
  method TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  status INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  latency_total_ms INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_start, method, endpoint, status)
);

CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL')),
  service TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata TEXT,
  acknowledged_at INTEGER,
  acknowledged_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_alerts_open_created ON alerts (acknowledged_at, created_at DESC);
CREATE TABLE IF NOT EXISTS server_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('REMOTE_RESTART', 'SPONTANEOUS_RESTART', 'UNKNOWN_RESTART', 'SERVER_SHUTDOWN')),
  message TEXT NOT NULL,
  metadata TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
