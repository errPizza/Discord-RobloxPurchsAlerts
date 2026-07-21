CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_canonical
ON users (lower(trim(email)));
