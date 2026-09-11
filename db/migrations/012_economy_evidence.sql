-- Attestations are authenticated at ingestion and immutable after acceptance.
CREATE TABLE economy_signed_evidence (
 evidence_hash text PRIMARY KEY CHECK(evidence_hash ~ '^0x[0-9a-f]{64}$'),
 chain_id integer NOT NULL CHECK(chain_id=5042002),
 settlement_address text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('order','window','basket')),
 scope text NOT NULL,
 window_start bigint NOT NULL,
 window_end bigint NOT NULL CHECK(window_end=window_start+86400 AND window_start%86400=0),
 signer text NOT NULL CHECK(signer ~ '^0x[0-9a-f]{40}$'),
 issued_at bigint NOT NULL CHECK(issued_at>=window_end),
 payload jsonb NOT NULL,
 signature text NOT NULL,
 accepted_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(chain_id,settlement_address,kind,scope)
);
CREATE INDEX economy_evidence_window ON economy_signed_evidence(chain_id,settlement_address,window_start,window_end);
CREATE TRIGGER economy_signed_evidence_immutable BEFORE UPDATE OR DELETE ON economy_signed_evidence FOR EACH ROW EXECUTE FUNCTION economy_immutable_row();
-- Preserve historical rows verbatim while allowing immutable observation revisions
-- when real evidence arrives after chain indexing. The content hash remains unique.
DO $$ DECLARE constraint_name text; BEGIN
 SELECT conname INTO STRICT constraint_name FROM pg_constraint WHERE conrelid='economy_observations'::regclass AND contype='u' AND pg_get_constraintdef(oid)='UNIQUE (asset, window_start, window_end, methodology)';
 EXECUTE format('ALTER TABLE economy_observations DROP CONSTRAINT %I',constraint_name);
END $$;
ALTER TABLE economy_observations ADD COLUMN settlement_address text;
CREATE INDEX economy_observations_deployment_window ON economy_observations(settlement_address,asset,window_end,created_at DESC);
