-- General tasks are additive; historical research runs and payment journals remain intact.
CREATE UNIQUE INDEX platform_agents_id_owner_unique ON platform_agents(id,user_id);
CREATE TABLE platform_tasks (
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES platform_users(id),
 agent_id uuid NOT NULL REFERENCES platform_agents(id),
 instruction text NOT NULL CHECK(length(instruction) BETWEEN 1 AND 12000),
 budget_atomic numeric(78,0) NOT NULL CHECK(budget_atomic > 0 AND budget_atomic < power(2::numeric,256)),
 idempotency_key text NOT NULL,
 request_hash text NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','planning','needs_approval','approved','running','completed','blocked','cancelled')),
 plan jsonb,
 plan_hash text,
 approved_plan_hash text,
 approval_expires_at timestamptz,
 step_results jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(step_results)='array'),
 error text,
 claim_token text,
 claim_worker text,
 claim_phase text CHECK(claim_phase IN ('plan','execute')),
 claim_until timestamptz,
 execution_worker text,
 revision integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,agent_id,idempotency_key),
 FOREIGN KEY(agent_id,user_id) REFERENCES platform_agents(id,user_id),
 CHECK((plan IS NULL)=(plan_hash IS NULL)),
 CHECK(approved_plan_hash IS NULL OR (approved_plan_hash=plan_hash AND approval_expires_at IS NOT NULL)),
 CHECK(status NOT IN ('approved','running','completed') OR approved_plan_hash IS NOT NULL),
 CHECK(status NOT IN ('running','completed') OR execution_worker IS NOT NULL),
 CHECK(status <> 'completed' OR jsonb_array_length(step_results)=jsonb_array_length(plan->'steps'))
);
CREATE INDEX platform_tasks_owner ON platform_tasks(user_id,created_at DESC);
CREATE INDEX platform_tasks_queue ON platform_tasks(agent_id,status,created_at);
CREATE FUNCTION platform_task_immutable_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.user_id,NEW.agent_id,NEW.instruction,NEW.budget_atomic,NEW.idempotency_key,NEW.request_hash)
   IS DISTINCT FROM (OLD.user_id,OLD.agent_id,OLD.instruction,OLD.budget_atomic,OLD.idempotency_key,OLD.request_hash)
 THEN RAISE EXCEPTION 'Task request terms are immutable'; END IF;
 IF OLD.approved_plan_hash IS NOT NULL AND (NEW.plan,NEW.plan_hash,NEW.approved_plan_hash,NEW.approval_expires_at)
   IS DISTINCT FROM (OLD.plan,OLD.plan_hash,OLD.approved_plan_hash,OLD.approval_expires_at)
 THEN RAISE EXCEPTION 'Approved task plan is immutable'; END IF;
 IF OLD.execution_worker IS NOT NULL AND NEW.execution_worker IS DISTINCT FROM OLD.execution_worker
 THEN RAISE EXCEPTION 'Execution host is sticky'; END IF;
 IF NEW.step_results IS DISTINCT FROM OLD.step_results AND (
   jsonb_array_length(NEW.step_results) < jsonb_array_length(OLD.step_results) OR
   EXISTS(SELECT 1 FROM jsonb_array_elements(OLD.step_results) WITH ORDINALITY old_step(value,position)
     WHERE NEW.step_results->((old_step.position-1)::integer) IS DISTINCT FROM old_step.value)
 ) THEN RAISE EXCEPTION 'Verified task results are append-only'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER platform_task_terms BEFORE UPDATE ON platform_tasks FOR EACH ROW EXECUTE FUNCTION platform_task_immutable_terms();
