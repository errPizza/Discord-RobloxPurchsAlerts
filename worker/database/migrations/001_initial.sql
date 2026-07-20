CREATE TABLE IF NOT EXISTS users (

  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  display_name TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())

);

CREATE TABLE IF NOT EXISTS contacts (

  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  email TEXT,
  discord TEXT,
  initials TEXT NOT NULL DEFAULT 'AG',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_visible INTEGER NOT NULL DEFAULT 1 CHECK (is_visible IN (0, 1))

);

CREATE TABLE IF NOT EXISTS site_settings (

  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
  
);
