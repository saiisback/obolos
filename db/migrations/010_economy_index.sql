-- Raw finalized chain evidence is append-only. Discovery and metrics are derived.
CREATE TABLE economy_chain_events (
 chain_id integer NOT NULL CHECK(chain_id=5042002),
 contract_address text NOT NULL,
 transaction_hash text NOT NULL,
 log_index integer NOT NULL,
 block_number numeric(78,0) NOT NULL,
 block_hash text NOT NULL,
 block_timestamp bigint NOT NULL,
 event_name text NOT NULL,
 payload jsonb NOT NULL,
 PRIMARY KEY(chain_id,transaction_hash,log_index)
);
CREATE INDEX economy_chain_events_block ON economy_chain_events(block_number,log_index);
CREATE TABLE economy_index_state (
 settlement_address text PRIMARY KEY,
 block_number numeric(78,0) NOT NULL,
 block_hash text NOT NULL,
 snapshot jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE economy_price_baskets (
 id text PRIMARY KEY,
 asset text NOT NULL CHECK(asset IN ('HBAR','USDC')),
 components jsonb NOT NULL,
 effective_at timestamptz NOT NULL,
 source_reference text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE economy_observations (
 observation_hash text PRIMARY KEY,
 asset text NOT NULL CHECK(asset IN ('HBAR','USDC')),
 window_start bigint NOT NULL,
 window_end bigint NOT NULL CHECK(window_end>window_start),
 input_root text NOT NULL,
 methodology text NOT NULL,
 metrics jsonb NOT NULL,
 transaction_hash text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(asset,window_start,window_end,methodology)
);
CREATE FUNCTION economy_immutable_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Economy evidence is append-only'; END;
$$;
CREATE TRIGGER economy_events_immutable BEFORE UPDATE OR DELETE ON economy_chain_events FOR EACH ROW EXECUTE FUNCTION economy_immutable_row();
CREATE TRIGGER economy_baskets_immutable BEFORE UPDATE OR DELETE ON economy_price_baskets FOR EACH ROW EXECUTE FUNCTION economy_immutable_row();
CREATE TRIGGER economy_observations_immutable BEFORE UPDATE OR DELETE ON economy_observations FOR EACH ROW EXECUTE FUNCTION economy_immutable_row();
