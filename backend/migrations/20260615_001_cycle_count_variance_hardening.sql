BEGIN;

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

COMMIT;

-- Verification
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.inventory_transactions'::regclass
  AND conname = 'inventory_transactions_tx_type_check';
