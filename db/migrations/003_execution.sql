CREATE TABLE platform_runners (
 id uuid PRIMARY KEY, agent_id uuid NOT NULL REFERENCES platform_agents(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'), prefix text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz, revoked_at timestamptz
);
CREATE UNIQUE INDEX platform_one_active_runner ON platform_runners(agent_id) WHERE revoked_at IS NULL;
CREATE TABLE platform_mandates (
 id uuid PRIMARY KEY, agent_id uuid NOT NULL REFERENCES platform_agents(id) ON DELETE CASCADE,
 fields jsonb NOT NULL, message text NOT NULL, signature text,
 max_runs integer NOT NULL CHECK(max_runs BETWEEN 1 AND 10), reserved_runs integer NOT NULL DEFAULT 0 CHECK(reserved_runs BETWEEN 0 AND max_runs),
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), approved_at timestamptz, revoked_at timestamptz
);
CREATE UNIQUE INDEX platform_one_active_mandate ON platform_mandates(agent_id) WHERE approved_at IS NOT NULL AND revoked_at IS NULL;
ALTER TABLE platform_jobs DROP CONSTRAINT platform_jobs_status_check;
ALTER TABLE platform_jobs ADD CONSTRAINT platform_jobs_status_check CHECK(status IN ('queued','running','succeeded','failed','blocked','uncertain'));
ALTER TABLE platform_jobs ADD COLUMN mandate_id uuid REFERENCES platform_mandates(id);
ALTER TABLE platform_jobs ADD COLUMN runner_id uuid REFERENCES platform_runners(id);
ALTER TABLE platform_jobs ADD COLUMN result jsonb;
ALTER TABLE platform_jobs ADD COLUMN claimed_at timestamptz;
CREATE INDEX platform_jobs_claim ON platform_jobs(agent_id,created_at) WHERE status='queued';
