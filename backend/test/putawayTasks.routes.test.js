import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { once } from "node:events";
import { db } from "../src/data/store.js";
import { pool } from "../src/db/client.js";
import { createApp } from "../src/server.js";

let server;
let baseUrl = "";
const postgresTaskId = `PUT9${Date.now().toString().slice(-5)}`;
const invalidTaskId = `PUTX${Date.now().toString().slice(-5)}`;
const completedHistoryTaskId = `PUTC${Date.now().toString().slice(-5)}`;
const unassignedCompletedHistoryTaskId = `PUTH${Date.now().toString().slice(-5)}`;
const fixtureSuffix = Date.now().toString().slice(-6);
const fixtureGrnId = `GRNT${fixtureSuffix}`;
const fixtureGrnLineId = `GRLT${fixtureSuffix}`;
const fixtureSourceLocationId = `LRC${fixtureSuffix}`;
const operationalUsers = [
  {
    userId: `UWO${fixtureSuffix}`,
    userName: "Test Warehouse Operator",
    roleId: "warehouseoperator",
  },
  {
    userId: `USK${fixtureSuffix}`,
    userName: "Test Storekeeper",
    roleId: "storekeeper",
  },
  {
    userId: `UWC${fixtureSuffix}`,
    userName: "Test Warehouse Clerk",
    roleId: "warehouseclerk",
  },
];
const noWarehouseUser = {
  userId: `UNW${fixtureSuffix}`,
  userName: "Test Wrong Warehouse Operator",
  roleId: "warehouseoperator",
};

