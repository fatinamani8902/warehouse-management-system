-- Migration: Phase 1 RLS for low-risk tenant business tables
-- Purpose: Enable tenant isolation on selected low-risk tables only.
-- Note: Forward migration is executable. Rollback SQL is commented at the bottom.

BEGIN;

-- Excluded by design:
-- - tenants
-- - users
-- - user_roles
-- - user_warehouses
-- - roles
-- - permissions
-- - role_permissions

-- 1. Enable RLS on selected low-risk tenant-scoped tables.
ALTER TABLE IF EXISTS public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.lov_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.lov_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.password_policies ENABLE ROW LEVEL SECURITY;

-- 2. Create tenant isolation policies using app.current_tenant_id only.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'customers',
    'suppliers',
    'skus',
    'warehouses',
    'locations',
    'lov_groups',
    'lov_values',
    'audit_logs',
    'password_policies'
  ]
  LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = tbl
           AND policyname = tbl || '_tenant_isolation'
       )
    THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I
         USING (tenant_id = current_setting(''app.current_tenant_id'', true))
         WITH CHECK (tenant_id = current_setting(''app.current_tenant_id'', true))',
        tbl || '_tenant_isolation',
        tbl
      );
    END IF;
  END LOOP;
END $$;

COMMIT;

-- Risk notes:
-- - Backend must set app.current_tenant_id before querying these tables.
-- - This migration does not enable RLS on tenants, users, user_roles, user_warehouses,
--   roles, permissions, or role_permissions.
-- - This migration should run after password_policies exists and after tenant session
--   variable standardization.
-- - Emergency rollback disables tenant isolation for these Phase 1 tables.

-- Rollback SQL:
-- BEGIN;
--
-- DROP POLICY IF EXISTS customers_tenant_isolation ON public.customers;
-- DROP POLICY IF EXISTS suppliers_tenant_isolation ON public.suppliers;
-- DROP POLICY IF EXISTS skus_tenant_isolation ON public.skus;
-- DROP POLICY IF EXISTS warehouses_tenant_isolation ON public.warehouses;
-- DROP POLICY IF EXISTS locations_tenant_isolation ON public.locations;
-- DROP POLICY IF EXISTS lov_groups_tenant_isolation ON public.lov_groups;
-- DROP POLICY IF EXISTS lov_values_tenant_isolation ON public.lov_values;
-- DROP POLICY IF EXISTS audit_logs_tenant_isolation ON public.audit_logs;
-- DROP POLICY IF EXISTS password_policies_tenant_isolation ON public.password_policies;
--
-- ALTER TABLE IF EXISTS public.customers DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.suppliers DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.skus DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.warehouses DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.locations DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.lov_groups DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.lov_values DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.audit_logs DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE IF EXISTS public.password_policies DISABLE ROW LEVEL SECURITY;
--
-- COMMIT;
