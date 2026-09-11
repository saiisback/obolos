CREATE TABLE economy_services (
  service_hash text PRIMARY KEY CHECK (service_hash ~ '^0x[0-9a-f]{64}$'),
  user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE RESTRICT,
  definition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX economy_services_created_idx ON economy_services(created_at DESC);
CREATE TRIGGER economy_services_immutable BEFORE UPDATE OR DELETE ON economy_services FOR EACH ROW EXECUTE FUNCTION economy_immutable_row();

CREATE TABLE economy_orders (
  order_id text PRIMARY KEY CHECK (order_id ~ '^0x[0-9a-f]{64}$'),
  user_id uuid NOT NULL REFERENCES platform_users(id) ON DELETE RESTRICT,
  platform_agent_id uuid NOT NULL REFERENCES platform_agents(id) ON DELETE RESTRICT,
  service_hash text NOT NULL REFERENCES economy_services(service_hash) ON DELETE RESTRICT,
  request_hash text NOT NULL CHECK (request_hash ~ '^0x[0-9a-f]{64}$'),
  request jsonb NOT NULL,
  definition jsonb NOT NULL,
  transaction_hash text NOT NULL UNIQUE CHECK (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  receipt jsonb NOT NULL,
  state text NOT NULL DEFAULT 'paid' CHECK (state IN ('paid','delivering','fulfilled')),
  output jsonb,
  output_hash text CHECK (output_hash IS NULL OR output_hash ~ '^0x[0-9a-f]{64}$'),
  delivery_token uuid,
  delivery_lease_until timestamptz,
  delivery_attempts integer NOT NULL DEFAULT 0 CHECK (delivery_attempts >= 0),
  delivery_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((state = 'fulfilled') = (output IS NOT NULL AND output_hash IS NOT NULL)),
  CHECK ((delivery_token IS NULL) = (delivery_lease_until IS NULL))
);

CREATE INDEX economy_orders_owner_idx ON economy_orders(user_id,created_at DESC);
CREATE INDEX economy_orders_service_idx ON economy_orders(service_hash,created_at DESC);

CREATE FUNCTION economy_order_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_id IS DISTINCT FROM OLD.order_id OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.platform_agent_id IS DISTINCT FROM OLD.platform_agent_id OR NEW.service_hash IS DISTINCT FROM OLD.service_hash
    OR NEW.request_hash IS DISTINCT FROM OLD.request_hash OR NEW.request IS DISTINCT FROM OLD.request
    OR NEW.definition IS DISTINCT FROM OLD.definition OR NEW.transaction_hash IS DISTINCT FROM OLD.transaction_hash
    OR NEW.receipt IS DISTINCT FROM OLD.receipt OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN RAISE EXCEPTION 'Economy order identity is immutable'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER economy_order_identity_guard BEFORE UPDATE ON economy_orders FOR EACH ROW EXECUTE FUNCTION economy_order_identity_immutable();
