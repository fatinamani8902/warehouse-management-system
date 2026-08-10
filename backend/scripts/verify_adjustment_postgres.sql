-- Usage:
-- psql "$DATABASE_URL" -v tenant_id=TNT000001 -v warehouse_id=WH000001 -v adjustment_id=ADJ000123 \
--   -f backend/scripts/verify_adjustment_postgres.sql

\echo 'Adjustment header'
SELECT
  tenant_id,
  adj_id,
  warehouse_id,
  reason AS reason_code,
  status,
  created_at AS requested_at,
  created_by AS requested_by,
  submitted_at,
  approved_at,
  approved_by,
  approval_note,
  rejected_at,
  rejected_by,
  rejection_reason,
  cancelled_at,
  cancelled_by,
  cancellation_reason
FROM public.adjustments
WHERE tenant_id = :'tenant_id'
  AND warehouse_id = :'warehouse_id'
  AND adj_id = :'adjustment_id';

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
WHERE tenant_id = :'tenant_id'
  AND adj_id = :'adjustment_id'
ORDER BY adj_line_id;

\echo 'Affected inventory balances'
SELECT
  balance.tenant_id,
  balance.inv_balance_id,
  balance.warehouse_id,
  balance.sku_id,
  balance.location_id,
  balance.lot_no,
  balance.serial_no,
  balance.qty_on_hand,
  balance.qty_reserved,
  balance.qty_quarantine,
  balance.updated_at
FROM public.inventory_balances balance
JOIN public.adjustment_lines line
  ON line.tenant_id = balance.tenant_id
 AND line.adj_id = :'adjustment_id'
 AND line.sku_id = balance.sku_id
 AND line.location_id = balance.location_id
 AND COALESCE(line.lot_no, '') = COALESCE(balance.lot_no, '')
 AND COALESCE(line.serial_no, '') = COALESCE(balance.serial_no, '')
WHERE balance.tenant_id = :'tenant_id'
  AND balance.warehouse_id = :'warehouse_id';

\echo 'Inventory transactions'
SELECT
  tenant_id,
  itx_id,
  warehouse_id,
  sku_id,
  from_location_id,
  to_location_id,
  qty,
  tx_type,
  transaction_type,
  reference_type,
  reference_id,
  posting_key,
  reason_code,
  created_by,
  created_at
FROM public.inventory_transactions
WHERE tenant_id = :'tenant_id'
  AND warehouse_id = :'warehouse_id'
  AND reference_type = 'adjustment'
  AND reference_id = :'adjustment_id'
ORDER BY created_at, itx_id;

\echo 'Idempotency check: each adjustment line must have one posting'
SELECT posting_key, count(*) AS posting_count
FROM public.inventory_transactions
WHERE tenant_id = :'tenant_id'
  AND warehouse_id = :'warehouse_id'
  AND reference_type = 'adjustment'
  AND reference_id = :'adjustment_id'
GROUP BY posting_key;
