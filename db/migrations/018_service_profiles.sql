-- Capability descriptions are separate from immutable service/payment terms.
CREATE TABLE economy_service_profiles (
 service_hash text PRIMARY KEY REFERENCES economy_services(service_hash),
 profile jsonb NOT NULL CHECK(jsonb_typeof(profile)='object'),
 updated_at timestamptz NOT NULL DEFAULT now()
);
