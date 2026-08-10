BEGIN;

ALTER TABLE public.grns
  ADD COLUMN IF NOT EXISTS supplier_id text NULL,
  ADD COLUMN IF NOT EXISTS notes text NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS cancelled_by text NULL,
  ADD COLUMN IF NOT EXISTS posted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS posted_by text NULL;

UPDATE public.grns g
SET supplier_id = a.supplier_id
FROM public.asns a
WHERE g.tenant_id = a.tenant_id
  AND g.asn_id = a.asn_id
  AND g.supplier_id IS NULL;

ALTER TABLE public.grns
  DROP CONSTRAINT IF EXISTS grns_status_check;

ALTER TABLE public.grns
  ADD CONSTRAINT grns_status_check
  CHECK (status IN (
    'draft',
    'receiving',
    'qc',
    'putaway_pending',
    'completed',
    'posted',
    'cancelled'
  ));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'grns_supplier_id_fkey'
      AND conrelid = 'public.grns'::regclass
  ) THEN
    ALTER TABLE public.grns
      ADD CONSTRAINT grns_supplier_id_fkey
      FOREIGN KEY (supplier_id)
      REFERENCES public.suppliers(supplier_id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'grns_cancelled_by_fkey'
      AND conrelid = 'public.grns'::regclass
  ) THEN
    ALTER TABLE public.grns
      ADD CONSTRAINT grns_cancelled_by_fkey
      FOREIGN KEY (cancelled_by)
      REFERENCES public.users(user_id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'grns_posted_by_fkey'
      AND conrelid = 'public.grns'::regclass
  ) THEN
    ALTER TABLE public.grns
      ADD CONSTRAINT grns_posted_by_fkey
      FOREIGN KEY (posted_by)
      REFERENCES public.users(user_id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_grns_tenant_created_at
  ON public.grns (tenant_id, created_at DESC);

COMMIT;
