BEGIN;

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
      'adjustment_override',
      'transfer',
      'issue'
    )
  );

COMMIT;

-- Verification
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.inventory_transactions'::regclass
  AND conname = 'inventory_transactions_transaction_type_check';
