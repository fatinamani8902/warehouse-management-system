BEGIN;

-- Dedicated single-record Returns -> RMA workflow seed.
-- Idempotent: only replaces RTN_FLOW_001 and any RMA linked to it.
SET LOCAL session_replication_role = replica;

DELETE FROM public.rma_items
WHERE tenant_id = 'TNT000001'
  AND rma_id IN (
    SELECT rma_id
    FROM public.rma
    WHERE tenant_id = 'TNT000001'
      AND return_id = 'RTN_FLOW_001'
  );

DELETE FROM public.rma
WHERE tenant_id = 'TNT000001'
  AND return_id = 'RTN_FLOW_001';

DELETE FROM public.return_items
WHERE tenant_id = 'TNT000001'
  AND return_id = 'RTN_FLOW_001';

DELETE FROM public.returns
WHERE tenant_id = 'TNT000001'
  AND return_id = 'RTN_FLOW_001';

INSERT INTO public.returns (
  tenant_id,
  return_id,
  warehouse_id,
  shipment_id,
  so_id,
  customer_id,
  customer_name,
  status,
  created_at,
  created_by,
  sku_id,
  qty,
  reason_code,
  reason_description,
  notes,
  updated_at,
  cancelled_at,
  cancelled_by,
  cancellation_reason,
  cancellation_reason_code,
  closed_at
)
VALUES (
  'TNT000001',
  'RTN_FLOW_001',
  'WH000001',
  'SHI000002',
  'SAL000007',
  'CUS000001',
  'BuildRight Co',
  'created',
  now(),
  'USR000005',
  'SKU000006',
  1,
  'damaged_in_transit',
  'Damaged In Transit',
  'Workflow test',
  now(),
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
);

INSERT INTO public.return_items (
  tenant_id,
  rmi_id,
  return_id,
  sku_id,
  qty,
  reason,
  reason_code,
  disposition,
  received_qty,
  notes
)
VALUES (
  'TNT000001',
  'RMI_FLOW_001',
  'RTN_FLOW_001',
  'SKU000006',
  1,
  'Damaged In Transit',
  'damaged_in_transit',
  'quarantine',
  0,
  'Workflow test'
);

SET LOCAL session_replication_role = DEFAULT;

COMMIT;
