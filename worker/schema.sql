CREATE TABLE subscribers (
  stripe_customer_id TEXT PRIMARY KEY,
  subscription_id TEXT,
  checkout_session_id TEXT,
  claim_token TEXT,
  invite_link TEXT,
  telegram_user_id TEXT,
  status TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE INDEX idx_subscribers_checkout_session_id ON subscribers (checkout_session_id);
CREATE INDEX idx_subscribers_claim_token ON subscribers (claim_token);
CREATE INDEX idx_subscribers_telegram_user_id ON subscribers (telegram_user_id);
CREATE INDEX idx_subscribers_subscription_id ON subscribers (subscription_id);
CREATE INDEX idx_subscribers_invite_link ON subscribers (invite_link);

CREATE TABLE brief_snapshot (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ticker TEXT NOT NULL,
  display_name TEXT NOT NULL,
  as_of_date TEXT NOT NULL,
  close_value REAL NOT NULL,
  mdd_value REAL NOT NULL,
  tier TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
