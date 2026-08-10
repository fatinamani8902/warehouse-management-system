import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { once } from "node:events";
import { createApp } from "../src/app.js";
import { pool } from "../src/db/client.js";

let server;
let baseUrl;
let balanceBefore;
const created = {
  orderId: null,
  waveId: null,
  packId: null,
  shipmentId: null,
};
const dateFilterOrderIds = ["SAL990001", "SAL990002"];
const pickingFilterOrderIds = ["SAL990011", "SAL990012", "SAL990013"];
const pickingFilterWaveIds = ["WAV990011", "WAV990012", "WAV990013"];
const packingFilterOrderIds = ["SAL990021", "SAL990022", "SAL990023", "SAL990024"];
const packingFilterPackIds = ["PAC990021", "PAC990022", "PAC990023", "PAC990024"];
const shippingFilterOrderIds = ["SAL990031", "SAL990032", "SAL990033", "SAL990034", "SAL990035"];
const shippingFilterShipmentIds = ["SHI990031", "SHI990032", "SHI990033", "SHI990034", "SHI990035"];

async function request(path, {
  method = "GET",
  body,
  tenant = "TNT000001",
  warehouse = "WH000001",
  user = "USR000005",
  role = "hqadmin",
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": tenant,
      "x-warehouse-id": warehouse,
      "x-user-id": user,
      "x-roles": role,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
}

before(async () => {
  const balance = await pool.query(
    `SELECT inv_balance_id, qty_on_hand, qty_reserved
     FROM public.inventory_balances
     WHERE tenant_id = 'TNT000001'
       AND warehouse_id = 'WH000001'
       AND sku_id = 'SKU000006'
       AND location_id = 'LOC000002'
       AND lot_no IS NULL
       AND serial_no IS NULL`
  );
  assert.equal(balance.rowCount, 1, "Expected outbound stock fixture");
  balanceBefore = balance.rows[0];

  const app = createApp();
  server = app.listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await pool.query(
    "DELETE FROM public.sales_orders WHERE tenant_id = 'TNT000001' AND so_id = ANY($1)",
    [dateFilterOrderIds]
  );
  await pool.query(
    "DELETE FROM public.pick_tasks WHERE tenant_id = 'TNT000001' AND wave_id = ANY($1)",
    [pickingFilterWaveIds]
  );
  await pool.query(
    "DELETE FROM public.pick_waves WHERE tenant_id = 'TNT000001' AND wave_id = ANY($1)",
    [pickingFilterWaveIds]
  );
  await pool.query(
    "DELETE FROM public.sales_order_lines WHERE tenant_id = 'TNT000001' AND so_id = ANY($1)",
    [pickingFilterOrderIds]
  );
  await pool.query(
    "DELETE FROM public.sales_orders WHERE tenant_id = 'TNT000001' AND so_id = ANY($1)",
    [pickingFilterOrderIds]
  );
  await pool.query(
    "DELETE FROM public.packing_tasks WHERE tenant_id = 'TNT000001' AND pack_task_id = ANY($1)",
    [packingFilterPackIds]
  );
  await pool.query(
    "DELETE FROM public.sales_orders WHERE tenant_id = 'TNT000001' AND so_id = ANY($1)",
    [packingFilterOrderIds]
  );
  await pool.query(
    "DELETE FROM public.shipments WHERE tenant_id = 'TNT000001' AND shipment_id = ANY($1)",
    [shippingFilterShipmentIds]
  );
  await pool.query(
    "DELETE FROM public.sales_orders WHERE tenant_id = 'TNT000001' AND so_id = ANY($1)",
    [shippingFilterOrderIds]
  );
  if (created.orderId) {
    await pool.query("BEGIN");
    try {
      if (created.shipmentId) {
        await pool.query(
          `DELETE FROM public.inventory_transactions
           WHERE tenant_id = 'TNT000001'
             AND reference_type = 'shipment'
             AND reference_id = $1`,
          [created.shipmentId]
        );
      }
      await pool.query(
        `UPDATE public.inventory_balances
         SET qty_on_hand = $1, qty_reserved = $2, updated_at = now()
         WHERE inv_balance_id = $3`,
        [balanceBefore.qty_on_hand, balanceBefore.qty_reserved, balanceBefore.inv_balance_id]
      );
      await pool.query(
        "DELETE FROM public.shipments WHERE tenant_id = 'TNT000001' AND so_id = $1",
        [created.orderId]
      );
      await pool.query(
        "DELETE FROM public.packing_tasks WHERE tenant_id = 'TNT000001' AND so_id = $1",
        [created.orderId]
      );
      await pool.query(
        "DELETE FROM public.pick_tasks WHERE tenant_id = 'TNT000001' AND so_id = $1",
        [created.orderId]
      );
      if (created.waveId) {
        await pool.query(
          "DELETE FROM public.pick_waves WHERE tenant_id = 'TNT000001' AND wave_id = $1",
          [created.waveId]
        );
      }
      await pool.query(
        "DELETE FROM public.sales_order_lines WHERE tenant_id = 'TNT000001' AND so_id = $1",
        [created.orderId]
      );
      await pool.query(
        "DELETE FROM public.sales_orders WHERE tenant_id = 'TNT000001' AND so_id = $1",
        [created.orderId]
      );
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  }
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test("auditor cannot create an outbound order", async () => {
  const response = await request("/api/v1/outbound/orders", {
    method: "POST",
    role: "auditor",
    user: "USR000001",
    body: { customer_id: "CUS000001", customer_name: "seed_customer_name" },
  });
  assert.equal(response.status, 403);
});

test("outbound order list filters by created_at date range", async () => {
  await pool.query(
    "DELETE FROM public.sales_orders WHERE tenant_id = 'TNT000001' AND so_id = ANY($1)",
    [dateFilterOrderIds]
  );
  await pool.query(
    `INSERT INTO public.sales_orders (
       tenant_id, so_id, warehouse_id, customer_id, order_date, ship_by_date,
       status, notes, created_at, created_by, updated_at
     ) VALUES
       ('TNT000001', 'SAL990001', 'WH000001', 'CUS000001', '2026-06-25', NULL,
        'draft', 'date filter start boundary', '2026-06-25T00:00:00.000Z', 'USR000005', '2026-06-25T00:00:00.000Z'),
       ('TNT000001', 'SAL990002', 'WH000001', 'CUS000001', '2026-06-26', NULL,
        'released', 'date filter end boundary', '2026-06-26T23:59:59.999Z', 'USR000005', '2026-06-26T23:59:59.999Z')`
  );

  const both = await request("/api/v1/outbound/orders?dateFrom=2026-06-25&dateTo=2026-06-26&pageSize=100");
  assert.equal(both.status, 200, JSON.stringify(both.payload));
  const bothIds = both.payload.data.map((row) => row.order_id);
  assert.equal(bothIds.includes("SAL990001"), true);
  assert.equal(bothIds.includes("SAL990002"), true);

  const fromOnly = await request("/api/v1/outbound/orders?dateFrom=2026-06-26&pageSize=100");
  assert.equal(fromOnly.status, 200, JSON.stringify(fromOnly.payload));
  const fromIds = fromOnly.payload.data.map((row) => row.order_id);
  assert.equal(fromIds.includes("SAL990001"), false);
  assert.equal(fromIds.includes("SAL990002"), true);

  const toOnly = await request("/api/v1/outbound/orders?dateTo=2026-06-25&pageSize=100");
  assert.equal(toOnly.status, 200, JSON.stringify(toOnly.payload));
  const toIds = toOnly.payload.data.map((row) => row.order_id);
  assert.equal(toIds.includes("SAL990001"), true);
  assert.equal(toIds.includes("SAL990002"), false);

  const combined = await request("/api/v1/outbound/orders?dateFrom=2026-06-25&dateTo=2026-06-26&status=released&search=SAL990002&pageSize=100");
  assert.equal(combined.status, 200, JSON.stringify(combined.payload));
  assert.deepEqual(combined.payload.data.map((row) => row.order_id), ["SAL990002"]);
});

test("outbound order list rejects invalid created date filters", async () => {
  const response = await request("/api/v1/outbound/orders?dateFrom=not-a-date");
  assert.equal(response.status, 400);
  assert.equal(response.payload.error.code, "VALIDATION_ERROR");
  assert.match(response.payload.error.message, /dateFrom/);
});

test("picking list filters by created_at, picked alias, and assigned operator", async () => {
  await pool.query("BEGIN");
  try {
    await pool.query(
      "DELETE FROM public.pick_tasks WHERE tenant_id = 'TNT000001' AND wave_id = ANY($1)",
      [pickingFilterWaveIds]
    );
    await pool.query(
      "DELETE FROM public.pick_waves WHERE tenant_id = 'TNT000001' AND wave_id = ANY($1)",
      [pickingFilterWaveIds]
    );
    await pool.query(
      "DELETE FROM public.sales_order_lines WHERE tenant_id = 'TNT000001' AND so_id = ANY($1)",
      [pickingFilterOrderIds]
    );
    await pool.query(
      "DELETE FROM public.sales_orders WHERE tenant_id = 'TNT000001' AND so_id = ANY($1)",
      [pickingFilterOrderIds]
    );
    await pool.query(
      `INSERT INTO public.sales_orders (
         tenant_id, so_id, warehouse_id, customer_id, order_date, ship_by_date,
         status, notes, created_at, created_by, updated_at
       ) VALUES
         ('TNT000001', 'SAL990011', 'WH000001', 'CUS000001', '2026-06-23', NULL, 'picking', NULL, '2026-06-23T08:00:00.000Z', 'USR000005', '2026-06-23T08:00:00.000Z'),
         ('TNT000001', 'SAL990012', 'WH000001', 'CUS000001', '2026-06-24', NULL, 'picking', NULL, '2026-06-24T08:00:00.000Z', 'USR000005', '2026-06-24T08:00:00.000Z'),
         ('TNT000001', 'SAL990013', 'WH000001', 'CUS000001', '2026-06-25', NULL, 'allocated', NULL, '2026-06-25T08:00:00.000Z', 'USR000005', '2026-06-25T08:00:00.000Z')`
    );
    await pool.query(
      `INSERT INTO public.sales_order_lines (
         tenant_id, so_line_id, so_id, line_no, sku_id, ordered_qty, allocated_qty, shipped_qty, uom
       ) VALUES
         ('TNT000001', 'SOL990011', 'SAL990011', 1, 'SKU000006', 1, 1, 0, 'EA'),
         ('TNT000001', 'SOL990012', 'SAL990012', 1, 'SKU000006', 1, 1, 0, 'EA'),
         ('TNT000001', 'SOL990013', 'SAL990013', 1, 'SKU000006', 1, 1, 0, 'EA')`
    );
    await pool.query(
      `INSERT INTO public.pick_waves (
         tenant_id, wave_id, warehouse_id, status, created_at, created_by
       ) VALUES
         ('TNT000001', 'WAV990011', 'WH000001', 'completed', '2026-06-24T00:00:00.000Z', 'USR000005'),
         ('TNT000001', 'WAV990012', 'WH000001', 'completed', '2026-06-24T23:59:59.999Z', 'USR000005'),
         ('TNT000001', 'WAV990013', 'WH000001', 'released', '2026-06-25T12:00:00.000Z', 'USR000005')`
    );
    await pool.query(
      `INSERT INTO public.pick_tasks (
         tenant_id, pick_task_id, warehouse_id, wave_id, so_id, so_line_id, sku_id,
         from_location_id, qty, picked_qty, status, assigned_to_user_id, picked_by,
         started_at, completed_at, created_at, updated_at
       ) VALUES
         ('TNT000001', 'PIC990011', 'WH000001', 'WAV990011', 'SAL990011', 'SOL990011', 'SKU000006',
          'LOC000002', 1, 1, 'done', 'USR000015', 'USR000015',
          '2026-06-24T00:05:00.000Z', '2026-06-24T00:10:00.000Z', '2026-06-24T00:00:00.000Z', '2026-06-24T00:10:00.000Z'),
         ('TNT000001', 'PIC990012', 'WH000001', 'WAV990012', 'SAL990012', 'SOL990012', 'SKU000006',
          'LOC000002', 1, 1, 'completed', 'USR000016', 'USR000016',
          '2026-06-24T23:50:00.000Z', '2026-06-24T23:59:59.999Z', '2026-06-24T23:50:00.000Z', '2026-06-24T23:59:59.999Z'),
         ('TNT000001', 'PIC990013', 'WH000001', 'WAV990013', 'SAL990013', 'SOL990013', 'SKU000006',
          'LOC000002', 1, 0, 'assigned', 'USR000015', NULL,
          NULL, NULL, '2026-06-25T12:00:00.000Z', '2026-06-25T12:00:00.000Z')`
    );
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }

  const picked = await request("/api/v1/picking/pick-lists?dateFrom=2026-06-24&dateTo=2026-06-24&status=picked&pageSize=100", {
    role: "manager",
    user: "USR000002",
  });
  assert.equal(picked.status, 200, JSON.stringify(picked.payload));
  const pickedIds = picked.payload.data.map((item) => item.wave_id);
  assert.equal(pickedIds.includes("WAV990011"), true);
  assert.equal(pickedIds.includes("WAV990012"), true);
  assert.equal(pickedIds.includes("WAV990013"), false);

  const operatorA = await request("/api/v1/picking/pick-lists?dateFrom=2026-06-24&dateTo=2026-06-25&pageSize=100", {
    role: "warehouseoperator",
    user: "USR000015",
  });
  assert.equal(operatorA.status, 200, JSON.stringify(operatorA.payload));
  const operatorAIds = operatorA.payload.data.map((item) => item.wave_id);
  assert.equal(operatorAIds.includes("WAV990011"), true);
  assert.equal(operatorAIds.includes("WAV990013"), true);
  assert.equal(operatorAIds.includes("WAV990012"), false);

  const manager = await request("/api/v1/picking/pick-lists?dateFrom=2026-06-24&dateTo=2026-06-25&pageSize=100", {
    role: "manager",
    user: "USR000002",
  });
  assert.equal(manager.status, 200, JSON.stringify(manager.payload));
  const managerIds = manager.payload.data.map((item) => item.wave_id);
  assert.equal(managerIds.includes("WAV990011"), true);
  assert.equal(managerIds.includes("WAV990012"), true);
  assert.equal(managerIds.includes("WAV990013"), true);

  const invalid = await request("/api/v1/picking/pick-lists?dateTo=bad-date", {
    role: "manager",
    user: "USR000002",
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.payload.error.code, "VALIDATION_ERROR");
  assert.match(invalid.payload.error.message, /dateTo/);
});

test("PostgreSQL outbound flow reserves, picks, packs, ships, and posts once", async () => {
  const login = await request("/api/v1/auth/login", {
    method: "POST",
    body: {
      email: "mike@acme.com",
      password: "demo1234",
    },
  });
  assert.equal(login.status, 200, JSON.stringify(login.payload));
  assert.equal(login.payload.user.user_id, "USR000015");
  assert.equal(login.payload.user.role_id, "warehouseoperator");
  assert.equal(login.payload.user.warehouse_ids.includes("WH000001"), true);

  const operators = await request("/api/v1/picking/operators", {
    role: "manager",
    user: "USR000002",
  });
  assert.equal(operators.status, 200, JSON.stringify(operators.payload));
  assert.equal(
    operators.payload.data.some((operator) =>
      operator.user_id === login.payload.user.user_id
      && operator.user_name === "Mike Operator"
    ),
    true,
  );

  const create = await request("/api/v1/outbound/orders", {
    method: "POST",
    body: {
      customer_id: "CUS000001",
      customer_name: "seed_customer_name",
      notes: "Outbound ORM route test",
    },
  });
  assert.equal(create.status, 201, JSON.stringify(create.payload));
  created.orderId = create.payload.data.order_id;
  assert.match(created.orderId, /^SAL\d{6}$/);

  const addLine = await request(`/api/v1/outbound/orders/${created.orderId}/lines`, {
    method: "POST",
    body: { sku_id: "SKU000006", ordered_qty: 5 },
  });
  assert.equal(addLine.status, 200, JSON.stringify(addLine.payload));
  assert.equal(addLine.payload.data.lines.length, 1);

  const release = await request(`/api/v1/outbound/orders/${created.orderId}/release`, {
    method: "POST",
    role: "manager",
    user: "USR000002",
  });
  assert.equal(release.status, 200, JSON.stringify(release.payload));
  created.waveId = release.payload.data.pickList.pick_list_id;
  assert.match(created.waveId, /^WAV\d{6}$/);
  assert.ok(release.payload.data.pickList.lines.length > 0);
  const afterReleaseOrder = await pool.query(
    `SELECT status
     FROM public.sales_orders
     WHERE so_id = $1`,
    [created.orderId]
  );
  assert.equal(afterReleaseOrder.rows[0].status, "allocated");

  const pickListResponse = await request("/api/v1/picking/pick-lists?page=1&pageSize=50", {
    role: "manager",
    user: "USR000002",
  });
  assert.equal(pickListResponse.status, 200, JSON.stringify(pickListResponse.payload));
  const listedWave = pickListResponse.payload.data.find((item) => item.wave_id === created.waveId);
  assert.ok(listedWave);
  assert.equal(listedWave.pick_list_id, created.waveId);
  assert.equal(listedWave.order_ref, created.orderId);
  assert.equal(listedWave.so_id, created.orderId);
  assert.equal(listedWave.lines.length > 0, true);
  assert.equal(
    pickListResponse.payload.data.some((item) => item.wave_id === "PIC000001"),
    false,
  );

  const pickDetailResponse = await request(`/api/v1/picking/pick-lists/${created.waveId}`, {
    role: "manager",
    user: "USR000002",
  });
  assert.equal(pickDetailResponse.status, 200, JSON.stringify(pickDetailResponse.payload));
  assert.equal(pickDetailResponse.payload.data.wave_id, created.waveId);
  assert.equal(pickDetailResponse.payload.data.order_ref, created.orderId);
  assert.equal(pickDetailResponse.payload.data.lines[0].pick_task_id.startsWith("PIC"), true);
  assert.equal(pickDetailResponse.payload.data.lines[0].sku_id, "SKU000006");
  assert.equal(pickDetailResponse.payload.data.lines[0].sku_name, "Test Bearing");
  assert.equal(pickDetailResponse.payload.data.lines[0].product_name, "Test Bearing");
  assert.equal(pickDetailResponse.payload.data.lines[0].location_id, "LOC000002");
  assert.equal(Number(pickDetailResponse.payload.data.lines[0].qty_required), 5);
  assert.equal(Number(pickDetailResponse.payload.data.lines[0].qty_picked), 0);

  const reserved = await pool.query(
    `SELECT qty_reserved
     FROM public.inventory_balances
     WHERE inv_balance_id = $1`,
    [balanceBefore.inv_balance_id]
  );
  assert.equal(Number(reserved.rows[0].qty_reserved), Number(balanceBefore.qty_reserved) + 5);

  const assign = await request(`/api/v1/picking/pick-lists/${created.waveId}/assign`, {
    method: "POST",
    role: "manager",
    user: "USR000002",
    body: { assignedToUserId: login.payload.user.user_id },
  });
  assert.equal(assign.status, 200, JSON.stringify(assign.payload));

  const mobileAssigned = await request(
    `/api/v1/picking/pick-lists?page=1&pageSize=50&assigned_user=${login.payload.user.user_id}`,
    {
      role: login.payload.user.role_id,
      user: login.payload.user.user_id,
    }
  );
  assert.equal(mobileAssigned.status, 200, JSON.stringify(mobileAssigned.payload));
  const mobileWave = mobileAssigned.payload.data.find((item) => item.wave_id === created.waveId);
  assert.ok(mobileWave, "Assigned PostgreSQL wave must be visible to its mobile operator");
  assert.equal(mobileWave.pick_list_id, created.waveId);
  assert.equal(mobileWave.order_ref, created.orderId);
  assert.equal(mobileWave.assigned_to_user_id, login.payload.user.user_id);
  assert.equal(mobileWave.assigned_to_user_name, "Mike Operator");
  assert.equal(mobileWave.assigned_to_user_display, "Mike Operator (USR000015)");
  assert.equal(mobileWave.assigned_user_display, "Mike Operator (USR000015)");
  assert.equal(mobileWave.lines[0].pick_task_id.startsWith("PIC"), true);
  assert.equal(mobileWave.lines[0].sku_id, "SKU000006");
  assert.equal(mobileWave.lines[0].sku_name, "Test Bearing");
  assert.equal(mobileWave.lines[0].location_id, "LOC000002");
  assert.equal(Number(mobileWave.lines[0].qty_required), 5);
  assert.equal(Number(mobileWave.lines[0].qty_picked), 0);

  const operatorBPickingList = await request("/api/v1/picking/pick-lists?page=1&pageSize=50", {
    role: "warehouseoperator",
    user: "USR000016",
  });
  assert.equal(operatorBPickingList.status, 200, JSON.stringify(operatorBPickingList.payload));
  assert.equal(
    operatorBPickingList.payload.data.some((item) => item.wave_id === created.waveId),
    false,
    "Operator B must not see Operator A's assigned pick wave",
  );

  const operatorBPickingDetail = await request(`/api/v1/picking/pick-lists/${created.waveId}`, {
    role: "warehouseoperator",
    user: "USR000016",
  });
  assert.equal(operatorBPickingDetail.status, 404);

  for (const line of assign.payload.data.lines) {
    const picked = await request(
      `/api/v1/picking/pick-lists/${created.waveId}/lines/${line.line_id}/manual-pick`,
      {
        method: "POST",
        role: "warehouseoperator",
        user: "USR000015",
        body: { qty_picked: line.qty_required },
      }
    );
    assert.equal(picked.status, 200, JSON.stringify(picked.payload));
  }

  const complete = await request(`/api/v1/picking/pick-lists/${created.waveId}/complete`, {
    method: "POST",
    role: "warehouseoperator",
    user: "USR000015",
  });
  assert.equal(complete.status, 200, JSON.stringify(complete.payload));
  created.packId = complete.payload.data.packing_task.pack_id;
  assert.match(created.packId, /^PAC\d{6}$/);
  assert.equal(complete.payload.data.packing_task.so_id, created.orderId);
  assert.equal(complete.payload.data.packing_task.order_ref, created.orderId);
  assert.equal(complete.payload.data.packing_task.wave_id, created.waveId);
  assert.equal(complete.payload.data.packing_task.customer_id, "CUS000001");
  assert.ok(complete.payload.data.packing_task.customer_name);
  const packingAfterPick = await pool.query(
    `SELECT pack_task_id, so_id, wave_id, tenant_id, warehouse_id, status, packed_by, packed_at
     FROM public.packing_tasks
     WHERE pack_task_id = $1`,
    [created.packId]
  );
  assert.equal(packingAfterPick.rowCount, 1);
  assert.equal(packingAfterPick.rows[0].so_id, created.orderId);
  assert.equal(packingAfterPick.rows[0].wave_id, created.waveId);
  assert.equal(packingAfterPick.rows[0].tenant_id, "TNT000001");
  assert.equal(packingAfterPick.rows[0].warehouse_id, "WH000001");
  assert.equal(packingAfterPick.rows[0].status, "pending");
  assert.equal(packingAfterPick.rows[0].packed_by, null);
  assert.equal(packingAfterPick.rows[0].packed_at, null);
  const waveAfterComplete = await pool.query(
    `SELECT status
     FROM public.pick_waves
     WHERE wave_id = $1`,
    [created.waveId]
  );
  assert.equal(waveAfterComplete.rows[0].status, "completed");

  const afterPickOrder = await request(`/api/v1/outbound/orders/${created.orderId}`, {
    role: "manager",
    user: "USR000002",
  });
  assert.equal(afterPickOrder.status, 200, JSON.stringify(afterPickOrder.payload));
  assert.equal(afterPickOrder.payload.data.status, "picking");
  assert.equal(Number(afterPickOrder.payload.data.lines[0].picked_qty), 5);
  const afterPickOrderDb = await pool.query(
    `SELECT status
     FROM public.sales_orders
     WHERE so_id = $1`,
    [created.orderId]
  );
  assert.equal(afterPickOrderDb.rows[0].status, "picking");

  const operatorAPackingList = await request("/api/v1/packing/orders?page=1&pageSize=50", {
    role: "warehouseoperator",
    user: "USR000015",
  });
  assert.equal(operatorAPackingList.status, 200, JSON.stringify(operatorAPackingList.payload));
  assert.equal(
    operatorAPackingList.payload.data.some((item) => item.pack_id === created.packId),
    true,
    "Operator A must see packing task derived from their pick wave",
  );

  const managerPackingList = await request("/api/v1/packing/orders?page=1&pageSize=50", {
    role: "manager",
    user: "USR000002",
  });
  assert.equal(managerPackingList.status, 200, JSON.stringify(managerPackingList.payload));
  assert.equal(
    managerPackingList.payload.data.some((item) => item.pack_id === created.packId),
    true,
    "Manager must see warehouse packing tasks",
  );

  const operatorBPackingList = await request("/api/v1/packing/orders?page=1&pageSize=50", {
    role: "warehouseoperator",
    user: "USR000016",
  });
  assert.equal(operatorBPackingList.status, 200, JSON.stringify(operatorBPackingList.payload));
  assert.equal(
    operatorBPackingList.payload.data.some((item) => item.pack_id === created.packId),
    false,
    "Operator B must not see packing task derived from Operator A's pick wave",
  );

  const operatorBPackingDetail = await request(`/api/v1/packing/orders/${created.packId}`, {
    role: "warehouseoperator",
    user: "USR000016",
  });
  assert.equal(operatorBPackingDetail.status, 404);

  const managerPackingDetail = await request(`/api/v1/packing/orders/${created.packId}`, {
    role: "manager",
    user: "USR000002",
  });
  assert.equal(managerPackingDetail.status, 200, JSON.stringify(managerPackingDetail.payload));
  assert.equal(managerPackingDetail.payload.data.pack_id, created.packId);

  const managerPackAttempt = await request(`/api/v1/packing/orders/${created.packId}/confirm-pack`, {
    method: "POST",
    role: "manager",
    user: "USR000002",
    body: { weight_kg: 2.5, packaging_type: "standard_box" },
  });
  assert.equal(managerPackAttempt.status, 403, JSON.stringify(managerPackAttempt.payload));
  assert.equal(managerPackAttempt.payload.error?.code, "PACKING_NOT_ASSIGNED_TO_USER");

  const pack = await request(`/api/v1/packing/orders/${created.packId}/confirm-pack`, {
    method: "POST",
    role: "warehouseoperator",
    user: "USR000015",
    body: { weight_kg: 2.5, packaging_type: "standard_box" },
  });
  assert.equal(pack.status, 200, JSON.stringify(pack.payload));
  created.shipmentId = pack.payload.shipment.shipment_id;
  assert.match(created.shipmentId, /^SHI\d{6}$/);
  assert.equal(pack.payload.data.pack_id, created.packId);
  assert.equal(pack.payload.data.so_id, created.orderId);
  assert.equal(pack.payload.data.order_ref, created.orderId);
  assert.equal(pack.payload.data.customer_id, "CUS000001");
  assert.ok(pack.payload.data.customer_name);
  assert.equal(pack.payload.data.wave_id, created.waveId);
  assert.equal(pack.payload.data.status, "packed");
  assert.match(pack.payload.data.carton_id, /^CTN\d{6}$/);
  assert.equal(pack.payload.data.packed_by_user_id, "USR000015");
  assert.ok(pack.payload.data.packed_by_user_display);

  const packingAfterConfirm = await pool.query(
    `SELECT status, carton_id, packed_by, packed_at, weight_kg, packaging_type
     FROM public.packing_tasks
     WHERE pack_task_id = $1`,
    [created.packId]
  );
  assert.equal(packingAfterConfirm.rowCount, 1);
  assert.equal(packingAfterConfirm.rows[0].status, "packed");
  assert.equal(pack.payload.data.carton_id, packingAfterConfirm.rows[0].carton_id);
  assert.equal(packingAfterConfirm.rows[0].packed_by, "USR000015");
  assert.ok(packingAfterConfirm.rows[0].packed_at);
  assert.equal(Number(packingAfterConfirm.rows[0].weight_kg), 2.5);
  assert.equal(packingAfterConfirm.rows[0].packaging_type, "standard_box");

  await pool.query(
    "DELETE FROM public.packing_tasks WHERE tenant_id = 'TNT000001' AND pack_task_id = ANY($1)",
    [packingFilterPackIds]
  );
  await pool.query(
    "DELETE FROM public.sales_orders WHERE tenant_id = 'TNT000001' AND so_id = ANY($1)",
    [packingFilterOrderIds]
  );
  await pool.query(
    `INSERT INTO public.sales_orders (
       tenant_id, so_id, warehouse_id, customer_id, order_date, ship_by_date,
       status, notes, created_at, created_by, updated_at
     ) VALUES
       ('TNT000001', 'SAL990021', 'WH000001', 'CUS000001', '2026-06-25', NULL,
        'draft', 'packing filter start boundary', '2026-06-25T00:00:00.000Z', 'USR000005', '2026-06-25T00:00:00.000Z'),
       ('TNT000001', 'SAL990022', 'WH000001', 'CUS000001', '2026-06-26', NULL,
        'in_progress', 'packing filter middle boundary', '2026-06-26T12:00:00.000Z', 'USR000005', '2026-06-26T12:00:00.000Z'),
       ('TNT000001', 'SAL990023', 'WH000001', 'CUS000001', '2026-06-26', NULL,
        'packed', 'packing filter end boundary', '2026-06-26T23:59:59.999Z', 'USR000005', '2026-06-26T23:59:59.999Z'),
       ('TNT000001', 'SAL990024', 'WH000001', 'CUS000001', '2026-06-27', NULL,
        'cancelled', 'packing filter cancelled', '2026-06-27T10:00:00.000Z', 'USR000005', '2026-06-27T10:00:00.000Z')`
  );
  await pool.query(
    `INSERT INTO public.packing_tasks (
       tenant_id, pack_task_id, warehouse_id, so_id, wave_id, status, created_at, created_by, updated_at, notes
     ) VALUES
       ('TNT000001', 'PAC990021', 'WH000001', 'SAL990021', 'WAV990021', 'draft', '2026-06-25T00:00:00.000Z', 'USR000005', '2026-06-25T00:00:00.000Z', 'packing filter start boundary'),
       ('TNT000001', 'PAC990022', 'WH000001', 'SAL990022', 'WAV990022', 'in_progress', '2026-06-26T12:00:00.000Z', 'USR000005', '2026-06-26T12:00:00.000Z', 'packing filter middle boundary'),
       ('TNT000001', 'PAC990023', 'WH000001', 'SAL990023', 'WAV990023', 'packed', '2026-06-26T23:59:59.999Z', 'USR000005', '2026-06-26T23:59:59.999Z', 'packing filter end boundary'),
       ('TNT000001', 'PAC990024', 'WH000001', 'SAL990024', 'WAV990024', 'cancelled', '2026-06-27T10:00:00.000Z', 'USR000005', '2026-06-27T10:00:00.000Z', 'packing filter cancelled')`
  );

  const packingBoth = await request("/api/v1/packing/orders?dateFrom=2026-06-25&dateTo=2026-06-26&pageSize=100", {
    role: "manager",
    user: "USR000002",
  });
  assert.equal(packingBoth.status, 200, JSON.stringify(packingBoth.payload));
  const packingBothIds = packingBoth.payload.data.map((row) => row.pack_id);
  assert.equal(packingBothIds.includes("PAC990021"), true);
  assert.equal(packingBothIds.includes("PAC990022"), true);

  const packingFromOnly = await request("/api/v1/packing/orders?dateFrom=2026-06-26&pageSize=100", {
    role: "manager",
    user: "USR000002",
  });
  assert.equal(packingFromOnly.status, 200, JSON.stringify(packingFromOnly.payload));
  const packingFromIds = packingFromOnly.payload.data.map((row) => row.pack_id);
  assert.equal(packingFromIds.includes("PAC990021"), false);
  assert.equal(packingFromIds.includes("PAC990022"), true);
  assert.equal(packingFromIds.includes("PAC990023"), true);

  const packingInProgress = await request("/api/v1/packing/orders?status=in_progress&pageSize=100", {
    role: "manager",
    user: "USR000002",
  });
  assert.equal(packingInProgress.status, 200, JSON.stringify(packingInProgress.payload));
  const packingInProgressIds = packingInProgress.payload.data.map((row) => row.pack_id);
  assert.equal(packingInProgressIds.includes("PAC990022"), true);
  assert.equal(packingInProgressIds.includes("PAC990021"), false);
  assert.equal(packingInProgressIds.includes("PAC990023"), false);
  assert.equal(packingInProgressIds.includes("PAC990024"), false);

  const packingToOnly = await request("/api/v1/packing/orders?dateTo=2026-06-25&pageSize=100", {
    role: "manager",
    user: "USR000002",
  });
  assert.equal(packingToOnly.status, 200, JSON.stringify(packingToOnly.payload));
  const packingToIds = packingToOnly.payload.data.map((row) => row.pack_id);
  assert.equal(packingToIds.includes("PAC990021"), true);
  assert.equal(packingToIds.includes("PAC990022"), false);
  assert.equal(packingToIds.includes("PAC990023"), false);
  assert.equal(packingToIds.includes("PAC990024"), false);

  const packingCombined = await request("/api/v1/packing/orders?dateFrom=2026-06-25&dateTo=2026-06-26&status=packed&search=PAC990023&pageSize=100", {
    role: "manager",
    user: "USR000002",
  });
  assert.equal(packingCombined.status, 200, JSON.stringify(packingCombined.payload));
  assert.deepEqual(packingCombined.payload.data.map((row) => row.pack_id), ["PAC990023"]);

  const packingCancelled = await request("/api/v1/packing/orders?status=cancelled&pageSize=100", {
    role: "manager",
    user: "USR000002",
  });
  assert.equal(packingCancelled.status, 200, JSON.stringify(packingCancelled.payload));
  assert.deepEqual(packingCancelled.payload.data.map((row) => row.pack_id), ["PAC990024"]);

  const packingInvalid = await request("/api/v1/packing/orders?dateFrom=bad-date", {
    role: "manager",
    user: "USR000002",
  });
  assert.equal(packingInvalid.status, 400);
  assert.equal(packingInvalid.payload.error.code, "VALIDATION_ERROR");
  assert.match(packingInvalid.payload.error.message, /dateFrom/);

  const orderAfterPack = await pool.query(
    `SELECT status
     FROM public.sales_orders
     WHERE so_id = $1`,
    [created.orderId]
  );
  assert.equal(orderAfterPack.rows[0].status, "packed");

  const noShipTxAfterPack = await pool.query(
    `SELECT count(*)::int AS count
     FROM public.inventory_transactions
     WHERE tenant_id = 'TNT000001'
       AND warehouse_id = 'WH000001'
       AND reference_type = 'shipment'
       AND reference_id = $1`,
    [created.shipmentId]
  );
  assert.equal(noShipTxAfterPack.rows[0].count, 0);

  const dispatch = await request(`/api/v1/shipping/${created.shipmentId}/dispatch`, {
    method: "POST",
    role: "manager",
    user: "USR000002",
    body: { carrier: "DHL", tracking_no: `TEST-${created.shipmentId}` },
  });
  assert.equal(dispatch.status, 200, JSON.stringify(dispatch.payload));
  assert.equal(dispatch.payload.data.status, "dispatched");
  assert.equal(dispatch.payload.idempotent, false);

  const afterDispatch = await pool.query(
    `SELECT qty_on_hand, qty_reserved
     FROM public.inventory_balances
     WHERE inv_balance_id = $1`,
    [balanceBefore.inv_balance_id]
  );
  assert.equal(Number(afterDispatch.rows[0].qty_on_hand), Number(balanceBefore.qty_on_hand) - 5);
  assert.equal(Number(afterDispatch.rows[0].qty_reserved), Number(balanceBefore.qty_reserved));

  const ledger = await pool.query(
    `SELECT tx_type, transaction_type, qty, reference_id
     FROM public.inventory_transactions
     WHERE tenant_id = 'TNT000001'
       AND reference_type = 'shipment'
       AND reference_id = $1`,
    [created.shipmentId]
  );
  assert.equal(ledger.rowCount, 1);
  assert.equal(ledger.rows[0].tx_type, "SHIP");
  assert.equal(ledger.rows[0].transaction_type, "issue");
  assert.equal(Number(ledger.rows[0].qty), 5);

  const secondDispatch = await request(`/api/v1/shipping/${created.shipmentId}/dispatch`, {
    method: "POST",
    role: "manager",
    user: "USR000002",
    body: { carrier: "DHL", tracking_no: `TEST-${created.shipmentId}` },
  });
  assert.equal(secondDispatch.status, 200, JSON.stringify(secondDispatch.payload));
  assert.equal(secondDispatch.payload.idempotent, true);

  const ledgerAfterRetry = await pool.query(
    `SELECT count(*)::int AS count
     FROM public.inventory_transactions
     WHERE tenant_id = 'TNT000001'
       AND reference_type = 'shipment'
       AND reference_id = $1`,
    [created.shipmentId]
  );
  assert.equal(ledgerAfterRetry.rows[0].count, 1);

  const operatorDispatch = await request(`/api/v1/shipping/${created.shipmentId}/dispatch`, {
    method: "POST",
    role: "warehouseoperator",
    user: "USR000015",
    body: { carrier: "DHL", tracking_no: `TEST-${created.shipmentId}` },
  });
  assert.equal(operatorDispatch.status, 403);

  const compatibilityDispatch = await request("/api/v1/outbound/shipping/confirm", {
    method: "POST",
    role: "manager",
    user: "USR000002",
    body: { shipmentId: created.shipmentId, carrier: "DHL", trackingNo: `TEST-${created.shipmentId}` },
  });
  assert.equal(compatibilityDispatch.status, 200, JSON.stringify(compatibilityDispatch.payload));
  assert.equal(compatibilityDispatch.payload.data.idempotent, true);
  assert.equal(compatibilityDispatch.payload.data.shipment.status, "dispatched");

  const hqCompatibilityDispatch = await request("/api/v1/outbound/shipping/confirm", {
    method: "POST",
    role: "hqadmin",
    user: "USR000005",
    body: { shipmentId: created.shipmentId, carrier: "DHL", trackingNo: `TEST-${created.shipmentId}` },
  });
  assert.equal(hqCompatibilityDispatch.status, 403);

  const close = await request(`/api/v1/shipping/${created.shipmentId}/close`, {
    method: "POST",
    role: "manager",
    user: "USR000002",
  });
  assert.equal(close.status, 200, JSON.stringify(close.payload));
  assert.equal(close.payload.data.status, "closed");

  const orderAfterClose = await pool.query(
    `SELECT status
     FROM public.sales_orders
     WHERE tenant_id = 'TNT000001'
       AND warehouse_id = 'WH000001'
       AND so_id = $1`,
    [created.orderId]
  );
  assert.equal(orderAfterClose.rows[0].status, "completed");
});

test("outbound detail is tenant and warehouse isolated", async () => {
  const otherTenant = await request(`/api/v1/outbound/orders/${created.orderId}`, {
    tenant: "TNT000002",
    warehouse: "WH000001",
    role: "hqadmin",
    user: "USR000005",
  });
  assert.equal(otherTenant.status, 200);
  assert.equal(otherTenant.payload.data, null);

  const otherWarehouse = await request(`/api/v1/outbound/orders/${created.orderId}`, {
    warehouse: "WH000002",
    role: "hqadmin",
    user: "USR000005",
  });
  assert.equal(otherWarehouse.status, 200);
  assert.equal(otherWarehouse.payload.data, null);
});

test("shipping list filters by search status and created date", async () => {
  await pool.query(
    "DELETE FROM public.shipments WHERE tenant_id = 'TNT000001' AND shipment_id = ANY($1)",
    [shippingFilterShipmentIds]
  );
  await pool.query(
    "DELETE FROM public.sales_orders WHERE tenant_id = 'TNT000001' AND so_id = ANY($1)",
    [shippingFilterOrderIds]
  );
  await pool.query(
    `INSERT INTO public.sales_orders (
       tenant_id, so_id, warehouse_id, customer_id, order_date, ship_by_date,
       status, notes, created_at, created_by, updated_at
     ) VALUES
       ('TNT000001', 'SAL990031', 'WH000001', 'CUS000001', '2026-06-25', '2026-06-30',
        'packed', 'shipping filter pending', '2026-06-25T00:00:00.000Z', 'USR000005', '2026-06-25T00:00:00.000Z'),
       ('TNT000001', 'SAL990032', 'WH000001', 'CUS000001', '2026-06-26', '2026-06-30',
        'packed', 'shipping filter packed', '2026-06-26T12:00:00.000Z', 'USR000005', '2026-06-26T12:00:00.000Z'),
       ('TNT000001', 'SAL990033', 'WH000001', 'CUS000001', '2026-06-26', '2026-06-30',
        'shipped', 'shipping filter dispatched', '2026-06-26T23:59:59.999Z', 'USR000005', '2026-06-26T23:59:59.999Z'),
       ('TNT000001', 'SAL990034', 'WH000001', 'CUS000001', '2026-06-27', '2026-06-30',
        'cancelled', 'shipping filter cancelled', '2026-06-27T10:00:00.000Z', 'USR000005', '2026-06-27T10:00:00.000Z'),
       ('TNT000001', 'SAL990035', 'WH000001', 'CUS000001', '2026-06-28', '2026-06-30',
        'completed', 'shipping filter closed', '2026-06-28T10:00:00.000Z', 'USR000005', '2026-06-28T10:00:00.000Z')`
  );
  await pool.query(
    `INSERT INTO public.shipments (
       tenant_id, shipment_id, warehouse_id, so_id, pack_task_id, carrier,
       tracking_no, ship_date, status, dispatched_at, dispatched_by,
       created_at, created_by, updated_at, cancellation_reason
     ) VALUES
       ('TNT000001', 'SHI990031', 'WH000001', 'SAL990031', NULL, NULL,
        NULL, NULL, 'pending', NULL, NULL,
        '2026-06-25T00:00:00.000Z', 'USR000005', '2026-06-25T00:00:00.000Z', NULL),
       ('TNT000001', 'SHI990032', 'WH000001', 'SAL990032', NULL, 'DHL Express',
        'TRACK990032', NULL, 'packed', NULL, NULL,
        '2026-06-26T12:00:00.000Z', 'USR000005', '2026-06-26T12:00:00.000Z', NULL),
       ('TNT000001', 'SHI990033', 'WH000001', 'SAL990033', NULL, 'FedEx Ground',
        'TRACK990033', '2026-06-26', 'dispatched', '2026-06-26T23:59:59.999Z', 'USR000002',
        '2026-06-26T23:59:59.999Z', 'USR000005', '2026-06-26T23:59:59.999Z', NULL),
       ('TNT000001', 'SHI990034', 'WH000001', 'SAL990034', NULL, 'UPS Standard',
        'TRACK990034', NULL, 'cancelled', NULL, NULL,
        '2026-06-27T10:00:00.000Z', 'USR000005', '2026-06-27T10:00:00.000Z', 'Customer cancelled'),
       ('TNT000001', 'SHI990035', 'WH000001', 'SAL990035', NULL, 'Pos Laju',
        'TRACK990035', '2026-06-28', 'closed', '2026-06-28T09:00:00.000Z', 'USR000002',
        '2026-06-28T10:00:00.000Z', 'USR000005', '2026-06-28T10:00:00.000Z', NULL)`
  );

  const dateRange = await request("/api/v1/shipping?dateFrom=2026-06-25&dateTo=2026-06-26&pageSize=100", {
    role: "manager",
    user: "USR000002",
  });
  assert.equal(dateRange.status, 200, JSON.stringify(dateRange.payload));
  const dateRangeIds = dateRange.payload.data.map((row) => row.shipment_id);
  assert.equal(dateRangeIds.includes("SHI990031"), true);
  assert.equal(dateRangeIds.includes("SHI990032"), true);
  assert.equal(dateRangeIds.includes("SHI990033"), true);
  assert.equal(dateRangeIds.includes("SHI990034"), false);
  assert.ok(dateRange.payload.summary);
  assert.ok(Number(dateRange.payload.summary.pending) >= 1);
  assert.ok(Number(dateRange.payload.summary.packed) >= 1);
  assert.ok(Number(dateRange.payload.summary.dispatched) >= 1);

  const packed = await request("/api/v1/shipping?status=packed&pageSize=100", {
    role: "manager",
    user: "USR000002",
  });
  assert.equal(packed.status, 200, JSON.stringify(packed.payload));
  const packedIds = packed.payload.data.map((row) => row.shipment_id);
  assert.equal(packedIds.includes("SHI990032"), true);
  assert.equal(packedIds.includes("SHI990031"), false);
  assert.equal(packedIds.includes("SHI990033"), false);

  const pending = await request("/api/v1/shipping?status=pending&pageSize=100", {
    role: "manager",
    user: "USR000002",
  });
  assert.equal(pending.status, 200, JSON.stringify(pending.payload));
  const pendingIds = pending.payload.data.map((row) => row.shipment_id);
  assert.equal(pendingIds.includes("SHI990031"), true);
  assert.equal(pendingIds.includes("SHI990032"), false);
  assert.equal(pendingIds.includes("SHI990033"), false);

  const dispatched = await request("/api/v1/shipping?status=dispatched&pageSize=100", {
    role: "manager",
    user: "USR000002",
  });
  assert.equal(dispatched.status, 200, JSON.stringify(dispatched.payload));
  const dispatchedIds = dispatched.payload.data.map((row) => row.shipment_id);
  assert.equal(dispatchedIds.includes("SHI990033"), true);
  assert.equal(dispatchedIds.includes("SHI990031"), false);
  assert.equal(dispatchedIds.includes("SHI990032"), false);

  const closed = await request("/api/v1/shipping?status=closed&pageSize=100", {
    role: "manager",
    user: "USR000002",
  });
  assert.equal(closed.status, 200, JSON.stringify(closed.payload));
  const closedIds = closed.payload.data.map((row) => row.shipment_id);
  assert.equal(closedIds.includes("SHI990035"), true);
  assert.equal(closedIds.includes("SHI990033"), false);
  assert.equal(closedIds.includes("SHI990034"), false);

  const cancelled = await request("/api/v1/shipping?status=cancelled&pageSize=100", {
    role: "manager",
    user: "USR000002",
  });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.payload));
  const cancelledIds = cancelled.payload.data.map((row) => row.shipment_id);
  assert.equal(cancelledIds.includes("SHI990034"), true);
  assert.equal(cancelledIds.includes("SHI990032"), false);
  assert.equal(cancelledIds.includes("SHI990035"), false);

  const byOrder = await request("/api/v1/shipping?search=SAL990033&pageSize=100", {
    role: "manager",
    user: "USR000002",
  });
  assert.equal(byOrder.status, 200, JSON.stringify(byOrder.payload));
  assert.deepEqual(byOrder.payload.data.map((row) => row.shipment_id), ["SHI990033"]);

  const customerSearchTerm = dateRange.payload.data.find((row) => row.shipment_id === "SHI990031")?.customer_name;
  assert.ok(customerSearchTerm, "Expected customer name in shipping list response");
  const byCustomer = await request(`/api/v1/shipping?search=${encodeURIComponent(customerSearchTerm)}&pageSize=100`, {
    role: "manager",
    user: "USR000002",
  });
  assert.equal(byCustomer.status, 200, JSON.stringify(byCustomer.payload));
  const customerIds = byCustomer.payload.data.map((row) => row.shipment_id);
  assert.equal(customerIds.includes("SHI990031"), true);
  assert.equal(customerIds.includes("SHI990032"), true);

  const invalid = await request("/api/v1/shipping?dateFrom=not-a-date", {
    role: "manager",
    user: "USR000002",
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.payload.error.code, "VALIDATION_ERROR");
  assert.match(invalid.payload.error.message, /dateFrom/);

  const otherWarehouse = await request("/api/v1/shipping?search=SHI990032&pageSize=100", {
    warehouse: "WH000002",
    role: "manager",
    user: "USR000002",
  });
  assert.equal(otherWarehouse.status, 200, JSON.stringify(otherWarehouse.payload));
  assert.deepEqual(otherWarehouse.payload.data.map((row) => row.shipment_id), []);
});
