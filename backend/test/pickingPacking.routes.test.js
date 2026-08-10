import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { once } from "node:events";
import { createApp } from "../src/server.js";
import { pool } from "../src/db/client.js";

let server;
let baseUrl = "";

before(async () => {
  const app = createApp();
  server = app.listen(0);
  await once(server, "listening");
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (!server) {
    return;
  }
  await new Promise((resolve) => server.close(resolve));
});

async function apiRequest(path, {
  method = "GET",
  body,
  tenant = "TNT000001",
  role = "storemanager",
  user = "USR000002",
  warehouse = "WH000001",
  source = "PORTAL",
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": tenant,
      "x-role-id": role,
      "x-user-id": user,
      "x-warehouse-id": warehouse,
      "x-client-source": source,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
}

async function cleanupPickingFixture(ids, tenant = "TNT000001") {
  await pool.query("DELETE FROM public.packing_tasks WHERE tenant_id = $1 AND (so_id = $2 OR wave_id = $3)", [tenant, ids.orderId, ids.waveId]);
  await pool.query("DELETE FROM public.pick_tasks WHERE tenant_id = $1 AND wave_id = $2", [tenant, ids.waveId]);
  await pool.query("DELETE FROM public.pick_waves WHERE tenant_id = $1 AND wave_id = $2", [tenant, ids.waveId]);
  await pool.query("DELETE FROM public.sales_order_lines WHERE tenant_id = $1 AND so_id = $2", [tenant, ids.orderId]);
  await pool.query("DELETE FROM public.sales_orders WHERE tenant_id = $1 AND so_id = $2", [tenant, ids.orderId]);
}

async function createPickingFixture({
  suffix,
  status = "assigned",
  pickedQty = 0,
  qty = 4,
  assignedTo = "USR000015",
  tenant = "TNT000001",
  warehouse = "WH000001",
} = {}) {
  const ids = {
    orderId: `SALSEC${suffix}`,
    lineId: `SOLSEC${suffix}`,
    waveId: `WAVSEC${suffix}`,
    taskId: `PICSEC${suffix}`,
  };

  await pool.query("BEGIN");
  try {
    await cleanupPickingFixture(ids, tenant);
    await pool.query(
      `INSERT INTO public.sales_orders (
         tenant_id, so_id, warehouse_id, customer_id, order_date, status, created_at, created_by, updated_at
       ) VALUES (
         $1, $2, $3, 'CUS000001', CURRENT_DATE, 'allocated', now(), 'USR000005', now()
       )`,
      [tenant, ids.orderId, warehouse]
    );
    await pool.query(
      `INSERT INTO public.sales_order_lines (
         tenant_id, so_line_id, so_id, line_no, sku_id, ordered_qty, allocated_qty, shipped_qty, uom
       ) VALUES (
         $1, $2, $3, 1, 'SKU000006', $4, $4, 0, 'EA'
       )`,
      [tenant, ids.lineId, ids.orderId, qty]
    );
    await pool.query(
      `INSERT INTO public.pick_waves (
         tenant_id, wave_id, warehouse_id, status, created_at, created_by
       ) VALUES (
         $1, $2, $3, 'released', now(), 'USR000005'
       )`,
      [tenant, ids.waveId, warehouse]
    );
    await pool.query(
      `INSERT INTO public.pick_tasks (
         tenant_id, pick_task_id, warehouse_id, wave_id, so_id, so_line_id, sku_id,
         from_location_id, qty, picked_qty, status, assigned_to_user_id, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, 'SKU000006',
         'LOC000002', $7, $8, $9, $10, now(), now()
       )`,
      [tenant, ids.taskId, warehouse, ids.waveId, ids.orderId, ids.lineId, qty, pickedQty, status, assignedTo]
    );
    await pool.query("COMMIT");
    return ids;
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

test("GET /api/picking/pick-lists returns PostgreSQL pick waves only", async () => {
  const response = await apiRequest("/api/picking/pick-lists?page=1&pageSize=50", {
    tenant: "TNT000001",
    role: "superadmin",
    user: "USR000001",
  });

  assert.equal(response.status, 200);
  assert.equal(Array.isArray(response.payload.data), true);
  assert.equal(response.payload.data.some((item) => item.pick_list_id === "PCK100001"), false);
});

test("PORTAL source cannot update mobile-owned picking status", async () => {
  const response = await apiRequest("/api/picking/pick-lists/PCK000077/status", {
    method: "POST",
    role: "storemanager",
    user: "USR000002",
    source: "PORTAL",
    body: { status: "picked" },
  });

  assert.equal(response.status, 403);
});

test("MOBILE source cannot update a legacy-only pick list", async () => {
  const response = await apiRequest("/api/picking/pick-lists/PCK000077/status", {
    method: "POST",
    role: "storeoperator",
    user: "USR000003",
    source: "MOBILE",
    body: { status: "picked" },
  });

  assert.equal(response.status, 404);
});

test("packing create carton does not read a legacy-only pack order", async () => {
  const response = await apiRequest("/api/packing/orders/PAK000034/create-carton", {
    method: "POST",
    role: "storemanager",
    user: "USR000002",
    source: "PORTAL",
    body: { packaging_type: "standard_box" },
  });

  assert.equal(response.status, 404);
});

test("storeoperator cannot run packing control actions", async () => {
  const response = await apiRequest("/api/packing/orders/PAK000033/create-carton", {
    method: "POST",
    role: "storeoperator",
    user: "USR000003",
    source: "PORTAL",
    body: { packaging_type: "standard_box" },
  });

  assert.ok([403, 404].includes(response.status), `Unexpected status ${response.status}`);
});

test("packing confirmation validates required PostgreSQL payload", async () => {
  const response = await apiRequest("/api/packing/orders/PAK000033/confirm-pack", {
    method: "POST",
    role: "storemanager",
    user: "USR000002",
    source: "PORTAL",
    body: { weight_kg: 6.25 },
  });

  assert.equal(response.status, 400);
});

test("assigned operator can move own pick list to in progress", async () => {
  const ids = await createPickingFixture({ suffix: "101", status: "assigned", pickedQty: 0, assignedTo: "USR000015" });
  try {
    const response = await apiRequest(`/api/picking/pick-lists/${ids.waveId}/status`, {
      method: "POST",
      role: "warehouseoperator",
      user: "USR000015",
      source: "MOBILE",
      body: { status: "in_progress" },
    });
    assert.equal(response.status, 200, JSON.stringify(response.payload));
    const stored = await pool.query(
      "SELECT status FROM public.pick_tasks WHERE tenant_id = 'TNT000001' AND wave_id = $1",
      [ids.waveId]
    );
    assert.equal(stored.rows[0].status, "in_progress");
  } finally {
    await cleanupPickingFixture(ids);
  }
});

test("different operator cannot move another operator's pick list to in progress", async () => {
  const ids = await createPickingFixture({ suffix: "102", status: "assigned", pickedQty: 0, assignedTo: "USR000015" });
  try {
    const response = await apiRequest(`/api/picking/pick-lists/${ids.waveId}/status`, {
      method: "POST",
      role: "warehouseoperator",
      user: "USR000016",
      source: "MOBILE",
      body: { status: "in_progress" },
    });
    assert.equal(response.status, 403, JSON.stringify(response.payload));
    assert.equal(response.payload.error?.code, "FORBIDDEN");
  } finally {
    await cleanupPickingFixture(ids);
  }
});

test("assigned operator can complete own fully picked pick list idempotently", async () => {
  const ids = await createPickingFixture({ suffix: "103", status: "done", pickedQty: 4, assignedTo: "USR000015" });
  try {
    const complete = await apiRequest(`/api/picking/pick-lists/${ids.waveId}/complete`, {
      method: "POST",
      role: "warehouseoperator",
      user: "USR000015",
      source: "MOBILE",
    });
    assert.equal(complete.status, 200, JSON.stringify(complete.payload));

    const duplicate = await apiRequest(`/api/picking/pick-lists/${ids.waveId}/complete`, {
      method: "POST",
      role: "warehouseoperator",
      user: "USR000015",
      source: "MOBILE",
    });
    assert.equal(duplicate.status, 200, JSON.stringify(duplicate.payload));

    const packing = await pool.query(
      "SELECT count(*)::int AS count FROM public.packing_tasks WHERE tenant_id = 'TNT000001' AND so_id = $1 AND wave_id = $2",
      [ids.orderId, ids.waveId]
    );
    assert.equal(packing.rows[0].count, 1);
  } finally {
    await cleanupPickingFixture(ids);
  }
});

test("different operator cannot complete another operator's pick list", async () => {
  const ids = await createPickingFixture({ suffix: "104", status: "done", pickedQty: 4, assignedTo: "USR000015" });
  try {
    const response = await apiRequest(`/api/picking/pick-lists/${ids.waveId}/complete`, {
      method: "POST",
      role: "warehouseoperator",
      user: "USR000016",
      source: "MOBILE",
    });
    assert.equal(response.status, 403, JSON.stringify(response.payload));
    assert.equal(response.payload.error?.code, "FORBIDDEN");
  } finally {
    await cleanupPickingFixture(ids);
  }
});

test("manager can assign open pick list", async () => {
  const ids = await createPickingFixture({ suffix: "105", status: "pending", pickedQty: 0, assignedTo: null });
  try {
    const response = await apiRequest(`/api/picking/pick-lists/${ids.waveId}/assign`, {
      method: "POST",
      role: "manager",
      user: "USR000002",
      body: { assignedToUserId: "USR000015" },
    });
    assert.equal(response.status, 200, JSON.stringify(response.payload));
    assert.equal(response.payload.data.assigned_to_user_id, "USR000015");
    assert.equal(response.payload.data.status, "assigned");
  } finally {
    await cleanupPickingFixture(ids);
  }
});

test("manager can reassign assigned pick list before execution starts", async () => {
  const ids = await createPickingFixture({ suffix: "106", status: "assigned", pickedQty: 0, assignedTo: "USR000015" });
  try {
    const response = await apiRequest(`/api/picking/pick-lists/${ids.waveId}/assign`, {
      method: "POST",
      role: "manager",
      user: "USR000002",
      body: { assignedToUserId: "USR000016" },
    });
    assert.equal(response.status, 200, JSON.stringify(response.payload));
    assert.equal(response.payload.data.assigned_to_user_id, "USR000016");
  } finally {
    await cleanupPickingFixture(ids);
  }
});

test("manager cannot reassign pick list after work is in progress", async () => {
  const ids = await createPickingFixture({ suffix: "107", status: "in_progress", pickedQty: 0, assignedTo: "USR000015" });
  try {
    const response = await apiRequest(`/api/picking/pick-lists/${ids.waveId}/assign`, {
      method: "POST",
      role: "manager",
      user: "USR000002",
      body: { assignedToUserId: "USR000016" },
    });
    assert.equal(response.status, 409, JSON.stringify(response.payload));
    assert.equal(response.payload.error?.code, "PICK_LIST_NOT_ASSIGNABLE");
  } finally {
    await cleanupPickingFixture(ids);
  }
});

test("manager cannot reassign pick list after any quantity has been picked", async () => {
  const ids = await createPickingFixture({ suffix: "108", status: "assigned", pickedQty: 1, assignedTo: "USR000015" });
  try {
    const response = await apiRequest(`/api/picking/pick-lists/${ids.waveId}/assign`, {
      method: "POST",
      role: "manager",
      user: "USR000002",
      body: { assignedToUserId: "USR000016" },
    });
    assert.equal(response.status, 409, JSON.stringify(response.payload));
    assert.equal(response.payload.error?.code, "PICK_LIST_NOT_ASSIGNABLE");
  } finally {
    await cleanupPickingFixture(ids);
  }
});

test("manager cannot reassign completed pick list", async () => {
  const ids = await createPickingFixture({ suffix: "109", status: "done", pickedQty: 4, assignedTo: "USR000015" });
  try {
    const response = await apiRequest(`/api/picking/pick-lists/${ids.waveId}/assign`, {
      method: "POST",
      role: "manager",
      user: "USR000002",
      body: { assignedToUserId: "USR000016" },
    });
    assert.equal(response.status, 409, JSON.stringify(response.payload));
    assert.equal(response.payload.error?.code, "PICK_LIST_NOT_ASSIGNABLE");
  } finally {
    await cleanupPickingFixture(ids);
  }
});

test("picking execution mutations preserve tenant and warehouse isolation", async () => {
  const ids = await createPickingFixture({ suffix: "110", status: "assigned", pickedQty: 0, assignedTo: "USR000015" });
  try {
    const wrongTenant = await apiRequest(`/api/picking/pick-lists/${ids.waveId}/status`, {
      method: "POST",
      tenant: "TNT999999",
      role: "warehouseoperator",
      user: "USR000015",
      source: "MOBILE",
      body: { status: "in_progress" },
    });
    assert.equal(wrongTenant.status, 404, JSON.stringify(wrongTenant.payload));

    const wrongWarehouse = await apiRequest(`/api/picking/pick-lists/${ids.waveId}/status`, {
      method: "POST",
      warehouse: "WH999999",
      role: "warehouseoperator",
      user: "USR000015",
      source: "MOBILE",
      body: { status: "in_progress" },
    });
    assert.equal(wrongWarehouse.status, 404, JSON.stringify(wrongWarehouse.payload));
  } finally {
    await cleanupPickingFixture(ids);
  }
});

test("manual pick completion finalizes wave and creates packing task idempotently", async () => {
  const ids = {
    orderId: "SAL991100",
    lineId: "SOL991100",
    waveId: "WAV991100",
    taskId: "PIC991100",
  };

  await pool.query("BEGIN");
  try {
    await pool.query("DELETE FROM public.packing_tasks WHERE tenant_id = 'TNT000001' AND so_id = $1", [ids.orderId]);
    await pool.query("DELETE FROM public.pick_tasks WHERE tenant_id = 'TNT000001' AND wave_id = $1", [ids.waveId]);
    await pool.query("DELETE FROM public.pick_waves WHERE tenant_id = 'TNT000001' AND wave_id = $1", [ids.waveId]);
    await pool.query("DELETE FROM public.sales_order_lines WHERE tenant_id = 'TNT000001' AND so_id = $1", [ids.orderId]);
    await pool.query("DELETE FROM public.sales_orders WHERE tenant_id = 'TNT000001' AND so_id = $1", [ids.orderId]);

    await pool.query(
      `INSERT INTO public.sales_orders (
         tenant_id, so_id, warehouse_id, customer_id, order_date, status, created_at, created_by, updated_at
       ) VALUES (
         'TNT000001', $1, 'WH000001', 'CUS000001', CURRENT_DATE, 'allocated', now(), 'USR000005', now()
       )`,
      [ids.orderId]
    );
    await pool.query(
      `INSERT INTO public.sales_order_lines (
         tenant_id, so_line_id, so_id, line_no, sku_id, ordered_qty, allocated_qty, shipped_qty, uom
       ) VALUES (
         'TNT000001', $1, $2, 1, 'SKU000006', 4, 4, 0, 'EA'
       )`,
      [ids.lineId, ids.orderId]
    );
    await pool.query(
      `INSERT INTO public.pick_waves (
         tenant_id, wave_id, warehouse_id, status, created_at, created_by
       ) VALUES (
         'TNT000001', $1, 'WH000001', 'released', now(), 'USR000005'
       )`,
      [ids.waveId]
    );
    await pool.query(
      `INSERT INTO public.pick_tasks (
         tenant_id, pick_task_id, warehouse_id, wave_id, so_id, so_line_id, sku_id,
         from_location_id, qty, picked_qty, status, assigned_to_user_id, created_at, updated_at
       ) VALUES (
         'TNT000001', $1, 'WH000001', $2, $3, $4, 'SKU000006',
         'LOC000002', 4, 0, 'assigned', 'USR000015', now(), now()
       )`,
      [ids.taskId, ids.waveId, ids.orderId, ids.lineId]
    );

    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }

  try {
    const picked = await apiRequest(`/api/picking/pick-lists/${ids.waveId}/lines/${ids.taskId}/manual-pick`, {
      method: "POST",
      role: "warehouseoperator",
      user: "USR000015",
      source: "MOBILE",
      body: { qty_picked: 4 },
    });
    assert.equal(picked.status, 200, JSON.stringify(picked.payload));
    assert.equal(picked.payload.line_completed, true);
    assert.equal(picked.payload.data.packing_task.so_id, ids.orderId);
    assert.equal(picked.payload.data.packing_task.wave_id, ids.waveId);

    const stored = await pool.query(
      `SELECT pack_task_id, tenant_id, warehouse_id, so_id, wave_id, status
       FROM public.packing_tasks
       WHERE tenant_id = 'TNT000001' AND so_id = $1 AND wave_id = $2`,
      [ids.orderId, ids.waveId]
    );
    assert.equal(stored.rowCount, 1);
    assert.equal(stored.rows[0].warehouse_id, "WH000001");
    assert.equal(stored.rows[0].status, "pending");

    const wave = await pool.query("SELECT status FROM public.pick_waves WHERE tenant_id = 'TNT000001' AND wave_id = $1", [ids.waveId]);
    assert.equal(wave.rows[0].status, "completed");

    const order = await pool.query("SELECT status FROM public.sales_orders WHERE tenant_id = 'TNT000001' AND so_id = $1", [ids.orderId]);
    assert.equal(order.rows[0].status, "picking");

    const packingList = await apiRequest("/api/packing/orders?page=1&pageSize=100", {
      role: "warehouseoperator",
      user: "USR000015",
      source: "MOBILE",
    });
    assert.equal(packingList.status, 200, JSON.stringify(packingList.payload));
    assert.equal(
      packingList.payload.data.some((item) => item.pack_id === stored.rows[0].pack_task_id),
      true
    );

    const managerCartonAttempt = await apiRequest(`/api/packing/orders/${stored.rows[0].pack_task_id}/carton`, {
      method: "POST",
      role: "warehousemanager",
      user: "USR000002",
      source: "MOBILE",
    });
    assert.equal(managerCartonAttempt.status, 403, JSON.stringify(managerCartonAttempt.payload));
    assert.equal(managerCartonAttempt.payload.error?.code, "PACKING_NOT_ASSIGNED_TO_USER");

    const carton = await apiRequest(`/api/packing/orders/${stored.rows[0].pack_task_id}/carton`, {
      method: "POST",
      role: "warehouseoperator",
      user: "USR000015",
      source: "MOBILE",
    });
    assert.equal(carton.status, 200, JSON.stringify(carton.payload));
    assert.match(carton.payload.data.carton_id, /^CTN\d{6}$/);
    assert.equal(carton.payload.data.status, "carton_generated");
    assert.equal(carton.payload.idempotent, false);

    const afterCarton = await pool.query(
      `SELECT status, carton_id
       FROM public.packing_tasks
       WHERE tenant_id = 'TNT000001' AND pack_task_id = $1`,
      [stored.rows[0].pack_task_id]
    );
    assert.equal(afterCarton.rows[0].status, "carton_generated");
    assert.equal(afterCarton.rows[0].carton_id, carton.payload.data.carton_id);

    const cartonRepeat = await apiRequest(`/api/packing/orders/${stored.rows[0].pack_task_id}/carton`, {
      method: "POST",
      role: "warehouseoperator",
      user: "USR000015",
      source: "MOBILE",
    });
    assert.equal(cartonRepeat.status, 200, JSON.stringify(cartonRepeat.payload));
    assert.equal(cartonRepeat.payload.data.carton_id, carton.payload.data.carton_id);
    assert.equal(cartonRepeat.payload.idempotent, true);

    const managerPackAttempt = await apiRequest(`/api/packing/orders/${stored.rows[0].pack_task_id}/confirm-pack`, {
      method: "POST",
      role: "warehousemanager",
      user: "USR000002",
      source: "MOBILE",
      body: { weight_kg: 2.5, packaging_type: "standard_box" },
    });
    assert.equal(managerPackAttempt.status, 403, JSON.stringify(managerPackAttempt.payload));
    assert.equal(managerPackAttempt.payload.error?.code, "PACKING_NOT_ASSIGNED_TO_USER");

    const duplicate = await apiRequest(`/api/picking/pick-lists/${ids.waveId}/complete`, {
      method: "POST",
      role: "warehouseoperator",
      user: "USR000015",
      source: "MOBILE",
    });
    assert.equal(duplicate.status, 200, JSON.stringify(duplicate.payload));

    const afterDuplicate = await pool.query(
      "SELECT count(*)::int AS count FROM public.packing_tasks WHERE tenant_id = 'TNT000001' AND so_id = $1 AND wave_id = $2",
      [ids.orderId, ids.waveId]
    );
    assert.equal(afterDuplicate.rows[0].count, 1);
  } finally {
    await pool.query("BEGIN");
    try {
      await pool.query("DELETE FROM public.packing_tasks WHERE tenant_id = 'TNT000001' AND so_id = $1", [ids.orderId]);
      await pool.query("DELETE FROM public.pick_tasks WHERE tenant_id = 'TNT000001' AND wave_id = $1", [ids.waveId]);
      await pool.query("DELETE FROM public.pick_waves WHERE tenant_id = 'TNT000001' AND wave_id = $1", [ids.waveId]);
      await pool.query("DELETE FROM public.sales_order_lines WHERE tenant_id = 'TNT000001' AND so_id = $1", [ids.orderId]);
      await pool.query("DELETE FROM public.sales_orders WHERE tenant_id = 'TNT000001' AND so_id = $1", [ids.orderId]);
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  }
});
