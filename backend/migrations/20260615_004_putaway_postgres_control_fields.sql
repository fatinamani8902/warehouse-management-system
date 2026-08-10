BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.putevt_id_seq START WITH 1 INCREMENT BY 1;

ALTER TABLE public.putaway_tasks
  ADD COLUMN IF NOT EXISTS exception_reason text,
  ADD COLUMN IF NOT EXISTS validation_result text;

ALTER TABLE public.putaway_task_events
  ALTER COLUMN event_id SET DEFAULT (
    'PUTEVT' || lpad(nextval('public.putevt_id_seq')::text, 6, '0')
  );

SELECT setval(
  'public.putevt_id_seq',
  GREATEST(
    COALESCE(
      (
        SELECT max(NULLIF(regexp_replace(event_id, '\D', '', 'g'), '')::bigint)
        FROM public.putaway_task_events
      ),
      0
    ),
    1
  ),
  EXISTS (SELECT 1 FROM public.putaway_task_events)
);

COMMIT;
