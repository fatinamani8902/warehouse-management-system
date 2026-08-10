BEGIN;

ALTER TABLE public.returns
  DROP CONSTRAINT IF EXISTS returns_status_check;

ALTER TABLE public.returns
  ADD CONSTRAINT returns_status_check
  CHECK (
    status = ANY (ARRAY[
      'initiated'::text,
      'awaiting_receipt'::text,
      'received'::text,
      'inspected'::text,
      'closed'::text,
      'cancelled'::text,
      'created'::text,
      'new'::text,
      'confirmed'::text
    ])
  );

COMMIT;
