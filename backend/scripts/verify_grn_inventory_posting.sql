-- Run with:
-- psql -U postgres -d wms -f backend/scripts/verify_grn_inventory_posting.sql

\set grn_id 'GRN000004'
\set tenant_id 'TNT000001'

SELECT
  grn_id,
  asn_id,
  warehouse_id,
  status,
  posted_at,
  posted_by
FROM public.grns
WHERE tenant_id = :'tenant_id'
  AND grn_id = :'grn_id';

SELECT
  itx_id,
  transaction_type,
  sku_id,
  qty,
  to_location_id,
  reference_type,
  reference_id,
  posting_key
FROM public.inventory_transactions
WHERE tenant_id = :'tenant_id'
  AND reference_type = 'grn'
  AND reference_id = :'grn_id'
ORDER BY created_at, itx_id;

SELECT
  inv_balance_id,
  warehouse_id,
  sku_id,
  location_id,
  lot_no,
  serial_no,
  qty_on_hand
FROM public.inventory_balances
WHERE tenant_id = :'tenant_id'
  AND warehouse_id = 'WH000001'
  AND sku_id = 'SKU000006'
  AND location_id = 'LOC000003';

SELECT
  putaway_task_id,
  grn_id,
  grn_line_id,
  sku_id,
  qty,
  source_location_id,
  destination_location_id,
  status,
  posting_key
FROM public.putaway_tasks
WHERE tenant_id = :'tenant_id'
  AND reference_type = 'grn'
  AND reference_id = :'grn_id'
ORDER BY created_at, putaway_task_id;

SELECT
  (SELECT count(*)
   FROM public.inventory_transactions
   WHERE tenant_id = :'tenant_id'
     AND reference_type = 'grn'
     AND reference_id = :'grn_id') AS inventory_transaction_count,
  (SELECT count(*)
   FROM public.putaway_tasks
   WHERE tenant_id = :'tenant_id'
     AND reference_type = 'grn'
     AND reference_id = :'grn_id') AS putaway_task_count;
