CREATE TABLE IF NOT EXISTS polyglot_users (
  subject TEXT PRIMARY KEY,
  trial_started_at TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS apple_transactions (
  original_transaction_id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  user_subject TEXT REFERENCES polyglot_users(subject) ON DELETE SET NULL,
  app_account_token UUID,
  product_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  purchase_date TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revocation_date TIMESTAMPTZ,
  ownership_type TEXT,
  raw_signed_transaction TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS apple_transactions_user_subject_idx ON apple_transactions(user_subject);
CREATE INDEX IF NOT EXISTS apple_transactions_app_account_token_idx ON apple_transactions(app_account_token);
CREATE INDEX IF NOT EXISTS apple_transactions_expires_at_idx ON apple_transactions(expires_at);
