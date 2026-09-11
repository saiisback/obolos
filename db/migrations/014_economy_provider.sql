-- Durable paid jobs; secrets and wallet keys remain on the private provider host.
CREATE TABLE economy_provider_jobs (
 order_id text PRIMARY KEY,
 request_hash text NOT NULL,
 request jsonb NOT NULL,
 definition jsonb NOT NULL,
 paid_at bigint NOT NULL,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','completed','failed')),
 claim_token uuid UNIQUE,
 lease_started_at bigint,
 output jsonb,
 output_hash text,
 attestation_hash text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((output IS NULL)=(output_hash IS NULL))
);
CREATE TABLE economy_provider_health (
 seller text PRIMARY KEY,
 model text NOT NULL,
 checked_at timestamptz NOT NULL DEFAULT now()
);
