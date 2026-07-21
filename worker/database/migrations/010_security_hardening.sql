CREATE TABLE IF NOT EXISTS auth_sessions (

  token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64),
  user_id INTEGER NOT NULL,
  user_agent_hash TEXT NOT NULL CHECK (length(user_agent_hash) = 64),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE

);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS webhook_events (

  scope TEXT NOT NULL,
  event_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (scope, event_id)

);

CREATE INDEX IF NOT EXISTS idx_webhook_events_created_at ON webhook_events(created_at);

CREATE TABLE IF NOT EXISTS auth_failures (

  identifier_hash TEXT PRIMARY KEY CHECK (length(identifier_hash) = 64),
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  window_started INTEGER NOT NULL DEFAULT (unixepoch()),
  locked_until INTEGER NOT NULL DEFAULT 0

);

CREATE INDEX IF NOT EXISTS idx_auth_failures_locked_until ON auth_failures(locked_until);
