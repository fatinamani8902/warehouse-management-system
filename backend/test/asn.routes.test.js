import assert from "node:assert/strict";
import { once } from "node:events";
import test, { after, before } from "node:test";
import { pool } from "../src/db/client.js";
import { withTenantContext } from "../src/db/withTenantContext.js";
import { createApp } from "../src/server.js";

const tenantId = "TNT000001";
const warehouseId = "WH000001";
const userId = "USR000001";
const operatorUserId = "USR000015";
const skuId = "SKU000006";
const createdAsnIds = [];
const createdFixtureGrnIds = [];
let server;
let baseUrl;
let grnBaseUrl;
let supplier;
let createdByUser;

before(async () => {
  const setup = await withTenantContext(tenantId, async (client) => {
    const supplierResult = await client.query(
      `SELECT supplier_id, supplier_name
       FROM public.suppliers
       WHERE tenant_id = $1
         AND status = 'active'
       ORDER BY supplier_id
       LIMIT 1`,
      [tenantId],
    );
    const userResult = await client.query(
      `SELECT user_id, user_name
       FROM public.users
       WHERE tenant_id = $1
         AND user_id = $2`,
      [tenantId, userId],
    );
    return {
      supplier: supplierResult.rows[0],
      user: userResult.rows[0],
    };
  });
  supplier = setup.supplier;
  createdByUser = setup.user;
  assert.ok(supplier, "ASN tests require an active supplier");
  assert.ok(createdByUser, "ASN tests require the creating user");

  server = createApp().listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/inbound/asn`;
  grnBaseUrl = `http://127.0.0.1:${server.address().port}/api/v1/inbound/grn`;
});

