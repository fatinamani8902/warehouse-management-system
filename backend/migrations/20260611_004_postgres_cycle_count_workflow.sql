BEGIN;

CREATE SEQUENCE IF NOT EXISTS cycle_count_id_seq START WITH 1 INCREMENT BY 1;

SELECT setval(
  'cycle_count_id_seq',
  GREATEST(
    COALESCE((
      SELECT max((regexp_match(cc_id, '(\d+)$'))[1]::bigint)
      FROM public.cycle_counts
      WHERE cc_id ~ '\d+$'
    ), 0),
    1
  ),
  true
);

ALTER TABLE public.cycle_counts
  ALTER COLUMN cc_id SET DEFAULT (
    'CYC' || lpad(nextval('cycle_count_id_seq')::text, 6, '0')
  ),
  ADD COLUMN IF NOT EXISTS zone_id text,
  ADD COLUMN IF NOT EXISTS planned_date date,
  ADD COLUMN IF NOT EXISTS scope_type text NOT NULL DEFAULT 'FULL_ZONE',
  ADD COLUMN IF NOT EXISTS scope_location_id text,
  ADD COLUMN IF NOT EXISTS scope_sku_ids text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_by text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by text,
  ADD COLUMN IF NOT EXISTS approval_reason_code text,
  ADD COLUMN IF NOT EXISTS approval_note text,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by text;

UPDATE public.cycle_counts
SET planned_date = COALESCE(planned_date, scheduled_at::date, created_at::date)
WHERE planned_date IS NULL;

ALTER TABLE public.cycle_counts
  DROP CONSTRAINT IF EXISTS cycle_counts_status_check;

ALTER TABLE public.cycle_counts
  ADD CONSTRAINT cycle_counts_status_check
  CHECK (status IN (
    'planned',
    'in_progress',
    'submitted',
    'approved',
    'rejected',
    'reconciled',
    'closed',
    'cancelled'
  ));

ALTER TABLE public.cycle_counts
  DROP CONSTRAINT IF EXISTS cycle_counts_scope_type_check;

ALTER TABLE public.cycle_counts
  ADD CONSTRAINT cycle_counts_scope_type_check
  CHECK (scope_type IN ('FULL_ZONE', 'BY_LOCATION', 'BY_SKU'));

CREATE INDEX IF NOT EXISTS ix_cycle_counts_tenant_warehouse_created
  ON public.cycle_counts (tenant_id, warehouse_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_cycle_count_lines_tenant_count
  ON public.cycle_count_lines (tenant_id, cc_id);

COMMIT;
