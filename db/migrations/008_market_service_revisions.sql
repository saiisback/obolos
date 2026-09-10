-- Seller agent attribution is optional. The name is captured at publication;
-- changing an agent name later does not rewrite the listing's attribution.
ALTER TABLE platform_agents ADD CONSTRAINT platform_agents_id_owner UNIQUE(id,user_id);
ALTER TABLE platform_market_services
 ADD COLUMN agent_id uuid,
 ADD COLUMN agent_name text,
 ADD CONSTRAINT platform_market_services_agent_owner FOREIGN KEY(agent_id,user_id) REFERENCES platform_agents(id,user_id),
 ADD CONSTRAINT platform_market_services_agent_label CHECK(
  (agent_id IS NULL AND agent_name IS NULL) OR
  (agent_id IS NOT NULL AND agent_name IS NOT NULL AND length(btrim(agent_name)) BETWEEN 1 AND 80)
 );

CREATE TABLE platform_market_service_revisions (
 service_id uuid NOT NULL REFERENCES platform_market_services(id),
 revision integer NOT NULL CHECK(revision>0),
 name text NOT NULL,
 description text NOT NULL,
 price_atomic integer NOT NULL CHECK(price_atomic BETWEEN 1000 AND 1000000),
 active boolean NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 source text NOT NULL DEFAULT 'change' CHECK(source IN ('change','backfill')),
 PRIMARY KEY(service_id,revision)
);
-- Earlier edits were not retained. Record only the known current state, at
-- migration time, rather than manufacturing old revisions or their timestamps.
INSERT INTO platform_market_service_revisions(service_id,revision,name,description,price_atomic,active,source)
 SELECT id,revision,name,description,price_atomic,active,'backfill' FROM platform_market_services;

CREATE FUNCTION record_market_service_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.agent_id IS DISTINCT FROM OLD.agent_id OR NEW.agent_name IS DISTINCT FROM OLD.agent_name
   OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.recipient IS DISTINCT FROM OLD.recipient THEN
   RAISE EXCEPTION 'Listing ownership, attribution and payout destination are immutable';
  END IF;
  IF NEW.revision<>OLD.revision+1 THEN
   RAISE EXCEPTION 'A listing edit must advance its revision by one';
  END IF;
 END IF;
 INSERT INTO platform_market_service_revisions(service_id,revision,name,description,price_atomic,active)
 VALUES(NEW.id,NEW.revision,NEW.name,NEW.description,NEW.price_atomic,NEW.active);
 RETURN NEW;
END;
$$;
CREATE TRIGGER market_service_revision AFTER INSERT OR UPDATE ON platform_market_services
 FOR EACH ROW EXECUTE FUNCTION record_market_service_revision();

-- History writes share the listing statement's transaction. Concurrent updates
-- serialize on the listing row; any history insert failure rolls back the edit.
CREATE FUNCTION reject_market_revision_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Listing revision history is append-only';
END;
$$;
CREATE TRIGGER market_revision_immutable BEFORE UPDATE OR DELETE ON platform_market_service_revisions
 FOR EACH ROW EXECUTE FUNCTION reject_market_revision_mutation();
