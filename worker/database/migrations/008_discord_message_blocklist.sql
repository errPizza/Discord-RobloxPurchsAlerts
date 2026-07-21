CREATE TABLE IF NOT EXISTS discord_message_blocklist (

  user_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())

);