after(async () => {
  await withTenantContext(tenantId, async (client) => {
    await client.query(
      `DELETE FROM public.grns
       WHERE tenant_id = $1
         AND asn_id = ANY($2::text[])`,
      [tenantId, createdAsnIds],
    );
    await client.query(
      `DELETE FROM public.grns
       WHERE tenant_id = $1
         AND grn_id = ANY($2::text[])`,
      [tenantId, createdFixtureGrnIds],
    );
    await client.query(
      `DELETE FROM public.asns
       WHERE tenant_id = $1
         AND asn_id = ANY($2::text[])`,
      [tenantId, createdAsnIds],
    );
  });
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

async function request(path = "", {
  method = "GET",
  body,
  tenant = tenantId,
  role = "hqadmin",
  user = userId,
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-tenant-id": tenant,
      "x-user-id": user,
      "x-roles": role,
      "x-warehouse-id": warehouseId,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    payload: await response.json(),
  };
}

async function requestGrn(path = "", {
  method = "GET",
  body,
  tenant = tenantId,
  role = "hqadmin",
  user = userId,
} = {}) {
  const response = await fetch(`${grnBaseUrl}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-tenant-id": tenant,
      "x-user-id": user,
      "x-roles": role,
      "x-warehouse-id": warehouseId,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    payload: await response.json(),
  };
}

async function createTestAsn(qty = 3) {
  const response = await request("", {
    method: "POST",
    body: {
      supplier_id: supplier.supplier_id,
      eta: "2026-06-20",
      notes: "PostgreSQL ASN integration test",
      lines: [{ sku_id: skuId, expected_qty: qty }],
    },
  });
  assert.equal(response.status, 201);
  createdAsnIds.push(response.payload.data.asn_id);
  return response.payload.data;
}

async function createArrivedAsnGrn(qty = 2) {
  const asn = await createTestAsn(qty);
  const submitted = await request(`/${asn.asn_id}/submit`, {
    method: "POST",
    role: "hqadmin",
    body: {},
  });
  assert.equal(submitted.status, 200);

  const arrived = await request(`/${asn.asn_id}/mark-arrived`, {
    method: "POST",
    role: "storemanager",
    user: userId,
    body: {},
  });
  assert.equal(arrived.status, 200);

  const grn = await withTenantContext(tenantId, (client) => client.query(
    `SELECT grn_id
     FROM public.grns
     WHERE tenant_id = $1
       AND asn_id = $2`,
    [tenantId, asn.asn_id],
  ));
  assert.equal(grn.rowCount, 1);
  return { asn, grnId: grn.rows[0].grn_id };
}

async function createDraftGrnFixture(qty = 2) {
  const result = await withTenantContext(tenantId, async (client) => {
    const header = await client.query(
      `INSERT INTO public.grns (
         tenant_id, warehouse_id, supplier_id, received_date,
         status, received_by, notes, created_at, updated_at
       )
       VALUES ($1, $2, $3, CURRENT_DATE, 'draft', $4, 'RBAC receive fixture', now(), now())
       RETURNING grn_id`,
      [tenantId, warehouseId, supplier.supplier_id, userId],
    );
    const grnId = header.rows[0].grn_id;
    await client.query(
      `INSERT INTO public.grn_lines (
         tenant_id, grn_id, line_no, sku_id, expected_qty, received_qty,
         uom, qc_status, putaway_qty
       )
       VALUES ($1, $2, 1, $3, $4, 0, 'EA', 'pending', 0)`,
      [tenantId, grnId, skuId, qty],
    );
    return grnId;
  });
  createdFixtureGrnIds.push(result);
  return result;
}

test("ASN create inserts PostgreSQL header with supplier and creator separated", async () => {
  const created = await createTestAsn(10);

  const result = await withTenantContext(tenantId, (client) => client.query(
    `SELECT a.*, s.supplier_name
     FROM public.asns a
     JOIN public.suppliers s
       ON s.tenant_id = a.tenant_id
      AND s.supplier_id = a.supplier_id
     WHERE a.tenant_id = $1
       AND a.asn_id = $2`,
    [tenantId, created.asn_id],
  ));

  assert.equal(result.rowCount, 1);
  assert.equal(result.rows[0].supplier_id, supplier.supplier_id);
  assert.equal(result.rows[0].supplier_name, supplier.supplier_name);
  assert.equal(result.rows[0].created_by, userId);
  assert.equal(result.rows[0].warehouse_id, warehouseId);
  assert.equal(result.rows[0].status, "draft");
  assert.equal(created.supplier_name, supplier.supplier_name);
  assert.equal(created.created_by, userId);
  assert.equal(created.created_by_name, createdByUser.user_name);
  assert.equal(created.created_by_display, `${createdByUser.user_name} (${userId})`);
});

test("ASN create inserts PostgreSQL lines and list/detail return the persisted SKU", async () => {
  const created = await createTestAsn(7);

  const lines = await withTenantContext(tenantId, (client) => client.query(
    `SELECT tenant_id, asn_id, line_no, sku_id, expected_qty, uom
     FROM public.asn_lines
     WHERE tenant_id = $1
       AND asn_id = $2
     ORDER BY line_no`,
    [tenantId, created.asn_id],
  ));
  assert.equal(lines.rowCount, 1);
  assert.equal(lines.rows[0].sku_id, skuId);
  assert.equal(Number(lines.rows[0].expected_qty), 7);

  const detail = await request(`/${created.asn_id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.payload.data.supplier_id, supplier.supplier_id);
  assert.equal(detail.payload.data.supplier_name, supplier.supplier_name);
  assert.equal(detail.payload.data.created_by_display, `${createdByUser.user_name} (${userId})`);
  assert.equal(detail.payload.data.lines[0].sku_id, skuId);
  assert.equal(detail.payload.data.lines[0].expected_qty, 7);

  const list = await request();
  assert.equal(list.status, 200);
  assert.equal(list.payload.data.every((asn) => asn.tenant_id === tenantId), true);
  const listed = list.payload.data.find((asn) => asn.asn_id === created.asn_id);
  assert.equal(listed.lines[0].sku_id, skuId);
  assert.equal(listed.supplier_name, supplier.supplier_name);
  assert.equal(listed.created_by_display, `${createdByUser.user_name} (${userId})`);

  const otherTenant = await request(`/${created.asn_id}`, { tenant: "TNT000002" });
  assert.equal(otherTenant.status, 404);
});

test("ASN arrived creates one tenant-scoped PostgreSQL GRN with copied lines", async () => {
  const created = await createTestAsn();
  const transitions = [
    ["submit", "pending", "hqadmin", userId],
    ["mark-in-transit", "in_transit", "storemanager", userId],
    ["mark-arrived", "arrived", "storemanager", userId],
  ];

  for (const [action, expectedStatus, role, user] of transitions) {
    const response = await request(`/${created.asn_id}/${action}`, { method: "POST", body: {}, role, user });
    assert.equal(response.status, 200);
    assert.equal(response.payload.data.status, expectedStatus);

    const stored = await withTenantContext(tenantId, (client) => client.query(
      `SELECT status
       FROM public.asns
       WHERE tenant_id = $1
         AND asn_id = $2`,
      [tenantId, created.asn_id],
    ));
    assert.equal(stored.rows[0].status, expectedStatus);
  }

  const grn = await withTenantContext(tenantId, (client) => client.query(
    `SELECT tenant_id, warehouse_id, grn_id, asn_id, status, received_by
     FROM public.grns
     WHERE tenant_id = $1
       AND asn_id = $2`,
    [tenantId, created.asn_id],
  ));
  assert.equal(grn.rowCount, 1);
  assert.equal(grn.rows[0].warehouse_id, warehouseId);
  assert.equal(grn.rows[0].status, "draft");
  assert.equal(grn.rows[0].received_by, userId);

  const grnLines = await withTenantContext(tenantId, (client) => client.query(
    `SELECT gl.asn_line_id, gl.sku_id, gl.expected_qty, gl.received_qty
     FROM public.grn_lines gl
     JOIN public.grns g
       ON g.tenant_id = gl.tenant_id
      AND g.grn_id = gl.grn_id
     WHERE gl.tenant_id = $1
       AND g.asn_id = $2
     ORDER BY gl.line_no`,
    [tenantId, created.asn_id],
  ));
  assert.equal(grnLines.rowCount, 1);
  assert.equal(grnLines.rows[0].sku_id, skuId);
  assert.equal(Number(grnLines.rows[0].expected_qty), 3);
  assert.equal(Number(grnLines.rows[0].received_qty), 0);
  assert.ok(grnLines.rows[0].asn_line_id);

  const postingSideEffects = await withTenantContext(tenantId, (client) => client.query(
    `SELECT
       (SELECT count(*)::int
        FROM public.inventory_transactions
        WHERE tenant_id = $1
          AND reference_id = $2) AS tx_count,
       (SELECT count(*)::int
       FROM public.putaway_tasks
       WHERE tenant_id = $1
          AND reference_id = $2) AS putaway_count`,
    [tenantId, grn.rows[0].grn_id],
  ));
  assert.equal(postingSideEffects.rows[0].tx_count, 0);
  assert.equal(postingSideEffects.rows[0].putaway_count, 0);

  const repeatedArrival = await request(`/${created.asn_id}/mark-arrived`, {
    method: "POST",
    role: "storemanager",
    user: userId,
    body: {},
  });
  assert.equal(repeatedArrival.status, 200);
  assert.equal(repeatedArrival.payload.data.status, "arrived");

  const duplicateCheck = await withTenantContext(tenantId, (client) => client.query(
    `SELECT
       count(DISTINCT g.grn_id)::int AS grn_count,
       count(gl.grn_line_id)::int AS line_count
     FROM public.grns g
     LEFT JOIN public.grn_lines gl
       ON gl.tenant_id = g.tenant_id
      AND gl.grn_id = g.grn_id
     WHERE g.tenant_id = $1
       AND g.asn_id = $2`,
    [tenantId, created.asn_id],
  ));
  assert.equal(duplicateCheck.rows[0].grn_count, 1);
  assert.equal(duplicateCheck.rows[0].line_count, 1);

  const grnList = await requestGrn();
  assert.equal(grnList.status, 200);
  assert.ok(grnList.payload.data.some((grn) => grn.asn_id === created.asn_id));

  const otherTenantGrn = await withTenantContext("TNT000002", (client) => client.query(
    `SELECT grn_id
     FROM public.grns
     WHERE tenant_id = $1
       AND asn_id = $2`,
    ["TNT000002", created.asn_id],
  ));
  assert.equal(otherTenantGrn.rowCount, 0);
});

test("ASN create validates required lines and positive quantities", async () => {
  const noLines = await request("", {
    method: "POST",
    body: { supplier_id: supplier.supplier_id, eta: "2026-06-20", lines: [] },
  });
  assert.equal(noLines.status, 400);
  assert.equal(noLines.payload.error.message, "Add at least one SKU line");

  const invalidQty = await request("", {
    method: "POST",
    body: {
      supplier_id: supplier.supplier_id,
      eta: "2026-06-20",
      lines: [{ sku_id: skuId, expected_qty: 0 }],
    },
  });
  assert.equal(invalidQty.status, 400);
  assert.match(invalidQty.payload.error.message, /greater than 0/);
});

test("ASN cancel is allowed for draft and persists cancellation metadata", async () => {
  const created = await createTestAsn(2);

  const missingReason = await request(`/${created.asn_id}/cancel`, {
    method: "POST",
    body: {},
  });
  assert.equal(missingReason.status, 400);
  assert.equal(missingReason.payload.error.message, "Cancellation reason is required");

  const cancelled = await request(`/${created.asn_id}/cancel`, {
    method: "POST",
    body: { reason: "Supplier shipment cancelled" },
  });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.payload.data.status, "cancelled");
  assert.equal(cancelled.payload.data.cancelled_by, userId);
  assert.equal(cancelled.payload.data.cancellation_reason, "Supplier shipment cancelled");
  assert.ok(cancelled.payload.data.cancelled_at);

  const stored = await withTenantContext(tenantId, (client) => client.query(
    `SELECT status, cancelled_by, cancellation_reason, cancelled_at
     FROM public.asns
     WHERE tenant_id = $1
       AND asn_id = $2`,
    [tenantId, created.asn_id],
  ));
  assert.equal(stored.rows[0].status, "cancelled");
  assert.equal(stored.rows[0].cancelled_by, userId);
  assert.equal(stored.rows[0].cancellation_reason, "Supplier shipment cancelled");
  assert.ok(stored.rows[0].cancelled_at);
});

test("ASN cancel is allowed for pending", async () => {
  const created = await createTestAsn(2);

  const submitted = await request(`/${created.asn_id}/submit`, { method: "POST", body: {} });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.payload.data.status, "pending");

  const cancelled = await request(`/${created.asn_id}/cancel`, {
    method: "POST",
    body: { reason: "Supplier paused shipment" },
  });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.payload.data.status, "cancelled");
  assert.equal(cancelled.payload.data.cancellation_reason, "Supplier paused shipment");
});

