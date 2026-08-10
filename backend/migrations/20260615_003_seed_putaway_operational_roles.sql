BEGIN;

INSERT INTO public.roles (role_id, role_name, description, is_system)
VALUES
  ('warehouseoperator', 'Warehouse Operator', 'Executes warehouse floor operations', true),
  ('storekeeper', 'Storekeeper', 'Executes inventory storage operations', true),
  ('warehouseclerk', 'Warehouse Clerk', 'Executes warehouse clerical operations', true)
ON CONFLICT (role_id) DO UPDATE
SET role_name = EXCLUDED.role_name,
    description = EXCLUDED.description,
    is_system = EXCLUDED.is_system;

DO $$
DECLARE
  seed_user record;
  seeded_user_id text;
BEGIN
  FOR seed_user IN
    SELECT *
    FROM (
      VALUES
        (
          'mike@acme.com',
          'Mike Operator',
          'Mike',
          'Operator',
          'warehouseoperator'
        ),
        (
          'warehouse.clerk@tenant1.local',
          'Warehouse Clerk One',
          'Warehouse',
          'Clerk',
          'warehouseclerk'
        )
    ) AS seed(email, user_name, first_name, last_name, role_id)
  LOOP
    INSERT INTO public.users (
      tenant_id,
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
      seed_user.email,
      seed_user.user_name,
      seed_user.first_name,
      seed_user.last_name,
      true,
      NULL,
      now(),
      now()
    )
    ON CONFLICT (email) DO UPDATE
    SET user_name = EXCLUDED.user_name,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        is_active = true,
        updated_at = now()
    RETURNING user_id INTO seeded_user_id;

    IF NOT EXISTS (
      SELECT 1
      FROM public.users
      WHERE tenant_id = 'TNT000001'
        AND user_id = seeded_user_id
    ) THEN
      RAISE EXCEPTION 'Operational seed email % belongs to another tenant', seed_user.email;
    END IF;

    DELETE FROM public.user_roles
    WHERE tenant_id = 'TNT000001'
      AND user_id = seeded_user_id
      AND role_id <> seed_user.role_id;

    INSERT INTO public.user_roles (tenant_id, user_id, role_id)
    VALUES ('TNT000001', seeded_user_id, seed_user.role_id)
    ON CONFLICT (user_id, role_id) DO UPDATE
    SET tenant_id = EXCLUDED.tenant_id;

    INSERT INTO public.user_warehouses (tenant_id, user_id, warehouse_id)
    VALUES ('TNT000001', seeded_user_id, 'WH000001')
    ON CONFLICT (user_id, warehouse_id) DO UPDATE
    SET tenant_id = EXCLUDED.tenant_id;
  END LOOP;
END
$$;

COMMIT;
