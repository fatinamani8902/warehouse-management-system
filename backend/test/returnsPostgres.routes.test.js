import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { pool } from "../src/db/client.js";
import { setReturnRmaAuditFailureForTests } from "../src/repositories/ReturnRmaAuditRepository.js";

let server;
let baseUrl;

const fixture = {
  tenant: "TNT000001",
  warehouse: "WH000001",
  user: "USR000005",
  role: "hqadmin",
  customerId: "CUS000001",
  customerName: "seed_customer_name",
  skuId: "SKU000006",
  locationId: "LOC000002",
  orderId: "SALRTN901",
  orderLineId: "SOLRTN901",
  waveId: "WAVRTN901",
  pickTaskId: "PICRTN901",
  packTaskId: "PACRTN901",
  shipmentId: "SHIRTN901",
};

async function request(path, {
  method = "GET",
  body,
  tenant = fixture.tenant,
  warehouse = fixture.warehouse,
  user = fixture.user,
  role = fixture.role,
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": tenant,
      "x-warehouse-id": warehouse,
      "x-user-id": user,
      "x-roles": role,
      "x-client-source": "PORTAL",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
}

function errorMessage(response) {
  return response.payload?.message || response.payload?.error?.message || "";
}

async function cleanup() {
  await withTenant(async (client) => {
    await client.query("DELETE FROM public.return_rma_audit_events WHERE tenant_id = $1 AND (return_id IN (SELECT return_id FROM public.returns WHERE shipment_id = $2) OR rma_id LIKE 'RMA%901')", [fixture.tenant, fixture.shipmentId]);
    await client.query("DELETE FROM public.rma WHERE tenant_id = $1 AND return_id IN (SELECT return_id FROM public.returns WHERE shipment_id = $2)", [fixture.tenant, fixture.shipmentId]);
    await client.query("DELETE FROM public.return_items WHERE tenant_id = $1 AND return_id IN (SELECT return_id FROM public.returns WHERE shipment_id = $2)", [fixture.tenant, fixture.shipmentId]);
    await client.query("DELETE FROM public.returns WHERE tenant_id = $1 AND shipment_id = $2", [fixture.tenant, fixture.shipmentId]);
  });
  await pool.query("DELETE FROM public.shipments WHERE tenant_id = $1 AND shipment_id = $2", [fixture.tenant, fixture.shipmentId]);
  await pool.query("DELETE FROM public.packing_tasks WHERE tenant_id = $1 AND pack_task_id = $2", [fixture.tenant, fixture.packTaskId]);
  await pool.query("DELETE FROM public.pick_tasks WHERE tenant_id = $1 AND pick_task_id = $2", [fixture.tenant, fixture.pickTaskId]);
  await pool.query("DELETE FROM public.pick_waves WHERE tenant_id = $1 AND wave_id = $2", [fixture.tenant, fixture.waveId]);
  await pool.query("DELETE FROM public.sales_order_lines WHERE tenant_id = $1 AND so_line_id = $2", [fixture.tenant, fixture.orderLineId]);
  await pool.query("DELETE FROM public.sales_orders WHERE tenant_id = $1 AND so_id = $2", [fixture.tenant, fixture.orderId]);
}

async function withTenant(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [fixture.tenant]);
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function ensureReturnsSchema() {
  await pool.query(readFileSync(new URL("../migrations/20260729_001_return_rma_audit_events.sql", import.meta.url), "utf8"));
  await pool.query(`
    ALTER TABLE public.returns
      ADD COLUMN IF NOT EXISTS shipment_id text,
      ADD COLUMN IF NOT EXISTS customer_name text
  `);
  await pool.query("ALTER TABLE public.return_items ADD COLUMN IF NOT EXISTS reason_code text");
}

async function auditTrail(path, options = {}) {
  const response = await request(path, options);
  assert.equal(response.status, 200);
  return response.payload?.data || response.payload;
}

async function seedClosedShipment() {
  await pool.query(
    `INSERT INTO public.sales_orders (
       tenant_id, so_id, warehouse_id, customer_id, order_date, status,
       created_at, created_by, updated_at
     ) VALUES ($1,$2,$3,$4,CURRENT_DATE,'completed',now(),$5,now())`,
    [fixture.tenant, fixture.orderId, fixture.warehouse, fixture.customerId, fixture.user]
  );
  await pool.query(
    `INSERT INTO public.sales_order_lines (
       tenant_id, so_line_id, so_id, line_no, sku_id, ordered_qty,
       allocated_qty, shipped_qty, uom
     ) VALUES ($1,$2,$3,1,$4,5,5,5,'EA')`,
    [fixture.tenant, fixture.orderLineId, fixture.orderId, fixture.skuId]
  );
  await pool.query(
    `INSERT INTO public.pick_waves (
       tenant_id, wave_id, warehouse_id, status, created_at, created_by
     ) VALUES ($1,$2,$3,'completed',now(),$4)`,
    [fixture.tenant, fixture.waveId, fixture.warehouse, fixture.user]
  );
  await pool.query(
    `INSERT INTO public.pick_tasks (
       tenant_id, pick_task_id, warehouse_id, wave_id, so_id, so_line_id,
       sku_id, from_location_id, qty, picked_qty, status, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,5,5,'done',now(),now())`,
    [
      fixture.tenant,
      fixture.pickTaskId,
      fixture.warehouse,
      fixture.waveId,
      fixture.orderId,
      fixture.orderLineId,
      fixture.skuId,
      fixture.locationId,
    ]
  );
  await pool.query(
    `INSERT INTO public.packing_tasks (
       tenant_id, pack_task_id, warehouse_id, so_id, wave_id, status,
       carton_id, packaging_type, weight_kg, packed_by, packed_at,
       created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,'packed','CTNRTN901','standard_box',1,$6,now(),now(),now())`,
    [fixture.tenant, fixture.packTaskId, fixture.warehouse, fixture.orderId, fixture.waveId, fixture.user]
  );
  await pool.query(
    `INSERT INTO public.shipments (
       tenant_id, shipment_id, warehouse_id, so_id, pack_task_id,
       carrier, tracking_no, ship_date, status, dispatched_at,
       dispatched_by, closed_at, created_at, created_by, updated_at
     ) VALUES ($1,$2,$3,$4,$5,'Test Carrier','TRKRTN901',CURRENT_DATE,'closed',now(),$6,now(),now(),$6,now())`,
    [fixture.tenant, fixture.shipmentId, fixture.warehouse, fixture.orderId, fixture.packTaskId, fixture.user]
  );
}

before(async () => {
  await ensureReturnsSchema();
  await cleanup();
  await seedClosedShipment();
  const app = createApp();
  server = app.listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await cleanup();
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test("POST /api/v1/returns persists return header and item in PostgreSQL", async () => {
  const lookupBefore = await request("/api/v1/shipping?status=closed&returnEligible=true");
  assert.equal(lookupBefore.status, 200);
  const beforeShipment = lookupBefore.payload.items.find((row) => row.shipment_id === fixture.shipmentId);
  assert.ok(beforeShipment);
  assert.equal(beforeShipment.items[0].sku_id, fixture.skuId);
  assert.equal(Number(beforeShipment.items[0].available_to_return), 5);

  await withTenant((client) => client.query(
    `INSERT INTO public.returns (
       tenant_id, return_id, warehouse_id, shipment_id, status, created_at,
       created_by, sku_id, qty, reason_code
     ) VALUES ($1, 'RTNFULL901', $2, $3, 'created', now(), $4, $5, 5, 'defective')`,
    [fixture.tenant, fixture.warehouse, fixture.shipmentId, fixture.user, fixture.skuId]
  ));
  const lookupFullyReturned = await request("/api/v1/shipping?status=closed&returnEligible=true");
  assert.equal(lookupFullyReturned.status, 200);
  assert.equal(lookupFullyReturned.payload.items.some((row) => row.shipment_id === fixture.shipmentId), false);
  await withTenant((client) => client.query(
    "DELETE FROM public.returns WHERE tenant_id = $1 AND return_id = 'RTNFULL901'",
    [fixture.tenant]
  ));

  const create = await request("/api/v1/returns", {
    method: "POST",
    body: {
      shipment_id: fixture.shipmentId,
      customer_id: fixture.customerId,
      customer_name: fixture.customerName,
      sku_id: fixture.skuId,
      qty: 2,
      reason_code: "defective",
      reason_description: "Defective",
      notes: "Persistence regression",
    },
  });

  assert.equal(create.status, 201);
  assert.match(create.payload.return_id, /^RTN\d{6}$/);
  assert.equal(create.payload.shipment_id, fixture.shipmentId);
  assert.equal(create.payload.warehouse_id, fixture.warehouse);
  assert.equal(create.payload.tenant_id, fixture.tenant);
  assert.match(create.payload.created_by_display, new RegExp(`\\(${fixture.user}\\)$`));
  assert.notEqual(create.payload.created_by_display, fixture.user);
  assert.equal(create.payload.items.length, 1);

  const returnId = create.payload.return_id;
  const createdAudit = await auditTrail(`/api/v1/returns/${returnId}/audit-trail`);
  assert.equal(createdAudit.total, 1);
  assert.equal(createdAudit.items[0].action_code, "return_created");
  assert.equal(createdAudit.items[0].previous_status, null);
  assert.equal(createdAudit.items[0].new_status, "created");
  assert.equal(createdAudit.items[0].performed_by_user_id, fixture.user);
  assert.match(createdAudit.items[0].audit_event_id, /^RAE\d{6}$/);

  const header = await withTenant((client) => client.query(
    `SELECT return_id, shipment_id, status, created_by, created_at, tenant_id, warehouse_id
       FROM public.returns
      WHERE tenant_id = $1 AND warehouse_id = $2 AND return_id = $3`,
    [fixture.tenant, fixture.warehouse, returnId]
  ));
  assert.equal(header.rowCount, 1);
  assert.equal(header.rows[0].shipment_id, fixture.shipmentId);
  assert.equal(header.rows[0].created_by, fixture.user);

  const item = await withTenant((client) => client.query(
    `SELECT return_id, sku_id, qty, reason_code
       FROM public.return_items
      WHERE tenant_id = $1 AND return_id = $2`,
    [fixture.tenant, returnId]
  ));
  assert.equal(item.rowCount, 1);
  assert.equal(item.rows[0].sku_id, fixture.skuId);
  assert.equal(Number(item.rows[0].qty), 2);
  assert.equal(item.rows[0].reason_code, "defective");

  const list = await request("/api/v1/returns");
  assert.equal(list.status, 200);
  const listedReturn = list.payload.find((row) => row.return_id === returnId);
  assert.ok(listedReturn);
  assert.equal(listedReturn.created_by_display, create.payload.created_by_display);

  const detail = await request(`/api/v1/returns/${returnId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.payload.return_id, returnId);
  assert.equal(detail.payload.created_by_display, create.payload.created_by_display);
  assert.equal(detail.payload.items.length, 1);
  assert.equal(detail.payload.items[0].sku_id, fixture.skuId);
  assert.ok(detail.payload.items[0].sku_name || detail.payload.items[0].product_name);

  const lookupAfterPartial = await request("/api/v1/shipping?status=closed&returnEligible=true");
  assert.equal(lookupAfterPartial.status, 200);
  const afterShipment = lookupAfterPartial.payload.items.find((row) => row.shipment_id === fixture.shipmentId);
  assert.ok(afterShipment);
  assert.equal(Number(afterShipment.items[0].previously_returned_qty), 2);
  assert.equal(Number(afterShipment.items[0].available_to_return), 3);

  const createRma = await request(`/api/v1/returns/${returnId}/rma`, {
    method: "POST",
    body: { notes: "" },
  });
  assert.equal(createRma.status, 201);
  assert.match(createRma.payload.rma_id, /^RMA\d{6}$/);
  assert.equal(createRma.payload.return_id, returnId);
  assert.equal(createRma.payload.notes, `Created from Return ${returnId}`);
  assert.equal(createRma.payload.items.length, 1);
  assert.equal(createRma.payload.items[0].sku_id, fixture.skuId);
  assert.equal(Number(createRma.payload.items[0].qty), 2);
  assert.equal(createRma.payload.items[0].reason_code, "defective");
  assert.ok(createRma.payload.items[0].sku_name || createRma.payload.items[0].product_name);

  const auditAfterRma = await auditTrail(`/api/v1/returns/${returnId}/audit-trail`);
  assert.ok(auditAfterRma.items.some((event) => event.action_code === "return_created"));
  const rmaCreatedAudit = auditAfterRma.items.find((event) => event.action_code === "rma_created");
  assert.ok(rmaCreatedAudit);
  assert.equal(rmaCreatedAudit.return_id, returnId);
  assert.equal(rmaCreatedAudit.rma_id, createRma.payload.rma_id);
  assert.equal(rmaCreatedAudit.previous_status, null);
  assert.equal(rmaCreatedAudit.new_status, "created");

  const rmaAuditCreated = await auditTrail(`/api/v1/rmas/${createRma.payload.rma_id}/audit-trail`);
  assert.equal(rmaAuditCreated.total, 1);
  assert.equal(rmaAuditCreated.items[0].action_code, "rma_created");

  const duplicateRma = await request(`/api/v1/returns/${returnId}/rma`, {
    method: "POST",
    body: { notes: "Duplicate RMA" },
  });
  assert.equal(duplicateRma.status, 409);
  assert.match(errorMessage(duplicateRma), /already linked/i);

  const detailWithRma = await request(`/api/v1/returns/${returnId}`);
  assert.equal(detailWithRma.status, 200);
  assert.equal(detailWithRma.payload.rma_id, createRma.payload.rma_id);
  assert.equal(detailWithRma.payload.rma_status, "created");
  assert.equal(detailWithRma.payload.rma_created_by, fixture.user);
  assert.equal(detailWithRma.payload.linked_rma.rma_id, createRma.payload.rma_id);

  const listWithRma = await request("/api/v1/returns");
  const listed = listWithRma.payload.find((row) => row.return_id === returnId);
  assert.equal(listed.rma_id, createRma.payload.rma_id);

  const prematureConfirm = await request(`/api/v1/returns/${returnId}/transition`, {
    method: "PATCH",
    body: { action: "confirm" },
  });
  assert.equal(prematureConfirm.status, 409);
  assert.match(errorMessage(prematureConfirm), /linked RMA is completed/i);

  const processRma = await request(`/api/v1/rma/${createRma.payload.rma_id}/transition`, {
    method: "PATCH",
    body: { action: "process" },
  });
  assert.equal(processRma.status, 200);
  assert.equal(processRma.payload.document.status, "processing");

  const rmaAuditProcessing = await auditTrail(`/api/v1/rmas/${createRma.payload.rma_id}/audit-trail`);
  const processingEvent = rmaAuditProcessing.items.find((event) => event.action_code === "rma_processing_started");
  assert.ok(processingEvent);
  assert.equal(processingEvent.previous_status, "created");
  assert.equal(processingEvent.new_status, "processing");

  const completeRma = await request(`/api/v1/rma/${createRma.payload.rma_id}/transition`, {
    method: "PATCH",
    body: { action: "complete" },
  });
  assert.equal(completeRma.status, 200);
  assert.equal(completeRma.payload.document.status, "completed");

  const rmaAuditCompleted = await auditTrail(`/api/v1/rmas/${createRma.payload.rma_id}/audit-trail`);
  const completedEvent = rmaAuditCompleted.items.find((event) => event.action_code === "rma_completed");
  assert.ok(completedEvent);
  assert.equal(completedEvent.previous_status, "processing");
  assert.equal(completedEvent.new_status, "completed");

  const cancelAfterCompletedRma = await request(`/api/v1/returns/${returnId}/cancel`, {
    method: "PATCH",
    body: { cancellation_reason: "Attempt after RMA completion" },
  });
  assert.equal(cancelAfterCompletedRma.status, 409);
  assert.match(errorMessage(cancelAfterCompletedRma), /cannot be cancelled after/i);

  const confirmReturn = await request(`/api/v1/returns/${returnId}/transition`, {
    method: "PATCH",
    body: { action: "confirm" },
  });
  assert.equal(confirmReturn.status, 200);
  assert.equal(confirmReturn.payload.document.return_id, returnId);
  assert.equal(confirmReturn.payload.document.status, "closed");
  assert.equal(confirmReturn.payload.document.rma_status, "completed");

  const finalReturnAudit = await auditTrail(`/api/v1/returns/${returnId}/audit-trail?page=1&pageSize=2`);
  assert.equal(finalReturnAudit.page, 1);
  assert.equal(finalReturnAudit.pageSize, 2);
  assert.equal(finalReturnAudit.total, 5);
  assert.equal(finalReturnAudit.items.length, 2);
  assert.equal(finalReturnAudit.items[0].action_code, "return_closed");
  assert.equal(finalReturnAudit.items[0].previous_status, "created");
  assert.equal(finalReturnAudit.items[0].new_status, "closed");

  const closedHeader = await withTenant((client) => client.query(
    `SELECT status
       FROM public.returns
      WHERE tenant_id = $1 AND warehouse_id = $2 AND return_id = $3`,
    [fixture.tenant, fixture.warehouse, returnId]
  ));
  assert.equal(closedHeader.rowCount, 1);
  assert.equal(closedHeader.rows[0].status, "closed");
});

test("PATCH /api/v1/returns/:id/cancel updates PostgreSQL returns", async () => {
  const returnId = "RTNCANCEL901";
  await withTenant((client) => client.query(
    `INSERT INTO public.returns (
       tenant_id, return_id, warehouse_id, shipment_id, status, created_at,
       created_by, sku_id, qty, reason_code
     ) VALUES ($1, $2, $3, $4, 'created', now(), $5, $6, 1, 'defective')`,
    [fixture.tenant, returnId, fixture.warehouse, fixture.shipmentId, fixture.user, fixture.skuId]
  ));

  const cancel = await request(`/api/v1/returns/${returnId}/cancel`, {
    method: "PATCH",
    body: { cancellation_reason: "Customer cancelled return" },
  });
  assert.equal(cancel.status, 200);
  assert.equal(cancel.payload.document.return_id, returnId);
  assert.equal(cancel.payload.document.status, "cancelled");
  assert.equal(cancel.payload.document.cancellation_reason, "Customer cancelled return");

  const cancelledHeader = await withTenant((client) => client.query(
    `SELECT status, cancellation_reason, cancelled_by
       FROM public.returns
      WHERE tenant_id = $1 AND warehouse_id = $2 AND return_id = $3`,
    [fixture.tenant, fixture.warehouse, returnId]
  ));
  assert.equal(cancelledHeader.rowCount, 1);
  assert.equal(cancelledHeader.rows[0].status, "cancelled");
  assert.equal(cancelledHeader.rows[0].cancellation_reason, "Customer cancelled return");
  assert.equal(cancelledHeader.rows[0].cancelled_by, fixture.user);

  const audit = await auditTrail(`/api/v1/returns/${returnId}/audit-trail`);
  const cancelEvent = audit.items.find((event) => event.action_code === "return_cancelled");
  assert.ok(cancelEvent);
  assert.equal(cancelEvent.previous_status, "created");
  assert.equal(cancelEvent.new_status, "cancelled");
  assert.equal(cancelEvent.remarks, "Customer cancelled return");
});

test("store operators cannot perform protected Return/RMA actions or read audit endpoints", async () => {
  const createReturn = await request("/api/v1/returns", {
    method: "POST",
    role: "storeoperator",
    body: {
      shipment_id: fixture.shipmentId,
      customer_id: fixture.customerId,
      customer_name: fixture.customerName,
      sku_id: fixture.skuId,
      qty: 1,
      reason_code: "defective",
    },
  });
  assert.equal(createReturn.status, 403);

  const createRma = await request("/api/v1/returns/RTNCANCEL901/rma", {
    method: "POST",
    role: "storeoperator",
    body: { notes: "Forbidden RMA create" },
  });
  assert.equal(createRma.status, 403);

  const response = await request("/api/v1/returns/RTNCANCEL901/audit-trail", {
    role: "storeoperator",
  });
  assert.equal(response.status, 403);
});

test("warehouse operators cannot perform protected Return/RMA actions or read audit endpoints", async () => {
  const createReturn = await request("/api/v1/returns", {
    method: "POST",
    role: "warehouseoperator",
    user: "USR000015",
    body: {
      shipment_id: fixture.shipmentId,
      customer_id: fixture.customerId,
      customer_name: fixture.customerName,
      sku_id: fixture.skuId,
      qty: 1,
      reason_code: "defective",
    },
  });
  assert.equal(createReturn.status, 403);

  const createRma = await request("/api/v1/returns/RTNCANCEL901/rma", {
    method: "POST",
    role: "warehouseoperator",
    user: "USR000015",
    body: { notes: "Forbidden RMA create" },
  });
  assert.equal(createRma.status, 403);

  const response = await request("/api/v1/returns/RTNCANCEL901/audit-trail", {
    role: "warehouseoperator",
    user: "USR000015",
  });
  assert.equal(response.status, 403);
});

test("failed audit insertion rolls back return cancellation", async () => {
  const returnId = "RTNAUDFAIL901";
  await withTenant((client) => client.query(
    `INSERT INTO public.returns (
       tenant_id, return_id, warehouse_id, shipment_id, status, created_at,
       created_by, sku_id, qty, reason_code
     ) VALUES ($1, $2, $3, $4, 'created', now(), $5, $6, 1, 'defective')`,
    [fixture.tenant, returnId, fixture.warehouse, fixture.shipmentId, fixture.user, fixture.skuId]
  ));

  setReturnRmaAuditFailureForTests(true);
  try {
    const cancel = await request(`/api/v1/returns/${returnId}/cancel`, {
      method: "PATCH",
      body: { cancellation_reason: "Force audit rollback" },
    });
    assert.equal(cancel.status, 500);
  } finally {
    setReturnRmaAuditFailureForTests(false);
  }

  const row = await withTenant((client) => client.query(
    `SELECT status, cancellation_reason
       FROM public.returns
      WHERE tenant_id = $1
        AND warehouse_id = $2
        AND return_id = $3`,
    [fixture.tenant, fixture.warehouse, returnId]
  ));
  assert.equal(row.rowCount, 1);
  assert.equal(row.rows[0].status, "created");
  assert.equal(row.rows[0].cancellation_reason, null);

  const auditRows = await withTenant((client) => client.query(
    "SELECT count(*)::int AS total FROM public.return_rma_audit_events WHERE tenant_id = $1 AND return_id = $2",
    [fixture.tenant, returnId]
  ));
  assert.equal(auditRows.rows[0].total, 0);
});

test("cancelling a return with an active RMA prevents RMA continuation", async () => {
  const returnId = "RTNCASCADE901";
  const rmaId = "RMACASCADE901";
  await withTenant(async (client) => {
    await client.query(
      `INSERT INTO public.returns (
         tenant_id, return_id, warehouse_id, shipment_id, status, created_at,
         created_by, sku_id, qty, reason_code
       ) VALUES ($1, $2, $3, $4, 'created', now(), $5, $6, 1, 'defective')`,
      [fixture.tenant, returnId, fixture.warehouse, fixture.shipmentId, fixture.user, fixture.skuId]
    );
    await client.query(
      `INSERT INTO public.rma (
         rma_id, tenant_id, return_id, status, created_by, created_at, updated_at
       ) VALUES ($1, $2, $3, 'created', $4, now(), now())`,
      [rmaId, fixture.tenant, returnId, fixture.user]
    );
  });

  const cancel = await request(`/api/v1/returns/${returnId}/cancel`, {
    method: "PATCH",
    body: { cancellation_reason: "Customer cancelled linked return" },
  });
  assert.equal(cancel.status, 200);
  assert.equal(cancel.payload.document.status, "cancelled");

  const linkedRma = await withTenant((client) => client.query(
    `SELECT status, cancellation_reason, cancelled_by
       FROM public.rma
      WHERE tenant_id = $1 AND rma_id = $2`,
    [fixture.tenant, rmaId]
  ));
  assert.equal(linkedRma.rowCount, 1);
  assert.equal(linkedRma.rows[0].status, "cancelled");
  assert.equal(linkedRma.rows[0].cancelled_by, fixture.user);
  assert.equal(
    linkedRma.rows[0].cancellation_reason,
    "Cancelled because linked Return RTNCASCADE901 was cancelled.\n\nReason: Customer cancelled linked return"
  );

  const rmaAudit = await auditTrail(`/api/v1/rmas/${rmaId}/audit-trail`);
  const rmaCancelEvent = rmaAudit.items.find((event) => event.action_code === "rma_cancelled");
  assert.ok(rmaCancelEvent);
  assert.equal(rmaCancelEvent.previous_status, "created");
  assert.equal(rmaCancelEvent.new_status, "cancelled");
  assert.equal(
    rmaCancelEvent.remarks,
    "Cancelled because linked Return RTNCASCADE901 was cancelled.\n\nReason: Customer cancelled linked return"
  );

  const detail = await request(`/api/v1/returns/${returnId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.payload.status, "cancelled");
  assert.equal(detail.payload.rma_id, rmaId);
  assert.equal(detail.payload.rma_status, "cancelled");
  assert.equal(detail.payload.linked_rma.rma_id, rmaId);
  assert.equal(detail.payload.linked_rma.status, "cancelled");

  const process = await request(`/api/v1/rma/${rmaId}/transition`, {
    method: "PATCH",
    body: { action: "process" },
  });
  assert.equal(process.status, 409);
});

test("cancelling a return with a processing RMA cancels both records and preserves linkage", async () => {
  const returnId = "RTNPROC901";
  const rmaId = "RMAPROC901";
  await withTenant(async (client) => {
    await client.query(
      `INSERT INTO public.returns (
         tenant_id, return_id, warehouse_id, shipment_id, status, created_at,
         created_by, sku_id, qty, reason_code
       ) VALUES ($1, $2, $3, $4, 'created', now(), $5, $6, 1, 'damaged_in_transit')`,
      [fixture.tenant, returnId, fixture.warehouse, fixture.shipmentId, fixture.user, fixture.skuId]
    );
    await client.query(
      `INSERT INTO public.rma (
         rma_id, tenant_id, return_id, status, created_by, created_at, updated_at
       ) VALUES ($1, $2, $3, 'processing', $4, now(), now())`,
      [rmaId, fixture.tenant, returnId, fixture.user]
    );
  });

  const before = await request(`/api/v1/returns/${returnId}`);
  assert.equal(before.status, 200);
  assert.equal(before.payload.rma_id, rmaId);
  assert.equal(before.payload.rma_status, "processing");

  const cancel = await request(`/api/v1/returns/${returnId}/cancel`, {
    method: "PATCH",
    body: { cancellation_reason: "Customer cancelled processing RMA return" },
  });
  assert.equal(cancel.status, 200);
  assert.equal(cancel.payload.document.status, "cancelled");
  assert.equal(cancel.payload.document.rma_id, rmaId);
  assert.equal(cancel.payload.document.rma_status, "cancelled");
  assert.equal(cancel.payload.document.linked_rma.rma_id, rmaId);

  const rows = await withTenant((client) => client.query(
    `SELECT ret.status AS return_status,
            ret.cancellation_reason AS return_reason,
            r.status AS rma_status,
            r.return_id,
            r.cancellation_reason AS rma_reason,
            r.cancelled_by
       FROM public.returns ret
       JOIN public.rma r
         ON r.tenant_id = ret.tenant_id
        AND r.return_id = ret.return_id
      WHERE ret.tenant_id = $1
        AND ret.warehouse_id = $2
        AND ret.return_id = $3
        AND r.rma_id = $4`,
    [fixture.tenant, fixture.warehouse, returnId, rmaId]
  ));
  assert.equal(rows.rowCount, 1);
  assert.equal(rows.rows[0].return_status, "cancelled");
  assert.equal(rows.rows[0].rma_status, "cancelled");
  assert.equal(rows.rows[0].return_id, returnId);
  assert.equal(rows.rows[0].cancelled_by, fixture.user);
  assert.equal(rows.rows[0].return_reason, "Customer cancelled processing RMA return");
  assert.equal(
    rows.rows[0].rma_reason,
    "Cancelled because linked Return RTNPROC901 was cancelled.\n\nReason: Customer cancelled processing RMA return"
  );

  const detail = await request(`/api/v1/returns/${returnId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.payload.rma_id, rmaId);
  assert.equal(detail.payload.rma_status, "cancelled");
  assert.equal(detail.payload.linked_rma.rma_id, rmaId);
  assert.equal(detail.payload.linked_rma.status, "cancelled");

  const rmaDetail = await request(`/api/v1/rma/${rmaId}`);
  assert.equal(rmaDetail.status, 200);
  assert.equal(rmaDetail.payload.status, "cancelled");
  assert.equal(rmaDetail.payload.return_id, returnId);

  const complete = await request(`/api/v1/rma/${rmaId}/transition`, {
    method: "PATCH",
    body: { action: "complete" },
  });
  assert.equal(complete.status, 409);
});

test("POST /api/v1/returns rejects over-return quantity", async () => {
  const response = await request("/api/v1/returns", {
    method: "POST",
    body: {
      shipment_id: fixture.shipmentId,
      customer_id: fixture.customerId,
      customer_name: fixture.customerName,
      sku_id: fixture.skuId,
      qty: 99,
      reason_code: "defective",
    },
  });
  assert.equal(response.status, 400);
  assert.match(errorMessage(response), /cannot exceed/i);
});

test("POST /api/v1/returns rejects non-closed shipment", async () => {
  await pool.query(
    "UPDATE public.shipments SET status = 'dispatched', updated_at = now() WHERE tenant_id = $1 AND shipment_id = $2",
    [fixture.tenant, fixture.shipmentId]
  );
  const response = await request("/api/v1/returns", {
    method: "POST",
    body: {
      shipment_id: fixture.shipmentId,
      customer_id: fixture.customerId,
      customer_name: fixture.customerName,
      sku_id: fixture.skuId,
      qty: 1,
      reason_code: "defective",
    },
  });
  assert.equal(response.status, 400);
  assert.match(errorMessage(response), /closed shipment/i);
  await pool.query(
    "UPDATE public.shipments SET status = 'closed', updated_at = now() WHERE tenant_id = $1 AND shipment_id = $2",
    [fixture.tenant, fixture.shipmentId]
  );
});
