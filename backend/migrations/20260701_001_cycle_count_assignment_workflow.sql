BEGIN;

ALTER TABLE public.cycle_counts
  ADD COLUMN IF NOT EXISTS assigned_to_user_id text,
  ADD COLUMN IF NOT EXISTS assigned_by text,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

ALTER TABLE public.cycle_counts
  DROP CONSTRAINT IF EXISTS cycle_counts_status_check;

ALTER TABLE public.cycle_counts
  ADD CONSTRAINT cycle_counts_status_check
  CHECK (status IN (
    'planned',
    'assigned',
    'in_progress',
    'submitted',
    'approved',
    'rejected',
    'reconciled',
    'closed',
    'cancelled'
  ));

CREATE INDEX IF NOT EXISTS ix_cycle_counts_assigned_operator
  ON public.cycle_counts (tenant_id, warehouse_id, assigned_to_user_id, status, created_at DESC);

COMMIT;
