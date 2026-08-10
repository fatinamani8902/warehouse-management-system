BEGIN;

UPDATE public.users
SET user_name = 'Mike Operator',
    first_name = 'Mike',
    last_name = 'Operator',
    updated_at = now()
WHERE tenant_id = 'TNT000001'
  AND user_id = 'USR000015'
  AND email = 'warehouse.operator@tenant1.local';

UPDATE public.users
SET user_name = 'Lisa Operator',
    first_name = 'Lisa',
    last_name = 'Operator',
    updated_at = now()
WHERE tenant_id = 'TNT000001'
  AND user_id = 'USR000016'
  AND email = 'warehouse.clerk@tenant1.local';

COMMIT;