test("ASN cancel is rejected for in transit", async () => {
  const created = await createTestAsn(2);

  await request(`/${created.asn_id}/submit`, { method: "POST", body: {} });
  const inTransit = await request(`/${created.asn_id}/mark-in-transit`, {
    method: "POST",
    body: {},
    role: "storemanager",
    user: userId,
  });
  assert.equal(inTransit.status, 200);
  assert.equal(inTransit.payload.data.status, "in_transit");

  const cancelled = await request(`/${created.asn_id}/cancel`, {
    method: "POST",
    body: { reason: "Too late to cancel" },
  });
  assert.equal(cancelled.status, 400);
  assert.match(cancelled.payload.error.message, /Cannot cancel ASN with status 'in_transit'/);

  const detail = await request(`/${created.asn_id}`);
  assert.equal(detail.payload.data.status, "in_transit");
});

test("ASN cancel is rejected for arrived", async () => {
  const created = await createTestAsn(2);

  await request(`/${created.asn_id}/submit`, { method: "POST", body: {} });
  const arrived = await request(`/${created.asn_id}/mark-arrived`, {
    method: "POST",
    body: {},
    role: "storemanager",
    user: userId,
  });
  assert.equal(arrived.status, 200);
  assert.equal(arrived.payload.data.status, "arrived");

  const cancelled = await request(`/${created.asn_id}/cancel`, {
    method: "POST",
    body: { reason: "Too late to cancel" },
  });
  assert.equal(cancelled.status, 400);
  assert.match(cancelled.payload.error.message, /Cannot cancel ASN with status 'arrived'/);

  const grn = await withTenantContext(tenantId, (client) => client.query(
    `SELECT grn_id
     FROM public.grns
     WHERE tenant_id = $1
       AND asn_id = $2`,
    [tenantId, created.asn_id],
  ));
  assert.equal(grn.rowCount, 1);
});

