import assert from "node:assert/strict";
import { once } from "node:events";
import test, { after, before } from "node:test";
import { pool } from "../src/db/client.js";
import { createApp } from "../src/server.js";

let server;
let baseUrl;
let receivingLocationId;
const suffix = Date.now().toString().slice(-8);
const grnId = `GRNP${suffix}`;
const taskIds = [];
const balanceIds = [];
const lots = [];

async function createTask({
  code,
  qty = 5,
  sourceQty = qty,
  destinationLocationId = "LOC000002",
  status = "pending",
  assignedToUserId = "USR000015",
}) {
  const taskId = `PUTP${suffix}${code}`;
  const lineId = `GRLP${suffix}${code}`;
  const lotNo = `LOT-PUT-${suffix}-${code}`;
  taskIds.push(taskId);
  lots.push(lotNo);

  await pool.query(
    `INSERT INTO public.grn_lines (
       tenant_id, grn_line_id, grn_id, line_no, sku_id,
       expected_qty, received_qty, uom, lot_no, qc_status, putaway_qty
     )
     VALUES (
       'TNT000001', $1, $2, $3, 'SKU000006',
       $4, $4, 'EA', $5, 'passed', 0
     )`,
    [lineId, grnId, taskIds.length, qty, lotNo]
  );
  await pool.query(
    `INSERT INTO public.putaway_tasks (
       tenant_id, putaway_task_id, warehouse_id,
       grn_id, grn_line_id, sku_id,
       from_location_id, source_location_id,
       to_location_id, destination_location_id,
       assigned_to_user_id,
       qty, status, priority, lot_no,
       reference_type, reference_id, posting_key
     )
     VALUES (
       'TNT000001', $1, 'WH000001',
       $2, $3, 'SKU000006',
       $4, $4, $5, $5,
       $6,
       $7, $8, 3, $9,
       'grn', $2, $10
     )`,
    [
      taskId,
      grnId,
      lineId,
      receivingLocationId,
      destinationLocationId,
      assignedToUserId,
      qty,
      status,
      lotNo,
      `${grnId}:${taskId}`,
    ]
  );

  if (sourceQty !== null) {
    const balanceId = `INVP${suffix}${code}`;
    balanceIds.push(balanceId);
    await pool.query(
      `INSERT INTO public.inventory_balances (
         tenant_id, inv_balance_id, warehouse_id, sku_id,
         location_id, lot_no, serial_no,
         qty_on_hand, qty_reserved, qty_quarantine
       )
       VALUES (
         'TNT000001', $1, 'WH000001', 'SKU000006',
         $2, $3, NULL, $4, 0, 0
       )`,
      [balanceId, receivingLocationId, lotNo, sourceQty]
    );
  }

  return { taskId, lotNo };
}

async function request(taskId, {
  tenant = "TNT000001",
  destinationLocationId,
  role = "storeoperator",
  user = "USR000015",
} = {}) {
  const response = await fetch(`${baseUrl}/putaway-tasks/${taskId}/complete`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-tenant-id": tenant,
      "x-user-id": user,
      "x-roles": role,
      "x-warehouse-id": "WH000001",
    },
    body: JSON.stringify(
      destinationLocationId === undefined
        ? {}
        : { destination_location_id: destinationLocationId }
    ),
  });
  return {
    status: response.status,
    payload: await response.json().catch(() => null),
  };
}

async function balance(locationId, lotNo) {
  const result = await pool.query(
    `SELECT *
     FROM public.inventory_balances
     WHERE tenant_id = 'TNT000001'
       AND warehouse_id = 'WH000001'
       AND sku_id = 'SKU000006'
       AND location_id = $1
       AND lot_no = $2
       AND serial_no IS NULL`,
    [locationId, lotNo]
  );
  return result.rows[0] || null;
}

