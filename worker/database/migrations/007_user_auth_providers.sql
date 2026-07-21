CREATE TABLE IF NOT EXISTS oauth_accounts (

  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'discord')),
  provider_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (provider, provider_user_id),
  UNIQUE (user_id, provider),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE

);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts(user_id);

UPDATE users SET role = 'admin' WHERE email = 'kikinttrex0231@gmail.com' COLLATE NOCASE;

