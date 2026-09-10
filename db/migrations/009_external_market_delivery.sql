ALTER TABLE platform_market_services
 ADD COLUMN execution text NOT NULL DEFAULT 'hosted-metric-verifier' CHECK(execution IN ('hosted-metric-verifier','external-repo-verifier')),
 ADD COLUMN provider_endpoint text,
 ADD CONSTRAINT market_service_provider CHECK(
  (execution='hosted-metric-verifier' AND provider_endpoint IS NULL) OR
  (execution='external-repo-verifier' AND provider_endpoint IS NOT NULL AND provider_endpoint LIKE 'https://%' AND length(provider_endpoint)<=2048)
 );
ALTER TABLE platform_market_service_revisions
 ADD COLUMN execution text NOT NULL DEFAULT 'hosted-metric-verifier',
 ADD COLUMN provider_endpoint text;

CREATE OR REPLACE FUNCTION record_market_service_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.agent_id IS DISTINCT FROM OLD.agent_id OR NEW.agent_name IS DISTINCT FROM OLD.agent_name
   OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.recipient IS DISTINCT FROM OLD.recipient
   OR NEW.execution IS DISTINCT FROM OLD.execution THEN
   RAISE EXCEPTION 'Listing ownership, attribution, payout destination and execution type are immutable';
  END IF;
  IF NEW.revision<>OLD.revision+1 THEN
   RAISE EXCEPTION 'A listing edit must advance its revision by one';
  END IF;
 END IF;
 INSERT INTO platform_market_service_revisions(service_id,revision,name,description,price_atomic,active,execution,provider_endpoint)
 VALUES(NEW.id,NEW.revision,NEW.name,NEW.description,NEW.price_atomic,NEW.active,NEW.execution,NEW.provider_endpoint);
 RETURN NEW;
END;
$$;

-- A paid transfer is durable independently of delivery. Never erase a settled
-- transfer when the provider is unavailable or the application process stops.
DO $$
DECLARE constraint_name text;
BEGIN
 FOR constraint_name IN SELECT conname FROM pg_constraint WHERE conrelid='platform_market_orders'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%status%'
 LOOP EXECUTE format('ALTER TABLE platform_market_orders DROP CONSTRAINT %I',constraint_name); END LOOP;
END;
$$;
ALTER TABLE platform_market_orders
 ADD COLUMN delivery_token uuid,
 ADD COLUMN delivery_lease_until timestamptz,
 ADD COLUMN delivery_attempts integer NOT NULL DEFAULT 0 CHECK(delivery_attempts>=0),
 ADD COLUMN delivery_error text,
 ADD CONSTRAINT market_order_state CHECK(
  (status='quoted' AND transaction_hash IS NULL AND proof IS NULL AND result IS NULL) OR
  (status='paid' AND transaction_hash IS NOT NULL AND proof IS NOT NULL AND result IS NULL) OR
  (status='fulfilled' AND transaction_hash IS NOT NULL AND proof IS NOT NULL AND result IS NOT NULL)
 ),
 ADD CONSTRAINT market_order_delivery_lease CHECK((delivery_token IS NULL)=(delivery_lease_until IS NULL));
