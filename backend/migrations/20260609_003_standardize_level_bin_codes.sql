BEGIN;

LOCK TABLE public.warehouse_levels, public.warehouse_bins IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE level_code_repair ON COMMIT DROP AS
WITH invalid_levels AS (
  SELECT
    level.tenant_id,
    level.bay_id,
    level.level_id,
    row_number() OVER (
      PARTITION BY level.tenant_id, level.bay_id
      ORDER BY level.created_at, level.level_id
    ) AS repair_rank
  FROM public.warehouse_levels level
  WHERE level.level_code !~ '^L[0-9]{2,}$'
),
available_codes AS (
  SELECT
    parent.tenant_id,
    parent.bay_id,
    candidate.code_number,
    row_number() OVER (
      PARTITION BY parent.tenant_id, parent.bay_id
      ORDER BY candidate.code_number
    ) AS available_rank
  FROM (
    SELECT DISTINCT tenant_id, bay_id
    FROM invalid_levels
  ) parent
  CROSS JOIN LATERAL generate_series(
    1,
    (
      SELECT count(*)::integer + 1000
      FROM public.warehouse_levels counted
      WHERE counted.tenant_id = parent.tenant_id
        AND counted.bay_id = parent.bay_id
    )
  ) candidate(code_number)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.warehouse_levels existing
    WHERE existing.tenant_id = parent.tenant_id
      AND existing.bay_id = parent.bay_id
      AND existing.level_code ~ '^L[0-9]{2,}$'
      AND substring(existing.level_code FROM 2)::bigint = candidate.code_number
  )
)
SELECT
  invalid_levels.tenant_id,
  invalid_levels.bay_id,
  invalid_levels.level_id,
  'L' || lpad(available_codes.code_number::text, 2, '0') AS repaired_level_code
FROM invalid_levels
JOIN available_codes
  ON available_codes.tenant_id = invalid_levels.tenant_id
 AND available_codes.bay_id = invalid_levels.bay_id
 AND available_codes.available_rank = invalid_levels.repair_rank;

UPDATE public.warehouse_levels level
SET level_code = '__LEVEL__' || level.level_id
FROM level_code_repair repair
WHERE level.tenant_id = repair.tenant_id
  AND level.bay_id = repair.bay_id
  AND level.level_id = repair.level_id;

UPDATE public.warehouse_levels level
SET level_code = repair.repaired_level_code
FROM level_code_repair repair
WHERE level.tenant_id = repair.tenant_id
  AND level.bay_id = repair.bay_id
  AND level.level_id = repair.level_id;

CREATE TEMP TABLE bin_code_repair ON COMMIT DROP AS
WITH invalid_bins AS (
  SELECT
    bin.tenant_id,
    bin.level_id,
    bin.bin_id,
    row_number() OVER (
      PARTITION BY bin.tenant_id, bin.level_id
      ORDER BY bin.created_at, bin.bin_id
    ) AS repair_rank
  FROM public.warehouse_bins bin
  WHERE bin.bin_code !~ '^B[0-9]{3,}$'
),
available_codes AS (
  SELECT
    parent.tenant_id,
    parent.level_id,
    candidate.code_number,
    row_number() OVER (
      PARTITION BY parent.tenant_id, parent.level_id
      ORDER BY candidate.code_number
    ) AS available_rank
  FROM (
    SELECT DISTINCT tenant_id, level_id
    FROM invalid_bins
  ) parent
  CROSS JOIN LATERAL generate_series(
    1,
    (
      SELECT count(*)::integer + 10000
      FROM public.warehouse_bins counted
      WHERE counted.tenant_id = parent.tenant_id
        AND counted.level_id = parent.level_id
    )
  ) candidate(code_number)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.warehouse_bins existing
    WHERE existing.tenant_id = parent.tenant_id
      AND existing.level_id = parent.level_id
      AND existing.bin_code ~ '^B[0-9]{3,}$'
      AND substring(existing.bin_code FROM 2)::bigint = candidate.code_number
  )
)
SELECT
  invalid_bins.tenant_id,
  invalid_bins.level_id,
  invalid_bins.bin_id,
  'B' || lpad(available_codes.code_number::text, 3, '0') AS repaired_bin_code
