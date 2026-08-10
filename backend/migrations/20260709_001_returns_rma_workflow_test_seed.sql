BEGIN;

-- Dedicated Returns/RMA workflow validation seed.
-- This script is idempotent and only replaces records with RTN_TEST/RMA_TEST IDs.
-- Existing production/demo records are not updated.
SET LOCAL session_replication_role = replica;

DELETE FROM public.rma_items
WHERE tenant_id = 'TNT000001'
  AND rma_id LIKE 'RMA_TEST_%';

DELETE FROM public.rma
WHERE tenant_id = 'TNT000001'
  AND rma_id LIKE 'RMA_TEST_%';

DELETE FROM public.return_items
WHERE tenant_id = 'TNT000001'
  AND return_id LIKE 'RTN_TEST_%';

DELETE FROM public.returns
WHERE tenant_id = 'TNT000001'
  AND return_id LIKE 'RTN_TEST_%';

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
VALUES
  (
    'TNT000001',
    'RTN_TEST_001',
    'WH000001',
    'SHI000002',
    'SAL000007',
    'CUS000001',
    'seed_customer_name',
    'created',
    TIMESTAMPTZ '2026-07-09 09:00:00+08',
    'USR000005',
    'SKU000006',
    1,
    'damaged_in_transit',
    'Damaged In Transit',
    'Workflow test: Created return without RMA. Expected actions: Create RMA, Cancel Return.',
    TIMESTAMPTZ '2026-07-09 09:00:00+08',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  ),
  (
    'TNT000001',
    'RTN_TEST_002',
    'WH000001',
    'SHI000002',
    'SAL000007',
    'CUS000001',
    'seed_customer_name',
    'created',
    TIMESTAMPTZ '2026-07-09 09:10:00+08',
    'USR000005',
    'SKU000006',
    1,
    'damaged_in_transit',
    'Damaged In Transit',
    'Workflow test: Created return with Processing RMA. Expected actions: Cancel Return only.',
    TIMESTAMPTZ '2026-07-09 09:10:00+08',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  ),
  (
    'TNT000001',
    'RTN_TEST_003',
    'WH000001',
    'SHI000002',
    'SAL000007',
    'CUS000001',
    'seed_customer_name',
    'created',
    TIMESTAMPTZ '2026-07-09 09:20:00+08',
    'USR000005',
    'SKU000006',
    1,
    'damaged_in_transit',
    'Damaged In Transit',
    'Workflow test: Created return with Completed RMA. Expected actions: Confirm Return.',
    TIMESTAMPTZ '2026-07-09 09:20:00+08',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  ),
  (
    'TNT000001',
    'RTN_TEST_004',
    'WH000001',
    'SHI000002',
    'SAL000007',
    'CUS000001',
    'seed_customer_name',
    'closed',
    TIMESTAMPTZ '2026-07-09 09:30:00+08',
    'USR000005',
    'SKU000006',
    1,
    'damaged_in_transit',
    'Damaged In Transit',
    'Workflow test: Closed return with Completed RMA. Expected actions: None.',
    TIMESTAMPTZ '2026-07-09 09:30:00+08',
    NULL,
    NULL,
    NULL,
    NULL,
    TIMESTAMPTZ '2026-07-09 09:40:00+08'
  ),
  (
    'TNT000001',
    'RTN_TEST_005',
    'WH000001',
    'SHI000002',
    'SAL000007',
    'CUS000001',
    'seed_customer_name',
    'cancelled',
    TIMESTAMPTZ '2026-07-09 09:50:00+08',
    'USR000005',
    'SKU000006',
    1,
    'damaged_in_transit',
    'Damaged In Transit',
    'Workflow test: Cancelled return with Cancelled RMA. Expected actions: None.',
    TIMESTAMPTZ '2026-07-09 09:50:00+08',
    TIMESTAMPTZ '2026-07-09 10:00:00+08',
    'USR000005',
    'Workflow test cancellation',
    'workflow_test',
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
VALUES
  ('TNT000001', 'RMI_TEST_001', 'RTN_TEST_001', 'SKU000006', 1, 'Damaged In Transit', 'damaged_in_transit', 'quarantine', 0, 'Workflow test item'),
  ('TNT000001', 'RMI_TEST_002', 'RTN_TEST_002', 'SKU000006', 1, 'Damaged In Transit', 'damaged_in_transit', 'quarantine', 0, 'Workflow test item'),
  ('TNT000001', 'RMI_TEST_003', 'RTN_TEST_003', 'SKU000006', 1, 'Damaged In Transit', 'damaged_in_transit', 'quarantine', 0, 'Workflow test item'),
  ('TNT000001', 'RMI_TEST_004', 'RTN_TEST_004', 'SKU000006', 1, 'Damaged In Transit', 'damaged_in_transit', 'quarantine', 0, 'Workflow test item'),
  ('TNT000001', 'RMI_TEST_005', 'RTN_TEST_005', 'SKU000006', 1, 'Damaged In Transit', 'damaged_in_transit', 'quarantine', 0, 'Workflow test item');

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
VALUES
  (
    'RMA_TEST_002',
    'TNT000001',
    'RTN_TEST_002',
    'processing',
    'Workflow test: linked Processing RMA.',
    TIMESTAMPTZ '2026-07-09 09:11:00+08',
    'USR000005',
    TIMESTAMPTZ '2026-07-09 09:12:00+08',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  ),
  (
    'RMA_TEST_003',
    'TNT000001',
    'RTN_TEST_003',
    'completed',
    'Workflow test: linked Completed RMA.',
    TIMESTAMPTZ '2026-07-09 09:21:00+08',
    'USR000005',
    TIMESTAMPTZ '2026-07-09 09:22:00+08',
    NULL,
    NULL,
    NULL,
    NULL,
    TIMESTAMPTZ '2026-07-09 09:22:00+08'
  ),
  (
    'RMA_TEST_004',
    'TNT000001',
    'RTN_TEST_004',
    'completed',
    'Workflow test: completed RMA for closed return.',
    TIMESTAMPTZ '2026-07-09 09:31:00+08',
    'USR000005',
    TIMESTAMPTZ '2026-07-09 09:32:00+08',
    NULL,
    NULL,
    NULL,
    NULL,
    TIMESTAMPTZ '2026-07-09 09:32:00+08'
  ),
  (
    'RMA_TEST_005',
    'TNT000001',
    'RTN_TEST_005',
    'cancelled',
    'Workflow test: cancelled RMA for cancelled return.',
    TIMESTAMPTZ '2026-07-09 09:51:00+08',
    'USR000005',
    TIMESTAMPTZ '2026-07-09 10:00:00+08',
    'Parent return RTN_TEST_005 cancelled: Workflow test cancellation',
    'workflow_test',
    'USR000005',
    TIMESTAMPTZ '2026-07-09 10:00:00+08',
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
VALUES
  ('RMAI_TEST_002', 'TNT000001', 'RMA_TEST_002', 'SKU000006', 1, 'damaged_in_transit'),
  ('RMAI_TEST_003', 'TNT000001', 'RMA_TEST_003', 'SKU000006', 1, 'damaged_in_transit'),
  ('RMAI_TEST_004', 'TNT000001', 'RMA_TEST_004', 'SKU000006', 1, 'damaged_in_transit'),
  ('RMAI_TEST_005', 'TNT000001', 'RMA_TEST_005', 'SKU000006', 1, 'damaged_in_transit');

SET LOCAL session_replication_role = DEFAULT;

COMMIT;