before(async () => {
  const location = await pool.query(
    `INSERT INTO public.locations (
       tenant_id, warehouse_id, label, location_code,
       location_type, is_active
     )
     VALUES (
       'TNT000001', 'WH000001', $1, $1, 'receiving', true
     )
     RETURNING location_id`,
    [`PUTAWAY-RECEIVING-${suffix}`]
  );
  receivingLocationId = location.rows[0].location_id;

  await pool.query(
    `INSERT INTO public.grns (
       tenant_id, grn_id, warehouse_id, received_date, status, received_by
     )
     VALUES ('TNT000001', $1, 'WH000001', current_date, 'posted', 'USR000001')`,
    [grnId]
  );

  server = createApp().listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => {
  await pool.query(
    `DELETE FROM public.inventory_transactions
     WHERE reference_type = 'putaway_task'
       AND reference_id = ANY($1::text[])`,
    [taskIds]
  );
  await pool.query(
    `DELETE FROM public.putaway_tasks WHERE putaway_task_id = ANY($1::text[])`,
    [taskIds]
  );
  await pool.query(`DELETE FROM public.grn_lines WHERE grn_id = $1`, [grnId]);
  await pool.query(`DELETE FROM public.grns WHERE grn_id = $1`, [grnId]);
  await pool.query(
    `DELETE FROM public.inventory_balances
     WHERE inv_balance_id = ANY($1::text[])
        OR (
          tenant_id = 'TNT000001'
          AND sku_id = 'SKU000006'
          AND lot_no = ANY($2::text[])
        )`,
    [balanceIds, lots]
  );
  if (receivingLocationId) {
    await pool.query(`DELETE FROM public.locations WHERE location_id = $1`, [receivingLocationId]);
  }
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test("putaway completion transfers receiving stock to a storage bin", async () => {
  const { taskId, lotNo } = await createTask({ code: "A", qty: 7 });
  const response = await request(taskId);

  assert.equal(response.status, 200, JSON.stringify(response.payload));
  assert.equal(response.payload.idempotent, false);
  assert.equal(response.payload.task.status, "completed");
  assert.equal(response.payload.task.destination_location_id, "LOC000002");
  assert.equal(response.payload.inventory_transaction.transaction_type, "putaway");
  assert.equal(Number((await balance(receivingLocationId, lotNo)).qty_on_hand), 0);
  assert.equal(Number((await balance("LOC000002", lotNo)).qty_on_hand), 7);
});

test("already assigned putaway task completes successfully", async () => {
  const { taskId, lotNo } = await createTask({
    code: "AS",
    qty: 6,
    status: "assigned",
    assignedToUserId: "USR000015",
  });
  const response = await request(taskId);

  assert.equal(response.status, 200, JSON.stringify(response.payload));
  assert.equal(response.payload.task.status, "completed");
  assert.equal(response.payload.task.assigned_to_user_id, "USR000015");
  assert.equal(response.payload.task.assigned_to_user_display, "Mike Operator (USR000015)");
  assert.equal(response.payload.task.execution.assigned_to, "Mike Operator (USR000015)");
  assert.equal(response.payload.inventory_transaction.transaction_type, "putaway");
  assert.equal(Number((await balance(receivingLocationId, lotNo)).qty_on_hand), 0);
  assert.equal(Number((await balance("LOC000002", lotNo)).qty_on_hand), 6);
});

test("assigned putaway task completes when addressed by canonical task_id", async () => {
  const { taskId, lotNo } = await createTask({
    code: "TI",
    qty: 8,
    status: "assigned",
    assignedToUserId: "USR000015",
  });
  const stored = await pool.query(
    `SELECT task_id, status, assigned_to_user_id
     FROM public.putaway_tasks
     WHERE putaway_task_id = $1`,
    [taskId]
  );
  assert.equal(stored.rowCount, 1);
  assert.equal(stored.rows[0].task_id, taskId);
  assert.equal(stored.rows[0].status, "assigned");
  assert.equal(stored.rows[0].assigned_to_user_id, "USR000015");

  const response = await request(stored.rows[0].task_id);

  assert.equal(response.status, 200, JSON.stringify(response.payload));
  assert.equal(response.payload.task.status, "completed");
  assert.equal(response.payload.task.assigned_to_user_id, "USR000015");
  assert.equal(response.payload.inventory_transaction.transaction_type, "putaway");
  assert.equal(Number((await balance(receivingLocationId, lotNo)).qty_on_hand), 0);
  assert.equal(Number((await balance("LOC000002", lotNo)).qty_on_hand), 8);
});

test("unassigned putaway task cannot be completed", async () => {
  const { taskId } = await createTask({
    code: "U",
    qty: 2,
    status: "assigned",
    assignedToUserId: null,
  });
  const response = await request(taskId);

  assert.equal(response.status, 400);
  assert.deepEqual(response.payload, {
    success: false,
    code: "PUTAWAY_NOT_ASSIGNED",
    message: "Putaway task must be assigned before completion.",
  });

  const task = await pool.query(
    `SELECT status, completed_at
     FROM public.putaway_tasks
     WHERE putaway_task_id = $1`,
    [taskId],
  );
  assert.equal(task.rows[0].status, "assigned");
  assert.equal(task.rows[0].completed_at, null);
});

test("manager roles cannot complete physical putaway tasks", async () => {
  const { taskId } = await createTask({ code: "M", qty: 3, status: "assigned" });
  const response = await request(taskId, {
    role: "storemanager",
    user: "USR000002",
  });

  assert.equal(response.status, 403);
});

test("completing the same task twice is idempotent", async () => {
  const { taskId, lotNo } = await createTask({ code: "B", qty: 4 });
  const first = await request(taskId);
  const second = await request(taskId);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(second.payload.idempotent, true);
  assert.equal(Number((await balance("LOC000002", lotNo)).qty_on_hand), 4);

  const count = await pool.query(
    `SELECT count(*)::int AS count
     FROM public.inventory_transactions
     WHERE tenant_id = 'TNT000001'
       AND reference_type = 'putaway_task'
       AND reference_id = $1`,
    [taskId]
  );
  assert.equal(count.rows[0].count, 1);
});

test("idempotent completion reconciles assigned task row when MOVE already exists", async () => {
  const { taskId, lotNo } = await createTask({
    code: "ID",
    qty: 3,
    status: "assigned",
    assignedToUserId: "USR000015",
  });
  await pool.query(
    `INSERT INTO public.inventory_transactions (
       tenant_id, warehouse_id, sku_id,
       from_location_id, to_location_id, qty,
       tx_type, ref_type, ref_id,
       reference_type, reference_id, posting_key,
       created_by, notes
     )
     VALUES (
       'TNT000001', 'WH000001', 'SKU000006',
       $1, 'LOC000002', 3,
       'MOVE', 'putaway_task', $2,
       'putaway_task', $2, $3,
       'USR000015', 'Existing putaway completion'
     )`,
    [receivingLocationId, taskId, `${taskId}:complete`]
  );

  const before = await pool.query(
    `SELECT status, completed_at, completed_by
     FROM public.putaway_tasks
     WHERE putaway_task_id = $1`,
    [taskId]
  );
  assert.equal(before.rows[0].status, "assigned");
  assert.equal(before.rows[0].completed_at, null);

  const response = await request(taskId);

  assert.equal(response.status, 200, JSON.stringify(response.payload));
  assert.equal(response.payload.idempotent, true);
  assert.equal(response.payload.task.status, "completed");
  assert.equal(response.payload.task.completed_by, "USR000015");
  assert.equal(response.payload.inventory_transaction.reference_id, taskId);
  assert.equal(Number((await balance(receivingLocationId, lotNo)).qty_on_hand), 3);

  const after = await pool.query(
    `SELECT status, completed_at, completed_by
     FROM public.putaway_tasks
     WHERE putaway_task_id = $1`,
    [taskId]
  );
  assert.equal(after.rows[0].status, "completed");
  assert.ok(after.rows[0].completed_at);
  assert.equal(after.rows[0].completed_by, "USR000015");

  const count = await pool.query(
    `SELECT count(*)::int AS count
     FROM public.inventory_transactions
     WHERE tenant_id = 'TNT000001'
       AND reference_type = 'putaway_task'
       AND reference_id = $1`,
    [taskId]
  );
  assert.equal(count.rows[0].count, 1);
});

test("missing destination returns a friendly error and leaves task pending", async () => {
  const { taskId } = await createTask({
    code: "C",
    destinationLocationId: null,
  });
  const response = await request(taskId);

  assert.equal(response.status, 400);
  assert.equal(response.payload.error.message, "Destination storage location is required");
  const task = await pool.query(
    `SELECT status, completed_at FROM public.putaway_tasks WHERE putaway_task_id = $1`,
    [taskId]
  );
  assert.equal(task.rows[0].status, "pending");
  assert.equal(task.rows[0].completed_at, null);
});

test("receiving location cannot be used as putaway destination", async () => {
  const { taskId } = await createTask({
    code: "D",
    destinationLocationId: null,
  });
  const response = await request(taskId, {
    destinationLocationId: receivingLocationId,
  });

  assert.equal(response.status, 400);
  assert.equal(
    response.payload.error.message,
    "Destination must be an active bin-backed storage location"
  );
});

test("insufficient receiving stock prevents completion", async () => {
  const { taskId } = await createTask({
    code: "E",
    qty: 5,
    sourceQty: 1,
  });
  const response = await request(taskId);

  assert.equal(response.status, 400);
  assert.equal(response.payload.error.message, "Insufficient stock at the source location");
  const task = await pool.query(
    `SELECT status FROM public.putaway_tasks WHERE putaway_task_id = $1`,
    [taskId]
  );
  assert.equal(task.rows[0].status, "pending");
});

test("putaway completion enforces tenant isolation", async () => {
  const { taskId } = await createTask({ code: "F", qty: 2 });
  const response = await request(taskId, {
    tenant: "TNT000002",
    destinationLocationId: "LOC000002",
  });
  assert.equal(response.status, 404);
});
