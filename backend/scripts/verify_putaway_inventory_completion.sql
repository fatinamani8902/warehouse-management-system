-- Usage:
-- psql "$DATABASE_URL" -v task_id=PUT000123 -f backend/scripts/verify_putaway_inventory_completion.sql

\echo 'Putaway task'
SELECT
  tenant_id,
  putaway_task_id,
  warehouse_id,
  sku_id,
  source_location_id,
  destination_location_id,
  lot_no,
  serial_no,
  qty,
  status,
  completed_at,
  completed_by
FROM public.putaway_tasks
WHERE putaway_task_id = :'task_id';

\echo 'Putaway inventory movement'
SELECT
  tenant_id,
  itx_id,
  warehouse_id,
  sku_id,
  from_location_id,
  to_location_id,
  lot_no,
  serial_no,
  qty,
  transaction_type,
  reference_type,
  reference_id,
  posting_key,
  created_at
FROM public.inventory_transactions
WHERE reference_type = 'putaway_task'
  AND reference_id = :'task_id';

\echo 'Source and destination balances'
SELECT
  balance.tenant_id,
  balance.inv_balance_id,
  balance.warehouse_id,
  balance.sku_id,
  balance.location_id,
  location.location_code,
  location.location_type,
  location.bin_id,
  balance.lot_no,
  balance.serial_no,
  balance.qty_on_hand,
  balance.qty_reserved,
  balance.qty_quarantine
FROM public.inventory_balances balance
JOIN public.locations location
  ON location.tenant_id = balance.tenant_id
 AND location.location_id = balance.location_id
JOIN public.putaway_tasks task
  ON task.tenant_id = balance.tenant_id
 AND task.putaway_task_id = :'task_id'
 AND balance.warehouse_id = task.warehouse_id
 AND balance.sku_id = task.sku_id
 AND balance.location_id IN (task.source_location_id, task.destination_location_id)
 AND COALESCE(balance.lot_no, '') = COALESCE(task.lot_no, '')
 AND COALESCE(balance.serial_no, '') = COALESCE(task.serial_no, '')
ORDER BY balance.location_id;

\echo 'Idempotency check: expected count = 1'
SELECT count(*) AS posting_count
FROM public.inventory_transactions
WHERE reference_type = 'putaway_task'
  AND reference_id = :'task_id'
  AND posting_key = :'task_id' || ':complete';
