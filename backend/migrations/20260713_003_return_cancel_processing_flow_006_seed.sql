BEGIN;

-- Dedicated Return cancellation workflow seed with a linked processing RMA.
-- Idempotent: only replaces RTN_FLOW_006 and records linked to it.
SET LOCAL session_replication_role = replica;

DELETE FROM public.rma_items
WHERE tenant_id = 'TNT000001'
  AND rma_id IN (
    SELECT rma_id
    FROM public.rma
    WHERE tenant_id = 'TNT000001'
      AND return_id = 'RTN_FLOW_006'
  );

DELETE FROM public.rma
WHERE tenant_id = 'TNT000001'
  AND return_id = 'RTN_FLOW_006';

DELETE FROM public.return_items
WHERE tenant_id = 'TNT000001'
  AND return_id = 'RTN_FLOW_006';

DELETE FROM public.returns
WHERE tenant_id = 'TNT000001'
  AND return_id = 'RTN_FLOW_006';

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
SELECT
  'TNT000001',
  'RTN_FLOW_006',
  'WH000001',
  'SHI000002',
  'SAL000007',
  c.customer_id,
  c.customer_name,
  'created',
  now(),
  'USR000005',
  'SKU000006',
  1,
  'damaged_in_transit',
  'Damaged In Transit',
  'Cancellation workflow testing with processing RMA',
  now(),
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM public.customers c
WHERE c.tenant_id = 'TNT000001'
  AND c.customer_id = 'CUS000001';

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
  'RMI_FLOW_006',
  'RTN_FLOW_006',
  'SKU000006',
  1,
  'Damaged In Transit',
  'damaged_in_transit',
  'quarantine',
  0,
  'Cancellation workflow testing with processing RMA'
);

INSERT INTO public.rma (
  rma_id,
  tenant_id,
  return_id,
  status,
  notes,
  created_at,
  created_by,
  updated_at,
  cancellation_reason,
  cancellation_reason_code,
  cancelled_by,
  cancelled_at,
  closed_at
)
VALUES (
  'RMA_FLOW_006',
  'TNT000001',
  'RTN_FLOW_006',
  'processing',
  'Cancellation workflow test: linked Processing RMA.',
  now(),
  'USR000005',
  now(),
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
);

INSERT INTO public.rma_items (
  rma_item_id,
  tenant_id,
  rma_id,
  sku_id,
  qty,
  reason_code
)
VALUES (
  'RMAI_FLOW_006',
  'TNT000001',
  'RMA_FLOW_006',
  'SKU000006',
  1,
  'damaged_in_transit'
);

SET LOCAL session_replication_role = DEFAULT;

COMMIT;
