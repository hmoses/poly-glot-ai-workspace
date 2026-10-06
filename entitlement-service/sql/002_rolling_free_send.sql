ALTER TABLE polyglot_users
  ADD COLUMN IF NOT EXISTS last_free_send_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS polyglot_users_last_free_send_at_idx
  ON polyglot_users(last_free_send_at);
