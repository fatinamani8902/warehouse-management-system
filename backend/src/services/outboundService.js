import { Op } from "sequelize";
import {
  Customer,
  InventoryBalance,
  InventoryTransaction,
  PackingTask,
  PickTask,
  PickWave,
  SalesOrder,
  SalesOrderLine,
  Shipment,
  Sku,
  User,
  UserRole,
  UserWarehouse,
  getOrder as getOrderRecord,
  getPackingTask,
  getPickList,
  getShipment,
  listOperators,
  listOrders as listOrderRecords,
  listPackingTasks,
  listPickLists,
  listShipments,
  nextId,
  number,
  requiredScope,
  sequelize,
} from "../repositories/OutboundRepository.js";
import { ApiError } from "../utils/errors.js";

const VIEW_ROLES = new Set([
  "superadmin", "hqadmin", "admin", "manager", "warehousemanager",
  "storemanager", "storeoperator", "warehouseoperator",
  "warehouseclerk", "storekeeper", "auditor",
]);
const ORDER_ROLES = new Set(["superadmin", "hqadmin", "admin"]);
const CONTROL_ROLES = new Set(["manager", "warehousemanager", "storemanager"]);
const OPERATOR_ROLES = new Set(["storeoperator", "warehouseoperator", "warehouseclerk", "storekeeper"]);
const CONFIRMABLE_PACK_STATUSES = new Set(["pending", "in_progress", "carton_generated"]);
const CARTON_LABEL_PATTERN = /^(CTN|CARTON)[A-Z0-9-]*$/i;

function scope(context) {
  return requiredScope(context?.tenantId, context?.warehouseId);
}

function isOperatorContext(context) {
  return Array.isArray(context?.roles) && context.roles.some((role) => OPERATOR_ROLES.has(String(role).toLowerCase()));
}

function clean(value) {
  return String(value ?? "").trim();
}

function positiveQty(value, field = "Quantity") {
  const qty = Number(value);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} must be greater than 0`);
  }
  return qty;
}

function normalizePackingOwnerIds(tasks = [], pack = null) {
  const ownerIds = new Set();
  for (const task of tasks) {
    const assignedTo = clean(task?.assigned_to_user_id);
    if (assignedTo) ownerIds.add(assignedTo);
  }
  const packedBy = clean(pack?.packed_by);
  if (packedBy) ownerIds.add(packedBy);
  return ownerIds;
}

function assertPackingOwner(tasks, pack, userId) {
  const ownerIds = normalizePackingOwnerIds(tasks, pack);
  if (!ownerIds.has(clean(userId))) {
    throw new ApiError(403, "PACKING_NOT_ASSIGNED_TO_USER", "Only the assigned operator can confirm this packing task.");
  }
}

function assertPickingExecutionOwner(tasks, context, { allowCompleted = false } = {}) {
  if (!Array.isArray(tasks) || !tasks.length) {
    throw new ApiError(404, "PICK_LIST_NOT_FOUND", "Pick list not found");
  }
  if (tasks.some((task) => !clean(task?.assigned_to_user_id))) {
    throw new ApiError(409, "PICK_TASK_NOT_ASSIGNED", "All pick tasks must be assigned before picking");
  }
  const terminalStatuses = allowCompleted
    ? new Set(["cancelled"])
    : new Set(["done", "completed", "cancelled"]);
  if (tasks.some((task) => terminalStatuses.has(clean(task?.status).toLowerCase()))) {
    throw new ApiError(409, "PICK_LIST_NOT_EXECUTABLE", "Pick list cannot be updated from its current status");
  }
  if (
    isOperatorContext(context)
    && tasks.some((task) => clean(task?.assigned_to_user_id) !== clean(context?.userId))
  ) {
    throw new ApiError(403, "FORBIDDEN", "Pick task is assigned to another operator");
  }
}

function assertPickListAssignable(tasks) {
  if (!Array.isArray(tasks) || !tasks.length) {
    throw new ApiError(404, "PICK_LIST_NOT_FOUND", "Pick list not found");
  }
  const assignableStatuses = new Set(["open", "pending", "assigned"]);
  const hasStarted = tasks.some((task) => {
    const status = clean(task?.status).toLowerCase();
    return !assignableStatuses.has(status) || number(task?.picked_qty) > 0;
  });
  if (hasStarted) {
    throw new ApiError(409, "PICK_LIST_NOT_ASSIGNABLE", "Pick list cannot be reassigned after picking has started");
  }
}

function pagination(input = {}) {
  return {
    page: Math.max(1, Number(input.page) || 1),
    pageSize: Math.min(100, Math.max(1, Number(input.pageSize) || 20)),
    search: clean(input.search),
    status: clean(input.status).toLowerCase(),
    dateFrom: parseOrderCreatedDate(input.dateFrom, "dateFrom", false),
    dateTo: parseOrderCreatedDate(input.dateTo, "dateTo", true),
    returnEligible: ["1", "true", "yes"].includes(clean(input.returnEligible).toLowerCase()),
  };
}

function parseOrderCreatedDate(value, field, endOfDay) {
  const raw = clean(value);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} must be a valid date in YYYY-MM-DD format`);
  }
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
    throw new ApiError(400, "VALIDATION_ERROR", `${field} must be a valid date`);
  }
  if (endOfDay) date.setUTCHours(23, 59, 59, 999);
  return date;
}

