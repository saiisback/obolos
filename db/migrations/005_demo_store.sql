CREATE TABLE platform_demo_runs (
  id uuid PRIMARY KEY,
  owner text NOT NULL,
  run jsonb NOT NULL,
  in_flight uuid,
  started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_demo_runs_owner ON platform_demo_runs(owner,created_at DESC);
