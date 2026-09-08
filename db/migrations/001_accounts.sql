CREATE TABLE IF NOT EXISTS platform_users (
  id uuid PRIMARY KEY,
  address text NOT NULL UNIQUE CHECK (address ~ '^0x[0-9a-f]{40}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_challenges (
  token_hash text PRIMARY KEY,
  address text NOT NULL,
  nonce text NOT NULL,
  message text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_challenges_expiry ON platform_challenges(expires_at);

CREATE TABLE IF NOT EXISTS platform_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_sessions_user ON platform_sessions(user_id);

CREATE TABLE IF NOT EXISTS platform_rate_limits (
  bucket text PRIMARY KEY,
  hits integer NOT NULL,
  reset_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS platform_rate_limits_expiry ON platform_rate_limits(reset_at);
