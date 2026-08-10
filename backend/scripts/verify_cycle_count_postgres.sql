-- Run with:
-- psql -U postgres -d wms -f backend/scripts/verify_cycle_count_postgres.sql

SELECT
  cc.cc_id,
  cc.warehouse_id,
  cc.zone_id,
  zone.zone_code,
  zone.zone_name,
  cc.planned_date,
  cc.status,
  cc.created_at,
  count(ccl.ccl_id) AS line_count
FROM public.cycle_counts cc
JOIN public.warehouse_zones zone
  ON zone.tenant_id = cc.tenant_id
 AND zone.zone_id = cc.zone_id
LEFT JOIN public.cycle_count_lines ccl
  ON ccl.tenant_id = cc.tenant_id
 AND ccl.cc_id = cc.cc_id
WHERE cc.tenant_id = 'TNT000001'
  AND cc.warehouse_id = 'WH000001'
GROUP BY cc.cc_id, zone.zone_code, zone.zone_name
ORDER BY cc.created_at DESC;

SELECT
  ccl.cc_id,
  ccl.ccl_id,
  ccl.sku_id,
  sku.sku_code,
  ccl.location_id,
  location.location_code,
  ccl.expected_qty,
  balance.qty_on_hand,
  ccl.counted_qty,
  ccl.counted_qty - ccl.expected_qty AS calculated_variance_qty,
  ccl.variance_qty AS stored_variance_qty,
  ccl.status
FROM public.cycle_count_lines ccl
JOIN public.skus sku
  ON sku.tenant_id = ccl.tenant_id
 AND sku.sku_id = ccl.sku_id
JOIN public.locations location
  ON location.tenant_id = ccl.tenant_id
 AND location.location_id = ccl.location_id
JOIN public.cycle_counts cc
  ON cc.tenant_id = ccl.tenant_id
 AND cc.cc_id = ccl.cc_id
LEFT JOIN public.inventory_balances balance
  ON balance.tenant_id = ccl.tenant_id
 AND balance.warehouse_id = cc.warehouse_id
 AND balance.sku_id = ccl.sku_id
 AND balance.location_id = ccl.location_id
WHERE ccl.tenant_id = 'TNT000001'
ORDER BY ccl.cc_id DESC, ccl.ccl_id;

SELECT
  itx_id,
  reference_id AS cycle_count_id,
  sku_id,
  from_location_id,
  to_location_id,
  qty,
  tx_type,
  transaction_type,
  posting_key,
  created_at
FROM public.inventory_transactions
WHERE tenant_id = 'TNT000001'
  AND reference_type = 'cycle_count'
ORDER BY created_at DESC, itx_id DESC;
