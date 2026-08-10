BEGIN;

ALTER TABLE public.warehouses
  ADD COLUMN IF NOT EXISTS warehouse_code text;

UPDATE public.warehouses
SET warehouse_code = warehouse_id
WHERE warehouse_code IS NULL OR btrim(warehouse_code) = '';

ALTER TABLE public.warehouses
  ALTER COLUMN warehouse_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_warehouses_tenant_warehouse
  ON public.warehouses (tenant_id, warehouse_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_warehouses_tenant_code
  ON public.warehouses (tenant_id, warehouse_code);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'warehouses_status_check'
      AND conrelid = 'public.warehouses'::regclass
  ) THEN
    ALTER TABLE public.warehouses
      ADD CONSTRAINT warehouses_status_check
      CHECK (status IN ('active', 'inactive'));
  END IF;
END $$;

CREATE SEQUENCE IF NOT EXISTS warehouse_zone_id_seq;
CREATE SEQUENCE IF NOT EXISTS warehouse_aisle_id_seq;
CREATE SEQUENCE IF NOT EXISTS warehouse_bay_id_seq;
CREATE SEQUENCE IF NOT EXISTS warehouse_level_id_seq;
CREATE SEQUENCE IF NOT EXISTS warehouse_bin_id_seq;

CREATE TABLE IF NOT EXISTS public.warehouse_zones (
  tenant_id text NOT NULL,
  zone_id text PRIMARY KEY DEFAULT ('ZON' || lpad(nextval('warehouse_zone_id_seq')::text, 6, '0')),
  warehouse_id text NOT NULL,
  zone_code text NOT NULL,
  zone_name text NOT NULL,
  zone_type text NOT NULL DEFAULT 'storage',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouse_zones_tenant_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(tenant_id) ON DELETE RESTRICT,
  CONSTRAINT warehouse_zones_warehouse_fkey
    FOREIGN KEY (tenant_id, warehouse_id)
    REFERENCES public.warehouses(tenant_id, warehouse_id) ON DELETE RESTRICT,
  CONSTRAINT warehouse_zones_tenant_code_key UNIQUE (tenant_id, warehouse_id, zone_code),
  CONSTRAINT warehouse_zones_tenant_zone_key UNIQUE (tenant_id, zone_id)
);

ALTER TABLE public.warehouse_zones
  ADD COLUMN IF NOT EXISTS zone_type text NOT NULL DEFAULT 'storage';

CREATE TABLE IF NOT EXISTS public.warehouse_aisles (
  tenant_id text NOT NULL,
  aisle_id text PRIMARY KEY DEFAULT ('AIS' || lpad(nextval('warehouse_aisle_id_seq')::text, 6, '0')),
  zone_id text NOT NULL,
  aisle_code text NOT NULL,
  aisle_name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouse_aisles_tenant_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(tenant_id) ON DELETE RESTRICT,
  CONSTRAINT warehouse_aisles_zone_fkey
    FOREIGN KEY (tenant_id, zone_id)
    REFERENCES public.warehouse_zones(tenant_id, zone_id) ON DELETE RESTRICT,
  CONSTRAINT warehouse_aisles_tenant_code_key UNIQUE (tenant_id, zone_id, aisle_code),
  CONSTRAINT warehouse_aisles_tenant_aisle_key UNIQUE (tenant_id, aisle_id)
);

ALTER TABLE public.warehouse_aisles
  ADD COLUMN IF NOT EXISTS aisle_name text;

UPDATE public.warehouse_aisles
SET aisle_name = aisle_code
WHERE aisle_name IS NULL OR btrim(aisle_name) = '';

ALTER TABLE public.warehouse_aisles
  ALTER COLUMN aisle_name SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.warehouse_bays (
  tenant_id text NOT NULL,
  bay_id text PRIMARY KEY DEFAULT ('BAY' || lpad(nextval('warehouse_bay_id_seq')::text, 6, '0')),
  aisle_id text NOT NULL,
  bay_code text NOT NULL,
  bay_name text NOT NULL,
  width_cm numeric(14, 4) NOT NULL DEFAULT 200,
  depth_cm numeric(14, 4) NOT NULL DEFAULT 50,
  level_height_cm numeric(14, 4) NOT NULL DEFAULT 50,
  level_count integer NOT NULL DEFAULT 4,
  max_weight_kg numeric(14, 4) NOT NULL DEFAULT 500,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouse_bays_tenant_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(tenant_id) ON DELETE RESTRICT,
  CONSTRAINT warehouse_bays_aisle_fkey
    FOREIGN KEY (tenant_id, aisle_id)
    REFERENCES public.warehouse_aisles(tenant_id, aisle_id) ON DELETE RESTRICT,
  CONSTRAINT warehouse_bays_tenant_code_key UNIQUE (tenant_id, aisle_id, bay_code),
  CONSTRAINT warehouse_bays_tenant_bay_key UNIQUE (tenant_id, bay_id),
  CONSTRAINT warehouse_bays_dimensions_check CHECK (
    width_cm >= 0 AND depth_cm >= 0 AND level_height_cm >= 0
    AND level_count > 0 AND max_weight_kg >= 0
  )
);

