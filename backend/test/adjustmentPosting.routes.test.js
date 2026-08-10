import assert from "node:assert/strict";
import { once } from "node:events";
import test, { after, afterEach, before, beforeEach } from "node:test";
import { db } from "../src/data/store.js";
import { pool } from "../src/db/client.js";
import { createApp } from "../src/server.js";

let server;
let baseUrl;
let originalBalanceQty;
const adjustmentIds = [];
const legacyAdjustmentId = `ADJLEGACY${Date.now()}`;
const excludedAdjustmentLocationId = `LOCADJREJ${Date.now()}`;

async function request(path, {
  method = "GET",
  body,
  tenant = "TNT000001",
  warehouse = "WH000001",
  role = "superadmin",
  user = "USR000001",
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-tenant-id": tenant,
      "x-user-id": user,
      "x-roles": role,
      "x-warehouse-id": warehouse,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    payload: await response.json().catch(() => null),
  };
}

async function setBalance(qty) {
  await pool.query(
    `UPDATE public.inventory_balances
     SET qty_on_hand = $1, updated_at = now()
     WHERE tenant_id = 'TNT000001'
       AND warehouse_id = 'WH000001'
       AND sku_id = 'SKU000006'
       AND location_id = 'LOC000002'
       AND lot_no IS NULL
       AND serial_no IS NULL`,
    [qty]
  );
}

async function setBalanceAt(locationId, qty) {
  await pool.query(
    `UPDATE public.inventory_balances
     SET qty_on_hand = $1, updated_at = now()
     WHERE tenant_id = 'TNT000001'
       AND warehouse_id = 'WH000001'
       AND sku_id = 'SKU000006'
       AND location_id = $2
       AND lot_no IS NULL
       AND serial_no IS NULL`,
    [qty, locationId]
  );
}

async function createAdjustment(qtyDelta = 2, options = {}) {
  const response = await request("/inventory/adjustments", {
    method: "POST",
    role: options.role || "storeoperator",
    user: options.user || "USR000015",
    body: {
      sku_id: "SKU000006",
      location_id: "LOC000002",
      qty_delta: qtyDelta,
      reason_code: "MISCOUNTED",
    },
  });
  assert.equal(response.status, 201, JSON.stringify(response.payload));
  assert.match(response.payload.adj_id, /^ADJ\d{6,}$/);
  assert.match(response.payload.adj_line_id, /^ADL\d{6,}$/);
  adjustmentIds.push(response.payload.adj_id);
  return response.payload;
}

async function submit(adjustmentId, options = {}) {
  const response = await request(`/inventory/adjustments/${adjustmentId}/submit`, {
    method: "POST",
    role: options.role || "storeoperator",
    user: options.user || "USR000015",
  });
  assert.equal(response.status, 200, JSON.stringify(response.payload));
  assert.equal(response.payload.status, "SUBMITTED");
  return response.payload;
}

async function balanceQty() {
  return balanceQtyAt("LOC000002");
}

async function balanceQtyAt(locationId) {
  const result = await pool.query(
    `SELECT qty_on_hand
     FROM public.inventory_balances
     WHERE tenant_id = 'TNT000001'
       AND warehouse_id = 'WH000001'
       AND sku_id = 'SKU000006'
       AND location_id = $1
       AND lot_no IS NULL
       AND serial_no IS NULL`
    ,
    [locationId]
  );
  assert.equal(result.rowCount, 1);
  return Number(result.rows[0].qty_on_hand);
}

before(async () => {
  const balance = await pool.query(
    `SELECT qty_on_hand
     FROM public.inventory_balances
     WHERE tenant_id = 'TNT000001'
       AND warehouse_id = 'WH000001'
       AND sku_id = 'SKU000006'
       AND location_id = 'LOC000002'
       AND lot_no IS NULL
       AND serial_no IS NULL`
  );
  assert.equal(balance.rowCount, 1, "SKU000006 storage balance is required");
  originalBalanceQty = balance.rows[0].qty_on_hand;

  db.adjustment_requests.push({
    adj_id: legacyAdjustmentId,
    tenant_id: "TNT000001",
    warehouse_id: "WH000001",
    status: "SUBMITTED",
    sku_id: "SKU000006",
    location_id: "LOC000002",
    qty_delta: 999,
    reason_code: "MISCOUNTED",
    requested_by: "USR000001",
    requested_at: new Date().toISOString(),
  });

  await pool.query(
    `INSERT INTO public.locations (
       tenant_id, location_id, warehouse_id, location_code, label, location_type, is_active
     )
     VALUES ('TNT000001', $1, 'WH000001', $2, $2, 'receiving', true)`,
    [excludedAdjustmentLocationId, `ADJ-RECEIVING-REJECT-${Date.now()}`]
  );

  server = createApp().listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});

