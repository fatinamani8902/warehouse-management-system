import { nowIso } from "../utils/mock.js";
import { db } from "../data/store.js";

/* ---------- LIST ORDERS ---------- */

function listOrders(context, { page = 1, pageSize = 20 }) {

  const tenantOrders = db.orders.filter(
    o => o.tenant_id === context.tenantId
  );

  return {
    items: tenantOrders,
    total: tenantOrders.length,
    page,
    pageSize
  };
}


/* ---------- GET ORDER ---------- */

function getOrder(context, orderId) {

  return db.orders.find(
    o => o.order_id === orderId && o.tenant_id === context.tenantId
  ) || null;

}


/* ---------- CREATE ORDER ---------- */

function createOrder(context, payload) {

  const tenantOrders = db.orders.filter(
    o => o.tenant_id === context.tenantId
  );

  const orderId =
    "ORD" +
    String(tenantOrders.length + 1).padStart(4, "0");

  const newOrder = {

    order_id: orderId,
    tenant_id: context.tenantId,

    customer_name: payload.customer_name || "",
    notes: payload.notes || "",

    status: "draft",

    lines: [],
    lines_count: 0,

    created_at: nowIso(),
    created_by: context.userId,

    cancellation_reason: null
  };

  db.orders.push(newOrder);

  return newOrder;
}


/* ---------- UPDATE ORDER ---------- */

function updateOrder(context, orderId, payload) {

  const order = db.orders.find(
    o => o.order_id === orderId && o.tenant_id === context.tenantId
  );

  if (!order) return null;

  Object.assign(order, payload);

  return order;
}


/* ---------- DELETE ORDER ---------- */

function deleteOrder(context, orderId) {

  const index = db.orders.findIndex(
    o => o.order_id === orderId && o.tenant_id === context.tenantId
  );

  if (index === -1) return false;

  db.orders.splice(index, 1);

  return true;
}


/* ---------- RELEASE ORDER ---------- */

function releaseOrder(context, orderId) {
  const order = db.orders.find(
    o => o.order_id === orderId && o.tenant_id === context.tenantId
  );

  if (!order) {
    return { error: "Order not found" };
  }

  if (!order.lines || order.lines.length === 0) {
    return { error: "Order has no lines" };
  }

  order.status = "released";

  // ✅ Guna db.pick_lists instead of db.pickingTasks
  const pickListId = "PCK" + String(db.pick_lists.length + 1).padStart(6, "0");

  const pickList = {
    pick_list_id: pickListId,
    wave_id: "WAV" + String(db.pick_lists.length + 1).padStart(6, "0"),
    tenant_id: context.tenantId,
    warehouse_id: "WH000001",
    assigned_to_user_id: null,
    assigned_to_user_name: null,
    status: "draft",
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
    updated_at: new Date().toISOString(),
    updated_by: context.userId,
    lines: order.lines.map((line, index) => ({
      line_no: index + 1,
      sku_id: line.sku_id,
      location_id: "LOC000001",
      qty_required: line.ordered_qty,
      qty_picked: 0,
      status: "pending",
    })),
  };

  db.pick_lists.push(pickList);

  return { order, pickList };
}

export {
  listOrders,
  getOrder,
  createOrder,
  updateOrder,
  deleteOrder,
  releaseOrder
};