test("ASN RBAC follows supplier-management role matrix", async () => {
  const created = await createTestAsn(2);

  const superadminCreate = await request("", {
    method: "POST",
    role: "superadmin",
    body: {
      supplier_id: supplier.supplier_id,
      eta: "2026-06-20",
      lines: [{ sku_id: skuId, expected_qty: 1 }],
    },
  });
  assert.equal(superadminCreate.status, 201);
  createdAsnIds.push(superadminCreate.payload.data.asn_id);

  const superadminSubmitted = await request(`/${superadminCreate.payload.data.asn_id}/submit`, {
    method: "POST",
    role: "superadmin",
    body: {},
  });
  assert.equal(superadminSubmitted.status, 200, JSON.stringify(superadminSubmitted.payload));
  assert.equal(superadminSubmitted.payload.data.status, "pending");

  const superadminCancelCreate = await request("", {
    method: "POST",
    role: "superadmin",
    body: {
      supplier_id: supplier.supplier_id,
      eta: "2026-06-20",
      lines: [{ sku_id: skuId, expected_qty: 1 }],
    },
  });
  assert.equal(superadminCancelCreate.status, 201);
  createdAsnIds.push(superadminCancelCreate.payload.data.asn_id);

  const superadminCancelled = await request(`/${superadminCancelCreate.payload.data.asn_id}/cancel`, {
    method: "POST",
    role: "superadmin",
    body: { reason: "Draft ASN no longer needed" },
  });
  assert.equal(superadminCancelled.status, 200, JSON.stringify(superadminCancelled.payload));
  assert.equal(superadminCancelled.payload.data.status, "cancelled");
  assert.equal(superadminCancelled.payload.data.cancellation_reason, "Draft ASN no longer needed");

  const operatorCreate = await request("", {
    method: "POST",
    role: "storeoperator",
    user: operatorUserId,
    body: {
      supplier_id: supplier.supplier_id,
      eta: "2026-06-20",
      lines: [{ sku_id: skuId, expected_qty: 1 }],
    },
  });
  assert.equal(operatorCreate.status, 403);

  const managerCreate = await request("", {
    method: "POST",
    role: "manager",
    body: {
      supplier_id: supplier.supplier_id,
      eta: "2026-06-20",
      lines: [{ sku_id: skuId, expected_qty: 1 }],
    },
  });
  assert.equal(managerCreate.status, 403);

  const auditorCreate = await request("", {
    method: "POST",
    role: "auditor",
    body: {
      supplier_id: supplier.supplier_id,
      eta: "2026-06-20",
      lines: [{ sku_id: skuId, expected_qty: 1 }],
    },
  });
  assert.equal(auditorCreate.status, 403);

  const auditorSubmit = await request(`/${created.asn_id}/submit`, {
    method: "POST",
    role: "auditor",
    body: {},
  });
  assert.equal(auditorSubmit.status, 403);

  const submitted = await request(`/${created.asn_id}/submit`, {
    method: "POST",
    role: "hqadmin",
    body: {},
  });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.payload.data.status, "pending");

  const hqInTransit = await request(`/${created.asn_id}/mark-in-transit`, {
    method: "POST",
    role: "hqadmin",
    body: {},
  });
  assert.equal(hqInTransit.status, 200);
  assert.equal(hqInTransit.payload.data.status, "in_transit");

  const operatorArrived = await request(`/${created.asn_id}/mark-arrived`, {
    method: "POST",
    role: "storeoperator",
    user: operatorUserId,
    body: {},
  });
  assert.equal(operatorArrived.status, 403);
});

