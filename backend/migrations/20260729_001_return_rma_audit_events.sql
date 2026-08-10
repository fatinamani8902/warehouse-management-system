BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.return_rma_audit_event_seq
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

CREATE TABLE IF NOT EXISTS public.return_rma_audit_events (
  audit_event_id varchar PRIMARY KEY DEFAULT (
    'RAE' || lpad(nextval('public.return_rma_audit_event_seq')::text, 6, '0')
  ),
  tenant_id varchar NOT NULL,
  entity_type varchar NOT NULL,
  entity_id varchar NOT NULL,
  return_id varchar NULL,
  rma_id varchar NULL,
  action_code varchar NOT NULL,
  previous_status varchar NULL,
  new_status varchar NULL,
  performed_by_user_id varchar NOT NULL,
  performed_by_display_name varchar NULL,
  performed_by_role_id varchar NULL,
  remarks text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id varchar NULL,
  ip_address varchar NULL,
  user_agent text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT return_rma_audit_events_entity_type_check
    CHECK (entity_type IN ('return', 'rma')),
  CONSTRAINT return_rma_audit_events_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS ix_return_rma_audit_events_entity_created
  ON public.return_rma_audit_events (tenant_id, entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_return_rma_audit_events_return_created
  ON public.return_rma_audit_events (tenant_id, return_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_return_rma_audit_events_rma_created
  ON public.return_rma_audit_events (tenant_id, rma_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_return_rma_audit_events_action_created
  ON public.return_rma_audit_events (tenant_id, action_code, created_at DESC);

ALTER TABLE public.return_rma_audit_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'return_rma_audit_events'
      AND policyname = 'return_rma_audit_events_tenant_isolation'
  ) THEN
    CREATE POLICY return_rma_audit_events_tenant_isolation
      ON public.return_rma_audit_events
      USING (tenant_id = current_setting('app.current_tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
  END IF;
END
$$;

COMMIT;
