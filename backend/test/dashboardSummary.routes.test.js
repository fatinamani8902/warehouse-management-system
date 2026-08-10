import assert from "node:assert/strict";
import { once } from "node:events";
import test, { after, before } from "node:test";
import { pool } from "../src/db/client.js";
import { inventoryScopedBalancesFromSql } from "../src/repositories/InventoryReadRepository.js";
import {
  pickListStatusScopeCte,
  shippingReadyToDispatchStatusSql,
} from "../src/repositories/OutboundRepository.js";
import { visiblePutawayScopeCte } from "../src/repositories/PutawayRepository.js";
import { returnsWorkflowScopeCte } from "../src/repositories/ReturnsRepository.js";
import { createApp } from "../src/server.js";

let server;
let baseUrl;
const suffix = Date.now().toString();
const tempWarehouseId = `WHDASH${suffix}`;
const tempWarehouseCode = `WHD${suffix.slice(-6)}`;
const tempAsnToday = `ASNDASHT${suffix}`;
const tempAsnYesterday = `ASNDASHY${suffix}`;
const tempInactiveLocationId = `LOCDASH${suffix}`;
const tempHiddenPutawayId = `PUTDASH${suffix}`;
const overdueSoId = `SODASHO${suffix}`;
const noDueSoId = `SODASHN${suffix}`;
const closedSoId = `SODASHC${suffix}`;
const cancelledSoId = `SODASHX${suffix}`;
const overdueShipmentId = `SHPDASHO${suffix}`;
const noDueShipmentId = `SHPDASHN${suffix}`;
const closedShipmentId = `SHPDASHC${suffix}`;
const cancelledShipmentId = `SHPDASHX${suffix}`;

async function request(path = "/summary", {
  tenant = "TNT000001",
  role = "storemanager",
  user = "USR000002",
  warehouse = "WH000001",
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      "x-tenant-id": tenant,
      "x-user-id": user,
      "x-roles": role,
      "x-warehouse-id": warehouse,
    },
  });
  return {
    status: response.status,
    payload: await response.json().catch(() => null),
  };
}

