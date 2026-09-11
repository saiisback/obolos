CREATE TABLE economy_service_retirements (
 service_hash text PRIMARY KEY REFERENCES economy_services(service_hash),
 user_id uuid NOT NULL REFERENCES platform_users(id),
 reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE economy_disputes (
 order_id text PRIMARY KEY REFERENCES economy_orders(order_id),
 user_id uuid NOT NULL REFERENCES platform_users(id),
 reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE economy_refunds (
 chain_id integer NOT NULL CHECK(chain_id=5042002),
 transaction_hash text NOT NULL,
 log_index integer NOT NULL,
 order_id text NOT NULL REFERENCES economy_orders(order_id),
 seller text NOT NULL,
 payer text NOT NULL,
 amount_atomic numeric(78,0) NOT NULL CHECK(amount_atomic>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(chain_id,transaction_hash,log_index)
);
CREATE TABLE economy_reviews (
 order_id text NOT NULL REFERENCES economy_orders(order_id),
 reviewer text NOT NULL,
 output_hash text NOT NULL,
 verdict text NOT NULL CHECK(verdict IN ('passed','failed')),
 evidence_reference text NOT NULL,
 evidence_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(order_id,reviewer)
);
CREATE TRIGGER economy_retirements_immutable BEFORE UPDATE OR DELETE ON economy_service_retirements FOR EACH ROW EXECUTE FUNCTION economy_immutable_row();
CREATE TRIGGER economy_disputes_immutable BEFORE UPDATE OR DELETE ON economy_disputes FOR EACH ROW EXECUTE FUNCTION economy_immutable_row();
CREATE TRIGGER economy_refunds_immutable BEFORE UPDATE OR DELETE ON economy_refunds FOR EACH ROW EXECUTE FUNCTION economy_immutable_row();
CREATE TRIGGER economy_reviews_immutable BEFORE UPDATE OR DELETE ON economy_reviews FOR EACH ROW EXECUTE FUNCTION economy_immutable_row();