before(async () => {
  for (const role of [
    ["warehouseoperator", "Warehouse Operator"],
    ["storekeeper", "Storekeeper"],
    ["warehouseclerk", "Warehouse Clerk"],
  ]) {
    await pool.query(
      `INSERT INTO public.roles (role_id, role_name, description, is_system)
       VALUES ($1, $2, 'Putaway assignment test role', true)
       ON CONFLICT (role_id) DO NOTHING`,
      role,
    );
  }
  for (const user of [...operationalUsers, noWarehouseUser]) {
    await pool.query(
      `INSERT INTO public.users (
         tenant_id, user_id, email, user_name, is_active, created_at, updated_at
       )
       VALUES ('TNT000001', $1, $2, $3, true, now(), now())`,
      [
        user.userId,
        `${user.userId.toLowerCase()}@test.local`,
        user.userName,
      ],
    );
    await pool.query(
      `INSERT INTO public.user_roles (tenant_id, user_id, role_id)
       VALUES ('TNT000001', $1, $2)`,
      [user.userId, user.roleId],
    );
  }
  for (const user of operationalUsers) {
    await pool.query(
      `INSERT INTO public.user_warehouses (tenant_id, user_id, warehouse_id)
       VALUES ('TNT000001', $1, 'WH000001')`,
      [user.userId],
    );
  }
  await pool.query(
    `INSERT INTO public.locations (
       tenant_id, location_id, warehouse_id, location_code, label,
       location_type, is_active, is_default_receiving
     )
     VALUES (
       'TNT000001', $1, 'WH000001', $1, 'Test Receiving Source',
       'receiving', true, false
     )
     ON CONFLICT (location_id) DO NOTHING`,
    [fixtureSourceLocationId],
  );

  await pool.query(
    `INSERT INTO public.grns (
       tenant_id, grn_id, warehouse_id, received_date,
       status, received_by, created_at, updated_at
     )
     VALUES (
       'TNT000001', $1, 'WH000001', CURRENT_DATE,
       'posted', 'USR000001', now(), now()
     )`,
    [fixtureGrnId],
  );
  await pool.query(
    `INSERT INTO public.grn_lines (
       tenant_id, grn_line_id, grn_id, line_no, sku_id,
       expected_qty, received_qty, uom, qc_status, putaway_qty
     )
     VALUES (
       'TNT000001', $1, $2, 1, 'SKU000006',
       1, 1, 'EA', 'passed', 0
     )`,
    [fixtureGrnLineId, fixtureGrnId],
  );
  await pool.query(
    `INSERT INTO public.putaway_tasks (
       tenant_id, putaway_task_id, warehouse_id,
       grn_id, grn_line_id, sku_id, qty, status, priority,
       from_location_id, source_location_id,
       lot_no, reference_type, reference_id, posting_key
     )
     VALUES (
       $1, $2, $3,
       $4, $5, $6, $7, 'pending', 3,
       $8, $8,
       $9, 'grn', $4, $10
     )`,
    [
      "TNT000001",
      postgresTaskId,
      "WH000001",
      fixtureGrnId,
      fixtureGrnLineId,
      "SKU000006",
      1,
      fixtureSourceLocationId,
      null,
      `${fixtureGrnId}:${postgresTaskId}`,
    ],
  );
  await pool.query(
    `INSERT INTO public.putaway_tasks (
       tenant_id, putaway_task_id, warehouse_id,
       grn_id, grn_line_id, sku_id, qty, status, priority,
       lot_no, reference_type, reference_id, posting_key
     )
     VALUES (
       $1, $2, $3,
       $4, $5, $6, $7, 'pending', 3,
       $8, 'grn', $4, $9
     )`,
    [
      "TNT000001",
      invalidTaskId,
      "WH000001",
      fixtureGrnId,
      fixtureGrnLineId,
      "SKU000006",
      1,
      null,
      `${fixtureGrnId}:${invalidTaskId}`,
    ],
  );
  await pool.query(
    `INSERT INTO public.putaway_tasks (
       tenant_id, putaway_task_id, warehouse_id,
       grn_id, grn_line_id, sku_id, qty, status, priority,
       assigned_to_user_id,
       lot_no, reference_type, reference_id, posting_key
     )
     VALUES (
       $1, $2, $3,
       $4, $5, $6, $7, 'completed', 3,
       $8,
       $9, 'grn', $4, $10
     )`,
    [
      "TNT000001",
      completedHistoryTaskId,
      "WH000001",
      fixtureGrnId,
      fixtureGrnLineId,
      "SKU000006",
      1,
      operationalUsers[2].userId,
      null,
      `${fixtureGrnId}:${completedHistoryTaskId}`,
    ],
  );
  await pool.query(
    `INSERT INTO public.putaway_tasks (
       tenant_id, putaway_task_id, warehouse_id,
       grn_id, grn_line_id, sku_id, qty, status, priority,
       lot_no, reference_type, reference_id, posting_key
     )
     VALUES (
       $1, $2, $3,
       $4, $5, $6, $7, 'completed', 3,
       $8, 'grn', $4, $9
     )`,
    [
      "TNT000001",
      unassignedCompletedHistoryTaskId,
      "WH000001",
      fixtureGrnId,
      fixtureGrnLineId,
      "SKU000006",
      1,
      null,
      `${fixtureGrnId}:${unassignedCompletedHistoryTaskId}`,
    ],
  );
  await pool.query(
    `UPDATE public.putaway_tasks
     SET created_at = CASE putaway_task_id
       WHEN $1 THEN TIMESTAMPTZ '2026-07-10 10:00:00+08'
       WHEN $2 THEN TIMESTAMPTZ '2026-07-11 10:00:00+08'
       WHEN $3 THEN TIMESTAMPTZ '2026-07-12 10:00:00+08'
       WHEN $4 THEN TIMESTAMPTZ '2026-07-13 10:00:00+08'
       ELSE created_at
     END
     WHERE tenant_id = 'TNT000001'
       AND putaway_task_id = ANY($5::text[])`,
    [
      postgresTaskId,
      invalidTaskId,
      completedHistoryTaskId,
      unassignedCompletedHistoryTaskId,
      [postgresTaskId, invalidTaskId, completedHistoryTaskId, unassignedCompletedHistoryTaskId],
    ],
  );

  const app = createApp();
  server = app.listen(0);
  await once(server, "listening");
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await pool.query(
    `DELETE FROM public.putaway_tasks
     WHERE tenant_id = 'TNT000001'
       AND putaway_task_id = ANY($1::text[])`,
    [[postgresTaskId, invalidTaskId, completedHistoryTaskId, unassignedCompletedHistoryTaskId]],
  );
  await pool.query(
    `DELETE FROM public.grns
     WHERE tenant_id = 'TNT000001'
       AND grn_id = $1`,
    [fixtureGrnId],
  );
  await pool.query(
    `DELETE FROM public.users
     WHERE tenant_id = 'TNT000001'
       AND user_id = ANY($1::text[])`,
    [[...operationalUsers, noWarehouseUser].map((user) => user.userId)],
  );
  await pool.query(
    `DELETE FROM public.locations
     WHERE tenant_id = 'TNT000001'
       AND location_id = $1`,
    [fixtureSourceLocationId],
  );
  if (!server) {
    await pool.end();
    return;
  }
  await new Promise((resolve) => server.close(resolve));
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

test("GET /api/putaway-tasks is tenant scoped", async () => {
  const response = await apiRequest("/api/putaway-tasks?page=1&pageSize=20", {
    tenant: "TNT000001",
    role: "superadmin",
  });

  assert.equal(response.status, 200);
  assert.equal(Array.isArray(response.payload.items), true);
  assert.equal(response.payload.items.some((item) => item.task_id === "PUT000310"), false);
  for (const legacyTaskId of ["PUT000210", "PUT000211", "PUT000213", "PUT000214"]) {
    assert.equal(
      response.payload.items.some((item) => item.task_id === legacyTaskId),
      false,
      `${legacyTaskId} must not be returned from legacy storage`,
    );
  }

  const legacyDetail = await apiRequest("/api/putaway-tasks/PUT000214", {
    role: "superadmin",
  });
  assert.equal(legacyDetail.status, 404);

  const invalidSearch = await apiRequest(`/api/putaway-tasks?search=${invalidTaskId}`, {
    role: "superadmin",
  });
  assert.equal(invalidSearch.status, 200);
  assert.equal(
    invalidSearch.payload.items.some((item) => item.task_id === invalidTaskId),
    false,
    "Active tasks without a valid source location must be excluded from the operational queue",
  );

  const completedSearch = await apiRequest(`/api/putaway-tasks?search=${completedHistoryTaskId}`, {
    role: "superadmin",
  });
  assert.equal(completedSearch.status, 200);
  assert.equal(
    completedSearch.payload.items.some((item) => item.task_id === completedHistoryTaskId),
    true,
    "Completed historical tasks must remain visible even when older seed fields are incomplete",
  );
  const completed = completedSearch.payload.items.find((item) => item.task_id === completedHistoryTaskId);
  assert.equal(completed.assigned_to_user_id, operationalUsers[2].userId);
  assert.equal(completed.assigned_to_user_name, operationalUsers[2].userName);
  assert.equal(
    completed.assigned_to_user_display,
    `${operationalUsers[2].userName} (${operationalUsers[2].userId})`,
  );

  const unassignedSearch = await apiRequest(`/api/putaway-tasks?search=${postgresTaskId}`, {
    role: "superadmin",
  });
  assert.equal(unassignedSearch.status, 200);
  const unassigned = unassignedSearch.payload.items.find((item) => item.task_id === postgresTaskId);
  assert.equal(unassigned.sku_id, "SKU000006");
  assert.equal(typeof unassigned.sku_name, "string");
  assert.ok(unassigned.sku_name.length > 0);
  assert.equal(unassigned.sku_description, unassigned.sku_name);
  assert.equal(unassigned.assigned_to_user_id, null);
  assert.equal(unassigned.assigned_to_user_name, null);
  assert.equal(unassigned.assigned_to_user_display, null);
  assert.equal(unassigned.execution.assigned_to, "Unassigned");

  const historicalUnassignedSearch = await apiRequest(
    `/api/putaway-tasks?search=${unassignedCompletedHistoryTaskId}`,
    { role: "superadmin" },
  );
  assert.equal(historicalUnassignedSearch.status, 200);
  const historicalUnassigned = historicalUnassignedSearch.payload.items.find(
    (item) => item.task_id === unassignedCompletedHistoryTaskId,
  );
  assert.ok(historicalUnassigned);
  assert.equal(historicalUnassigned.status, "completed");
  assert.equal(historicalUnassigned.assigned_to_user_id, null);
  assert.equal(historicalUnassigned.assigned_to_user_name, null);
  assert.equal(historicalUnassigned.assigned_to_user_display, null);
  assert.equal(historicalUnassigned.execution.assigned_to, "Unassigned");

  const historicalUnassignedHistory = await apiRequest(
    `/api/putaway-tasks/${unassignedCompletedHistoryTaskId}/history`,
    { role: "superadmin" },
  );
  assert.equal(historicalUnassignedHistory.status, 200);
  assert.equal(Array.isArray(historicalUnassignedHistory.payload), true);
});

test("GET /api/putaway-tasks filters by created date range", async () => {
  const sameDay = await apiRequest(
    "/api/putaway-tasks?dateFrom=2026-07-10&dateTo=2026-07-10&page=1&pageSize=20",
    { role: "superadmin" },
  );
  assert.equal(sameDay.status, 200);
  assert.equal(sameDay.payload.items.some((item) => item.task_id === postgresTaskId), true);
  assert.equal(sameDay.payload.items.some((item) => item.task_id === completedHistoryTaskId), false);

  const fromOnly = await apiRequest(
    "/api/putaway-tasks?dateFrom=2026-07-12&page=1&pageSize=20",
    { role: "superadmin" },
  );
  assert.equal(fromOnly.status, 200);
  assert.equal(fromOnly.payload.items.some((item) => item.task_id === completedHistoryTaskId), true);
  assert.equal(fromOnly.payload.items.some((item) => item.task_id === postgresTaskId), false);

  const toOnly = await apiRequest(
    "/api/putaway-tasks?dateTo=2026-07-10&page=1&pageSize=20",
    { role: "superadmin" },
  );
  assert.equal(toOnly.status, 200);
  assert.equal(toOnly.payload.items.some((item) => item.task_id === postgresTaskId), true);
  assert.equal(toOnly.payload.items.some((item) => item.task_id === completedHistoryTaskId), false);

  const combined = await apiRequest(
    `/api/putaway-tasks?dateFrom=2026-07-10&dateTo=2026-07-10&status=pending&priority=medium&search=${postgresTaskId}&page=1&pageSize=1`,
    { role: "superadmin" },
  );
  assert.equal(combined.status, 200);
  assert.equal(combined.payload.total, 1);
  assert.equal(combined.payload.items[0]?.task_id, postgresTaskId);
  assert.equal(combined.payload.page, 1);
  assert.equal(combined.payload.pageSize, 1);

  const invalid = await apiRequest(
    "/api/putaway-tasks?dateFrom=2026-07-12&dateTo=2026-07-10",
    { role: "superadmin" },
  );
  assert.equal(invalid.status, 400);
});

test("storeoperator cannot assign putaway task", async () => {
  const response = await apiRequest("/api/putaway-tasks/PUT000210/assign", {
    method: "POST",
    role: "storeoperator",
    user: "USR000003",
    body: { assignedToUserId: "USR000004" },
  });

  assert.equal(response.status, 403);
});

test("PostgreSQL-only task assignment updates list and detail with operator name", async () => {
  assert.equal(
    db.putaway_tasks.some((task) => task.task_id === postgresTaskId),
    false,
    "Regression fixture must not exist in legacy storage",
  );

  const operators = await apiRequest("/api/putaway-tasks/operators", {
    role: "superadmin",
  });
  assert.equal(operators.status, 200);
  assert.equal(operators.payload.some((operator) => operator.user_id === "USR000001"), false);
  for (const user of operationalUsers) {
    assert.equal(
      operators.payload.some((operator) => operator.user_id === user.userId),
      true,
      `${user.roleId} must be assignable`,
    );
  }
  assert.equal(
    operators.payload.some((operator) => operator.user_id === "USR000015" && operator.user_name === "Mike Operator"),
    true,
    "PostgreSQL operational users must be offered with their actual user name",
  );

  const adminRejected = await apiRequest(`/api/putaway-tasks/${postgresTaskId}/assign`, {
    method: "POST",
    role: "superadmin",
    user: "USR000001",
    body: { assignedToUserId: "USR000001" },
  });
  assert.equal(adminRejected.status, 400);
  assert.equal(
    adminRejected.payload.error.message,
    "Selected user must be an operational warehouse user.",
  );

  const warehouseRejected = await apiRequest(`/api/putaway-tasks/${postgresTaskId}/assign`, {
    method: "POST",
    role: "superadmin",
    user: "USR000001",
    body: { assignedToUserId: noWarehouseUser.userId },
  });
  assert.equal(warehouseRejected.status, 400);
  assert.equal(warehouseRejected.payload.error.code, "PUTAWAY_OPERATOR_WAREHOUSE_INVALID");

  const invalidSourceRejected = await apiRequest(`/api/putaway-tasks/${invalidTaskId}/assign`, {
    method: "POST",
    role: "superadmin",
    user: "USR000001",
    body: { assignedToUserId: operationalUsers[0].userId },
  });
  assert.equal(invalidSourceRejected.status, 400);
  assert.equal(invalidSourceRejected.payload.error.code, "PUTAWAY_SOURCE_LOCATION_REQUIRED");

  await pool.query(
    `UPDATE public.putaway_tasks
     SET status = 'open'
     WHERE tenant_id = 'TNT000001'
       AND warehouse_id = 'WH000001'
       AND putaway_task_id = $1`,
    [postgresTaskId],
  );

  const assignee = operationalUsers[0];
  const response = await apiRequest(`/api/putaway-tasks/${postgresTaskId}/assign`, {
    method: "POST",
    role: "superadmin",
    user: "USR000001",
    body: { assignedToUserId: assignee.userId },
  });

  assert.equal(response.status, 200);
  assert.equal(response.payload.task.task_id, postgresTaskId);
  assert.equal(response.payload.task.assigned_to_user_id, assignee.userId);
  assert.equal(response.payload.task.assigned_to_user_name, assignee.userName);
  assert.equal(response.payload.task.assigned_to_user_display, `${assignee.userName} (${assignee.userId})`);
  assert.equal(response.payload.task.execution.assigned_to, `${assignee.userName} (${assignee.userId})`);
  assert.equal(response.payload.task.status, "assigned");

  const stored = await pool.query(
    `SELECT assigned_to_user_id, status
     FROM public.putaway_tasks
     WHERE tenant_id = 'TNT000001'
       AND warehouse_id = 'WH000001'
       AND putaway_task_id = $1`,
    [postgresTaskId],
  );
  assert.equal(stored.rows[0].assigned_to_user_id, assignee.userId);
  assert.equal(stored.rows[0].status, "assigned");

  const list = await apiRequest(`/api/putaway-tasks?search=${postgresTaskId}`, {
    role: "superadmin",
  });
  assert.equal(list.status, 200);
  const listed = list.payload.items.find((task) => task.task_id === postgresTaskId);
  assert.equal(listed.putaway_task_id, postgresTaskId);
  assert.equal(listed.grn_id, response.payload.task.grn_id);
  assert.equal(listed.sku_id, response.payload.task.sku_id);
  assert.equal(listed.sku_name, response.payload.task.sku_name);
  assert.equal(listed.sku_description, response.payload.task.sku_description);
  assert.ok(listed.sku_name);
  assert.equal(listed.assigned_to_user_name, assignee.userName);
  assert.equal(listed.assigned_to_user_display, `${assignee.userName} (${assignee.userId})`);

  const detail = await apiRequest(`/api/putaway-tasks/${postgresTaskId}`, {
    role: "superadmin",
  });
  assert.equal(detail.status, 200, JSON.stringify(detail.payload));
  assert.equal(detail.payload.assigned_to_user_id, assignee.userId);
  assert.equal(detail.payload.assigned_to_user_name, assignee.userName);
  assert.equal(detail.payload.assigned_to_user_display, `${assignee.userName} (${assignee.userId})`);
  assert.equal(detail.payload.execution.assigned_to, `${assignee.userName} (${assignee.userId})`);
  assert.equal(detail.payload.putaway_task_id, listed.putaway_task_id);
  assert.equal(detail.payload.grn_id, listed.grn_id);
  assert.equal(detail.payload.sku_id, listed.sku_id);
  assert.equal(detail.payload.sku_name, listed.sku_name);
  assert.equal(detail.payload.sku_description, listed.sku_description);

  const recomputed = await apiRequest(
    `/api/putaway-tasks/${postgresTaskId}/recompute-bin`,
    {
      method: "POST",
      role: "superadmin",
    },
  );
  assert.equal(recomputed.status, 200);
  assert.equal(recomputed.payload.task.putaway_task_id, postgresTaskId);

  const history = await apiRequest(`/api/putaway-tasks/${postgresTaskId}/history`, {
    role: "superadmin",
  });
  assert.equal(history.status, 200);
  assert.equal(
    history.payload.some(
      (event) => event.task_id === postgresTaskId && event.event_type === "assigned",
    ),
    true,
  );
  assert.equal(
    history.payload.some(
      (event) => event.task_id === postgresTaskId && event.event_type === "recompute_bin",
    ),
    true,
  );

  const wrongTenant = await apiRequest(`/api/putaway-tasks/${postgresTaskId}/assign`, {
    method: "POST",
    tenant: "TN000001",
    warehouse: "WH000001",
    role: "superadmin",
    body: { assignedToUserId: assignee.userId },
  });
  assert.equal(wrongTenant.status, 404);

  const wrongWarehouse = await apiRequest(`/api/putaway-tasks/${postgresTaskId}/assign`, {
    method: "POST",
    warehouse: "WH999999",
    role: "superadmin",
    body: { assignedToUserId: assignee.userId },
  });
  assert.equal(wrongWarehouse.status, 404);

  const exception = await apiRequest(
    `/api/putaway-tasks/${postgresTaskId}/mark-exception`,
    {
      method: "POST",
      role: "storemanager",
      user: "USR000001",
      body: { reason: "Damaged packaging found" },
    },
  );
  assert.equal(exception.status, 200);
  assert.equal(exception.payload.task.putaway_task_id, postgresTaskId);
  assert.equal(exception.payload.task.status, "exception");
  assert.equal(exception.payload.task.exception_reason, "Damaged packaging found");
});

test("cross-tenant detail lookup is blocked", async () => {
  const response = await apiRequest("/api/putaway-tasks/PUT000310", {
    tenant: "TNT000001",
    role: "superadmin",
  });

  assert.equal(response.status, 404);
});

test("mark exception requires reason", async () => {
  const response = await apiRequest("/api/putaway-tasks/PUT000211/mark-exception", {
    method: "POST",
    role: "storemanager",
    user: "USR000002",
    body: { reason: "bad" },
  });

  assert.equal(response.status, 400);
});
