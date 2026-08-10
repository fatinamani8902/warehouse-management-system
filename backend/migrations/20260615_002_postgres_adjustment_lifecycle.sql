BEGIN;

ALTER TABLE public.adjustments
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_note text,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by text,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by text;

ALTER TABLE public.adjustments
  DROP CONSTRAINT IF EXISTS adjustments_status_check;

UPDATE public.adjustments
SET status = 'approved'
WHERE status = 'posted';

ALTER TABLE public.adjustments
  ADD CONSTRAINT adjustments_status_check
  CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled'));

SELECT setval(
  'public.adj_id_seq',
  GREATEST(
    COALESCE(
      (
        SELECT max(NULLIF(regexp_replace(adj_id, '\D', '', 'g'), '')::bigint)
        FROM public.adjustments
      ),
      0
    ),
    1
  ),
  EXISTS (SELECT 1 FROM public.adjustments)
);

SELECT setval(
  'public.adj_line_id_seq',
  GREATEST(
    COALESCE(
      (
        SELECT max(NULLIF(regexp_replace(adj_line_id, '\D', '', 'g'), '')::bigint)
        FROM public.adjustment_lines
      ),
      0
    ),
    1
  ),
  EXISTS (SELECT 1 FROM public.adjustment_lines)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.adjustments'::regclass
      AND conname = 'adjustments_rejected_by_fkey'
  ) THEN
    ALTER TABLE public.adjustments
      ADD CONSTRAINT adjustments_rejected_by_fkey
      FOREIGN KEY (rejected_by) REFERENCES public.users(user_id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.adjustments'::regclass
      AND conname = 'adjustments_cancelled_by_fkey'
  ) THEN
    ALTER TABLE public.adjustments
      ADD CONSTRAINT adjustments_cancelled_by_fkey
      FOREIGN KEY (cancelled_by) REFERENCES public.users(user_id) ON DELETE SET NULL;
  END IF;
END
$$;

ALTER TABLE public.inventory_transactions
  DROP CONSTRAINT IF EXISTS inventory_transactions_tx_type_check;

ALTER TABLE public.inventory_transactions
  ADD CONSTRAINT inventory_transactions_tx_type_check
  CHECK (
    tx_type IS NULL
    OR tx_type IN (
      'RECEIPT',
      'PUTAWAY',
      'MOVE',
      'ALLOCATE',
      'PICK',
      'PACK',
      'SHIP',
      'RETURN',
      'ADJUST',
      'ADJUSTMENT',
      'CYCLE_COUNT'
    )
  );

CREATE INDEX IF NOT EXISTS ix_adjustments_tenant_warehouse_created
  ON public.adjustments (tenant_id, warehouse_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_adjustments_tenant_warehouse_status
  ON public.adjustments (tenant_id, warehouse_id, status);

CREATE INDEX IF NOT EXISTS ix_adjustment_lines_tenant_adjustment
  ON public.adjustment_lines (tenant_id, adj_id);

INSERT INTO public.lov_groups (
  tenant_id,
  group_code,
  group_name,
  description,
  is_system
)
SELECT
  tenant.tenant_id,
  'ADJUSTMENT_REASON',
  'Inventory Adjustment Reasons',
  'Reason codes used by PostgreSQL inventory adjustments',
  true
FROM public.tenants tenant
ON CONFLICT (tenant_id, group_code) DO NOTHING;

INSERT INTO public.lov_values (
  tenant_id,
  lov_group_id,
  value_code,
  value_label,
  sort_order,
  is_active
)
SELECT
  reason.tenant_id,
  reason.lov_group_id,
  value.value_code,
  value.value_label,
  value.sort_order,
  true
FROM public.lov_groups reason
CROSS JOIN (
  VALUES
    ('MISCOUNTED', 'Miscounted', 10),
    ('DAMAGED', 'Damaged', 20),
    ('CYCLE_VARIANCE', 'Cycle Count Variance', 30),
    ('FOUND_STOCK', 'Found Stock', 40),
    ('OTHER', 'Other', 50)
) AS value(value_code, value_label, sort_order)
WHERE reason.group_code = 'ADJUSTMENT_REASON'
ON CONFLICT (tenant_id, lov_group_id, value_code) DO NOTHING;

ALTER TABLE public.adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adjustment_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'adjustments',
    'adjustment_lines',
    'inventory_balances',
    'inventory_transactions'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = table_name || '_tenant_isolation'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I USING (tenant_id = current_setting(''app.current_tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.current_tenant_id'', true))',
        table_name || '_tenant_isolation',
        table_name
      );
    END IF;
  END LOOP;
END
$$;

COMMIT;

-- Verification
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'adjustments'
ORDER BY ordinal_position;

SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'adjustments',
    'adjustment_lines',
    'inventory_balances',
    'inventory_transactions'
  )
ORDER BY tablename, policyname;
