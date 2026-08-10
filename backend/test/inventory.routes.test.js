import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { once } from "node:events";
import { pool } from "../src/db/client.js";
import { createApp } from "../src/server.js";

let server;
let baseUrl = "";
let originalBalanceQty;
const adjustmentIds = [];

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

  const app = createApp();
  server = app.listen(0);
  await once(server, "listening");
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
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
  await pool.query(
    `UPDATE public.inventory_balances
     SET qty_on_hand = $1, updated_at = now()
     WHERE tenant_id = 'TNT000001'
       AND warehouse_id = 'WH000001'
       AND sku_id = 'SKU000006'
       AND location_id = 'LOC000002'
       AND lot_no IS NULL
       AND serial_no IS NULL`,
    [originalBalanceQty]
  );
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

async function apiRequest(path, {
  method = "GET",
  body,
  tenant = "TNT000001",
  role = "superadmin",
  user = "USR000001",
  warehouse = "WH000001",
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": tenant,
      "x-role-id": role,
      "x-user-id": user,
      "x-warehouse-id": warehouse,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
}

test("inventory summary is tenant scoped", async () => {
  const response = await apiRequest("/api/inventory/summary?page=1&pageSize=100", {
    tenant: "TNT000001",
    role: "superadmin",
  });

  assert.equal(response.status, 200);
  assert.equal(Array.isArray(response.payload.items), true);
  assert.equal(response.payload.items.some((row) => row.location_id === "LOC100001"), false);
});

test("admin can create and submit adjustment while storeoperator cannot approve", async () => {
  const createResponse = await apiRequest("/api/inventory/adjustments", {
    method: "POST",
    role: "admin",
    user: "USR000009",
    body: {
      sku_id: "SKU000006",
      location_id: "LOC000002",
      qty_delta: -4,
      reason_code: "DAMAGED",
    },
  });

  assert.equal(createResponse.status, 201);
  const adjId = createResponse.payload.adj_id;
  adjustmentIds.push(adjId);

  const submitResponse = await apiRequest(`/api/inventory/adjustments/${adjId}/submit`, {
    method: "POST",
    role: "admin",
    user: "USR000009",
  });
  assert.equal(submitResponse.status, 200);
  assert.equal(submitResponse.payload.status, "SUBMITTED");

  const approveBlocked = await apiRequest(`/api/inventory/adjustments/${adjId}/approve`, {
    method: "POST",
    role: "storeoperator",
    user: "USR000015",
    body: { approval_note: "trying approve" },
  });
  assert.equal(approveBlocked.status, 403);
});

test("manager can approve submitted adjustment created by another user", async () => {
  const createResponse = await apiRequest("/api/inventory/adjustments", {
    method: "POST",
    role: "admin",
    user: "USR000009",
    body: {
      sku_id: "SKU000006",
      location_id: "LOC000002",
      qty_delta: 2,
      reason_code: "MISCOUNTED",
    },
  });
  assert.equal(createResponse.status, 201);
  const adjId = createResponse.payload.adj_id;
  adjustmentIds.push(adjId);

  const submitResponse = await apiRequest(`/api/inventory/adjustments/${adjId}/submit`, {
    method: "POST",
    role: "admin",
    user: "USR000009",
  });
  assert.equal(submitResponse.status, 200);

  const approveResponse = await apiRequest(`/api/inventory/adjustments/${adjId}/approve`, {
    method: "POST",
    role: "manager",
    user: "USR000015",
    body: { approval_note: "Approved for correction" },
  });

  assert.equal(approveResponse.status, 200);
  assert.equal(approveResponse.payload.status, "APPROVED");
});

test("count plan cancel requires a meaningful reason", async () => {
  const response = await apiRequest("/api/inventory/count-plans/CC000015/cancel", {
    method: "POST",
    role: "manager",
    user: "USR000002",
    body: { reason: "no" },
  });

  assert.equal(response.status, 400);
});

test("count plan detail respects tenant scope", async () => {
  const response = await apiRequest("/api/inventory/count-plans/CC000015", {
    tenant: "TNT000002",
    role: "superadmin",
    user: "USR100001",
    warehouse: "WH000003",
  });

  assert.equal(response.status, 404);
});
