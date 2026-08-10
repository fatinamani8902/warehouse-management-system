BEGIN;

ALTER TABLE public.grn_lines
  ADD COLUMN IF NOT EXISTS expected_qty numeric(18, 4) NULL;

UPDATE public.grn_lines
SET expected_qty = received_qty
WHERE expected_qty IS NULL;

ALTER TABLE public.grn_lines
  ALTER COLUMN expected_qty SET NOT NULL;

ALTER TABLE public.grn_lines
  DROP CONSTRAINT IF EXISTS grn_lines_expected_qty_check;

ALTER TABLE public.grn_lines
  ADD CONSTRAINT grn_lines_expected_qty_check
  CHECK (expected_qty >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS uq_grns_tenant_asn
  ON public.grns (tenant_id, asn_id)
  WHERE asn_id IS NOT NULL;

SELECT setval(
  'public.grn_id_seq',
  GREATEST(
    COALESCE((
      SELECT max(substring(grn_id FROM '[0-9]+$')::bigint)
      FROM public.grns
      WHERE grn_id ~ '^GRN[0-9]+$'
    ), 0),
    1
  ),
  true
);

SELECT setval(
  'public.grn_line_id_seq',
  GREATEST(
    COALESCE((
      SELECT max(substring(grn_line_id FROM '[0-9]+$')::bigint)
      FROM public.grn_lines
      WHERE grn_line_id ~ '^GRL[0-9]+$'
    ), 0),
    1
  ),
  true
);

COMMIT;
