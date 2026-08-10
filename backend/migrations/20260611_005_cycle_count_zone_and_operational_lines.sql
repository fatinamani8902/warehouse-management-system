BEGIN;

CREATE TEMP TABLE cycle_counts_needing_operational_rebuild ON COMMIT DROP AS
SELECT tenant_id, cc_id, warehouse_id
FROM public.cycle_counts
WHERE zone_id IS NULL
  AND status = 'planned'
  AND started_at IS NULL
  AND submitted_at IS NULL
  AND approved_at IS NULL;

WITH line_zones AS (
  SELECT
    cc.tenant_id,
    cc.cc_id,
    min(zone.zone_id) AS zone_id,
    count(DISTINCT zone.zone_id) AS zone_count
  FROM public.cycle_counts cc
  JOIN public.cycle_count_lines ccl
    ON ccl.tenant_id = cc.tenant_id
   AND ccl.cc_id = cc.cc_id
  JOIN public.locations location
    ON location.tenant_id = ccl.tenant_id
   AND location.location_id = ccl.location_id
   AND location.warehouse_id = cc.warehouse_id
  JOIN public.warehouse_bins bin
    ON bin.tenant_id = location.tenant_id
   AND bin.bin_id = location.bin_id
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
   AND zone.warehouse_id = cc.warehouse_id
  WHERE cc.zone_id IS NULL
  GROUP BY cc.tenant_id, cc.cc_id
)
UPDATE public.cycle_counts cc
SET zone_id = line_zones.zone_id
FROM line_zones
WHERE cc.tenant_id = line_zones.tenant_id
  AND cc.cc_id = line_zones.cc_id
  AND line_zones.zone_count = 1;

WITH warehouse_zones AS (
  SELECT
    cc.tenant_id,
    cc.cc_id,
    min(zone.zone_id) AS zone_id,
    count(DISTINCT zone.zone_id) AS zone_count
  FROM public.cycle_counts cc
  JOIN public.warehouse_zones zone
    ON zone.tenant_id = cc.tenant_id
   AND zone.warehouse_id = cc.warehouse_id
   AND zone.status = 'active'
  WHERE cc.zone_id IS NULL
  GROUP BY cc.tenant_id, cc.cc_id
)
UPDATE public.cycle_counts cc
SET zone_id = warehouse_zones.zone_id
FROM warehouse_zones
WHERE cc.tenant_id = warehouse_zones.tenant_id
  AND cc.cc_id = warehouse_zones.cc_id
  AND warehouse_zones.zone_count = 1;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.cycle_counts WHERE zone_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot enforce cycle count zones: one or more existing plans have no unambiguous warehouse zone';
  END IF;
END
$$;

DELETE FROM public.cycle_count_lines ccl
USING cycle_counts_needing_operational_rebuild legacy
WHERE ccl.tenant_id = legacy.tenant_id
  AND ccl.cc_id = legacy.cc_id;

INSERT INTO public.cycle_count_lines (
  tenant_id,
  cc_id,
  sku_id,
  location_id,
  expected_qty,
  counted_qty,
  status
)
SELECT
  legacy.tenant_id,
  legacy.cc_id,
  balance.sku_id,
  balance.location_id,
  sum(balance.qty_on_hand)::numeric,
  NULL,
  'pending'
FROM cycle_counts_needing_operational_rebuild legacy
JOIN public.cycle_counts cc
  ON cc.tenant_id = legacy.tenant_id
 AND cc.cc_id = legacy.cc_id
JOIN public.inventory_balances balance
  ON balance.tenant_id = cc.tenant_id
 AND balance.warehouse_id = cc.warehouse_id
JOIN public.locations location
  ON location.tenant_id = balance.tenant_id
 AND location.location_id = balance.location_id
 AND location.warehouse_id = balance.warehouse_id
 AND location.is_active = true
JOIN public.warehouse_bins bin
  ON bin.tenant_id = location.tenant_id
 AND bin.bin_id = location.bin_id
JOIN public.warehouse_levels level
  ON level.tenant_id = bin.tenant_id
 AND level.level_id = bin.level_id
JOIN public.warehouse_bays bay
  ON bay.tenant_id = level.tenant_id
 AND bay.bay_id = level.bay_id
JOIN public.warehouse_aisles aisle
  ON aisle.tenant_id = bay.tenant_id
 AND aisle.aisle_id = bay.aisle_id
 AND aisle.zone_id = cc.zone_id
GROUP BY legacy.tenant_id, legacy.cc_id, balance.sku_id, balance.location_id
HAVING sum(balance.qty_on_hand) > 0;

ALTER TABLE public.cycle_counts
  ALTER COLUMN zone_id SET NOT NULL;

ALTER TABLE public.cycle_counts
  DROP CONSTRAINT IF EXISTS cycle_counts_zone_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'warehouse_zones_tenant_warehouse_zone_key'
      AND conrelid = 'public.warehouse_zones'::regclass
  ) THEN
    ALTER TABLE public.warehouse_zones
      ADD CONSTRAINT warehouse_zones_tenant_warehouse_zone_key
      UNIQUE (tenant_id, warehouse_id, zone_id);
  END IF;
END
$$;

ALTER TABLE public.cycle_counts
  ADD CONSTRAINT cycle_counts_zone_id_fkey
  FOREIGN KEY (tenant_id, warehouse_id, zone_id)
  REFERENCES public.warehouse_zones(tenant_id, warehouse_id, zone_id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS ix_cycle_counts_tenant_warehouse_zone
  ON public.cycle_counts (tenant_id, warehouse_id, zone_id, created_at DESC);

COMMIT;
