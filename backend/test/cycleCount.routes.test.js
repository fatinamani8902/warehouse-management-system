import assert from "node:assert/strict";
import { once } from "node:events";
import test, { after, afterEach, before, beforeEach } from "node:test";
import { db } from "../src/data/store.js";
import { pool } from "../src/db/client.js";
import { createApp } from "../src/server.js";

let server;
let baseUrl;
const createdCountIds = [];
const fixtureSuffix = Date.now().toString().slice(-6);
const activeZoneId = `ZONCC${fixtureSuffix}`;
const wrongWarehouseZoneId = `ZONCW${fixtureSuffix}`;
const fixtureAisleId = `AISCC${fixtureSuffix}`;
const fixtureBayId = `BAYCC${fixtureSuffix}`;
const fixtureLevelId = `LVLCC${fixtureSuffix}`;
const fixtureBinId = `BINCC${fixtureSuffix}`;
const fixtureLocationId = `LOCCC${fixtureSuffix}`;
const fixtureBalanceId = `INVCC${fixtureSuffix}`;

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

before(async () => {
  await pool.query(
    `ALTER TABLE public.cycle_counts
       ADD COLUMN IF NOT EXISTS assigned_to_user_id text,
       ADD COLUMN IF NOT EXISTS assigned_by text,
       ADD COLUMN IF NOT EXISTS assigned_at timestamptz`
  );
  await pool.query(`ALTER TABLE public.cycle_counts DROP CONSTRAINT IF EXISTS cycle_counts_status_check`);
  await pool.query(
    `ALTER TABLE public.cycle_counts
       ADD CONSTRAINT cycle_counts_status_check
       CHECK (status IN (
         'planned',
         'assigned',
         'in_progress',
         'submitted',
         'approved',
         'rejected',
         'reconciled',
         'closed',
         'cancelled'
       ))`
  );
  await pool.query(
    `INSERT INTO public.user_roles (tenant_id, user_id, role_id)
     VALUES ('TNT000001', 'USR000015', 'warehouseoperator')
     ON CONFLICT DO NOTHING`
  );
  await pool.query(
    `INSERT INTO public.user_warehouses (tenant_id, user_id, warehouse_id)
     VALUES ('TNT000001', 'USR000015', 'WH000001')
     ON CONFLICT DO NOTHING`
  );
  await pool.query(
    `INSERT INTO public.warehouse_zones (
       tenant_id, zone_id, warehouse_id, zone_code, zone_name, zone_type, status, created_at, updated_at
     )
     VALUES
       ('TNT000001', $1, 'WH000001', $2, 'Cycle Count Test Zone', 'storage', 'active', now(), now()),
       ('TNT000001', $3, 'WH900001', $4, 'Wrong Warehouse Count Zone', 'storage', 'active', now(), now())`,
    [activeZoneId, `CC${fixtureSuffix}`, wrongWarehouseZoneId, `CW${fixtureSuffix}`]
  );
  await pool.query(
    `INSERT INTO public.warehouse_aisles (
       tenant_id, aisle_id, zone_id, aisle_code, aisle_name, status, created_at, updated_at
     )
     VALUES ('TNT000001', $1, $2, '01', 'Cycle Count Test Aisle', 'active', now(), now())`,
    [fixtureAisleId, activeZoneId]
  );
  await pool.query(
    `INSERT INTO public.warehouse_bays (
       tenant_id, bay_id, aisle_id, bay_code, bay_name,
       width_cm, depth_cm, level_height_cm, level_count, max_weight_kg,
       status, created_at, updated_at
     )
     VALUES ('TNT000001', $1, $2, '001', 'Cycle Count Test Bay',
       200, 50, 50, 1, 500, 'active', now(), now())`,
    [fixtureBayId, fixtureAisleId]
  );
  await pool.query(
    `INSERT INTO public.warehouse_levels (
       tenant_id, level_id, bay_id, level_code, status, created_at, updated_at
     )
     VALUES ('TNT000001', $1, $2, 'L01', 'active', now(), now())`,
    [fixtureLevelId, fixtureBayId]
  );
  await pool.query(
    `INSERT INTO public.warehouse_bins (
       tenant_id, bin_id, level_id, bin_code, max_weight, max_volume, status, created_at, updated_at
     )
     VALUES ('TNT000001', $1, $2, 'B001', 250, 10, 'active', now(), now())`,
    [fixtureBinId, fixtureLevelId]
  );
  await pool.query(
    `INSERT INTO public.locations (
       tenant_id, location_id, warehouse_id, location_code, label,
       location_type, bin_id, is_default_receiving, is_active, created_at, updated_at
     )
     VALUES ('TNT000001', $1, 'WH000001', $2, 'Cycle Count Test Location',
       'storage', $3, false, true, now(), now())`,
    [fixtureLocationId, `CC-${fixtureSuffix}`, fixtureBinId]
  );
  await pool.query(
    `INSERT INTO public.inventory_balances (
       tenant_id, inv_balance_id, warehouse_id, sku_id, location_id,
       lot_no, serial_no, qty_on_hand, qty_reserved, qty_quarantine
     )
     VALUES ('TNT000001', $1, 'WH000001', 'SKU000006', $2, NULL, NULL, 10, 0, 0)`,
    [fixtureBalanceId, fixtureLocationId]
  );

  server = createApp().listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;
});