function packingPagination(input = {}) {
  return {
    page: Math.max(1, Number(input.page) || 1),
    pageSize: Math.min(100, Math.max(1, Number(input.pageSize) || 20)),
    search: clean(input.search),
    status: clean(input.status).toLowerCase(),
    dateFrom: parseOrderCreatedDate(input.dateFrom, "dateFrom", false),
    dateTo: parseOrderCreatedDate(input.dateTo, "dateTo", true),
  };
}

async function listOrders(context, input = {}) {
  const { tenantId, warehouseId } = scope(context);
  return listOrderRecords({ tenantId, warehouseId, ...pagination(input) });
}

async function getOrder(context, orderId) {
  const { tenantId, warehouseId } = scope(context);
  return getOrderRecord(tenantId, warehouseId, clean(orderId));
}

async function resolveCustomer(tenantId, payload, transaction) {
  const customerId = clean(payload.customer_id);
  if (customerId) {
    const row = await Customer.findOne({
      where: { tenant_id: tenantId, customer_id: customerId, status: "active" },
      transaction,
    });
    if (!row) throw new ApiError(400, "INVALID_CUSTOMER", "Customer is invalid for this tenant");
    return row;
  }
  const customerName = clean(payload.customer_name);
  if (!customerName) throw new ApiError(400, "VALIDATION_ERROR", "Customer is required");
  const row = await Customer.findOne({
    where: { tenant_id: tenantId, customer_name: { [Op.iLike]: customerName }, status: "active" },
    transaction,
  });
  if (!row) throw new ApiError(400, "INVALID_CUSTOMER", "Customer is invalid for this tenant");
  return row;
}

async function createOrder(context, payload = {}) {
  const { tenantId, warehouseId } = scope(context);
  return sequelize.transaction(async (transaction) => {
    const customer = await resolveCustomer(tenantId, payload, transaction);
    const soId = await nextId(SalesOrder, "so_id", "SAL", transaction);
    const now = new Date();
    await SalesOrder.create({
      tenant_id: tenantId,
      so_id: soId,
      warehouse_id: warehouseId,
      customer_id: customer.customer_id,
      order_date: now.toISOString().slice(0, 10),
      ship_by_date: payload.ship_by ? new Date(payload.ship_by).toISOString().slice(0, 10) : null,
      status: "draft",
      notes: clean(payload.notes) || null,
      created_at: now,
      created_by: context.userId,
      updated_at: now,
    }, { transaction });

    for (const line of Array.isArray(payload.lines) ? payload.lines : []) {
      await addOrderLineWithTransaction(
        { tenantId, warehouseId, userId: context.userId },
        soId,
        line,
        transaction
      );
    }
    return getOrderRecord(tenantId, warehouseId, soId, transaction);
  });
}

