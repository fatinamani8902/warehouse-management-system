-- Usage:
-- psql "$DATABASE_URL" -v adjustment_id=ADJ000123 -f backend/scripts/verify_adjustment_inventory_posting.sql

\echo 'Adjustment header'
SELECT
  tenant_id,
  adj_id,
  warehouse_id,
  reason,
  status,
  created_at,
  created_by,
  approved_at,
  approved_by
FROM public.adjustments
WHERE adj_id = :'adjustment_id';

\echo 'Adjustment lines'
SELECT
  tenant_id,
  adj_line_id,
  adj_id,
  sku_id,
  location_id,
  qty_change,
  lot_no,
  serial_no,
  notes
FROM public.adjustment_lines
WHERE adj_id = :'adjustment_id'
ORDER BY adj_line_id;

\echo 'Inventory posting'
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
  reason_code,
  created_at
FROM public.inventory_transactions
WHERE reference_type = 'adjustment'
  AND reference_id = :'adjustment_id'
ORDER BY created_at, itx_id;

\echo 'Affected inventory balance'
SELECT
  balance.tenant_id,
  balance.inv_balance_id,
  balance.warehouse_id,
  balance.sku_id,
  balance.location_id,
  location.location_code,
  balance.lot_no,
  balance.serial_no,
  balance.qty_on_hand,
  balance.qty_reserved,
  balance.qty_quarantine
FROM public.inventory_balances balance
JOIN public.locations location
  ON location.tenant_id = balance.tenant_id
 AND location.location_id = balance.location_id
JOIN public.adjustment_lines line
  ON line.tenant_id = balance.tenant_id
 AND line.adj_id = :'adjustment_id'
 AND line.sku_id = balance.sku_id
 AND line.location_id = balance.location_id
 AND COALESCE(line.lot_no, '') = COALESCE(balance.lot_no, '')
 AND COALESCE(line.serial_no, '') = COALESCE(balance.serial_no, '');

\echo 'Idempotency check: each adjustment line should have one posting'
SELECT posting_key, count(*) AS posting_count
FROM public.inventory_transactions
WHERE reference_type = 'adjustment'
  AND reference_id = :'adjustment_id'
GROUP BY posting_key;
