import assert from "node:assert/strict";
import { once } from "node:events";
import test, { after, before } from "node:test";
import { pool } from "../src/db/client.js";
import { createApp } from "../src/server.js";

let server;
let baseUrl;
let receivingLocationId;
const suffix = Date.now().toString().slice(-8);
const testGrnIds = [];
const testLots = [];

async function createPostgresGrn({
  id,
  qty = 5,
  lotNo = `LOT-${suffix}`,
  status = "completed",
}) {
  await pool.query(
    `INSERT INTO public.grns (
       tenant_id, grn_id, warehouse_id, supplier_id, received_date,
       status, received_by, notes, created_at, updated_at
     )
     VALUES (
       'TNT000001', $1, 'WH000001', 'SUP000001', CURRENT_DATE,
       $2, 'USR000001', 'PostgreSQL GRN posting test', now(), now()
     )`,
    [id, status]
  );
  await pool.query(
    `INSERT INTO public.grn_lines (
       tenant_id, grn_id, line_no, sku_id, expected_qty, received_qty,
       uom, lot_no, qc_status, putaway_qty
     )
     VALUES (
       'TNT000001', $1, 1, 'SKU000006', $2, $2,
       'EA', $3, 'passed', 0
     )`,
    [id, qty, lotNo]
  );
  testGrnIds.push(id);
  testLots.push(lotNo);
}

async function postGrn(grnId, {
  tenant = "TNT000001",
  role = "storemanager",
  user = "USR000001",
} = {}) {
  const response = await fetch(`${baseUrl}/inbound/grn/${grnId}/post`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-tenant-id": tenant,
      "x-user-id": user,
      "x-roles": role,
      "x-warehouse-id": "WH000001",
    },
    body: "{}",
  });
  return {
    status: response.status,
    payload: await response.json().catch(() => null),
  };
}

before(async () => {
  const location = await pool.query(
    `SELECT location_id
     FROM public.locations
     WHERE tenant_id = 'TNT000001'
       AND warehouse_id = 'WH000001'
       AND location_type = 'receiving'
       AND is_active = true
     ORDER BY is_default_receiving DESC, location_id
     LIMIT 1`
  );
  assert.equal(location.rowCount, 1, "A receiving location is required for posting tests");
  receivingLocationId = location.rows[0].location_id;

  server = createApp().listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => {
  await pool.query(
    `DELETE FROM public.putaway_tasks
     WHERE tenant_id = 'TNT000001'
       AND reference_type = 'grn'
       AND reference_id = ANY($1::text[])`,
    [testGrnIds]
  );
  await pool.query(
    `DELETE FROM public.inventory_transactions
     WHERE tenant_id = 'TNT000001'
       AND reference_type = 'grn'
       AND reference_id = ANY($1::text[])`,
    [testGrnIds]
  );
  await pool.query(
    `DELETE FROM public.inventory_balances
     WHERE tenant_id = 'TNT000001'
       AND sku_id = 'SKU000006'
       AND lot_no = ANY($1::text[])`,
    [testLots]
  );
  await pool.query(
    `DELETE FROM public.grn_lines WHERE grn_id = ANY($1::text[])`,
    [testGrnIds]
  );
  await pool.query(
    `DELETE FROM public.grns WHERE grn_id = ANY($1::text[])`,
    [testGrnIds]
  );
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test("persisted PostgreSQL GRN posts receipt, balance, task, and status", async () => {
  const grnId = `GRNT${suffix}A`;
  const lotNo = `LOT-${suffix}-CREATE`;
  await createPostgresGrn({ id: grnId, qty: 7, lotNo });

  const response = await postGrn(grnId);
  assert.equal(response.status, 200, JSON.stringify(response.payload));
  assert.equal(response.payload.data.status, "posted");
  assert.equal(response.payload.data.posting_idempotent, false);
  assert.equal(response.payload.data.receiving_location_id, receivingLocationId);

  const result = await pool.query(
    `SELECT
       g.status,
       count(DISTINCT it.itx_id)::int AS transaction_count,
       max(it.transaction_type) AS transaction_type,
       max(it.to_location_id) AS transaction_location,
       max(ib.qty_on_hand) AS qty_on_hand,
       count(DISTINCT pt.putaway_task_id)::int AS task_count,
       max(pt.status) AS task_status
     FROM public.grns g
     LEFT JOIN public.inventory_transactions it
       ON it.tenant_id = g.tenant_id
      AND it.reference_type = 'grn'
      AND it.reference_id = g.grn_id
     LEFT JOIN public.inventory_balances ib
       ON ib.tenant_id = g.tenant_id
      AND ib.warehouse_id = g.warehouse_id
      AND ib.sku_id = 'SKU000006'
      AND ib.location_id = $2
      AND ib.lot_no = $3
     LEFT JOIN public.putaway_tasks pt
       ON pt.tenant_id = g.tenant_id
      AND pt.reference_type = 'grn'
      AND pt.reference_id = g.grn_id
     WHERE g.tenant_id = 'TNT000001'
       AND g.grn_id = $1
     GROUP BY g.status`,
    [grnId, receivingLocationId, lotNo]
  );
  assert.deepEqual(result.rows[0], {
    status: "posted",
    transaction_count: 1,
    transaction_type: "receipt",
    transaction_location: receivingLocationId,
    qty_on_hand: "7.0000",
    task_count: 1,
    task_status: "pending",
  });
});

test("posting the same PostgreSQL GRN twice is idempotent", async () => {
  const grnId = `GRNT${suffix}B`;
  await createPostgresGrn({ id: grnId, qty: 6, lotNo: `LOT-${suffix}-DUP` });

  const first = await postGrn(grnId);
  const second = await postGrn(grnId);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(second.payload.data.posting_idempotent, true);

  const counts = await pool.query(
    `SELECT
       (SELECT count(*)::int
        FROM public.inventory_transactions
        WHERE tenant_id = 'TNT000001'
          AND reference_type = 'grn'
          AND reference_id = $1) AS transaction_count,
       (SELECT count(*)::int
        FROM public.putaway_tasks
        WHERE tenant_id = 'TNT000001'
          AND reference_type = 'grn'
          AND reference_id = $1) AS task_count`,
    [grnId]
  );
  assert.deepEqual(counts.rows[0], { transaction_count: 1, task_count: 1 });
});

test("GRN posting uses PostgreSQL status and enforces tenant isolation", async () => {
  const draftGrnId = `GRNT${suffix}C`;
  await createPostgresGrn({
    id: draftGrnId,
    status: "draft",
    lotNo: `LOT-${suffix}-DRAFT`,
  });
  const draft = await postGrn(draftGrnId);
  assert.equal(draft.status, 400);
  assert.equal(draft.payload.error.code, "GRN_NOT_COMPLETED");

  const completedGrnId = `GRNT${suffix}D`;
  await createPostgresGrn({
    id: completedGrnId,
    lotNo: `LOT-${suffix}-TENANT`,
  });
  const otherTenant = await postGrn(completedGrnId, { tenant: "TNT000002" });
  assert.equal(otherTenant.status, 404);
  assert.equal(otherTenant.payload.error.message, "GRN not found");
});

test("read-only users cannot post PostgreSQL GRNs", async () => {
  const grnId = `GRNT${suffix}E`;
  await createPostgresGrn({ id: grnId, lotNo: `LOT-${suffix}-RBAC` });

  const response = await postGrn(grnId, { role: "viewer" });
  assert.equal(response.status, 403);
  assert.equal(response.payload.error.message, "Insufficient role to access this resource");
});
