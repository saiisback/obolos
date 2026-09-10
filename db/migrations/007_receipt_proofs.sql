ALTER TABLE platform_jobs ADD COLUMN receipt_verification text;
ALTER TABLE platform_jobs ADD COLUMN receipt_proofs jsonb;
CREATE TABLE platform_chain_receipts (
 network text NOT NULL CHECK(network IN ('hedera:testnet','arc:testnet')),
 transaction_id text NOT NULL,
 job_id uuid NOT NULL REFERENCES platform_jobs(id),
 verified_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(network,transaction_id)
);
