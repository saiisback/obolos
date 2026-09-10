CREATE TABLE platform_market_services (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES platform_users(id),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 80), description text NOT NULL CHECK(length(description)<=1000),
 recipient text NOT NULL CHECK(recipient ~ '^0x[0-9a-f]{40}$'), price_atomic integer NOT NULL CHECK(price_atomic BETWEEN 1000 AND 1000000),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_market_services_owner ON platform_market_services(user_id,created_at DESC);
CREATE TABLE platform_market_orders (
 id uuid PRIMARY KEY, job_id uuid NOT NULL UNIQUE REFERENCES platform_jobs(id),
 service_id uuid NOT NULL REFERENCES platform_market_services(id),revision integer NOT NULL,runner_id uuid NOT NULL REFERENCES platform_runners(id),
 payer text NOT NULL,recipient text NOT NULL,amount_atomic integer NOT NULL CHECK(amount_atomic BETWEEN 1000 AND 1000000),
 data_transaction_id text NOT NULL UNIQUE, data_source_id text NOT NULL UNIQUE REFERENCES platform_service_payments(transaction_id),
 report_digest text NOT NULL,report jsonb NOT NULL,service_snapshot jsonb NOT NULL,
 status text NOT NULL DEFAULT 'quoted' CHECK(status IN ('quoted','fulfilled')),
 transaction_hash text UNIQUE CHECK(transaction_hash ~ '^0x[0-9a-f]{64}$'),proof jsonb,result jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,
 CHECK(expires_at>created_at),CHECK((status='fulfilled')=(transaction_hash IS NOT NULL AND proof IS NOT NULL AND result IS NOT NULL))
);
