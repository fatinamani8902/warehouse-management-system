BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.users
    WHERE tenant_id = 'TNT000001'
      AND user_id = 'USR000015'
  ) THEN
    RAISE EXCEPTION 'Canonical Mike Operator user USR000015 does not exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.users
    WHERE lower(email) = lower('mike@acme.com')
      AND user_id <> 'USR000015'
  ) THEN
    RAISE EXCEPTION 'Email mike@acme.com is already assigned to another user';
  END IF;
END
$$;

UPDATE public.users
SET email = 'mike@acme.com',
    user_name = 'Mike Operator',
    first_name = 'Mike',
    last_name = 'Operator',
    is_active = true,
    updated_at = now()
WHERE tenant_id = 'TNT000001'
  AND user_id = 'USR000015';

INSERT INTO public.user_roles (tenant_id, user_id, role_id)
VALUES ('TNT000001', 'USR000015', 'warehouseoperator')
ON CONFLICT (user_id, role_id) DO UPDATE
SET tenant_id = EXCLUDED.tenant_id;

INSERT INTO public.user_warehouses (tenant_id, user_id, warehouse_id)
VALUES ('TNT000001', 'USR000015', 'WH000001')
ON CONFLICT (user_id, warehouse_id) DO UPDATE
SET tenant_id = EXCLUDED.tenant_id;

COMMIT;
