-- Migration: Add tenant_id to user_warehouses
-- Purpose: Tenant-scope user warehouse assignments while preserving existing rows.
-- Note: Forward migration is executable. Rollback SQL is commented at the bottom.

BEGIN;

-- 1. Add tenant_id column.
ALTER TABLE IF EXISTS public.user_warehouses
  ADD COLUMN IF NOT EXISTS tenant_id text;

-- 2. Backfill tenant_id from users.
UPDATE public.user_warehouses uw
SET tenant_id = u.tenant_id
FROM public.users u
WHERE uw.user_id = u.user_id
  AND uw.tenant_id IS NULL;

-- 3. Stop if any rows could not be backfilled.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.user_warehouses
    WHERE tenant_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot migrate user_warehouses: tenant_id backfill failed for one or more rows';
  END IF;
END $$;

-- 4. Stop if any assignment crosses tenant boundaries.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.user_warehouses uw
    JOIN public.warehouses w
      ON w.warehouse_id = uw.warehouse_id
    WHERE uw.tenant_id <> w.tenant_id
  ) THEN
    RAISE EXCEPTION 'Cannot migrate user_warehouses: warehouse tenant mismatch detected';
  END IF;
END $$;

-- 5. Enforce required tenant_id.
ALTER TABLE IF EXISTS public.user_warehouses
  ALTER COLUMN tenant_id SET NOT NULL;

-- 6. Add indexes.
CREATE INDEX IF NOT EXISTS idx_user_warehouses_tenant_id
  ON public.user_warehouses (tenant_id);

CREATE INDEX IF NOT EXISTS idx_user_warehouses_tenant_user
  ON public.user_warehouses (tenant_id, user_id);

CREATE INDEX IF NOT EXISTS idx_user_warehouses_tenant_warehouse
  ON public.user_warehouses (tenant_id, warehouse_id);

-- Required parent keys for composite tenant consistency validation.
CREATE UNIQUE INDEX IF NOT EXISTS ux_warehouses_tenant_warehouse
  ON public.warehouses (tenant_id, warehouse_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_tenant_user
  ON public.users (tenant_id, user_id);

-- 7. Add tenant FK.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_warehouses_tenant_id_fkey'
      AND conrelid = 'public.user_warehouses'::regclass
  ) THEN
    ALTER TABLE public.user_warehouses
      ADD CONSTRAINT user_warehouses_tenant_id_fkey
      FOREIGN KEY (tenant_id)
      REFERENCES public.tenants(tenant_id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.user_warehouses
  VALIDATE CONSTRAINT user_warehouses_tenant_id_fkey;

-- 8. Add composite tenant/user consistency FK.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_warehouses_tenant_user_fkey'
      AND conrelid = 'public.user_warehouses'::regclass
  ) THEN
    ALTER TABLE public.user_warehouses
      ADD CONSTRAINT user_warehouses_tenant_user_fkey
      FOREIGN KEY (tenant_id, user_id)
      REFERENCES public.users(tenant_id, user_id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.user_warehouses
  VALIDATE CONSTRAINT user_warehouses_tenant_user_fkey;

-- 9. Add composite tenant/warehouse consistency FK.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_warehouses_tenant_warehouse_fkey'
      AND conrelid = 'public.user_warehouses'::regclass
  ) THEN
    ALTER TABLE public.user_warehouses
      ADD CONSTRAINT user_warehouses_tenant_warehouse_fkey
      FOREIGN KEY (tenant_id, warehouse_id)
      REFERENCES public.warehouses(tenant_id, warehouse_id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.user_warehouses
  VALIDATE CONSTRAINT user_warehouses_tenant_warehouse_fkey;

COMMIT;

-- Risk notes:
-- - This migration fails intentionally if user_warehouses contains orphaned user_id values.
-- - This migration fails intentionally if a user is assigned to a warehouse from another tenant.
-- - Existing primary key (user_id, warehouse_id) is preserved.
-- - This does not enable RLS on user_warehouses.

-- Rollback SQL:
-- BEGIN;
--
-- ALTER TABLE IF EXISTS public.user_warehouses
--   DROP CONSTRAINT IF EXISTS user_warehouses_tenant_warehouse_fkey;
--
-- ALTER TABLE IF EXISTS public.user_warehouses
--   DROP CONSTRAINT IF EXISTS user_warehouses_tenant_user_fkey;
--
-- ALTER TABLE IF EXISTS public.user_warehouses
--   DROP CONSTRAINT IF EXISTS user_warehouses_tenant_id_fkey;
--
-- DROP INDEX IF EXISTS public.idx_user_warehouses_tenant_warehouse;
-- DROP INDEX IF EXISTS public.idx_user_warehouses_tenant_user;
-- DROP INDEX IF EXISTS public.idx_user_warehouses_tenant_id;
--
-- ALTER TABLE IF EXISTS public.user_warehouses
--   DROP COLUMN IF EXISTS tenant_id;
--
-- DROP INDEX IF EXISTS public.ux_warehouses_tenant_warehouse;
--
-- COMMIT;
