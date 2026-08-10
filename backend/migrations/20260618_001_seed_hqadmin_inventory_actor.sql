BEGIN;

INSERT INTO public.roles (role_id, role_name, description, is_system)
VALUES (
  'hqadmin',
  'HQ Admin',
  'Business administrator for inventory document creation and submission',
  true
)
ON CONFLICT (role_id) DO UPDATE
SET role_name = EXCLUDED.role_name,
    description = EXCLUDED.description,
    is_system = EXCLUDED.is_system;

INSERT INTO public.users (
  tenant_id,
  user_id,
  email,
  user_name,
  first_name,
  last_name,
  is_active,
  password_hash,
  created_at,
  updated_at
)
VALUES (
  'TNT000001',
  'USR000005',
  'hq@acme.com',
  'HQ Admin',
  'HQ',
  'Admin',
  true,
  NULL,
  now(),
  now()
)
ON CONFLICT (user_id) DO UPDATE
SET tenant_id = EXCLUDED.tenant_id,
    email = EXCLUDED.email,
    user_name = EXCLUDED.user_name,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    is_active = true,
    updated_at = now();

INSERT INTO public.user_roles (tenant_id, user_id, role_id)
VALUES ('TNT000001', 'USR000005', 'hqadmin')
ON CONFLICT (user_id, role_id) DO UPDATE
SET tenant_id = EXCLUDED.tenant_id;

INSERT INTO public.user_warehouses (tenant_id, user_id, warehouse_id)
SELECT 'TNT000001', 'USR000005', warehouse_id
FROM public.warehouses
WHERE tenant_id = 'TNT000001'
  AND warehouse_id IN ('WH000001', 'WH000002')
ON CONFLICT (user_id, warehouse_id) DO UPDATE
SET tenant_id = EXCLUDED.tenant_id;

COMMIT;