after(async () => {
  if (createdCountIds.length) {
    await pool.query(
      `DELETE FROM public.inventory_transactions
       WHERE tenant_id = 'TNT000001'
         AND reference_type = 'cycle_count'
         AND reference_id = ANY($1::text[])`,
      [createdCountIds]
    );
    await pool.query(
      `DELETE FROM public.cycle_count_lines
       WHERE tenant_id = 'TNT000001' AND cc_id = ANY($1::text[])`,
      [createdCountIds]
    );
    await pool.query(
      `DELETE FROM public.cycle_counts
       WHERE tenant_id = 'TNT000001' AND cc_id = ANY($1::text[])`,
      [createdCountIds]
    );
  }
  await pool.query(
    `DELETE FROM public.inventory_balances WHERE tenant_id = 'TNT000001' AND inv_balance_id = $1`,
    [fixtureBalanceId]
  );
  await pool.query(
    `DELETE FROM public.locations WHERE tenant_id = 'TNT000001' AND location_id = $1`,
    [fixtureLocationId]
  );
  await pool.query(
    `DELETE FROM public.warehouse_bins WHERE tenant_id = 'TNT000001' AND bin_id = $1`,
    [fixtureBinId]
  );
  await pool.query(
    `DELETE FROM public.warehouse_levels WHERE tenant_id = 'TNT000001' AND level_id = $1`,
    [fixtureLevelId]
  );
  await pool.query(
    `DELETE FROM public.warehouse_bays WHERE tenant_id = 'TNT000001' AND bay_id = $1`,
    [fixtureBayId]
  );
  await pool.query(
    `DELETE FROM public.warehouse_aisles WHERE tenant_id = 'TNT000001' AND aisle_id = $1`,
    [fixtureAisleId]
  );
  await pool.query(
    `DELETE FROM public.warehouse_zones WHERE tenant_id = 'TNT000001' AND zone_id = ANY($1::text[])`,
    [[activeZoneId, wrongWarehouseZoneId]]
  );
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

afterEach(async () => {
  await restoreBalance();
});

beforeEach(async () => {
  await setBalance(10);
});

async function restoreBalance() {
  await setBalance(10);
}

async function setBalance(qty) {
  await pool.query(
    `DELETE FROM public.inventory_balances
     WHERE tenant_id = 'TNT000001'
       AND warehouse_id = 'WH000001'
       AND sku_id = 'SKU000006'
       AND location_id = $1
       AND inv_balance_id <> $2`,
    [fixtureLocationId, fixtureBalanceId]
  );
  await pool.query(
    `INSERT INTO public.inventory_balances (
       tenant_id, inv_balance_id, warehouse_id, sku_id, location_id,
       lot_no, serial_no, qty_on_hand, qty_reserved, qty_quarantine
     )
     VALUES ('TNT000001', $2, 'WH000001', 'SKU000006', $3, NULL, NULL, $1, 0, 0)
     ON CONFLICT (inv_balance_id)
     DO UPDATE SET qty_on_hand = EXCLUDED.qty_on_hand, updated_at = now()`,
    [qty, fixtureBalanceId, fixtureLocationId]
  );
}

async function createSubmittedCount(countedQty, options = {}) {
  const makerUser = options.user || "USR000005";
  const operatorUser = options.operatorUser || options.entryUser || options.submitUser || "USR000015";
  const created = await request("/inventory/count-plans", {
    method: "POST",
    role: options.createRole || "hqadmin",
    user: makerUser,
    body: {
      zone_id: activeZoneId,
      planned_date: "2026-06-15",
      scope_type: "BY_SKU",
      scope_sku_ids: ["SKU000006"],
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.payload));
  createdCountIds.push(created.payload.count_id);

  const line = created.payload.lines.find(
    (item) => item.sku_id === "SKU000006" && item.location_id === fixtureLocationId
  );
  assert.ok(line);
  assert.equal(Number(line.expected_qty), 10);

  const assigned = await request(`/inventory/count-plans/${created.payload.count_id}/assign`, {
    method: "POST",
    role: options.assignRole || "hqadmin",
    user: options.assignUser || makerUser,
    body: { assigned_to_user_id: operatorUser },
  });
  assert.equal(assigned.status, 200, JSON.stringify(assigned.payload));
  assert.equal(assigned.payload.status, "ASSIGNED");
  assert.equal(assigned.payload.assigned_to_user_id, operatorUser);

  if (options.start !== false) {
    const started = await request(`/inventory/count-plans/${created.payload.count_id}/start`, {
      method: "POST",
      role: options.startRole || options.entryRole || "warehouseoperator",
      user: operatorUser,
    });
    assert.equal(started.status, 200, JSON.stringify(started.payload));
    assert.equal(started.payload.status, "COUNTING");
  }

  const entry = await request(`/inventory/count-plans/${created.payload.count_id}/entries`, {
    method: "POST",
    role: options.entryRole || "warehouseoperator",
    user: operatorUser,
    body: {
      line_id: line.line_id,
      scan_mode: "MANUAL",
      qty_counted: countedQty,
    },
  });
  assert.equal(entry.status, 200, JSON.stringify(entry.payload));

  const submitted = await request(`/inventory/count-plans/${created.payload.count_id}/submit`, {
    method: "POST",
    role: options.submitRole || "warehouseoperator",
    user: operatorUser,
  });
  assert.equal(submitted.status, 200, JSON.stringify(submitted.payload));
  assert.equal(submitted.payload.status, "SUBMITTED");
  assert.equal(
    submitted.payload.lines.find((item) => item.line_id === line.line_id).variance_qty,
    countedQty - 10
  );

  return { countId: created.payload.count_id, line };
}

async function approvalState(countId) {
  const result = await pool.query(
    `SELECT
       cc.status,
       cc.approval_reason_code,
       balance.qty_on_hand,
       it.itx_id,
       it.qty AS transaction_qty,
       it.tx_type,
       it.transaction_type,
       it.reference_id
     FROM public.cycle_counts cc
     JOIN public.cycle_count_lines ccl
       ON ccl.tenant_id = cc.tenant_id
      AND ccl.cc_id = cc.cc_id
     JOIN public.inventory_balances balance
       ON balance.tenant_id = ccl.tenant_id
      AND balance.warehouse_id = cc.warehouse_id
      AND balance.sku_id = ccl.sku_id
      AND balance.location_id = ccl.location_id
      AND balance.lot_no IS NULL
      AND balance.serial_no IS NULL
     LEFT JOIN public.inventory_transactions it
       ON it.tenant_id = cc.tenant_id
      AND it.reference_type = 'cycle_count'
      AND it.reference_id = cc.cc_id
      AND it.sku_id = ccl.sku_id
     WHERE cc.tenant_id = 'TNT000001'
       AND cc.cc_id = $1`,
    [countId]
  );
  assert.equal(result.rowCount, 1);
  return result.rows[0];
}

test("PostgreSQL list excludes legacy JSON cycle counts", async () => {
  assert.ok(db.count_plans.some((row) => row.count_id === "CC000017"));

  const response = await request("/inventory/count-plans?page=1&pageSize=100");
  assert.equal(response.status, 200);
  const postgresPlan = response.payload.items.find((row) => row.count_id === "CYC000001");
  assert.ok(postgresPlan);
  assert.equal(postgresPlan.zone_id, "ZON000012");
  assert.equal(postgresPlan.zone_code, "B");
  assert.equal(postgresPlan.zone_name, "Zone B - Pick Face");
  assert.equal(response.payload.items.some((row) => row.count_id === "CC000017"), false);

  const postgresDetail = await request("/inventory/count-plans/CYC000001");
  assert.equal(postgresDetail.status, 200);
  assert.equal(postgresDetail.payload.zone_id, "ZON000012");
  assert.equal(postgresDetail.payload.zone_name, "Zone B - Pick Face");
  assert.equal(postgresDetail.payload.lines.length, 1);
  assert.equal(postgresDetail.payload.lines[0].sku_id, "SKU000006");
  assert.equal(postgresDetail.payload.lines[0].location_id, "LOC000002");
  assert.equal(postgresDetail.payload.lines[0].display_name, "WH000001-B-01-001-L01-B001");
  assert.equal(postgresDetail.payload.lines[0].system_qty, 10);

  const legacyDetail = await request("/inventory/count-plans/CC000017");
  assert.equal(legacyDetail.status, 404);
});

test("superadmin can cancel a draft cycle count plan", async () => {
  const created = await request("/inventory/count-plans", {
    method: "POST",
    role: "superadmin",
    user: "USR000001",
    body: {
      zone_id: activeZoneId,
      planned_date: "2026-06-15",
      scope_type: "BY_SKU",
      scope_sku_ids: ["SKU000006"],
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.payload));
  createdCountIds.push(created.payload.count_id);
  assert.equal(created.payload.status, "DRAFT");

  const cancelled = await request(`/inventory/count-plans/${created.payload.count_id}/cancel`, {
    method: "POST",
    role: "superadmin",
    user: "USR000001",
    body: { reason: "Draft plan no longer needed" },
  });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.payload));
  assert.equal(cancelled.payload.status, "CANCELLED");
  assert.equal(cancelled.payload.cancellation_reason, "Draft plan no longer needed");
});

test("superadmin cannot cancel a submitted cycle count plan", async () => {
  const { countId } = await createSubmittedCount(10, {
    createRole: "hqadmin",
    user: "USR000009",
    submitRole: "storeoperator",
    submitUser: "USR000015",
  });

  const cancelled = await request(`/inventory/count-plans/${countId}/cancel`, {
    method: "POST",
    role: "superadmin",
    user: "USR000001",
    body: { reason: "Submitted plan requires manager review" },
  });
  assert.equal(cancelled.status, 400);
  assert.equal(cancelled.payload.error.code, "CYCLE_COUNT_STATUS_INVALID");
});

test("cycle count creation accepts active zone and rejects inactive or wrong-warehouse zones clearly", async () => {
  const active = await request("/inventory/count-plans", {
    method: "POST",
    role: "hqadmin",
    user: "USR000005",
    body: {
      zone_id: activeZoneId,
      planned_date: "2026-06-15",
      scope_type: "BY_SKU",
      scope_sku_ids: ["SKU000006"],
    },
  });
  assert.equal(active.status, 201, JSON.stringify(active.payload));
  createdCountIds.push(active.payload.count_id);
  assert.equal(active.payload.zone_id, activeZoneId);

  const inactive = await request("/inventory/count-plans", {
    method: "POST",
    role: "hqadmin",
    user: "USR000005",
    body: {
      zone_id: "ZON000012",
      planned_date: "2026-06-15",
      scope_type: "BY_SKU",
      scope_sku_ids: ["SKU000006"],
    },
  });
  assert.equal(inactive.status, 400);
  assert.equal(
    inactive.payload.error.message,
    "Selected zone is inactive and cannot be used for cycle counting."
  );

  const wrongWarehouse = await request("/inventory/count-plans", {
    method: "POST",
    role: "hqadmin",
    user: "USR000005",
    body: {
      zone_id: wrongWarehouseZoneId,
      planned_date: "2026-06-15",
      scope_type: "BY_SKU",
      scope_sku_ids: ["SKU000006"],
    },
  });
  assert.equal(wrongWarehouse.status, 400);
  assert.equal(
    wrongWarehouse.payload.error.message,
    "Selected zone does not belong to the current warehouse."
  );

  const missing = await request("/inventory/count-plans", {
    method: "POST",
    role: "hqadmin",
    user: "USR000005",
    body: {
      zone_id: "ZON-NOT-FOUND",
      planned_date: "2026-06-15",
      scope_type: "BY_SKU",
      scope_sku_ids: ["SKU000006"],
    },
  });
  assert.equal(missing.status, 400);
  assert.equal(missing.payload.error.message, "Selected zone does not exist.");
});

test("cycle count assignment role split is enforced", async () => {
  const created = await request("/inventory/count-plans", {
    method: "POST",
    role: "hqadmin",
    user: "USR000005",
    body: {
      zone_id: activeZoneId,
      planned_date: "2026-06-15",
      scope_type: "BY_SKU",
      scope_sku_ids: ["SKU000006"],
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.payload));
  createdCountIds.push(created.payload.count_id);

  const operatorCreate = await request("/inventory/count-plans", {
    method: "POST",
    role: "warehouseoperator",
    user: "USR000015",
    body: {
      zone_id: activeZoneId,
      planned_date: "2026-06-15",
      scope_type: "BY_SKU",
      scope_sku_ids: ["SKU000006"],
    },
  });
  assert.equal(operatorCreate.status, 403);

  const assigned = await request(`/inventory/count-plans/${created.payload.count_id}/assign`, {
    method: "POST",
    role: "hqadmin",
    user: "USR000005",
    body: { assigned_to_user_id: "USR000015" },
  });
  assert.equal(assigned.status, 200, JSON.stringify(assigned.payload));
  assert.equal(assigned.payload.status, "ASSIGNED");
  assert.equal(assigned.payload.assigned_to_user_id, "USR000015");

  const managerEntry = await request(`/inventory/count-plans/${created.payload.count_id}/entries`, {
    method: "POST",
    role: "warehousemanager",
    user: "USR000001",
    body: {
      line_id: created.payload.lines[0].line_id,
      scan_mode: "MANUAL",
      qty_counted: 10,
    },
  });
  assert.equal(managerEntry.status, 403);

  const started = await request(`/inventory/count-plans/${created.payload.count_id}/start`, {
    method: "POST",
    role: "warehouseoperator",
    user: "USR000015",
  });
  assert.equal(started.status, 200, JSON.stringify(started.payload));
  assert.equal(started.payload.status, "COUNTING");

  const filtered = await request("/inventory/count-plans?status=counting&page=1&pageSize=100", {
    role: "superadmin",
    user: "USR000001",
  });
  assert.equal(filtered.status, 200, JSON.stringify(filtered.payload));
  const row = filtered.payload.items.find((item) => item.count_id === created.payload.count_id);
  assert.ok(row);
  assert.equal(row.status, "COUNTING");
});

test("zero variance approves without reason and creates no adjustment transaction", async () => {
  const { countId } = await createSubmittedCount(10);
  const approved = await request(`/inventory/count-plans/${countId}/approve`, {
    method: "POST",
    role: "manager",
    user: "USR000001",
    body: {},
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.payload));
  assert.equal(approved.payload.status, "APPROVED");
  assert.equal(approved.payload.approval_reason_code, null);

  const state = await approvalState(countId);
  assert.equal(state.status, "approved");
  assert.equal(Number(state.qty_on_hand), 10);
  assert.equal(state.itx_id, null);
});

test("operator submission does not update inventory balance or create adjustment transaction", async () => {
  const { countId } = await createSubmittedCount(12, {
    entryRole: "warehouseoperator",
    entryUser: "USR000015",
    submitRole: "warehouseoperator",
    submitUser: "USR000015",
  });

  const state = await approvalState(countId);
  assert.equal(state.status, "submitted");
  assert.equal(Number(state.qty_on_hand), 10);
  assert.equal(state.itx_id, null);

  const operatorApproval = await request(`/inventory/count-plans/${countId}/approve`, {
    method: "POST",
    role: "warehouseoperator",
    user: "USR000015",
    body: { reason_code: "MISCOUNTED" },
  });
  assert.equal(operatorApproval.status, 403);
});

test("positive variance requires reason, increases balance, and records +2 adjustment", async () => {
  const { countId } = await createSubmittedCount(12);
  const rejected = await request(`/inventory/count-plans/${countId}/approve`, {
    method: "POST",
    role: "manager",
    user: "USR000001",
    body: {},
  });
  assert.equal(rejected.status, 400);
  assert.equal(
    rejected.payload.error.message,
    "Reason Code is required when cycle count contains inventory variance."
  );

  const approved = await request(`/inventory/count-plans/${countId}/approve`, {
    method: "POST",
    role: "manager",
    user: "USR000001",
    body: { reason_code: "MISCOUNTED" },
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.payload));

  const state = await approvalState(countId);
  assert.equal(Number(state.qty_on_hand), 12);
  assert.equal(Number(state.transaction_qty), 2);
  assert.equal(state.tx_type, "ADJUSTMENT");
  assert.equal(state.transaction_type, "adjustment");
  assert.equal(state.reference_id, countId);

  const reapproved = await request(`/inventory/count-plans/${countId}/approve`, {
    method: "POST",
    role: "manager",
    user: "USR000001",
    body: { reason_code: "MISCOUNTED" },
  });
  assert.equal(reapproved.status, 200, JSON.stringify(reapproved.payload));

  const afterReapprove = await approvalState(countId);
  assert.equal(Number(afterReapprove.qty_on_hand), 12);
  const txCount = await pool.query(
    `SELECT count(*)::int AS count
     FROM public.inventory_transactions
     WHERE tenant_id = 'TNT000001'
       AND reference_type = 'cycle_count'
       AND reference_id = $1`,
    [countId]
  );
  assert.equal(txCount.rows[0].count, 1);
});

test("negative variance requires reason, decreases balance, and records -2 adjustment", async () => {
  const { countId } = await createSubmittedCount(8);
  const rejected = await request(`/inventory/count-plans/${countId}/approve`, {
    method: "POST",
    role: "manager",
    user: "USR000001",
    body: {},
  });
  assert.equal(rejected.status, 400);
  assert.equal(
    rejected.payload.error.message,
    "Reason Code is required when cycle count contains inventory variance."
  );

  const approved = await request(`/inventory/count-plans/${countId}/approve`, {
    method: "POST",
    role: "manager",
    user: "USR000001",
    body: { reason_code: "MISCOUNTED" },
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.payload));

  const state = await approvalState(countId);
  assert.equal(Number(state.qty_on_hand), 8);
  assert.equal(Number(state.transaction_qty), -2);
  assert.equal(state.tx_type, "ADJUSTMENT");
  assert.equal(state.transaction_type, "adjustment");
  assert.equal(state.reference_id, countId);
});

test("rejection does not update inventory balance or create adjustment transaction", async () => {
  const { countId } = await createSubmittedCount(12);

  const rejected = await request(`/inventory/count-plans/${countId}/reject`, {
    method: "POST",
    role: "manager",
    user: "USR000001",
    body: { reason: "Variance rejected after review" },
  });
  assert.equal(rejected.status, 200, JSON.stringify(rejected.payload));
  assert.equal(rejected.payload.status, "REJECTED");

  const state = await approvalState(countId);
  assert.equal(state.status, "rejected");
  assert.equal(Number(state.qty_on_hand), 10);
  assert.equal(state.itx_id, null);
});

test("positive variance creates missing inventory balance row during approval", async () => {
  const { countId } = await createSubmittedCount(12);
  await pool.query(
    `DELETE FROM public.inventory_balances
     WHERE tenant_id = 'TNT000001'
       AND inv_balance_id = $1`,
    [fixtureBalanceId]
  );

  const approved = await request(`/inventory/count-plans/${countId}/approve`, {
    method: "POST",
    role: "manager",
    user: "USR000001",
    body: { reason_code: "MISCOUNTED" },
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.payload));

  const state = await approvalState(countId);
  assert.equal(Number(state.qty_on_hand), 2);
  assert.equal(Number(state.transaction_qty), 2);
  assert.equal(state.tx_type, "ADJUSTMENT");
  assert.equal(state.reference_id, countId);
});

test("cycle count RBAC and maker-checker enforce approval boundaries", async () => {
  const superadminCreate = await request("/inventory/count-plans", {
    method: "POST",
    role: "superadmin",
    user: "USR000001",
    body: {
      zone_id: activeZoneId,
      planned_date: "2026-06-15",
      scope_type: "BY_SKU",
      scope_sku_ids: ["SKU000006"],
    },
  });
  assert.equal(superadminCreate.status, 201, JSON.stringify(superadminCreate.payload));
  createdCountIds.push(superadminCreate.payload.count_id);

  const { countId: hqAdminCountId } = await createSubmittedCount(10, {
    createRole: "hqadmin",
    user: "USR000005",
    submitRole: "storeoperator",
    submitUser: "USR000015",
  });
  for (const action of ["approve", "reject"]) {
    const response = await request(`/inventory/count-plans/${hqAdminCountId}/${action}`, {
      method: "POST",
      role: "hqadmin",
      user: "USR000005",
      body: action === "reject" ? { reason: "HQ admin cannot reject" } : {},
    });
    assert.equal(response.status, 403, `hqadmin maker must not ${action} own cycle counts`);
  }
  const managerApprovalForHqAdmin = await request(`/inventory/count-plans/${hqAdminCountId}/approve`, {
    method: "POST",
    role: "manager",
    user: "USR000001",
    body: {},
  });
  assert.equal(managerApprovalForHqAdmin.status, 200, JSON.stringify(managerApprovalForHqAdmin.payload));
  assert.equal(managerApprovalForHqAdmin.payload.status, "APPROVED");
  assert.equal(managerApprovalForHqAdmin.payload.created_by, "USR000005");
  assert.equal(managerApprovalForHqAdmin.payload.created_by_name, "HQ Admin");
  assert.equal(managerApprovalForHqAdmin.payload.created_by_display, "HQ Admin (USR000005)");
  assert.equal(managerApprovalForHqAdmin.payload.submitted_by, "USR000015");
  assert.equal(managerApprovalForHqAdmin.payload.submitted_by_name, "Mike Operator");
  assert.equal(managerApprovalForHqAdmin.payload.submitted_by_display, "Mike Operator (USR000015)");
  assert.equal(managerApprovalForHqAdmin.payload.approved_by, "USR000001");
  assert.equal(managerApprovalForHqAdmin.payload.approved_by_name, "Tenant1 Admin");
  assert.equal(managerApprovalForHqAdmin.payload.approved_by_display, "Tenant1 Admin (USR000001)");

  const { countId: hqReviewerCountId } = await createSubmittedCount(10, {
    createRole: "hqadmin",
    user: "USR000009",
    submitRole: "storeoperator",
    submitUser: "USR000015",
  });
  const hqAdminApproval = await request(`/inventory/count-plans/${hqReviewerCountId}/approve`, {
    method: "POST",
    role: "hqadmin",
    user: "USR000005",
    body: {},
  });
  assert.equal(hqAdminApproval.status, 403, JSON.stringify(hqAdminApproval.payload));

  const { countId: superReviewerCountId } = await createSubmittedCount(10, {
    createRole: "hqadmin",
    user: "USR000009",
    submitRole: "storeoperator",
    submitUser: "USR000015",
  });
  const superAdminApproval = await request(`/inventory/count-plans/${superReviewerCountId}/approve`, {
    method: "POST",
    role: "superadmin",
    user: "USR000001",
    body: {},
  });
  assert.equal(superAdminApproval.status, 200, JSON.stringify(superAdminApproval.payload));
  assert.equal(superAdminApproval.payload.status, "APPROVED");

  const { countId: adminCountId } = await createSubmittedCount(10, {
    createRole: "hqadmin",
    user: "USR000009",
    submitRole: "storeoperator",
    submitUser: "USR000015",
  });
  const adminOwnApproval = await request(`/inventory/count-plans/${adminCountId}/approve`, {
    method: "POST",
    role: "superadmin",
    user: "USR000009",
    body: {},
  });
  assert.equal(adminOwnApproval.status, 403);

  const managerApproval = await request(`/inventory/count-plans/${adminCountId}/approve`, {
    method: "POST",
    role: "manager",
    user: "USR000001",
    body: {},
  });
  assert.equal(managerApproval.status, 200, JSON.stringify(managerApproval.payload));
  assert.equal(managerApproval.payload.status, "APPROVED");

  const { countId: adminRejectedCountId } = await createSubmittedCount(10, {
    createRole: "hqadmin",
    user: "USR000009",
    submitRole: "storeoperator",
    submitUser: "USR000015",
  });
  const managerReject = await request(`/inventory/count-plans/${adminRejectedCountId}/reject`, {
    method: "POST",
    role: "manager",
    user: "USR000001",
    body: { reason: "Manager rejected after review" },
  });
  assert.equal(managerReject.status, 200, JSON.stringify(managerReject.payload));
  assert.equal(managerReject.payload.status, "REJECTED");

  const managerCreate = await request("/inventory/count-plans", {
    method: "POST",
    role: "manager",
    user: "USR000001",
    body: {
      zone_id: activeZoneId,
      planned_date: "2026-06-15",
      scope_type: "BY_SKU",
      scope_sku_ids: ["SKU000006"],
    },
  });
  assert.equal(managerCreate.status, 403);

  const { countId: managerOwnedCountId } = await createSubmittedCount(10, {
    createRole: "hqadmin",
    user: "USR000009",
    submitRole: "storeoperator",
    submitUser: "USR000015",
  });
  await pool.query(
    `UPDATE public.cycle_counts
     SET created_by = 'USR000001', submitted_by = 'USR000001'
     WHERE tenant_id = 'TNT000001' AND cc_id = $1`,
    [managerOwnedCountId]
  );
  const managerOwnApproval = await request(`/inventory/count-plans/${managerOwnedCountId}/approve`, {
    method: "POST",
    role: "manager",
    user: "USR000001",
    body: {},
  });
  assert.equal(managerOwnApproval.status, 403);

  const { countId: roleDeniedCountId } = await createSubmittedCount(10, {
    createRole: "hqadmin",
    user: "USR000009",
    submitRole: "storeoperator",
    submitUser: "USR000015",
  });
  for (const [role, user] of [
    ["admin", "USR000009"],
    ["storeoperator", "USR000015"],
    ["auditor", "USR000014"],
  ]) {
    for (const action of ["approve", "reject"]) {
      const response = await request(`/inventory/count-plans/${roleDeniedCountId}/${action}`, {
        method: "POST",
        role,
        user,
        body: action === "reject" ? { reason: `${role} cannot reject` } : {},
      });
      assert.equal(response.status, 403, `${role} must not ${action} cycle counts`);
    }
  }

  const auditorCreate = await request("/inventory/count-plans", {
    method: "POST",
    role: "auditor",
    user: "USR000014",
    body: {
      zone_id: activeZoneId,
      planned_date: "2026-06-15",
      scope_type: "BY_SKU",
      scope_sku_ids: ["SKU000006"],
    },
  });
  assert.equal(auditorCreate.status, 403);

});

test("Cycle Count list and detail enforce tenant and warehouse isolation", async () => {
  const otherTenant = await request("/inventory/count-plans/CYC000001", {
    tenant: "TNT000002",
    warehouse: "WH000002",
  });
  assert.equal(otherTenant.status, 404);

  const otherWarehouse = await request("/inventory/count-plans/CYC000001", {
    warehouse: "WH000002",
  });
  assert.equal(otherWarehouse.status, 404);
});
