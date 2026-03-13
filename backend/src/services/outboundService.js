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

  const pickingTask = {
    task_id:
      "PCK" +
      String(Math.floor(Math.random() * 1000)).padStart(3, "0"),
    order_id: orderId,
    tenant_id: context.tenantId,
    status: "READY",
    assignee: context.userId,
    created_at: nowIso(),
  };
  
  db.pickingTasks.push(pickingTask);

  return {
    order,
    pickingTask
  };
}

export {
  listOrders,
  getOrder,
  createOrder,
  updateOrder,
  deleteOrder,
  releaseOrder
};