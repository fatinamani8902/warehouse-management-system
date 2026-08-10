BEGIN;

ALTER TABLE public.inventory_transactions
  DROP CONSTRAINT IF EXISTS inventory_transactions_transaction_type_check;

ALTER TABLE public.inventory_transactions
  ADD CONSTRAINT inventory_transactions_transaction_type_check
  CHECK (
    transaction_type IS NULL
    OR transaction_type IN (
      'receipt',
      'adjustment',
      'adjustment_in',
      'adjustment_out',
      'adjustment_override',
      'transfer',
      'putaway',
      'issue'
    )
  );

CREATE INDEX IF NOT EXISTS ix_adjustment_lines_tenant_adjustment
  ON public.adjustment_lines (tenant_id, adj_id);

COMMIT;

-- Verification
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.inventory_transactions'::regclass
  AND conname = 'inventory_transactions_transaction_type_check';

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname = 'ix_adjustment_lines_tenant_adjustment';