async function addOrderLineWithTransaction(context, orderId, payload, transaction) {
  const order = await SalesOrder.findOne({
    where: { tenant_id: context.tenantId, warehouse_id: context.warehouseId, so_id: orderId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found");
  if (order.status !== "draft") {
    throw new ApiError(409, "ORDER_NOT_EDITABLE", "Only draft orders can be edited");
  }

  const skuId = clean(payload.sku_id);
  const sku = await Sku.findOne({
    where: { tenant_id: context.tenantId, sku_id: skuId, status: "active" },
    transaction,
  });
  if (!sku) throw new ApiError(400, "INVALID_SKU", "SKU is invalid for this tenant");
  const qty = positiveQty(payload.ordered_qty ?? payload.qty, "Ordered quantity");
  const maxLine = Number(await SalesOrderLine.max("line_no", {
    where: { tenant_id: context.tenantId, so_id: orderId },
    transaction,
  })) || 0;
  const lineId = await nextId(SalesOrderLine, "so_line_id", "SOL", transaction);
  await SalesOrderLine.create({
    tenant_id: context.tenantId,
    so_line_id: lineId,
    so_id: orderId,
    line_no: maxLine + 1,
    sku_id: skuId,
    ordered_qty: qty,
    allocated_qty: 0,
    shipped_qty: 0,
    uom: sku.uom,
  }, { transaction });
  order.updated_at = new Date();
  await order.save({ transaction });
}

async function addOrderLine(context, orderId, payload) {
  const { tenantId, warehouseId } = scope(context);
  await sequelize.transaction((transaction) => addOrderLineWithTransaction(
    { tenantId, warehouseId, userId: context.userId },
    clean(orderId),
    payload,
    transaction
  ));
  return getOrderRecord(tenantId, warehouseId, clean(orderId));
}

async function updateOrder(context, orderId, payload = {}) {
  const { tenantId, warehouseId } = scope(context);
  return sequelize.transaction(async (transaction) => {
    const order = await SalesOrder.findOne({
      where: { tenant_id: tenantId, warehouse_id: warehouseId, so_id: clean(orderId) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found");
    if (order.status !== "draft") throw new ApiError(409, "ORDER_NOT_EDITABLE", "Only draft orders can be edited");
    if (payload.customer_id || payload.customer_name) {
      const customer = await resolveCustomer(tenantId, payload, transaction);
      order.customer_id = customer.customer_id;
    }
    if (payload.notes !== undefined) order.notes = clean(payload.notes) || null;
    if (payload.ship_by !== undefined || payload.ship_by_date !== undefined) {
      const value = payload.ship_by ?? payload.ship_by_date;
      order.ship_by_date = value ? new Date(value).toISOString().slice(0, 10) : null;
    }
    order.updated_at = new Date();
    await order.save({ transaction });
    return getOrderRecord(tenantId, warehouseId, order.so_id, transaction);
  });
}

async function deleteOrder(context, orderId) {
  const { tenantId, warehouseId } = scope(context);
  return sequelize.transaction(async (transaction) => {
    const order = await SalesOrder.findOne({
      where: { tenant_id: tenantId, warehouse_id: warehouseId, so_id: clean(orderId) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found");
    if (order.status !== "draft") throw new ApiError(409, "ORDER_NOT_EDITABLE", "Only draft orders can be deleted");
    await order.destroy({ transaction });
    return { deleted: true, order_id: order.so_id };
  });
}

async function cancelOrder(context, orderId, reasonValue) {
  const { tenantId, warehouseId } = scope(context);
  const reason = clean(reasonValue);
  if (reason.length < 5) {
    throw new ApiError(400, "VALIDATION_ERROR", "Cancellation reason must be at least 5 characters");
  }
  return sequelize.transaction(async (transaction) => {
    const order = await SalesOrder.findOne({
      where: { tenant_id: tenantId, warehouse_id: warehouseId, so_id: clean(orderId) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found");
    if (order.status !== "draft") {
      throw new ApiError(409, "ORDER_NOT_CANCELLABLE", "Only draft orders can be cancelled");
    }
    order.status = "cancelled";
    order.cancelled_at = new Date();
    order.cancellation_reason = reason;
    order.updated_at = new Date();
    await order.save({ transaction });
    return getOrderRecord(tenantId, warehouseId, order.so_id, transaction);
  });
}

async function releaseOrder(context, orderId) {
  const { tenantId, warehouseId } = scope(context);
  return sequelize.transaction(async (transaction) => {
    await sequelize.query(
      "SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))",
      { replacements: { key: `outbound-release:${tenantId}:${warehouseId}:${orderId}` }, transaction }
    );
    const order = await SalesOrder.findOne({
      where: { tenant_id: tenantId, warehouse_id: warehouseId, so_id: clean(orderId) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Order not found");
    if (order.status !== "draft") {
      const existingWave = await PickWave.findOne({
        where: { tenant_id: tenantId, warehouse_id: warehouseId },
        include: [{ model: PickTask, as: "tasks", required: true, where: { so_id: order.so_id } }],
        transaction,
      });
      if (existingWave) {
        return {
          order: await getOrderRecord(tenantId, warehouseId, order.so_id, transaction),
          pickList: await getPickList(tenantId, warehouseId, existingWave.wave_id, transaction),
          idempotent: true,
        };
      }
      throw new ApiError(409, "ORDER_NOT_RELEASABLE", `Cannot release order with status '${order.status}'`);
    }

    const lines = await SalesOrderLine.findAll({
      where: { tenant_id: tenantId, so_id: order.so_id },
      order: [["line_no", "ASC"]],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!lines.length) throw new ApiError(400, "ORDER_LINES_REQUIRED", "Cannot release an order with no line items");

    const waveId = await nextId(PickWave, "wave_id", "WAV", transaction);
    await PickWave.create({
      tenant_id: tenantId,
      wave_id: waveId,
      warehouse_id: warehouseId,
      status: "released",
      created_at: new Date(),
      created_by: context.userId,
    }, { transaction });

    for (const line of lines) {
      let remaining = number(line.ordered_qty);
      const balances = await InventoryBalance.findAll({
        where: {
          tenant_id: tenantId,
          warehouse_id: warehouseId,
          sku_id: line.sku_id,
          [Op.and]: sequelize.literal("(qty_on_hand - qty_reserved - qty_quarantine) > 0"),
        },
        order: [
          [sequelize.literal("(qty_on_hand - qty_reserved - qty_quarantine)"), "DESC"],
          ["location_id", "ASC"],
        ],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const availableTotal = balances.reduce(
        (sum, balance) => sum + number(balance.qty_on_hand) - number(balance.qty_reserved) - number(balance.qty_quarantine),
        0
      );
      if (availableTotal < remaining) {
        throw new ApiError(
          409,
          "INSUFFICIENT_AVAILABLE_STOCK",
          `Insufficient available stock for SKU ${line.sku_id}`
        );
      }
      for (const balance of balances) {
        if (remaining <= 0) break;
        const available = number(balance.qty_on_hand) - number(balance.qty_reserved) - number(balance.qty_quarantine);
        const allocated = Math.min(available, remaining);
        if (allocated <= 0) continue;
        balance.qty_reserved = number(balance.qty_reserved) + allocated;
        balance.updated_at = new Date();
        await balance.save({ transaction });
        await PickTask.create({
          tenant_id: tenantId,
          pick_task_id: await nextId(PickTask, "pick_task_id", "PIC", transaction),
          warehouse_id: warehouseId,
          wave_id: waveId,
          so_id: order.so_id,
          so_line_id: line.so_line_id,
          sku_id: line.sku_id,
          from_location_id: balance.location_id,
          lot_no: balance.lot_no,
          serial_no: balance.serial_no,
          qty: allocated,
          picked_qty: 0,
          status: "open",
          created_at: new Date(),
          updated_at: new Date(),
        }, { transaction });
        remaining -= allocated;
      }
      line.allocated_qty = number(line.ordered_qty);
      await line.save({ transaction });
    }
    order.status = "allocated";
    order.updated_at = new Date();
    await order.save({ transaction });
    return {
      order: await getOrderRecord(tenantId, warehouseId, order.so_id, transaction),
      pickList: await getPickList(tenantId, warehouseId, waveId, transaction),
      idempotent: false,
    };
  });
}

async function listPickingTasks(context, input = {}) {
  const { tenantId, warehouseId } = scope(context);
  const params = pagination(input);
  const operatorUserId = isOperatorContext(context) ? context.userId : null;
  return listPickLists({
    tenantId,
    warehouseId,
    ...params,
    assignedUser: operatorUserId ? context.userId : clean(input.assigned_user || input.assignee),
    operatorUserId,
  });
}

async function getPickingTask(context, waveId) {
  const { tenantId, warehouseId } = scope(context);
  const operatorUserId = isOperatorContext(context) ? context.userId : null;
  return getPickList(tenantId, warehouseId, clean(waveId), null, null, operatorUserId);
}

async function getPickingOperators(context) {
  const { tenantId, warehouseId } = scope(context);
  return listOperators(tenantId, warehouseId);
}

async function validateOperator(tenantId, warehouseId, userId, transaction) {
  const user = await User.findOne({
    where: { tenant_id: tenantId, user_id: userId, is_active: true },
    transaction,
  });
  if (!user) throw new ApiError(400, "INVALID_OPERATOR", "Selected operator is invalid or inactive");
  const role = await UserRole.findOne({
    where: { tenant_id: tenantId, user_id: userId, role_id: { [Op.in]: [...OPERATOR_ROLES] } },
    transaction,
  });
  const membership = await UserWarehouse.findOne({
    where: { tenant_id: tenantId, user_id: userId, warehouse_id: warehouseId },
    transaction,
  });
  if (!role || !membership) {
    throw new ApiError(400, "INVALID_OPERATOR", "Selected user must be an operational warehouse user");
  }
  return user;
}

async function assignPickingTask(context, waveId, assignedToUserId) {
  const { tenantId, warehouseId } = scope(context);
  return sequelize.transaction(async (transaction) => {
    const user = await validateOperator(tenantId, warehouseId, clean(assignedToUserId), transaction);
    const tasks = await PickTask.findAll({
      where: { tenant_id: tenantId, warehouse_id: warehouseId, wave_id: clean(waveId) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!tasks.length) throw new ApiError(404, "PICK_LIST_NOT_FOUND", "Pick list not found");
    assertPickListAssignable(tasks);
    await PickTask.update(
      { assigned_to_user_id: user.user_id, status: "assigned", updated_at: new Date() },
      { where: { tenant_id: tenantId, warehouse_id: warehouseId, wave_id: clean(waveId) }, transaction }
    );
    return getPickList(tenantId, warehouseId, clean(waveId), transaction);
  });
}

async function updatePickLine(context, waveId, taskId, qtyValue) {
  const { tenantId, warehouseId } = scope(context);
  return sequelize.transaction(async (transaction) => {
    const task = await PickTask.findOne({
      where: {
        tenant_id: tenantId,
        warehouse_id: warehouseId,
        wave_id: clean(waveId),
        pick_task_id: clean(taskId),
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!task) throw new ApiError(404, "PICK_TASK_NOT_FOUND", "Pick task not found");
    if (!task.assigned_to_user_id) throw new ApiError(409, "PICK_TASK_NOT_ASSIGNED", "Pick task must be assigned");
    if (OPERATOR_ROLES.has(String(context.roles?.[0] || "")) && task.assigned_to_user_id !== context.userId) {
      throw new ApiError(403, "FORBIDDEN", "Pick task is assigned to another operator");
    }
    const qty = Number(qtyValue);
    if (!Number.isFinite(qty) || qty < 0 || qty > number(task.qty)) {
      throw new ApiError(400, "INVALID_PICK_QUANTITY", `Picked quantity must be between 0 and ${number(task.qty)}`);
    }
    task.picked_qty = qty;
    task.status = qty >= number(task.qty) ? "done" : qty > 0 ? "in_progress" : "assigned";
    task.started_at = qty > 0 ? task.started_at || new Date() : task.started_at;
    task.completed_at = qty >= number(task.qty) ? new Date() : null;
    task.picked_by = qty > 0 ? context.userId : null;
    task.updated_at = new Date();
    await task.save({ transaction });
    const tasks = await PickTask.findAll({
      where: { tenant_id: tenantId, warehouse_id: warehouseId, wave_id: clean(waveId) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const finalization = await finalizePickingWaveIfComplete(context, tenantId, warehouseId, clean(waveId), tasks, transaction);
    return {
      ...task.get({ plain: true }),
      ...(finalization ? { pick_list: finalization.pick_list, packing_task: finalization.packing_task } : {}),
    };
  });
}

async function createPackingForWave(tenantId, warehouseId, waveId, soId, userId, transaction) {
  let packing = await PackingTask.findOne({
    where: { tenant_id: tenantId, warehouse_id: warehouseId, so_id: soId, wave_id: waveId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!packing) {
    packing = await PackingTask.create({
      tenant_id: tenantId,
      pack_task_id: await nextId(PackingTask, "pack_task_id", "PAC", transaction),
      warehouse_id: warehouseId,
      so_id: soId,
      wave_id: waveId,
      status: "pending",
      created_at: new Date(),
      updated_at: new Date(),
      notes: `Generated from pick wave ${waveId}`,
    }, { transaction });
  }
  return packing;
}

async function generatePackingCarton(context, packId) {
  const { tenantId, warehouseId } = scope(context);
  return sequelize.transaction(async (transaction) => {
    const pack = await PackingTask.findOne({
      where: { tenant_id: tenantId, warehouse_id: warehouseId, pack_task_id: clean(packId) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!pack) throw new ApiError(404, "PACKING_TASK_NOT_FOUND", "Packing task not found");
    const tasks = await PickTask.findAll({
      where: { tenant_id: tenantId, warehouse_id: warehouseId, wave_id: pack.wave_id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!tasks.length) {
      throw new ApiError(409, "PACKING_NOT_READY", "Packing task is not ready for carton generation");
    }
    assertPackingOwner(tasks, pack, context.userId);
    if (pack.carton_id) {
      return {
        packing_task: await getPackingTask(tenantId, warehouseId, pack.pack_task_id, transaction),
        idempotent: true,
      };
    }
    if (!CONFIRMABLE_PACK_STATUSES.has(String(pack.status || "").toLowerCase())) {
      throw new ApiError(409, "PACKING_NOT_GENERATABLE", `Cannot generate carton for packing status '${pack.status}'`);
    }
    pack.carton_id = await nextId(PackingTask, "carton_id", "CTN", transaction);
    pack.status = "carton_generated";
    pack.updated_at = new Date();
    await pack.save({ transaction });
    return {
      packing_task: await getPackingTask(tenantId, warehouseId, pack.pack_task_id, transaction),
      idempotent: false,
    };
  });
}

async function finalizePickingWaveIfComplete(context, tenantId, warehouseId, waveId, tasks, transaction) {
  if (!tasks.length) return null;
  if (tasks.some((task) => !task.assigned_to_user_id)) return null;
  if (tasks.some((task) => number(task.picked_qty) < number(task.qty))) return null;

  const now = new Date();
  await PickTask.update(
    { status: "done", completed_at: now, picked_by: context.userId, updated_at: now },
    { where: { tenant_id: tenantId, warehouse_id: warehouseId, wave_id: clean(waveId) }, transaction }
  );

  const wave = await PickWave.findOne({
    where: { tenant_id: tenantId, warehouse_id: warehouseId, wave_id: clean(waveId) },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!wave) throw new ApiError(404, "PICK_LIST_NOT_FOUND", "Pick list not found");
  wave.status = "completed";
  wave.updated_at = now;
  await wave.save({ transaction });

  const soId = tasks[0].so_id;
  await SalesOrder.update(
    { status: "picking", updated_at: now },
    { where: { tenant_id: tenantId, warehouse_id: warehouseId, so_id: soId }, transaction }
  );

  const packing = await createPackingForWave(tenantId, warehouseId, clean(waveId), soId, context.userId, transaction);
  return {
    pick_list: await getPickList(tenantId, warehouseId, clean(waveId), transaction),
    packing_task: await getPackingTask(tenantId, warehouseId, packing.pack_task_id, transaction),
  };
}

async function completePickingTask(context, waveId) {
  const { tenantId, warehouseId } = scope(context);
  return sequelize.transaction(async (transaction) => {
    const wave = await PickWave.findOne({
      where: { tenant_id: tenantId, warehouse_id: warehouseId, wave_id: clean(waveId) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!wave) throw new ApiError(404, "PICK_LIST_NOT_FOUND", "Pick list not found");
    const tasks = await PickTask.findAll({
      where: { tenant_id: tenantId, warehouse_id: warehouseId, wave_id: clean(waveId) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!tasks.length) throw new ApiError(404, "PICK_LIST_NOT_FOUND", "Pick list not found");
    assertPickingExecutionOwner(tasks, context, { allowCompleted: true });
    if (tasks.some((task) => number(task.picked_qty) < number(task.qty))) {
      throw new ApiError(409, "PICK_LIST_INCOMPLETE", "Not all pick task quantities have been completed");
    }
    return finalizePickingWaveIfComplete(context, tenantId, warehouseId, clean(waveId), tasks, transaction);
  });
}

async function updatePickingStatus(context, waveId, status) {
  const normalized = clean(status).toLowerCase();
  if (["picked", "completed", "done"].includes(normalized)) {
    const { tenantId, warehouseId } = scope(context);
    await sequelize.transaction(async (transaction) => {
      const tasks = await PickTask.findAll({
        where: { tenant_id: tenantId, warehouse_id: warehouseId, wave_id: clean(waveId) },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!tasks.length) throw new ApiError(404, "PICK_LIST_NOT_FOUND", "Pick list not found");
      assertPickingExecutionOwner(tasks, context);
      for (const task of tasks) {
        task.picked_qty = task.qty;
        task.status = "done";
        task.started_at = task.started_at || new Date();
        task.completed_at = new Date();
        task.picked_by = context.userId;
        task.updated_at = new Date();
        await task.save({ transaction });
      }
    });
    return completePickingTask(context, waveId);
  }
  const { tenantId, warehouseId } = scope(context);
  const mappedStatus = normalized === "picking" ? "in_progress" : normalized;
  if (!["assigned", "in_progress"].includes(mappedStatus)) {
    throw new ApiError(400, "INVALID_PICK_STATUS", "Unsupported pick status transition");
  }
  return sequelize.transaction(async (transaction) => {
    const tasks = await PickTask.findAll({
      where: { tenant_id: tenantId, warehouse_id: warehouseId, wave_id: clean(waveId) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!tasks.length) throw new ApiError(404, "PICK_LIST_NOT_FOUND", "Pick list not found");
    assertPickingExecutionOwner(tasks, context);
    await PickTask.update(
      { status: mappedStatus, started_at: new Date(), updated_at: new Date() },
      { where: { tenant_id: tenantId, warehouse_id: warehouseId, wave_id: clean(waveId) }, transaction }
    );
    return getPickList(tenantId, warehouseId, clean(waveId), transaction);
  });
}

async function listPacking(context, input = {}) {
  const { tenantId, warehouseId } = scope(context);
  const operatorUserId = isOperatorContext(context) ? context.userId : null;
  return listPackingTasks({
    tenantId,
    warehouseId,
    ...packingPagination(input),
    assignedUser: operatorUserId ? context.userId : clean(input.assigned_picker || input.assigned_user),
    operatorUserId,
  });
}

async function getPacking(context, packId) {
  const { tenantId, warehouseId } = scope(context);
  const operatorUserId = isOperatorContext(context) ? context.userId : null;
  return getPackingTask(tenantId, warehouseId, clean(packId), null, null, operatorUserId);
}

async function confirmPacking(context, packId, payload = {}) {
  const { tenantId, warehouseId } = scope(context);
  const weight = positiveQty(payload.weight_kg, "Weight");
  const packagingType = clean(payload.packaging_type);
  if (!packagingType) throw new ApiError(400, "VALIDATION_ERROR", "Packaging type is required");
  return sequelize.transaction(async (transaction) => {
    const pack = await PackingTask.findOne({
      where: { tenant_id: tenantId, warehouse_id: warehouseId, pack_task_id: clean(packId) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!pack) throw new ApiError(404, "PACKING_TASK_NOT_FOUND", "Packing task not found");
    const tasks = await PickTask.findAll({
      where: { tenant_id: tenantId, warehouse_id: warehouseId, wave_id: pack.wave_id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    assertPackingOwner(tasks, pack, context.userId);
    if (pack.status === "packed") {
      const existing = await Shipment.findOne({
        where: { tenant_id: tenantId, warehouse_id: warehouseId, so_id: pack.so_id },
        transaction,
      });
      return {
        packing_task: await getPackingTask(tenantId, warehouseId, pack.pack_task_id, transaction),
        shipment: existing ? await getShipment(tenantId, warehouseId, existing.shipment_id, transaction) : null,
        idempotent: true,
      };
    }
    if (!["pending", "in_progress", "carton_generated"].includes(pack.status)) {
      throw new ApiError(409, "PACKING_NOT_CONFIRMABLE", `Cannot confirm packing with status '${pack.status}'`);
    }
    if (!tasks.length || tasks.some((task) => !["done", "completed"].includes(task.status))) {
      throw new ApiError(409, "PICKING_NOT_COMPLETED", "Packing requires completed picking");
    }
    const now = new Date();
    const requestedCartonId = clean(payload.carton_id);
    if (requestedCartonId && !CARTON_LABEL_PATTERN.test(requestedCartonId)) {
      throw new ApiError(400, "INVALID_CARTON_ID", "Invalid carton label. Please scan a carton QR label.");
    }
    if (pack.carton_id && requestedCartonId && String(pack.carton_id).toUpperCase() !== requestedCartonId.toUpperCase()) {
      throw new ApiError(409, "PACKING_CARTON_MISMATCH", "Carton ID mismatch. Please scan the assigned carton label.");
    }
    pack.carton_id = pack.carton_id || requestedCartonId || await nextId(PackingTask, "carton_id", "CTN", transaction);
    pack.packaging_type = packagingType;
    pack.weight_kg = weight;
    pack.status = "packed";
    pack.packed_by = context.userId;
    pack.packed_at = now;
    pack.updated_at = now;
    await pack.save({ transaction });
    let shipment = await Shipment.findOne({
      where: { tenant_id: tenantId, warehouse_id: warehouseId, so_id: pack.so_id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!shipment) {
      shipment = await Shipment.create({
        tenant_id: tenantId,
        shipment_id: await nextId(Shipment, "shipment_id", "SHI", transaction),
        warehouse_id: warehouseId,
        so_id: pack.so_id,
        pack_task_id: pack.pack_task_id,
        status: "packed",
        created_at: now,
        created_by: context.userId,
        updated_at: now,
      }, { transaction });
    }
    await SalesOrder.update(
      { status: "packed", updated_at: now },
      { where: { tenant_id: tenantId, warehouse_id: warehouseId, so_id: pack.so_id }, transaction }
    );
    return {
      packing_task: await getPackingTask(tenantId, warehouseId, pack.pack_task_id, transaction),
      shipment: await getShipment(tenantId, warehouseId, shipment.shipment_id, transaction),
      idempotent: false,
    };
  });
}

async function listShipping(context, input = {}) {
  const { tenantId, warehouseId } = scope(context);
  return listShipments({ tenantId, warehouseId, ...pagination(input) });
}

async function getShipping(context, shipmentId) {
  const { tenantId, warehouseId } = scope(context);
  return getShipment(tenantId, warehouseId, clean(shipmentId));
}

async function dispatchShipment(context, shipmentId, payload = {}) {
  const { tenantId, warehouseId } = scope(context);
  const carrier = clean(payload.carrier);
  const trackingNo = clean(payload.tracking_no || payload.trackingNo);
  if (!carrier) throw new ApiError(400, "VALIDATION_ERROR", "Carrier is required");
  if (!trackingNo) throw new ApiError(400, "VALIDATION_ERROR", "Tracking number is required");
  return sequelize.transaction(async (transaction) => {
    await sequelize.query(
      "SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))",
      { replacements: { key: `shipment-dispatch:${tenantId}:${warehouseId}:${shipmentId}` }, transaction }
    );
    const shipment = await Shipment.findOne({
      where: { tenant_id: tenantId, warehouse_id: warehouseId, shipment_id: clean(shipmentId) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!shipment) throw new ApiError(404, "SHIPMENT_NOT_FOUND", "Shipment not found");
    if (["dispatched", "closed", "delivered"].includes(shipment.status)) {
      return { shipment: await getShipment(tenantId, warehouseId, shipment.shipment_id, transaction), idempotent: true };
    }
    if (!["packed", "carton_generated"].includes(shipment.status)) {
      throw new ApiError(409, "SHIPMENT_NOT_DISPATCHABLE", `Cannot dispatch shipment with status '${shipment.status}'`);
    }
    const tasks = await PickTask.findAll({
      where: { tenant_id: tenantId, warehouse_id: warehouseId, so_id: shipment.so_id },
      transaction,
      lock: transaction.LOCK.UPDATE,
      order: [["pick_task_id", "ASC"]],
    });
    if (!tasks.length || tasks.some((task) => !["done", "completed"].includes(task.status))) {
      throw new ApiError(409, "PICKING_NOT_COMPLETED", "Shipment requires completed picking");
    }
    for (const task of tasks) {
      const postingKey = `shipment:${shipment.shipment_id}:${task.pick_task_id}`;
      const existing = await InventoryTransaction.findOne({
        where: { tenant_id: tenantId, reference_type: "shipment", reference_id: shipment.shipment_id, posting_key: postingKey },
        transaction,
      });
      if (existing) continue;
      const balance = await InventoryBalance.findOne({
        where: {
          tenant_id: tenantId,
          warehouse_id: warehouseId,
          sku_id: task.sku_id,
          location_id: task.from_location_id,
          lot_no: task.lot_no,
          serial_no: task.serial_no,
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const qty = number(task.qty);
      if (!balance || number(balance.qty_on_hand) < qty || number(balance.qty_reserved) < qty) {
        throw new ApiError(409, "OUTBOUND_STOCK_MISMATCH", `Reserved stock is not available for pick task ${task.pick_task_id}`);
      }
      balance.qty_on_hand = number(balance.qty_on_hand) - qty;
      balance.qty_reserved = number(balance.qty_reserved) - qty;
      balance.updated_at = new Date();
      await balance.save({ transaction });
      const itxId = await nextId(InventoryTransaction, "itx_id", "ITX", transaction);
      await InventoryTransaction.create({
        tenant_id: tenantId,
        itx_id: itxId,
        txn_id: itxId,
        warehouse_id: warehouseId,
        sku_id: task.sku_id,
        from_location_id: task.from_location_id,
        to_location_id: null,
        lot_no: task.lot_no,
        serial_no: task.serial_no,
        qty,
        transaction_type: "issue",
        tx_type: "SHIP",
        txn_type: "SHIP",
        reference_type: "shipment",
        reference_id: shipment.shipment_id,
        ref_type: "shipment",
        ref_id: shipment.shipment_id,
        posting_key: postingKey,
        notes: `Outbound shipment ${shipment.shipment_id}`,
        created_by: context.userId,
        created_at: new Date(),
        tx_at: new Date(),
      }, { transaction });
    }
    const now = new Date();
    shipment.carrier = carrier;
    shipment.tracking_no = trackingNo;
    shipment.ship_date = now.toISOString().slice(0, 10);
    shipment.status = "dispatched";
    shipment.dispatched_at = now;
    shipment.dispatched_by = context.userId;
    shipment.updated_at = now;
    await shipment.save({ transaction });
    await SalesOrderLine.update(
      { shipped_qty: sequelize.col("allocated_qty") },
      { where: { tenant_id: tenantId, so_id: shipment.so_id }, transaction }
    );
    await SalesOrder.update(
      { status: "shipped", updated_at: now },
      { where: { tenant_id: tenantId, warehouse_id: warehouseId, so_id: shipment.so_id }, transaction }
    );
    if (shipment.pack_task_id) {
      await PackingTask.update(
        { status: "shipped", updated_at: now },
        { where: { tenant_id: tenantId, warehouse_id: warehouseId, pack_task_id: shipment.pack_task_id }, transaction }
      );
    }
    return { shipment: await getShipment(tenantId, warehouseId, shipment.shipment_id, transaction), idempotent: false };
  });
}

async function closeShipment(context, shipmentId) {
  const { tenantId, warehouseId } = scope(context);
  return sequelize.transaction(async (transaction) => {
    const shipment = await Shipment.findOne({
      where: { tenant_id: tenantId, warehouse_id: warehouseId, shipment_id: clean(shipmentId) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!shipment) throw new ApiError(404, "SHIPMENT_NOT_FOUND", "Shipment not found");
    if (shipment.status !== "dispatched") throw new ApiError(409, "SHIPMENT_NOT_CLOSABLE", "Only dispatched shipments can be closed");
    shipment.status = "closed";
    shipment.closed_at = new Date();
    shipment.updated_at = new Date();
    await shipment.save({ transaction });
    await SalesOrder.update(
      { status: "completed", updated_at: new Date() },
      { where: { tenant_id: tenantId, warehouse_id: warehouseId, so_id: shipment.so_id }, transaction }
    );
    return getShipment(tenantId, warehouseId, shipment.shipment_id, transaction);
  });
}

async function cancelShipment(context, shipmentId, reasonValue) {
  const { tenantId, warehouseId } = scope(context);
  const reason = clean(reasonValue);
  if (reason.length < 5) throw new ApiError(400, "VALIDATION_ERROR", "Cancellation reason must be at least 5 characters");
  return sequelize.transaction(async (transaction) => {
    const shipment = await Shipment.findOne({
      where: { tenant_id: tenantId, warehouse_id: warehouseId, shipment_id: clean(shipmentId) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!shipment) throw new ApiError(404, "SHIPMENT_NOT_FOUND", "Shipment not found");
    if (!["planned", "pending", "packed", "carton_generated"].includes(shipment.status)) {
      throw new ApiError(409, "SHIPMENT_NOT_CANCELLABLE", `Cannot cancel shipment with status '${shipment.status}'`);
    }
    const tasks = await PickTask.findAll({
      where: { tenant_id: tenantId, warehouse_id: warehouseId, so_id: shipment.so_id },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    for (const task of tasks) {
      const balance = await InventoryBalance.findOne({
        where: {
          tenant_id: tenantId,
          warehouse_id: warehouseId,
          sku_id: task.sku_id,
          location_id: task.from_location_id,
          lot_no: task.lot_no,
          serial_no: task.serial_no,
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (balance) {
        balance.qty_reserved = Math.max(0, number(balance.qty_reserved) - number(task.qty));
        balance.updated_at = new Date();
        await balance.save({ transaction });
      }
      task.status = "cancelled";
      task.updated_at = new Date();
      await task.save({ transaction });
    }
    shipment.status = "cancelled";
    shipment.cancelled_at = new Date();
    shipment.cancellation_reason = reason;
    shipment.updated_at = new Date();
    await shipment.save({ transaction });
    await SalesOrder.update(
      { status: "cancelled", cancelled_at: new Date(), cancellation_reason: reason, updated_at: new Date() },
      { where: { tenant_id: tenantId, warehouse_id: warehouseId, so_id: shipment.so_id }, transaction }
    );
    return getShipment(tenantId, warehouseId, shipment.shipment_id, transaction);
  });
}

export {
  CONTROL_ROLES,
  OPERATOR_ROLES,
  ORDER_ROLES,
  VIEW_ROLES,
  addOrderLine,
  assignPickingTask,
  cancelOrder,
  cancelShipment,
  closeShipment,
  completePickingTask,
  generatePackingCarton,
  confirmPacking,
  createOrder,
  deleteOrder,
  dispatchShipment,
  getOrder,
  getPacking,
  getPickingOperators,
  getPickingTask,
  getShipping,
  listOrders,
  listPacking,
  listPickingTasks,
  listShipping,
  releaseOrder,
  updateOrder,
  updatePickLine,
  updatePickingStatus,
};