ALTER TABLE public.warehouse_bays
  ADD COLUMN IF NOT EXISTS bay_name text,
  ADD COLUMN IF NOT EXISTS width_cm numeric(14, 4) NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS depth_cm numeric(14, 4) NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS level_height_cm numeric(14, 4) NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS level_count integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS max_weight_kg numeric(14, 4) NOT NULL DEFAULT 500;

UPDATE public.warehouse_bays
SET bay_name = bay_code
WHERE bay_name IS NULL OR btrim(bay_name) = '';

ALTER TABLE public.warehouse_bays
  ALTER COLUMN bay_name SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.warehouse_levels (
  tenant_id text NOT NULL,
  level_id text PRIMARY KEY DEFAULT ('LVL' || lpad(nextval('warehouse_level_id_seq')::text, 6, '0')),
  bay_id text NOT NULL,
  level_code text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouse_levels_tenant_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(tenant_id) ON DELETE RESTRICT,
  CONSTRAINT warehouse_levels_bay_fkey
    FOREIGN KEY (tenant_id, bay_id)
    REFERENCES public.warehouse_bays(tenant_id, bay_id) ON DELETE RESTRICT,
  CONSTRAINT warehouse_levels_tenant_code_key UNIQUE (tenant_id, bay_id, level_code),
  CONSTRAINT warehouse_levels_tenant_level_key UNIQUE (tenant_id, level_id)
);

CREATE TABLE IF NOT EXISTS public.warehouse_bins (
  tenant_id text NOT NULL,
  bin_id text PRIMARY KEY DEFAULT ('BIN' || lpad(nextval('warehouse_bin_id_seq')::text, 6, '0')),
  level_id text NOT NULL,
  bin_code text NOT NULL,
  max_weight numeric(14, 4),
  max_volume numeric(14, 4),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT warehouse_bins_tenant_fkey
    FOREIGN KEY (tenant_id) REFERENCES public.tenants(tenant_id) ON DELETE RESTRICT,
  CONSTRAINT warehouse_bins_level_fkey
    FOREIGN KEY (tenant_id, level_id)
    REFERENCES public.warehouse_levels(tenant_id, level_id) ON DELETE RESTRICT,
  CONSTRAINT warehouse_bins_tenant_code_key UNIQUE (tenant_id, level_id, bin_code),
  CONSTRAINT warehouse_bins_tenant_bin_key UNIQUE (tenant_id, bin_id),
  CONSTRAINT warehouse_bins_max_weight_check CHECK (max_weight IS NULL OR max_weight >= 0),
  CONSTRAINT warehouse_bins_max_volume_check CHECK (max_volume IS NULL OR max_volume >= 0)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_zones_parent
  ON public.warehouse_zones (tenant_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_aisles_parent
  ON public.warehouse_aisles (tenant_id, zone_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_bays_parent
  ON public.warehouse_bays (tenant_id, aisle_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_levels_parent
  ON public.warehouse_levels (tenant_id, bay_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_bins_parent
  ON public.warehouse_bins (tenant_id, level_id);

SELECT setval(
  'warehouse_id_seq',
  GREATEST(
    COALESCE((SELECT max(substring(warehouse_id FROM 3)::bigint) FROM public.warehouses WHERE warehouse_id ~ '^WH[0-9]+$'), 0),
    1
  ),
  true
);
SELECT setval(
  'warehouse_zone_id_seq',
  GREATEST(COALESCE((SELECT max(substring(zone_id FROM 4)::bigint) FROM public.warehouse_zones WHERE zone_id ~ '^ZON[0-9]+$'), 0), 1),
  true
);
SELECT setval(
  'warehouse_aisle_id_seq',
  GREATEST(COALESCE((SELECT max(substring(aisle_id FROM 4)::bigint) FROM public.warehouse_aisles WHERE aisle_id ~ '^AIS[0-9]+$'), 0), 1),
  true
);
SELECT setval(
  'warehouse_bay_id_seq',
  GREATEST(COALESCE((SELECT max(substring(bay_id FROM 4)::bigint) FROM public.warehouse_bays WHERE bay_id ~ '^BAY[0-9]+$'), 0), 1),
  true
);
SELECT setval(
  'warehouse_level_id_seq',
  GREATEST(COALESCE((SELECT max(substring(level_id FROM 4)::bigint) FROM public.warehouse_levels WHERE level_id ~ '^LVL[0-9]+$'), 0), 1),
  true
);
SELECT setval(
  'warehouse_bin_id_seq',
  GREATEST(COALESCE((SELECT max(substring(bin_id FROM 4)::bigint) FROM public.warehouse_bins WHERE bin_id ~ '^BIN[0-9]+$'), 0), 1),
  true
);

COMMIT;
