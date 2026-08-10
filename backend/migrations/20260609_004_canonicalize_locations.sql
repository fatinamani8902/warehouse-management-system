BEGIN;

LOCK TABLE public.locations, public.warehouse_bins IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS bin_id text,
  ADD COLUMN IF NOT EXISTS location_code text;

ALTER TABLE public.locations
  DROP CONSTRAINT IF EXISTS locations_location_type_check,
  DROP CONSTRAINT IF EXISTS locations_storage_bin_check,
  DROP CONSTRAINT IF EXISTS locations_tenant_bin_fkey;

UPDATE public.locations
SET
  location_code = COALESCE(
    NULLIF(btrim(location_code), ''),
    NULLIF(btrim(label), ''),
    location_id
  ),
  location_type = CASE
    WHEN lower(btrim(location_type)) = 'dock' THEN 'receiving'
    ELSE lower(btrim(location_type))
  END;

ALTER TABLE public.locations
  ALTER COLUMN location_code SET NOT NULL,
  ALTER COLUMN location_type SET DEFAULT 'storage';

ALTER TABLE public.locations
  ADD CONSTRAINT locations_location_type_check
  CHECK (
    location_type IN (
      'receiving',
      'staging',
      'storage',
      'quarantine',
      'packing',
      'shipping',
      'adjustment'
    )
  ) NOT VALID,
  ADD CONSTRAINT locations_storage_bin_check
  CHECK (location_type <> 'storage' OR bin_id IS NOT NULL) NOT VALID,
  ADD CONSTRAINT locations_tenant_bin_fkey
  FOREIGN KEY (tenant_id, bin_id)
  REFERENCES public.warehouse_bins(tenant_id, bin_id)
  ON DELETE RESTRICT
  NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS ux_locations_tenant_bin
  ON public.locations (tenant_id, bin_id)
  WHERE bin_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_locations_tenant_type_active
  ON public.locations (tenant_id, location_type, is_active);

CREATE INDEX IF NOT EXISTS ix_locations_tenant_code
  ON public.locations (tenant_id, location_code);

SELECT setval(
  'location_id_seq',
  GREATEST(
    1,
    COALESCE(
      (
        SELECT max(substring(location_id FROM '^LOC([0-9]+)$')::bigint)
        FROM public.locations
        WHERE location_id ~ '^LOC[0-9]+$'
      ),
      0
    )
  ),
  true
);

WITH taxonomy_bins AS (
  SELECT
    bin.tenant_id,
    bin.bin_id,
    warehouse.warehouse_id,
    concat_ws(
      '-',
      warehouse.warehouse_code,
      zone.zone_code,
      aisle.aisle_code,
      bay.bay_code,
      level.level_code,
      bin.bin_code
    ) AS generated_location_code
  FROM public.warehouse_bins bin
  JOIN public.warehouse_levels level
    ON level.tenant_id = bin.tenant_id
   AND level.level_id = bin.level_id
  JOIN public.warehouse_bays bay
    ON bay.tenant_id = level.tenant_id
   AND bay.bay_id = level.bay_id
  JOIN public.warehouse_aisles aisle
    ON aisle.tenant_id = bay.tenant_id
   AND aisle.aisle_id = bay.aisle_id
  JOIN public.warehouse_zones zone
    ON zone.tenant_id = aisle.tenant_id
   AND zone.zone_id = aisle.zone_id
  JOIN public.warehouses warehouse
    ON warehouse.tenant_id = zone.tenant_id
   AND warehouse.warehouse_id = zone.warehouse_id
)
UPDATE public.locations location
SET
  bin_id = taxonomy_bin.bin_id,
  warehouse_id = taxonomy_bin.warehouse_id,
  location_code = taxonomy_bin.generated_location_code,
  label = taxonomy_bin.generated_location_code,
  updated_at = now()
FROM taxonomy_bins taxonomy_bin
WHERE location.tenant_id = taxonomy_bin.tenant_id
  AND location.bin_id IS NULL
  AND lower(btrim(location.location_code)) = lower(taxonomy_bin.generated_location_code)
  AND NOT EXISTS (
    SELECT 1
    FROM public.locations linked
    WHERE linked.tenant_id = taxonomy_bin.tenant_id
      AND linked.bin_id = taxonomy_bin.bin_id
  );

WITH taxonomy_bins AS (
  SELECT
    bin.tenant_id,
    bin.bin_id,
    warehouse.warehouse_id,
    concat_ws(
      '-',
      warehouse.warehouse_code,
      zone.zone_code,
      aisle.aisle_code,
      bay.bay_code,
      level.level_code,
      bin.bin_code
    ) AS generated_location_code,
    (
      warehouse.status = 'active'
      AND zone.status = 'active'
      AND aisle.status = 'active'
      AND bay.status = 'active'
      AND level.status = 'active'
      AND bin.status = 'active'
    ) AS hierarchy_is_active
  FROM public.warehouse_bins bin
  JOIN public.warehouse_levels level
    ON level.tenant_id = bin.tenant_id
   AND level.level_id = bin.level_id
  JOIN public.warehouse_bays bay
    ON bay.tenant_id = level.tenant_id
   AND bay.bay_id = level.bay_id
  JOIN public.warehouse_aisles aisle
    ON aisle.tenant_id = bay.tenant_id
   AND aisle.aisle_id = bay.aisle_id
  JOIN public.warehouse_zones zone
    ON zone.tenant_id = aisle.tenant_id
   AND zone.zone_id = aisle.zone_id
  JOIN public.warehouses warehouse
    ON warehouse.tenant_id = zone.tenant_id
   AND warehouse.warehouse_id = zone.warehouse_id
)
INSERT INTO public.locations (
  tenant_id,
  warehouse_id,
  bin_id,
  location_code,
  label,
  location_type,
  is_active
)
SELECT
  taxonomy_bin.tenant_id,
  taxonomy_bin.warehouse_id,
  taxonomy_bin.bin_id,
  taxonomy_bin.generated_location_code,
  taxonomy_bin.generated_location_code,
  'storage',
  taxonomy_bin.hierarchy_is_active
FROM taxonomy_bins taxonomy_bin
WHERE NOT EXISTS (
  SELECT 1
  FROM public.locations existing
  WHERE existing.tenant_id = taxonomy_bin.tenant_id
    AND existing.bin_id = taxonomy_bin.bin_id
);

ALTER TABLE public.locations
  VALIDATE CONSTRAINT locations_location_type_check,
  VALIDATE CONSTRAINT locations_tenant_bin_fkey;

COMMIT;

-- Verification: all taxonomy bins should have exactly one operational location.
SELECT
  count(*) FILTER (WHERE location.location_id IS NULL) AS bins_without_location,
  count(*) FILTER (WHERE location.location_id IS NOT NULL) AS bins_with_location
FROM public.warehouse_bins bin
LEFT JOIN public.locations location
  ON location.tenant_id = bin.tenant_id
 AND location.bin_id = bin.bin_id;

-- Verification: these are preserved legacy storage exceptions.
SELECT tenant_id, location_id, location_code, location_type
FROM public.locations
WHERE location_type = 'storage'
  AND bin_id IS NULL
ORDER BY tenant_id, location_id;