test("ASN mark in transit and mark arrived allow approved management roles", async () => {
  for (const role of ["superadmin", "hqadmin", "storemanager"]) {
    const created = await createTestAsn(2);
    const submitted = await request(`/${created.asn_id}/submit`, {
      method: "POST",
      role,
      body: {},
    });
    assert.equal(submitted.status, 200, `${role} should submit ASN`);
    assert.equal(submitted.payload.data.status, "pending");

    const inTransit = await request(`/${created.asn_id}/mark-in-transit`, {
      method: "POST",
      role,
      body: {},
    });
    assert.equal(inTransit.status, 200, `${role} should mark ASN in transit`);
    assert.equal(inTransit.payload.data.status, "in_transit");

    const arrived = await request(`/${created.asn_id}/mark-arrived`, {
      method: "POST",
      role,
      body: {},
    });
    assert.equal(arrived.status, 200, `${role} should mark ASN arrived`);
    assert.equal(arrived.payload.data.status, "arrived");
  }
});

test("ASN management transitions reject unauthorized roles and invalid statuses normally", async () => {
  const created = await createTestAsn(2);

  const submitted = await request(`/${created.asn_id}/submit`, {
    method: "POST",
    role: "hqadmin",
    body: {},
  });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.payload.data.status, "pending");

  for (const role of ["storeoperator", "auditor"]) {
    const rejected = await request(`/${created.asn_id}/mark-in-transit`, {
      method: "POST",
      role,
      user: role === "storeoperator" ? operatorUserId : userId,
      body: {},
    });
    assert.equal(rejected.status, 403, `${role} should not mark ASN in transit`);
  }

  const inTransit = await request(`/${created.asn_id}/mark-in-transit`, {
    method: "POST",
    role: "storemanager",
    body: {},
  });
  assert.equal(inTransit.status, 200);

  const invalidRepeat = await request(`/${created.asn_id}/mark-in-transit`, {
    method: "POST",
    role: "storemanager",
    body: {},
  });
  assert.equal(invalidRepeat.status, 400);
  assert.match(invalidRepeat.payload.error.message, /Cannot mark-in-transit ASN with status 'in_transit'/);
});