beforeEach(async () => {
  await setBalance(10);
});

afterEach(async () => {
  await setBalance(10);
});

after(async () => {
  db.adjustment_requests = db.adjustment_requests.filter(
    (row) => row.adj_id !== legacyAdjustmentId
  );
  if (adjustmentIds.length) {
    await pool.query(
      `DELETE FROM public.inventory_transactions
       WHERE tenant_id = 'TNT000001'
         AND reference_type = 'adjustment'
         AND reference_id = ANY($1::text[])`,
      [adjustmentIds]
    );
    await pool.query(
      `DELETE FROM public.adjustment_lines
       WHERE tenant_id = 'TNT000001'
         AND adj_id = ANY($1::text[])`,
      [adjustmentIds]
    );
    await pool.query(
      `DELETE FROM public.adjustments
       WHERE tenant_id = 'TNT000001'
         AND adj_id = ANY($1::text[])`,
      [adjustmentIds]
    );
  }
  await setBalance(originalBalanceQty);
  await pool.query(
    `DELETE FROM public.locations WHERE location_id = $1`,
    [excludedAdjustmentLocationId]
  );
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test("create persists header and line in PostgreSQL", async () => {
  const created = await createAdjustment(3);
  assert.equal(created.status, "DRAFT");
  assert.equal(created.qty_delta, "3.0000");

  const result = await pool.query(
    `SELECT adjustment.status, adjustment.reason, line.qty_change
     FROM public.adjustments adjustment
     JOIN public.adjustment_lines line
       ON line.tenant_id = adjustment.tenant_id
      AND line.adj_id = adjustment.adj_id
     WHERE adjustment.tenant_id = 'TNT000001'
       AND adjustment.warehouse_id = 'WH000001'
       AND adjustment.adj_id = $1`,
    [created.adj_id]
  );
  assert.equal(result.rowCount, 1);
  assert.equal(result.rows[0].status, "draft");
  assert.equal(result.rows[0].reason, "MISCOUNTED");
  assert.equal(Number(result.rows[0].qty_change), 3);
});

test("list and detail read PostgreSQL only", async () => {
  const created = await createAdjustment(4);
  const list = await request(`/inventory/adjustments?search=${created.adj_id}`);
  assert.equal(list.status, 200);
  assert.equal(list.payload.total, 1);
  assert.equal(list.payload.items[0].adj_id, created.adj_id);
  assert.equal(list.payload.items[0].sku_description, "Test Bearing");

  const detail = await request(`/inventory/adjustments/${created.adj_id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.payload.adj_id, created.adj_id);
  assert.equal(detail.payload.display_name, "WH000001-B-01-001-L01-B001");

  const legacyList = await request(`/inventory/adjustments?search=${legacyAdjustmentId}`);
  assert.equal(legacyList.status, 200);
  assert.equal(legacyList.payload.total, 0);
  const legacyDetail = await request(`/inventory/adjustments/${legacyAdjustmentId}`);
  assert.equal(legacyDetail.status, 404);
});

test("create rejects receiving locations for normal manual adjustments", async () => {
  const response = await request("/inventory/adjustments", {
    method: "POST",
    role: "storeoperator",
    user: "USR000015",
    body: {
      sku_id: "SKU000006",
      location_id: excludedAdjustmentLocationId,
      qty_delta: 1,
      reason_code: "MISCOUNTED",
    },
  });

  assert.equal(response.status, 400);
  assert.equal(response.payload.error.code, "ADJUSTMENT_LOCATION_INVALID");
});

test("invalid adjustment status filter is rejected", async () => {
  const response = await request("/inventory/adjustments?status=open");
  assert.equal(response.status, 400, JSON.stringify(response.payload));
  assert.equal(response.payload.error.code, "ADJUSTMENT_STATUS_INVALID");
  assert.equal(response.payload.error.message, "Invalid adjustment status filter");
});

test("draft adjustment can be submitted", async () => {
  const created = await createAdjustment(1);
  const submitted = await submit(created.adj_id);
  assert.ok(submitted.submitted_at);
});

test("positive approval increases balance and creates signed adjustment transaction", async () => {
  const created = await createAdjustment(2);
  await submit(created.adj_id);
  const approved = await request(`/inventory/adjustments/${created.adj_id}/approve`, {
    method: "POST",
    role: "storemanager",
    user: "USR000001",
    body: { approval_note: "Positive approval" },
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.payload));
  assert.equal(approved.payload.status, "APPROVED");
  assert.equal(await balanceQty(), 12);
  assert.equal(Number(approved.payload.inventory_transaction.qty), 2);
  assert.equal(approved.payload.inventory_transaction.tx_type, "ADJUSTMENT");
  assert.equal(approved.payload.inventory_transaction.reference_id, created.adj_id);
});

test("cycle variance increase approval accepts approval_note and posts stock once", async () => {
  const locationId = "LOC900004";
  const originalLocationQty = await balanceQtyAt(locationId);

  try {
    await setBalanceAt(locationId, 97);
    const created = await request("/inventory/adjustments", {
      method: "POST",
      role: "storeoperator",
      user: "USR000015",
      body: {
        sku_id: "SKU000006",
        location_id: locationId,
        qty_delta: 1,
        reason_code: "CYCLE_VARIANCE",
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.payload));
    adjustmentIds.push(created.payload.adj_id);

    await submit(created.payload.adj_id, { role: "storeoperator", user: "USR000015" });
    const approved = await request(`/inventory/adjustments/${created.payload.adj_id}/approve`, {
      method: "POST",
      role: "warehousemanager",
      user: "USR000002",
      body: { approval_note: "testing" },
    });

    assert.equal(approved.status, 200, JSON.stringify(approved.payload));
    assert.equal(approved.payload.status, "APPROVED");
    assert.equal(approved.payload.approval_note, "testing");
    assert.equal(approved.payload.approved_by, "USR000002");
    assert.equal(approved.payload.display_name, "WH000001-F-02-001-L01-B001");
    assert.equal(await balanceQtyAt(locationId), 98);
    assert.equal(Number(approved.payload.inventory_transaction.qty), 1);
    assert.equal(approved.payload.inventory_transaction.notes, "testing");
    assert.equal(approved.payload.inventory_transaction.reference_id, created.payload.adj_id);

    const persisted = await pool.query(
      `SELECT status, approved_by, approved_at, approval_note
       FROM public.adjustments
       WHERE tenant_id = 'TNT000001'
         AND warehouse_id = 'WH000001'
         AND adj_id = $1`,
      [created.payload.adj_id]
    );
    assert.equal(persisted.rowCount, 1);
    assert.equal(persisted.rows[0].status, "approved");
    assert.equal(persisted.rows[0].approved_by, "USR000002");
    assert.ok(persisted.rows[0].approved_at);
    assert.equal(persisted.rows[0].approval_note, "testing");

    const secondApproval = await request(`/inventory/adjustments/${created.payload.adj_id}/approve`, {
      method: "POST",
      role: "warehousemanager",
      user: "USR000002",
      body: { approval_note: "testing again" },
    });
    assert.equal(secondApproval.status, 200, JSON.stringify(secondApproval.payload));
    assert.equal(secondApproval.payload.idempotent, true);
    assert.equal(await balanceQtyAt(locationId), 98);
  } finally {
    await setBalanceAt(locationId, originalLocationQty);
  }
});

test("negative approval decreases balance and creates signed adjustment transaction", async () => {
  const created = await createAdjustment(-2);
  await submit(created.adj_id);
  const approved = await request(`/inventory/adjustments/${created.adj_id}/approve`, {
    method: "POST",
    role: "storemanager",
    user: "USR000001",
    body: {},
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.payload));
  assert.equal(await balanceQty(), 8);
  assert.equal(Number(approved.payload.inventory_transaction.qty), -2);
  assert.equal(approved.payload.inventory_transaction.tx_type, "ADJUSTMENT");
});

test("approval prevents negative stock and leaves adjustment submitted", async () => {
  await setBalance(0);
  const created = await createAdjustment(-2);
  await submit(created.adj_id);
  const approval = await request(`/inventory/adjustments/${created.adj_id}/approve`, {
    method: "POST",
    role: "storemanager",
    user: "USR000001",
    body: {},
  });
  assert.equal(approval.status, 400);
  assert.equal(approval.payload.error.message, "Insufficient stock at the source location");

  const detail = await request(`/inventory/adjustments/${created.adj_id}`);
  assert.equal(detail.payload.status, "SUBMITTED");
  const transaction = await pool.query(
    `SELECT 1
     FROM public.inventory_transactions
     WHERE tenant_id = 'TNT000001'
       AND reference_type = 'adjustment'
       AND reference_id = $1`,
    [created.adj_id]
  );
  assert.equal(transaction.rowCount, 0);
});

test("repeated approval is idempotent", async () => {
  const created = await createAdjustment(2);
  await submit(created.adj_id);
  const first = await request(`/inventory/adjustments/${created.adj_id}/approve`, {
    method: "POST",
    role: "storemanager",
    user: "USR000001",
    body: {},
  });
  const second = await request(`/inventory/adjustments/${created.adj_id}/approve`, {
    method: "POST",
    role: "storemanager",
    user: "USR000001",
    body: {},
  });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(second.payload.idempotent, true);
  assert.equal(await balanceQty(), 12);

  const count = await pool.query(
    `SELECT count(*)::int AS count
     FROM public.inventory_transactions
     WHERE tenant_id = 'TNT000001'
       AND reference_type = 'adjustment'
       AND reference_id = $1`,
    [created.adj_id]
  );
  assert.equal(count.rows[0].count, 1);
});

test("submitted adjustment can be rejected and cannot then be approved", async () => {
  const created = await createAdjustment(1);
  await submit(created.adj_id);
  const rejected = await request(`/inventory/adjustments/${created.adj_id}/reject`, {
    method: "POST",
    role: "storemanager",
    user: "USR000001",
    body: { reason: "Physical verification failed" },
  });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.payload.status, "REJECTED");
  assert.equal(rejected.payload.rejection_reason, "Physical verification failed");

  const approval = await request(`/inventory/adjustments/${created.adj_id}/approve`, {
    method: "POST",
    role: "storemanager",
    user: "USR000001",
    body: {},
  });
  assert.equal(approval.status, 400);
});

test("cancellation requires confirmation and reason", async () => {
  const created = await createAdjustment(1);
  const unconfirmed = await request(`/inventory/adjustments/${created.adj_id}/cancel`, {
    method: "POST",
    role: "storemanager",
    user: "USR000001",
    body: { reason: "Duplicate request" },
  });
  assert.equal(unconfirmed.status, 400);
  assert.equal(unconfirmed.payload.error.code, "CANCELLATION_CONFIRMATION_REQUIRED");

  const missingReason = await request(`/inventory/adjustments/${created.adj_id}/cancel`, {
    method: "POST",
    role: "storemanager",
    user: "USR000001",
    body: { confirmed: true },
  });
  assert.equal(missingReason.status, 400);

  const cancelled = await request(`/inventory/adjustments/${created.adj_id}/cancel`, {
    method: "POST",
    role: "storemanager",
    user: "USR000001",
    body: { confirmed: true, reason: "Duplicate request" },
  });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.payload.status, "CANCELLED");
  assert.equal(cancelled.payload.cancellation_reason, "Duplicate request");
});

test("tenant and warehouse isolation are enforced for detail and transitions", async () => {
  const created = await createAdjustment(1);
  const otherTenant = await request(`/inventory/adjustments/${created.adj_id}`, {
    tenant: "TNT000002",
    warehouse: "WH000003",
    user: "USR100001",
  });
  assert.equal(otherTenant.status, 404);

  const otherWarehouse = await request(`/inventory/adjustments/${created.adj_id}`, {
    warehouse: "WH000002",
  });
  assert.equal(otherWarehouse.status, 404);

  const submitOtherWarehouse = await request(`/inventory/adjustments/${created.adj_id}/submit`, {
    method: "POST",
    warehouse: "WH000002",
    role: "storeoperator",
    user: "USR000015",
  });
  assert.equal(submitOtherWarehouse.status, 404);
});

test("adjustment RBAC split and maker-checker preserve approval boundaries", async () => {
  const superadminCreated = await createAdjustment(1, { role: "superadmin", user: "USR000001" });
  await submit(superadminCreated.adj_id, { role: "superadmin", user: "USR000001" });
  const superadminApproval = await request(`/inventory/adjustments/${superadminCreated.adj_id}/approve`, {
    method: "POST",
    role: "superadmin",
    user: "USR000001",
    body: {},
  });
  assert.equal(superadminApproval.status, 403);
  const superadminReject = await request(`/inventory/adjustments/${superadminCreated.adj_id}/reject`, {
    method: "POST",
    role: "superadmin",
    user: "USR000001",
    body: { reason: "Superadmin cannot reject" },
  });
  assert.equal(superadminReject.status, 403);

  const adminCreate = await request("/inventory/adjustments", {
    method: "POST",
    role: "admin",
    user: "USR000009",
    body: {
      sku_id: "SKU000006",
      location_id: "LOC000002",
      qty_delta: 1,
      reason_code: "MISCOUNTED",
    },
  });
  assert.equal(adminCreate.status, 403);

  const hqAdminCreate = await createAdjustment(1, { role: "hqadmin", user: "USR000005" });
  await submit(hqAdminCreate.adj_id, { role: "hqadmin", user: "USR000005" });
  const hqAdminApproval = await request(`/inventory/adjustments/${hqAdminCreate.adj_id}/approve`, {
    method: "POST",
    role: "hqadmin",
    user: "USR000005",
    body: {},
  });
  assert.equal(hqAdminApproval.status, 403);
  const hqAdminReject = await request(`/inventory/adjustments/${hqAdminCreate.adj_id}/reject`, {
    method: "POST",
    role: "hqadmin",
    user: "USR000005",
    body: { reason: "HQ admin cannot reject" },
  });
  assert.equal(hqAdminReject.status, 403);

  const operatorCreatedForHqAdmin = await createAdjustment(1, { role: "storeoperator", user: "USR000015" });
  await submit(operatorCreatedForHqAdmin.adj_id, { role: "storeoperator", user: "USR000015" });
  const hqAdminApprovalForOperator = await request(
    `/inventory/adjustments/${operatorCreatedForHqAdmin.adj_id}/approve`,
    {
      method: "POST",
      role: "hqadmin",
      user: "USR000005",
      body: {},
    }
  );
  assert.equal(hqAdminApprovalForOperator.status, 200, JSON.stringify(hqAdminApprovalForOperator.payload));
  assert.equal(hqAdminApprovalForOperator.payload.status, "APPROVED");
  assert.equal(hqAdminApprovalForOperator.payload.requested_by, "USR000015");
  assert.equal(hqAdminApprovalForOperator.payload.approved_by, "USR000005");
  assert.equal(hqAdminApprovalForOperator.payload.approved_by_name, "HQ Admin");
  assert.equal(hqAdminApprovalForOperator.payload.approved_by_display, "HQ Admin (USR000005)");

  const sarahApprovalCreate = await createAdjustment(1, { role: "hqadmin", user: "USR000005" });
  await submit(sarahApprovalCreate.adj_id, { role: "hqadmin", user: "USR000005" });
  const sarahApproval = await request(`/inventory/adjustments/${sarahApprovalCreate.adj_id}/approve`, {
    method: "POST",
    role: "storemanager",
    user: "USR000002",
  });
  assert.equal(sarahApproval.status, 200, JSON.stringify(sarahApproval.payload));
  assert.equal(sarahApproval.payload.approved_by, "USR000002");
  assert.equal(sarahApproval.payload.approved_by_name, "Sarah Manager");
  assert.equal(sarahApproval.payload.approved_by_display, "Sarah Manager (USR000002)");

  const storemanagerRejected = await createAdjustment(1, { role: "hqadmin", user: "USR000005" });
  await submit(storemanagerRejected.adj_id, { role: "hqadmin", user: "USR000005" });
  const managerReject = await request(`/inventory/adjustments/${storemanagerRejected.adj_id}/reject`, {
    method: "POST",
    role: "storemanager",
    user: "USR000002",
    body: { reason: "Store manager rejected after review" },
  });
  assert.equal(managerReject.status, 200, JSON.stringify(managerReject.payload));
  assert.equal(managerReject.payload.status, "REJECTED");

  const managerCreate = await request("/inventory/adjustments", {
    method: "POST",
    role: "manager",
    user: "USR000001",
    body: {
      sku_id: "SKU000006",
      location_id: "LOC000002",
      qty_delta: 1,
      reason_code: "MISCOUNTED",
    },
  });
  assert.equal(managerCreate.status, 403);
  const adminDraftForSubmitCheck = await createAdjustment(1, { role: "storeoperator", user: "USR000015" });
  const managerSubmit = await request(`/inventory/adjustments/${adminDraftForSubmitCheck.adj_id}/submit`, {
    method: "POST",
    role: "manager",
    user: "USR000001",
  });
  assert.equal(managerSubmit.status, 403);

  const storemanagerOwned = await createAdjustment(1, { role: "storemanager", user: "USR000001" });
  await submit(storemanagerOwned.adj_id, { role: "storemanager", user: "USR000001" });
  await pool.query(
    `UPDATE public.adjustments
     SET created_by = 'USR000001', status = 'submitted', submitted_at = now()
     WHERE tenant_id = 'TNT000001' AND adj_id = $1`,
    [storemanagerOwned.adj_id]
  );
  const managerOwnReject = await request(`/inventory/adjustments/${storemanagerOwned.adj_id}/reject`, {
    method: "POST",
    role: "storemanager",
    user: "USR000001",
    body: { reason: "Manager created document" },
  });
  assert.equal(managerOwnReject.status, 403);
  assert.equal(
    managerOwnReject.payload.error.message,
    "Maker-checker violation: creator/submitter cannot approve their own document."
  );

  const auditorList = await request("/inventory/adjustments", { role: "auditor", user: "USR000014" });
  assert.equal(auditorList.status, 200);
  const warehouseManagerList = await request("/inventory/adjustments", {
    role: "warehousemanager",
    user: "USR000001",
  });
  assert.equal(warehouseManagerList.status, 200);
  const warehouseManagerCreate = await request("/inventory/adjustments", {
    method: "POST",
    role: "warehousemanager",
    user: "USR000002",
    body: {
      sku_id: "SKU000006",
      location_id: "LOC000002",
      qty_delta: 1,
      reason_code: "MISCOUNTED",
    },
  });
  assert.equal(warehouseManagerCreate.status, 201, JSON.stringify(warehouseManagerCreate.payload));
  adjustmentIds.push(warehouseManagerCreate.payload.adj_id);
  const auditorCreate = await request("/inventory/adjustments", {
    method: "POST",
    role: "auditor",
    user: "USR000014",
    body: {
      sku_id: "SKU000006",
      location_id: "LOC000002",
      qty_delta: 1,
      reason_code: "MISCOUNTED",
    },
  });
  assert.equal(auditorCreate.status, 403);

  const storeoperatorCreate = await request("/inventory/adjustments", {
    method: "POST",
    role: "storeoperator",
    user: "USR000015",
    body: {
      sku_id: "SKU000006",
      location_id: "LOC000002",
      qty_delta: 1,
      reason_code: "MISCOUNTED",
    },
  });
  assert.equal(storeoperatorCreate.status, 201, JSON.stringify(storeoperatorCreate.payload));
  adjustmentIds.push(storeoperatorCreate.payload.adj_id);

  const created = await createAdjustment(1, { role: "hqadmin", user: "USR000005" });
  await submit(created.adj_id, { role: "hqadmin", user: "USR000005" });
  const operatorApproval = await request(`/inventory/adjustments/${created.adj_id}/approve`, {
    method: "POST",
    role: "storeoperator",
    user: "USR000001",
    body: {},
  });
  assert.equal(operatorApproval.status, 403);

  const auditorApproval = await request(`/inventory/adjustments/${created.adj_id}/approve`, {
    method: "POST",
    role: "auditor",
    user: "USR000014",
    body: {},
  });
  assert.equal(auditorApproval.status, 403);

  const warehouseManagerApproval = await request(`/inventory/adjustments/${created.adj_id}/approve`, {
    method: "POST",
    role: "warehousemanager",
    user: "USR000001",
    body: {},
  });
  assert.equal(warehouseManagerApproval.status, 200, JSON.stringify(warehouseManagerApproval.payload));
  assert.equal(warehouseManagerApproval.payload.status, "APPROVED");
});
