-- Migration: Add tenant_id to user_roles
-- Purpose: Tenant-scope user role assignments while preserving existing rows.
-- Note: Forward migration is executable. Rollback SQL is commented at the bottom.

BEGIN;

-- 1. Add tenant_id column.
ALTER TABLE IF EXISTS public.user_roles
  ADD COLUMN IF NOT EXISTS tenant_id text;

-- 2. Backfill tenant_id from users.
UPDATE public.user_roles ur
SET tenant_id = u.tenant_id
FROM public.users u
WHERE ur.user_id = u.user_id
  AND ur.tenant_id IS NULL;

-- 3. Stop if any rows could not be backfilled.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE tenant_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot migrate user_roles: tenant_id backfill failed for one or more rows';
  END IF;
END $$;

-- 4. Enforce required tenant_id.
ALTER TABLE IF EXISTS public.user_roles
  ALTER COLUMN tenant_id SET NOT NULL;

-- 5. Add indexes.
CREATE INDEX IF NOT EXISTS idx_user_roles_tenant_id
  ON public.user_roles (tenant_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_tenant_user
  ON public.user_roles (tenant_id, user_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_tenant_role
  ON public.user_roles (tenant_id, role_id);

-- Required parent key for composite tenant consistency validation.
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_tenant_user
  ON public.users (tenant_id, user_id);

-- 6. Add tenant FK.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_roles_tenant_id_fkey'
      AND conrelid = 'public.user_roles'::regclass
  ) THEN
    ALTER TABLE public.user_roles
      ADD CONSTRAINT user_roles_tenant_id_fkey
      FOREIGN KEY (tenant_id)
      REFERENCES public.tenants(tenant_id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.user_roles
  VALIDATE CONSTRAINT user_roles_tenant_id_fkey;

-- 7. Add composite tenant/user consistency FK.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_roles_tenant_user_fkey'
      AND conrelid = 'public.user_roles'::regclass
  ) THEN
    ALTER TABLE public.user_roles
      ADD CONSTRAINT user_roles_tenant_user_fkey
      FOREIGN KEY (tenant_id, user_id)
      REFERENCES public.users(tenant_id, user_id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.user_roles
  VALIDATE CONSTRAINT user_roles_tenant_user_fkey;

COMMIT;

-- Risk notes:
-- - This migration fails intentionally if user_roles contains orphaned user_id values.
-- - Existing primary key (user_id, role_id) is preserved.
-- - This does not enable RLS on user_roles.
-- - ux_users_tenant_user may also be used by later tenant consistency migrations.

-- Rollback SQL:
-- BEGIN;
--
-- ALTER TABLE IF EXISTS public.user_roles
--   DROP CONSTRAINT IF EXISTS user_roles_tenant_user_fkey;
--
-- ALTER TABLE IF EXISTS public.user_roles
--   DROP CONSTRAINT IF EXISTS user_roles_tenant_id_fkey;
--
-- DROP INDEX IF EXISTS public.idx_user_roles_tenant_role;
-- DROP INDEX IF EXISTS public.idx_user_roles_tenant_user;
-- DROP INDEX IF EXISTS public.idx_user_roles_tenant_id;
--
-- ALTER TABLE IF EXISTS public.user_roles
--   DROP COLUMN IF EXISTS tenant_id;
--
-- DROP INDEX IF EXISTS public.ux_users_tenant_user;
--
-- COMMIT;
