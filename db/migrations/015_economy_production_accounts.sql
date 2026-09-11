CREATE TABLE economy_production_accounts (
 order_id text PRIMARY KEY REFERENCES economy_orders(order_id),
 evidence_hash text NOT NULL UNIQUE,
 seller text NOT NULL,
 payload jsonb NOT NULL,
 signature text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE economy_production_input_allocations (
 output_order_id text NOT NULL REFERENCES economy_production_accounts(order_id),
 input_order_id text NOT NULL REFERENCES economy_orders(order_id),
 amount_atomic numeric(78,0) NOT NULL CHECK(amount_atomic>0),
 PRIMARY KEY(output_order_id,input_order_id)
);
CREATE TRIGGER economy_production_accounts_immutable BEFORE UPDATE OR DELETE ON economy_production_accounts FOR EACH ROW EXECUTE FUNCTION economy_immutable_row();
CREATE TRIGGER economy_production_inputs_immutable BEFORE UPDATE OR DELETE ON economy_production_input_allocations FOR EACH ROW EXECUTE FUNCTION economy_immutable_row();
