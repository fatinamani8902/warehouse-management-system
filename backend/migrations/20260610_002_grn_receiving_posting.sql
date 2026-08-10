BEGIN;

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS is_default_receiving boolean NOT NULL DEFAULT false;

WITH receiving_rank AS (
  SELECT
    location_id,
    row_number() OVER (
      PARTITION BY tenant_id, warehouse_id
      ORDER BY location_id
    ) AS row_number,
    bool_or(is_default_receiving) OVER (
      PARTITION BY tenant_id, warehouse_id
    ) AS has_default
  FROM public.locations
  WHERE location_type = 'receiving'
    AND is_active = true
)
UPDATE public.locations AS location
SET is_default_receiving = true
FROM receiving_rank
WHERE location.location_id = receiving_rank.location_id
  AND receiving_rank.row_number = 1
  AND receiving_rank.has_default = false;

CREATE UNIQUE INDEX IF NOT EXISTS ux_locations_default_receiving
  ON public.locations (tenant_id, warehouse_id)
  WHERE location_type = 'receiving'
    AND is_default_receiving = true;

ALTER TABLE public.grns
  DROP CONSTRAINT IF EXISTS grns_status_check;

ALTER TABLE public.grns
  ADD CONSTRAINT grns_status_check
  CHECK (status IN (
    'receiving',
    'qc',
    'putaway_pending',
    'completed',
    'posted',
    'cancelled'
  ));

ALTER TABLE public.putaway_tasks
  ADD COLUMN IF NOT EXISTS source_location_id text,
  ADD COLUMN IF NOT EXISTS destination_location_id text,
  ADD COLUMN IF NOT EXISTS lot_no text,
  ADD COLUMN IF NOT EXISTS serial_no text,
  ADD COLUMN IF NOT EXISTS reference_type text,
  ADD COLUMN IF NOT EXISTS reference_id text,
  ADD COLUMN IF NOT EXISTS posting_key text;

ALTER TABLE public.putaway_tasks
  DROP CONSTRAINT IF EXISTS putaway_tasks_status_check;

ALTER TABLE public.putaway_tasks
  ADD CONSTRAINT putaway_tasks_status_check
  CHECK (status IN (
    'open',
    'pending',
    'assigned',
    'in_progress',
    'done',
    'completed',
    'cancelled',
    'exception'
  ));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'putaway_tasks_source_location_id_fkey'
      AND conrelid = 'public.putaway_tasks'::regclass
  ) THEN
    ALTER TABLE public.putaway_tasks
      ADD CONSTRAINT putaway_tasks_source_location_id_fkey
      FOREIGN KEY (source_location_id)
      REFERENCES public.locations(location_id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'putaway_tasks_destination_location_id_fkey'
      AND conrelid = 'public.putaway_tasks'::regclass
  ) THEN
    ALTER TABLE public.putaway_tasks
      ADD CONSTRAINT putaway_tasks_destination_location_id_fkey
      FOREIGN KEY (destination_location_id)
      REFERENCES public.locations(location_id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_putaway_tasks_posting_key
  ON public.putaway_tasks (
    tenant_id,
    reference_type,
    reference_id,
    posting_key
  )
  WHERE reference_type IS NOT NULL
    AND reference_id IS NOT NULL
    AND posting_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_locations_receiving_lookup
  ON public.locations (
    tenant_id,
    warehouse_id,
    location_type,
    is_active,
    is_default_receiving
  );

COMMIT;

-- Verification
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'locations' AND column_name = 'is_default_receiving')
    OR (
      table_name = 'putaway_tasks'
      AND column_name IN (
        'source_location_id',
        'destination_location_id',
        'lot_no',
        'serial_no',
        'reference_type',
        'reference_id',
        'posting_key'
      )
    )
  )
ORDER BY table_name, column_name;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'ux_locations_default_receiving',
    'ux_putaway_tasks_posting_key',
    'ix_locations_receiving_lookup'
  )
ORDER BY indexname;
