BEGIN;

ALTER TABLE public.asns
  ADD COLUMN IF NOT EXISTS notes text NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS cancelled_by text NULL;

ALTER TABLE public.asns
  DROP CONSTRAINT IF EXISTS asns_status_check;

ALTER TABLE public.asns
  ADD CONSTRAINT asns_status_check
  CHECK (
    status = ANY (
      ARRAY[
        'draft'::text,
        'pending'::text,
        'in_transit'::text,
        'arrived'::text,
        'receiving'::text,
        'completed'::text,
        'closed'::text,
        'cancelled'::text
      ]
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'asns_cancelled_by_fkey'
      AND conrelid = 'public.asns'::regclass
  ) THEN
    ALTER TABLE public.asns
      ADD CONSTRAINT asns_cancelled_by_fkey
      FOREIGN KEY (cancelled_by)
      REFERENCES public.users(user_id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_asns_tenant_created_at
  ON public.asns (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_asn_lines_tenant_asn
  ON public.asn_lines (tenant_id, asn_id, line_no);

SELECT setval(
  'public.asn_id_seq',
  GREATEST(
    COALESCE((
      SELECT max(substring(asn_id FROM '[0-9]+$')::bigint)
      FROM public.asns
    ), 0),
    1
  ),
  true
);

SELECT setval(
  'public.asn_line_id_seq',
  GREATEST(
    COALESCE((
      SELECT max(substring(asn_line_id FROM '[0-9]+$')::bigint)
      FROM public.asn_lines
    ), 0),
    1
  ),
  true
);

COMMIT;
