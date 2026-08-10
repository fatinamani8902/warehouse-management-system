BEGIN;

ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS transaction_type text,
  ADD COLUMN IF NOT EXISTS posting_key text,
  ADD COLUMN IF NOT EXISTS lot_no text,
  ADD COLUMN IF NOT EXISTS serial_no text;

ALTER TABLE public.inventory_transactions
  DROP CONSTRAINT IF EXISTS inventory_transactions_transaction_type_check;

ALTER TABLE public.inventory_transactions
  ADD CONSTRAINT inventory_transactions_transaction_type_check
  CHECK (
    transaction_type IS NULL
    OR transaction_type IN (
      'receipt',
      'adjustment_in',
      'adjustment_out',
      'transfer',
      'issue'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS ux_inventory_transactions_posting_key
  ON public.inventory_transactions (
    tenant_id,
    reference_type,
    reference_id,
    posting_key
  )
  WHERE reference_type IS NOT NULL
    AND reference_id IS NOT NULL
    AND posting_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_inventory_balances_posting_lookup
  ON public.inventory_balances (
    tenant_id,
    warehouse_id,
    sku_id,
    location_id,
    lot_no,
    serial_no
  );

CREATE INDEX IF NOT EXISTS ix_inventory_transactions_reference
  ON public.inventory_transactions (
    tenant_id,
    reference_type,
    reference_id
  );

ALTER TABLE public.inventory_balances
  DROP CONSTRAINT IF EXISTS inventory_non_negative,
  DROP CONSTRAINT IF EXISTS inventory_reserved_quarantine_non_negative;

ALTER TABLE public.inventory_balances
  ADD CONSTRAINT inventory_reserved_quarantine_non_negative
  CHECK (qty_reserved >= 0 AND qty_quarantine >= 0);

SELECT setval(
  'itx_id_seq',
  GREATEST(
    1,
    COALESCE(
      (
        SELECT max(substring(itx_id FROM '^ITX([0-9]+)$')::bigint)
        FROM public.inventory_transactions
        WHERE itx_id ~ '^ITX[0-9]+$'
      ),
      0
    )
  ),
  true
);

SELECT setval(
  'inv_balance_id_seq',
  GREATEST(
    1,
    COALESCE(
      (
        SELECT max(substring(inv_balance_id FROM '^INV([0-9]+)$')::bigint)
        FROM public.inventory_balances
        WHERE inv_balance_id ~ '^INV[0-9]+$'
      ),
      0
    )
  ),
  true
);

COMMIT;

-- Verification
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'inventory_transactions'
  AND column_name IN ('transaction_type', 'posting_key', 'lot_no', 'serial_no')
ORDER BY column_name;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'ux_inventory_transactions_posting_key',
    'ix_inventory_balances_posting_lookup',
    'ix_inventory_transactions_reference'
  )
ORDER BY indexname;
