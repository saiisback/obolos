CREATE TABLE platform_agents (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
  status text NOT NULL DEFAULT 'setup_required' CHECK (status IN ('setup_required', 'ready', 'paused')),
  data_budget_atomic integer NOT NULL CHECK (data_budget_atomic BETWEEN 0 AND 100000000),
  verification_budget_atomic integer NOT NULL CHECK (verification_budget_atomic BETWEEN 0 AND 1000000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_agents_owner ON platform_agents(user_id, created_at DESC);

CREATE TABLE platform_api_keys (
  id uuid PRIMARY KEY,
  agent_id uuid NOT NULL REFERENCES platform_agents(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  prefix text NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX platform_api_keys_agent ON platform_api_keys(agent_id, created_at DESC);

-- No execution writer is enabled until isolated runner authorization exists.
CREATE TABLE platform_jobs (
  id uuid PRIMARY KEY,
  agent_id uuid NOT NULL REFERENCES platform_agents(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
  status text NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  repos jsonb NOT NULL CHECK (jsonb_typeof(repos) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, idempotency_key)
);
CREATE INDEX platform_jobs_agent ON platform_jobs(agent_id, created_at DESC);