async function directSummary(tenantId = "TNT000001", warehouseId = "WH000001") {
  const visiblePutaway = visiblePutawayScopeCte();
  const pickingStatusScope = pickListStatusScopeCte();
  const inventoryScopedBalances = inventoryScopedBalancesFromSql();
  const returnsWorkflowScope = returnsWorkflowScopeCte();
  const shippingReadyStatuses = shippingReadyToDispatchStatusSql();
  const result = await pool.query(
    `WITH ${visiblePutaway},
     ${pickingStatusScope},
     ${returnsWorkflowScope}
     SELECT
       (SELECT count(*)::int FROM public.asns WHERE tenant_id = $1 AND warehouse_id = $2 AND created_at >= current_date AND created_at < current_date + interval '1 day') AS asn_today,
       (SELECT count(*)::int FROM public.grns WHERE tenant_id = $1 AND warehouse_id = $2 AND created_at >= current_date AND created_at < current_date + interval '1 day') AS grn_today,
       (SELECT count(*)::int FROM public.asns WHERE tenant_id = $1 AND warehouse_id = $2 AND lower(status) IN ('draft', 'pending', 'in_transit', 'arrived')) AS pending_inbound,
       (SELECT count(*)::int FROM public.grns WHERE tenant_id = $1 AND warehouse_id = $2 AND lower(status) = 'receiving') AS receiving_in_progress,
       (SELECT count(*)::int FROM visible_putaway WHERE lower(status) = 'pending') AS putaway_pending,
       (SELECT count(*)::int FROM visible_putaway WHERE lower(status) = 'assigned') AS putaway_assigned,
       (SELECT count(*)::int FROM visible_putaway WHERE lower(status) = 'in_progress') AS putaway_in_progress,
       (SELECT count(*)::int FROM visible_putaway WHERE lower(status) = 'exception') AS putaway_exception,
       (SELECT coalesce(sum(balance.qty_on_hand), 0)::numeric
        FROM ${inventoryScopedBalances}
        WHERE balance.tenant_id = $1 AND balance.warehouse_id = $2) AS on_hand,
       (SELECT coalesce(sum(balance.qty_reserved), 0)::numeric
        FROM ${inventoryScopedBalances}
        WHERE balance.tenant_id = $1 AND balance.warehouse_id = $2) AS reserved,
       (SELECT coalesce(sum(balance.qty_on_hand - balance.qty_reserved), 0)::numeric
        FROM ${inventoryScopedBalances}
        WHERE balance.tenant_id = $1 AND balance.warehouse_id = $2) AS available,
       (SELECT coalesce(sum(balance.qty_quarantine), 0)::numeric
        FROM ${inventoryScopedBalances}
        WHERE balance.tenant_id = $1 AND balance.warehouse_id = $2) AS quarantine,
       (SELECT count(*)::int FROM picking_statuses WHERE status = 'open') AS picking_open,
       (SELECT count(*)::int FROM picking_statuses WHERE status = 'assigned') AS picking_assigned,
       (SELECT count(*)::int FROM picking_statuses WHERE status = 'in_progress') AS picking_in_progress,
       (SELECT count(*)::int FROM picking_statuses WHERE status = 'picked') AS picking_picked,
       (SELECT count(*)::int FROM public.shipments WHERE tenant_id = $1 AND warehouse_id = $2 AND lower(status) IN (${shippingReadyStatuses})) AS ready_to_dispatch,
       (SELECT count(*)::int FROM public.shipments WHERE tenant_id = $1 AND warehouse_id = $2 AND lower(status) = 'dispatched') AS dispatched,
       (SELECT count(*)::int
        FROM public.shipments shipment
        LEFT JOIN public.sales_orders sales_order
          ON sales_order.tenant_id = shipment.tenant_id
         AND sales_order.warehouse_id = shipment.warehouse_id
         AND sales_order.so_id = shipment.so_id
       WHERE shipment.tenant_id = $1
          AND shipment.warehouse_id = $2
          AND lower(shipment.status) NOT IN ('closed', 'cancelled')
          AND sales_order.ship_by_date IS NOT NULL
          AND sales_order.ship_by_date < current_date) AS overdue,
       (SELECT count(*)::int FROM public.cycle_counts WHERE tenant_id = $1 AND warehouse_id = $2 AND lower(status) = 'submitted') AS cycle_counts_submitted,
       (SELECT count(*)::int FROM public.adjustments WHERE tenant_id = $1 AND warehouse_id = $2 AND lower(status) = 'submitted') AS adjustments_submitted,
       (SELECT count(*)::int FROM returns_with_workflow WHERE workflow_status = 'Return Created') AS return_created,
       (SELECT count(*)::int
        FROM public.rma rma
        JOIN public.returns return_row
          ON return_row.tenant_id = rma.tenant_id
         AND return_row.return_id = rma.return_id
       WHERE rma.tenant_id = $1
          AND return_row.warehouse_id = $2
          AND lower(rma.status) = 'processing') AS rma_processing,
       (SELECT count(*)::int FROM returns_with_workflow WHERE workflow_status IN ('Return Created', 'RMA Opened', 'RMA Processing', 'RMA Completed')) AS open_returns,
       (SELECT count(*)::int
        FROM public.rma rma
        JOIN public.returns return_row
          ON return_row.tenant_id = rma.tenant_id
         AND return_row.return_id = rma.return_id
        WHERE rma.tenant_id = $1
          AND return_row.warehouse_id = $2
          AND lower(return_row.status) NOT IN ('closed', 'cancelled')
          AND lower(rma.status) IN ('created', 'open', 'processing', 'completed')) AS active_rmas,
       (SELECT count(*)::int
        FROM public.rma rma
        JOIN public.returns return_row
          ON return_row.tenant_id = rma.tenant_id
         AND return_row.return_id = rma.return_id
        WHERE rma.tenant_id = $1
          AND return_row.warehouse_id = $2
          AND lower(return_row.status) NOT IN ('closed', 'cancelled')
          AND lower(rma.status) = 'completed') AS returns_awaiting_closure`,
    [tenantId, warehouseId]
  );
  return result.rows[0];
}

