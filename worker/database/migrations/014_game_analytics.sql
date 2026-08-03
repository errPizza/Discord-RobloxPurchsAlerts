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

CREATE INDEX IF NOT EXISTS idx_game_stat_events_game_created
ON game_stat_events (game_key, created_at);

CREATE INDEX IF NOT EXISTS idx_game_stat_events_type_created
ON game_stat_events (game_key, event_type, created_at);

INSERT OR IGNORE INTO game_stat_events (
  game_key, event_type, spent, revenue, single_count, bulk_count,
  donations, source_event_id, created_at
)
SELECT
  'Clothing', 'legacy_daily', spent, revenue, single_count, bulk_count,
  donations, 'legacy-daily:' || day,
  CAST(strftime('%s', day || ' 12:00:00') AS INTEGER)
FROM daily_stats;
