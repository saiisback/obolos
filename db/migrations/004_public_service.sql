CREATE TABLE platform_service_prices (
  provider_id text PRIMARY KEY CHECK (provider_id IN ('repo-standard','repo-economy')),
  unit_price_atomic integer NOT NULL CHECK (unit_price_atomic BETWEEN 1 AND 100000000)
);
INSERT INTO platform_service_prices VALUES ('repo-standard',100000),('repo-economy',120000);
CREATE TABLE platform_service_payments (
  transaction_id text PRIMARY KEY,
  provider_id text NOT NULL,
  repos jsonb NOT NULL,
  amount_atomic integer NOT NULL CHECK(amount_atomic>0),
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','settled')),
  settlement jsonb,
  evidence jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);
