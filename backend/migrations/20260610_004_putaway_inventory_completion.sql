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
      'putaway',
      'issue'
    )
  );

ALTER TABLE public.putaway_tasks
  ADD COLUMN IF NOT EXISTS completed_by text,
  ADD COLUMN IF NOT EXISTS actual_bin_code text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.putaway_tasks'::regclass
      AND conname = 'putaway_tasks_completed_by_fkey'
  ) THEN
    ALTER TABLE public.putaway_tasks
      ADD CONSTRAINT putaway_tasks_completed_by_fkey
      FOREIGN KEY (completed_by)
      REFERENCES public.users(user_id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;

-- Verification
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'putaway_tasks'
  AND column_name = 'completed_by';

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN (
  'public.inventory_transactions'::regclass,
  'public.putaway_tasks'::regclass
)
  AND conname IN (
    'inventory_transactions_transaction_type_check',
    'putaway_tasks_completed_by_fkey'
  )
ORDER BY conname;
