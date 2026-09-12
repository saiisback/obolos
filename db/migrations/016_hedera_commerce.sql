CREATE TABLE platform_hedera_config (
  id text PRIMARY KEY CHECK (id IN ('hts','identity-service','identity-buyer','release')),
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_service_payments ADD COLUMN asset text NOT NULL DEFAULT '0.0.0';
ALTER TABLE platform_service_payments ADD COLUMN offer_id text;
ALTER TABLE platform_service_payments ADD COLUMN offer_request_key text;
CREATE UNIQUE INDEX platform_service_offer_once ON platform_service_payments(offer_id) WHERE offer_id IS NOT NULL;
CREATE UNIQUE INDEX platform_service_offer_request_once ON platform_service_payments(offer_request_key) WHERE offer_request_key IS NOT NULL;
CREATE TABLE platform_scheduled_deliveries (
  schedule_id text PRIMARY KEY,
  fingerprint text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','delivered')),
  evidence jsonb,
  proof jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
