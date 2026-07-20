CREATE TABLE IF NOT EXISTS daily_stats (

  day TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  spent INTEGER NOT NULL DEFAULT 0,
  revenue INTEGER NOT NULL DEFAULT 0,
  single_count INTEGER NOT NULL DEFAULT 0,
  bulk_count INTEGER NOT NULL DEFAULT 0,
  donations INTEGER NOT NULL DEFAULT 0

);

INSERT OR IGNORE INTO site_settings (key, value) VALUES ('worker_enabled', '1');