before(async () => {
  await pool.query(
    `INSERT INTO public.warehouses (
       tenant_id, warehouse_id, warehouse_code, warehouse_name, city, country, status
     )
     VALUES ('TNT000001', $1, $2, 'Dashboard Empty Test Warehouse', 'Test', 'MY', 'active')
     ON CONFLICT (warehouse_id) DO NOTHING`,
    [tempWarehouseId, tempWarehouseCode]
  );
  await pool.query(
    `INSERT INTO public.user_warehouses (tenant_id, user_id, warehouse_id)
     VALUES ('TNT000001', 'USR000002', $1)
     ON CONFLICT DO NOTHING`,
    [tempWarehouseId]
  );
  await pool.query(
    `INSERT INTO public.asns (
       tenant_id, asn_id, warehouse_id, supplier_id, eta, status, created_at, created_by
     )
     VALUES
       ('TNT000001', $1, 'WH000001', 'SUP000001', current_date, 'pending', current_date + interval '1 hour', 'USR000002'),
       ('TNT000001', $2, 'WH000001', 'SUP000001', current_date, 'pending', current_date - interval '1 second', 'USR000002')`,
    [tempAsnToday, tempAsnYesterday]
  );
  await pool.query(
    `INSERT INTO public.locations (
       tenant_id, location_id, warehouse_id, zone, aisle, rack, bin, label, location_type,
       bin_id, location_code, is_default_receiving, is_active, created_at, updated_at
     )
     VALUES (
       'TNT000001', $1, 'WH000001', 'DASH', '00', '00', '000', 'Dashboard Inactive Source',
       'receiving', NULL, $1, false, false, now(), now()
     )
     ON CONFLICT (location_id) DO UPDATE
     SET is_active = false,
         warehouse_id = excluded.warehouse_id,
         updated_at = now()`,
    [tempInactiveLocationId]
  );
  await pool.query(
    `INSERT INTO public.putaway_tasks (
       tenant_id, putaway_task_id, warehouse_id, grn_id, grn_line_id, sku_id, qty, status, priority,
       assigned_to_user_id, source_location_id, from_location_id, created_at
     )
     VALUES (
       'TNT000001', $1, 'WH000001', 'GRN000004', 'GRL000004', 'SKU000006', 1, 'assigned', 3,
       'USR000015', $2, $2, now()
     )
     ON CONFLICT (putaway_task_id) DO UPDATE
     SET status = 'assigned',
         source_location_id = excluded.source_location_id,
         from_location_id = excluded.from_location_id`,
    [tempHiddenPutawayId, tempInactiveLocationId]
  );
  await pool.query(
    `INSERT INTO public.sales_orders (
       tenant_id, so_id, warehouse_id, customer_id, order_date, ship_by_date,
       status, created_at, created_by
     )
     VALUES
       ('TNT000001', $1, 'WH000001', 'CUS000001', current_date, current_date - interval '1 day', 'open', now(), 'USR000002'),
       ('TNT000001', $2, 'WH000001', 'CUS000001', current_date, NULL, 'open', current_date - interval '30 days', 'USR000002'),
       ('TNT000001', $3, 'WH000001', 'CUS000001', current_date, current_date - interval '1 day', 'open', now(), 'USR000002'),
       ('TNT000001', $4, 'WH000001', 'CUS000001', current_date, current_date - interval '1 day', 'open', now(), 'USR000002')
     ON CONFLICT (so_id) DO UPDATE
     SET ship_by_date = excluded.ship_by_date,
         created_at = excluded.created_at`,
    [overdueSoId, noDueSoId, closedSoId, cancelledSoId]
  );
  await pool.query(
    `INSERT INTO public.shipments (
       tenant_id, shipment_id, warehouse_id, so_id, carrier, tracking_no,
       status, created_at, created_by
     )
     VALUES
       ('TNT000001', $1, 'WH000001', $2, 'Dashboard Carrier', 'DASH-OVERDUE', 'dispatched', now(), 'USR000002'),
       ('TNT000001', $3, 'WH000001', $4, 'Dashboard Carrier', 'DASH-NODUE', 'dispatched', current_date - interval '30 days', 'USR000002'),
       ('TNT000001', $5, 'WH000001', $6, 'Dashboard Carrier', 'DASH-CLOSED', 'closed', now(), 'USR000002'),
       ('TNT000001', $7, 'WH000001', $8, 'Dashboard Carrier', 'DASH-CANCELLED', 'cancelled', now(), 'USR000002')
     ON CONFLICT (shipment_id) DO UPDATE
     SET status = excluded.status,
         so_id = excluded.so_id,
         created_at = excluded.created_at`,
    [
      overdueShipmentId,
      overdueSoId,
      noDueShipmentId,
      noDueSoId,
      closedShipmentId,
      closedSoId,
      cancelledShipmentId,
      cancelledSoId,
    ]
  );
  server = createApp().listen(0);
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/dashboard`;
});

after(async () => {
  await pool.query(
    `DELETE FROM public.shipments
     WHERE shipment_id = ANY($1::text[])`,
    [[overdueShipmentId, noDueShipmentId, closedShipmentId, cancelledShipmentId]]
  );
  await pool.query(
    `DELETE FROM public.sales_orders
     WHERE so_id = ANY($1::text[])`,
    [[overdueSoId, noDueSoId, closedSoId, cancelledSoId]]
  );
  await pool.query(
    `DELETE FROM public.putaway_tasks
     WHERE putaway_task_id = $1`,
    [tempHiddenPutawayId]
  );
  await pool.query(
    `DELETE FROM public.locations
     WHERE location_id = $1`,
    [tempInactiveLocationId]
  );
  await pool.query(
    `DELETE FROM public.asns
     WHERE asn_id = ANY($1::text[])`,
    [[tempAsnToday, tempAsnYesterday]]
  );
  await pool.query(
    `DELETE FROM public.user_warehouses
     WHERE tenant_id = 'TNT000001'
       AND user_id = 'USR000002'
       AND warehouse_id = $1`,
    [tempWarehouseId]
  );
  await pool.query(
    `DELETE FROM public.warehouses
     WHERE tenant_id = 'TNT000001'
       AND warehouse_id = $1`,
    [tempWarehouseId]
  );
  if (server) await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test("dashboard summary is tenant and warehouse scoped live data", async () => {
  const response = await request();
  const expected = await directSummary();
  const kpis = response.payload.data.kpis;

  assert.equal(response.status, 200, JSON.stringify(response.payload));
  assert.equal(response.payload.data.tenant_id, "TNT000001");
  assert.equal(response.payload.data.warehouse_id, "WH000001");
  assert.equal(kpis.today_inbound.asn_created_today, expected.asn_today);
  assert.equal(kpis.today_inbound.grn_created_today, expected.grn_today);
  assert.equal(kpis.today_inbound.total, expected.asn_today + expected.grn_today);
  assert.equal(kpis.pending_putaway.assigned, expected.putaway_assigned);
  assert.equal(kpis.pending_putaway.pending, expected.putaway_pending);
  assert.equal(kpis.pending_putaway.in_progress, expected.putaway_in_progress);
  assert.equal(kpis.pending_putaway.exception, expected.putaway_exception);
  assert.equal(kpis.pending_putaway.total, expected.putaway_pending + expected.putaway_assigned + expected.putaway_in_progress + expected.putaway_exception);
  assert.equal(kpis.inventory.on_hand, Number(expected.on_hand));
  assert.equal(kpis.inventory.reserved, Number(expected.reserved));
  assert.equal(kpis.inventory.available, Number(expected.available));
  assert.equal(kpis.inventory.quarantine, Number(expected.quarantine));
  assert.equal(kpis.picking.open, expected.picking_open);
  assert.equal(kpis.picking.assigned, expected.picking_assigned);
  assert.equal(kpis.picking.in_progress, expected.picking_in_progress);
  assert.equal(kpis.picking.picked, expected.picking_picked);
  assert.equal(kpis.shipping.ready_to_dispatch, expected.ready_to_dispatch);
  assert.equal(kpis.shipping.dispatched, expected.dispatched);
  assert.equal(kpis.shipping.overdue, expected.overdue);
  assert.equal(kpis.approvals.cycle_counts_submitted, expected.cycle_counts_submitted);
  assert.equal(kpis.approvals.adjustments_submitted, expected.adjustments_submitted);
  assert.equal(kpis.approvals.total, expected.cycle_counts_submitted + expected.adjustments_submitted);
  assert.equal(kpis.returns.return_created, expected.return_created);
  assert.equal(kpis.returns.rma_processing, expected.rma_processing);
  assert.equal(kpis.returns.total_pending, expected.return_created + expected.rma_processing);
  assert.equal(kpis.returns.open_returns, expected.open_returns);
  assert.equal(kpis.returns.active_rmas, expected.active_rmas);
  assert.equal(kpis.returns.returns_awaiting_closure, expected.returns_awaiting_closure);
  assert.equal(kpis.operational.pending_inbound, expected.pending_inbound);
  assert.equal(kpis.operational.receiving_in_progress, expected.receiving_in_progress);
  assert.equal(kpis.operational.pending_putaway, kpis.pending_putaway.total);
  assert.equal(kpis.operational.active_picking, kpis.picking.active);
  assert.equal(kpis.operational.open_returns, expected.open_returns);
  assert.equal(kpis.operational.active_rmas, expected.active_rmas);
  assert.ok(response.payload.data.status_summary);
  assert.ok(Array.isArray(response.payload.data.pending_actions));
  assert.ok(Array.isArray(response.payload.data.recent_transactions));
  assert.equal(response.payload.data.trends.labels.length, 7);
  assert.equal(response.payload.data.trends.inbound.length, 7);
  assert.equal(response.payload.data.trends.outbound.length, 7);
});

test("dashboard summary allows warehouse floor operator read access", async () => {
  const response = await request("/summary", {
    role: "warehouseoperator",
    user: "USR000015",
    warehouse: "WH000001",
  });

  assert.equal(response.status, 200, JSON.stringify(response.payload));
  assert.equal(response.payload.data.tenant_id, "TNT000001");
  assert.equal(response.payload.data.warehouse_id, "WH000001");
  assert.ok(response.payload.data.kpis);
  assert.equal(
    response.payload.data.pending_actions.some((item) => (
      ["Cycle Count", "Adjustment", "Shipping", "Returns", "RMA", "ASN", "GRN"].includes(item.module)
    )),
    false
  );
});

test("dashboard summary preserves manager read access and rejects unsupported roles", async () => {
  const hqAdmin = await request("/summary", { role: "hqadmin", user: "USR000005" });
  const storeManager = await request("/summary", { role: "storemanager", user: "USR000002" });
  const unauthorized = await request("/summary", { role: "readonly", user: "USR000015" });

  assert.equal(hqAdmin.status, 200, JSON.stringify(hqAdmin.payload));
  assert.equal(storeManager.status, 200, JSON.stringify(storeManager.payload));
  assert.equal(unauthorized.status, 403);
  assert.equal(unauthorized.payload.error.code, "FORBIDDEN");
});

test("dashboard rejects unauthorized selected warehouse", async () => {
  const response = await request("/summary", {
    warehouse: "WH000002",
    user: "USR000015",
    role: "storeoperator",
  });

  assert.equal(response.status, 403);
  assert.equal(response.payload.error.code, "WAREHOUSE_ACCESS_DENIED");
});

test("dashboard rejects cross-tenant warehouse access", async () => {
  const response = await request("/summary", {
    tenant: "TNT999999",
    warehouse: "WH000001",
    role: "storeoperator",
    user: "USR000015",
  });

  assert.equal(response.status, 403);
  assert.equal(response.payload.error.code, "WAREHOUSE_ACCESS_DENIED");
});

test("dashboard empty authorized warehouse returns zero values", async () => {
  const response = await request("/summary", { warehouse: tempWarehouseId });
  const kpis = response.payload.data.kpis;

  assert.equal(response.status, 200, JSON.stringify(response.payload));
  assert.equal(kpis.today_inbound.total, 0);
  assert.equal(kpis.pending_putaway.total, 0);
  assert.equal(kpis.inventory.on_hand, 0);
  assert.equal(kpis.inventory.reserved, 0);
  assert.equal(kpis.inventory.available, 0);
  assert.equal(kpis.inventory.quarantine, 0);
  assert.equal(kpis.picking.active, 0);
  assert.equal(kpis.picking.picked, 0);
  assert.equal(kpis.shipping.ready_to_dispatch, 0);
  assert.equal(kpis.shipping.dispatched, 0);
  assert.equal(kpis.shipping.overdue, 0);
  assert.equal(kpis.approvals.total, 0);
  assert.equal(kpis.returns.total_pending, 0);
  assert.equal(kpis.returns.returns_awaiting_closure, 0);
  assert.equal(kpis.operational.pending_inbound, 0);
  assert.equal(kpis.operational.receiving_in_progress, 0);
  assert.equal(kpis.operational.pending_putaway, 0);
  assert.equal(kpis.operational.active_picking, 0);
  assert.equal(kpis.operational.pending_packing, 0);
  assert.equal(kpis.operational.shipments_ready_or_in_progress, 0);
  assert.equal(kpis.operational.open_returns, 0);
  assert.equal(kpis.operational.active_rmas, 0);
  assert.deepEqual(response.payload.data.pending_actions, []);
  assert.deepEqual(response.payload.data.recent_transactions, []);
  assert.equal(response.payload.data.trends.labels.length, 7);
  assert.deepEqual(response.payload.data.trends.inbound, [0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(response.payload.data.trends.outbound, [0, 0, 0, 0, 0, 0, 0]);
});

test("dashboard hides manager pending actions for operator role", async () => {
  const response = await request("/summary", {
    role: "storeoperator",
    user: "USR000015",
    warehouse: "WH000001",
  });

  assert.equal(response.status, 200, JSON.stringify(response.payload));
  assert.equal(
    response.payload.data.pending_actions.some((item) => (
      ["Cycle Count", "Adjustment", "Shipping", "Returns", "RMA", "ASN", "GRN"].includes(item.module)
    )),
    false
  );
  assert.ok(Array.isArray(response.payload.data.recent_transactions));
});

test("dashboard today inbound uses current local database date boundary", async () => {
  const response = await request();
  const expected = await directSummary();

  assert.equal(response.status, 200, JSON.stringify(response.payload));
  assert.equal(response.payload.data.kpis.today_inbound.asn_created_today, expected.asn_today);
  assert.ok(response.payload.data.kpis.today_inbound.asn_created_today >= 1);
});

test("dashboard putaway assigned count matches the putaway list visibility rules", async () => {
  const dashboard = await request();
  const putawayResponse = await fetch(`${baseUrl.replace("/dashboard", "")}/putaway-tasks?status=assigned&page=1&pageSize=100`, {
    headers: {
      "x-tenant-id": "TNT000001",
      "x-user-id": "USR000002",
      "x-roles": "storemanager",
      "x-warehouse-id": "WH000001",
    },
  });
  const putawayPayload = await putawayResponse.json();

  assert.equal(dashboard.status, 200, JSON.stringify(dashboard.payload));
  assert.equal(putawayResponse.status, 200, JSON.stringify(putawayPayload));
  assert.equal(
    putawayPayload.items.some((item) => item.putaway_task_id === tempHiddenPutawayId || item.task_id === tempHiddenPutawayId),
    false
  );
  assert.equal(dashboard.payload.data.kpis.pending_putaway.assigned, putawayPayload.total);
});

test("dashboard response excludes sensitive fields", async () => {
  const response = await request();
  const serialized = JSON.stringify(response.payload);

  assert.equal(response.status, 200, JSON.stringify(response.payload));
  assert.equal(serialized.includes("password"), false);
  assert.equal(serialized.includes("token"), false);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("stack"), false);
});

test("dashboard operation totals equal their breakdown fields", async () => {
  const response = await request();
  assert.equal(response.status, 200, JSON.stringify(response.payload));

  const data = response.payload.data;
  const kpis = data.kpis;
  const inbound = data.status_summary.inbound;
  const warehouse = data.status_summary.warehouse;

  assert.equal(
    inbound.pending_asn + inbound.in_transit_asn + inbound.arrived_asn + inbound.receiving_grn,
    kpis.operational.pending_inbound + kpis.operational.receiving_in_progress
  );
  assert.equal(
    kpis.pending_putaway.total,
    kpis.pending_putaway.pending + kpis.pending_putaway.assigned + kpis.pending_putaway.in_progress + kpis.pending_putaway.exception
  );
  assert.equal(kpis.picking.active, kpis.picking.open + kpis.picking.assigned + kpis.picking.in_progress);
  assert.equal(warehouse.active_picking, kpis.picking.active);
  assert.equal(warehouse.active_packing, kpis.operational.pending_packing);
  assert.equal(kpis.operational.shipments_ready_or_in_progress, kpis.shipping.ready_to_dispatch + kpis.shipping.dispatched);
  assert.equal(
    kpis.returns.open_returns,
    kpis.returns.return_created + Math.max(kpis.returns.open_returns - kpis.returns.return_created, 0)
  );
});

test("dashboard overdue shipments use required ship by date and exclude terminal shipments", async () => {
  const response = await request();
  const fixture = await pool.query(
    `SELECT count(*)::int AS count
     FROM public.shipments shipment
     JOIN public.sales_orders sales_order
       ON sales_order.tenant_id = shipment.tenant_id
      AND sales_order.warehouse_id = shipment.warehouse_id
      AND sales_order.so_id = shipment.so_id
     WHERE shipment.shipment_id = ANY($1::text[])
       AND lower(shipment.status) NOT IN ('closed', 'cancelled')
       AND sales_order.ship_by_date IS NOT NULL
       AND sales_order.ship_by_date < current_date`,
    [[overdueShipmentId, noDueShipmentId, closedShipmentId, cancelledShipmentId]]
  );

  assert.equal(response.status, 200, JSON.stringify(response.payload));
  assert.equal(fixture.rows[0].count, 1);
  assert.ok(response.payload.data.kpis.shipping.overdue >= 1);
});