test("GRN RBAC allows receiving to operators and posting to managers only", async () => {
  const { grnId } = await createArrivedAsnGrn(2);

  const auditorList = await requestGrn("", { role: "auditor" });
  assert.equal(auditorList.status, 200);

  const operatorPost = await requestGrn(`/${grnId}/post`, {
    method: "POST",
    role: "storeoperator",
    user: operatorUserId,
    body: {},
  });
  assert.equal(operatorPost.status, 403);

  const hqPost = await requestGrn(`/${grnId}/post`, {
    method: "POST",
    role: "hqadmin",
    body: {},
  });
  assert.equal(hqPost.status, 403);

  const started = await requestGrn(`/${grnId}/start_receiving`, {
    method: "POST",
    role: "storeoperator",
    user: operatorUserId,
    body: {},
  });
  assert.equal(started.status, 200);
  assert.equal(started.payload.data.status, "receiving");

  const updated = await requestGrn(`/${grnId}/lines`, {
    method: "PATCH",
    role: "storeoperator",
    user: operatorUserId,
    body: { lines: [{ line_no: 1, received_qty: 2 }] },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.payload.data.lines[0].received_qty, 2);

  const completed = await requestGrn(`/${grnId}/complete`, {
    method: "POST",
    role: "storeoperator",
    user: operatorUserId,
    body: {},
  });
  assert.equal(completed.status, 200);
  assert.equal(completed.payload.data.status, "completed");

  const managerPost = await requestGrn(`/${grnId}/post`, {
    method: "POST",
    role: "manager",
    body: {},
  });
  assert.equal(managerPost.status, 200);
  assert.equal(managerPost.payload.data.status, "posted");
  assert.ok(Array.isArray(managerPost.payload.data.inventory_transactions));
  assert.ok(managerPost.payload.data.inventory_transactions.length > 0);
  assert.ok(Array.isArray(managerPost.payload.data.putaway_tasks));
  assert.ok(managerPost.payload.data.putaway_tasks.length > 0);

  const cancel = await requestGrn(`/${grnId}/cancel`, {
    method: "POST",
    role: "manager",
    body: { reason: "not supported" },
  });
  assert.equal(cancel.status, 404);
});

test("direct GRN creation is unavailable", async () => {
  const created = await requestGrn("", {
    method: "POST",
    role: "hqadmin",
    body: {
      asn_id: null,
      supplier_id: supplier.supplier_id,
      received_date: "2026-06-20",
      notes: "RBAC direct GRN test",
    },
  });
  assert.equal(created.status, 404);
});

test("storeoperator can receive and complete PostgreSQL GRN but cannot post it", async () => {
  const grnId = await createDraftGrnFixture(2);

  const started = await requestGrn(`/${grnId}/start_receiving`, {
    method: "POST",
    role: "storeoperator",
    user: operatorUserId,
    body: {},
  });
  assert.equal(started.status, 200);
  assert.equal(started.payload.data.status, "receiving");

  const updated = await requestGrn(`/${grnId}/lines`, {
    method: "PATCH",
    role: "storeoperator",
    user: operatorUserId,
    body: { lines: [{ line_no: 1, received_qty: 2 }] },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.payload.data.lines[0].received_qty, 2);

  const completed = await requestGrn(`/${grnId}/complete`, {
    method: "POST",
    role: "storeoperator",
    user: operatorUserId,
    body: {},
  });
  assert.equal(completed.status, 200);
  assert.equal(completed.payload.data.status, "completed");

  const operatorPost = await requestGrn(`/${grnId}/post`, {
    method: "POST",
    role: "storeoperator",
    user: operatorUserId,
    body: {},
  });
  assert.equal(operatorPost.status, 403);
});