FROM invalid_bins
JOIN available_codes
  ON available_codes.tenant_id = invalid_bins.tenant_id
 AND available_codes.level_id = invalid_bins.level_id
 AND available_codes.available_rank = invalid_bins.repair_rank;

UPDATE public.warehouse_bins bin
SET bin_code = '__BIN__' || bin.bin_id
FROM bin_code_repair repair
WHERE bin.tenant_id = repair.tenant_id
  AND bin.level_id = repair.level_id
  AND bin.bin_id = repair.bin_id;

UPDATE public.warehouse_bins bin
SET bin_code = repair.repaired_bin_code
FROM bin_code_repair repair
WHERE bin.tenant_id = repair.tenant_id
  AND bin.level_id = repair.level_id
  AND bin.bin_id = repair.bin_id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.warehouse_levels WHERE level_code !~ '^L[0-9]{2,}$') THEN
    RAISE EXCEPTION 'Level code backfill failed: invalid level_code remains';
  END IF;

  IF EXISTS (SELECT 1 FROM public.warehouse_bins WHERE bin_code !~ '^B[0-9]{3,}$') THEN
    RAISE EXCEPTION 'Bin code backfill failed: invalid bin_code remains';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'warehouse_levels_code_format_check'
      AND conrelid = 'public.warehouse_levels'::regclass
  ) THEN
    ALTER TABLE public.warehouse_levels
      ADD CONSTRAINT warehouse_levels_code_format_check
      CHECK (level_code ~ '^L[0-9]{2,}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'warehouse_bins_code_format_check'
      AND conrelid = 'public.warehouse_bins'::regclass
  ) THEN
    ALTER TABLE public.warehouse_bins
      ADD CONSTRAINT warehouse_bins_code_format_check
      CHECK (bin_code ~ '^B[0-9]{3,}$');
  END IF;
END $$;

COMMIT;

-- Migration verification query. All validity and duplicate columns must be true/zero.
SELECT
  (SELECT count(*) FROM public.warehouse_levels WHERE level_code !~ '^L[0-9]{2,}$') AS invalid_level_codes,
  (SELECT count(*) FROM public.warehouse_bins WHERE bin_code !~ '^B[0-9]{3,}$') AS invalid_bin_codes,
  (
    SELECT count(*) FROM (
      SELECT tenant_id, bay_id, level_code
      FROM public.warehouse_levels
      GROUP BY tenant_id, bay_id, level_code
      HAVING count(*) > 1
    ) duplicates
  ) AS duplicate_level_codes,
  (
    SELECT count(*) FROM (
      SELECT tenant_id, level_id, bin_code
      FROM public.warehouse_bins
      GROUP BY tenant_id, level_id, bin_code
      HAVING count(*) > 1
    ) duplicates
  ) AS duplicate_bin_codes;

SELECT
  level.tenant_id,
  level.level_id,
  level.level_code,
  bin.bin_id,
  bin.bin_code,
  concat_ws(
    '-',
    warehouse.warehouse_code,
    zone.zone_code,
    aisle.aisle_code,
    bay.bay_code,
    level.level_code,
    bin.bin_code
  ) AS location_code
FROM public.warehouse_levels level
JOIN public.warehouse_bays bay
  ON bay.tenant_id = level.tenant_id AND bay.bay_id = level.bay_id
JOIN public.warehouse_aisles aisle
  ON aisle.tenant_id = bay.tenant_id AND aisle.aisle_id = bay.aisle_id
JOIN public.warehouse_zones zone
  ON zone.tenant_id = aisle.tenant_id AND zone.zone_id = aisle.zone_id
JOIN public.warehouses warehouse
  ON warehouse.tenant_id = zone.tenant_id AND warehouse.warehouse_id = zone.warehouse_id
LEFT JOIN public.warehouse_bins bin
  ON bin.tenant_id = level.tenant_id AND bin.level_id = level.level_id
ORDER BY level.tenant_id, level.bay_id, level.level_code, bin.bin_code;
