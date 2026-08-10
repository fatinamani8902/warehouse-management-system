BEGIN;

DELETE FROM public.user_roles
WHERE user_id = 'USR000002';

DELETE FROM public.user_warehouses
WHERE user_id = 'USR000002';

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
  'USR000002',
  'sarah@acme.com',
  'Sarah Manager',
  'Sarah',
  'Manager',
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

INSERT INTO public.user_warehouses (tenant_id, user_id, warehouse_id)
SELECT 'TNT000001', 'USR000002', warehouse_id
FROM public.warehouses
WHERE tenant_id = 'TNT000001'
  AND warehouse_id IN ('WH000001', 'WH000002')
ON CONFLICT (user_id, warehouse_id) DO UPDATE
SET tenant_id = EXCLUDED.tenant_id;

COMMIT;
