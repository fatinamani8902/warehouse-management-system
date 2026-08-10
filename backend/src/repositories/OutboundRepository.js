import { Op, QueryTypes, Sequelize } from "sequelize";
import {
  Customer,
  InventoryBalance,
  InventoryTransaction,
  Location,
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
  sequelize,
} from "../models/index.js";
import { ApiError } from "../utils/errors.js";

function requiredScope(tenantId, warehouseId) {
  const tenant = String(tenantId || "").trim();
  const warehouse = String(warehouseId || "").trim();
  if (!tenant) throw new ApiError(403, "TENANT_CONTEXT_REQUIRED", "Tenant context is required");
  if (!warehouse) throw new ApiError(403, "WAREHOUSE_CONTEXT_REQUIRED", "Warehouse context is required");
  return { tenantId: tenant, warehouseId: warehouse };
}

function plain(row) {
  return row?.get ? row.get({ plain: true }) : row;
}

function number(value) {
  return Number(value || 0);
}

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const item = plain(row);
    const value = item?.[key];
    if (!value) continue;
    if (!map.has(value)) map.set(value, []);
    map.get(value).push(item);
  }
  return map;
}

function pickListStatusScopeCte(alias = "picking_statuses") {
  return `${alias} AS (
       SELECT
         pick_wave.wave_id,
         pick_wave.created_at,
         pick_wave.created_by,
         CASE
           WHEN bool_and(lower(pick_task.status) IN ('done', 'completed')) THEN 'picked'
           WHEN bool_or(lower(pick_task.status) IN ('in_progress', 'picking')) THEN 'in_progress'
           WHEN bool_or(lower(pick_task.status) = 'assigned') THEN 'assigned'
           WHEN lower(pick_wave.status) IN ('released', 'pending', 'draft') THEN 'open'
           ELSE lower(pick_wave.status)
         END AS status
       FROM public.pick_waves pick_wave
       JOIN public.pick_tasks pick_task
         ON pick_task.tenant_id = pick_wave.tenant_id
        AND pick_task.warehouse_id = pick_wave.warehouse_id
        AND pick_task.wave_id = pick_wave.wave_id
       WHERE pick_wave.tenant_id = $1
         AND pick_wave.warehouse_id = $2
       GROUP BY pick_wave.wave_id, pick_wave.created_at, pick_wave.created_by, lower(pick_wave.status)
     )`;
}

function packingActiveStatusSql() {
  return "'pending', 'carton_generated', 'in_progress'";
}

function shippingReadyToDispatchStatusSql() {
  return "'packed', 'carton_generated'";
}

async function nextId(model, field, prefix, transaction) {
  await sequelize.query(
    "SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))",
    { replacements: { key: `outbound-id:${prefix}` }, transaction }
  );
  const rows = await model.findAll({ attributes: [field], transaction, raw: true });
  const max = rows.reduce((current, row) => {
    const match = new RegExp(`^${prefix}(\\d+)$`).exec(String(row[field] || ""));
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);
  return `${prefix}${String(max + 1).padStart(6, "0")}`;
}

function deriveOrderStatus(order, tasks = [], packingTask = null, shipment = null) {
  const orderStatus = String(order?.status || "").toLowerCase();
  const shipmentStatus = String(shipment?.status || "").toLowerCase();
  const packingStatus = String(packingTask?.status || "").toLowerCase();
  const taskStatuses = tasks.map((task) => String(task?.status || "").toLowerCase());
  const anyPicked = tasks.some((task) => number(task?.picked_qty) > 0);
  const allPicked = tasks.length > 0 && tasks.every((task) => ["done", "completed"].includes(String(task?.status || "").toLowerCase()));

  if (["dispatched", "closed", "delivered"].includes(shipmentStatus)) {
    return shipmentStatus === "dispatched" ? "shipped" : "completed";
  }
  if (packingStatus === "packed") return "packed";
  if (allPicked || anyPicked || taskStatuses.some((status) => ["done", "completed"].includes(status))) {
    return "picking";
  }
  if (orderStatus === "allocated") return "released";
  if (["released", "picking", "packed", "shipped", "completed", "cancelled"].includes(orderStatus)) {
    return orderStatus;
  }
  if (tasks.length) return "released";
  return orderStatus || "draft";
}

function mapOrder(row, context = {}) {
  const order = plain(row);
  const customer = plain(order.customer);
  const tasks = Array.isArray(context.tasks) ? context.tasks : [];
  const pickedQtyByLine = context.pickedQtyByLine || new Map();
  const lines = (order.lines || []).map((item) => {
    const line = plain(item);
    const sku = plain(line.sku);
    const pickedQty = pickedQtyByLine.has(line.so_line_id)
      ? pickedQtyByLine.get(line.so_line_id)
      : number(line.allocated_qty);
    return {
      ...line,
      sku_name: sku?.description || null,
      product_name: sku?.description || null,
      description: sku?.description || null,
      sku_description: sku?.description || null,
      category: sku?.category || null,
      picked_qty: pickedQty,
    };
  });
  const status = deriveOrderStatus(order, tasks, context.packingTask || null, context.shipment || null);
  return {
    ...order,
    status,
    workflow_status: status,
    order_id: order.so_id,
    customer_name: customer?.customer_name || order.customer_name || order.customer_id,
    ship_by: order.ship_by_date,
    required_ship_by: order.ship_by_date,
    lines,
    lines_count: lines.length,
  };
}

function mapPickList(waveRow, tasks = [], order = null) {
  const wave = plain(waveRow);
  const mappedTasks = tasks.map((item, index) => {
    const task = plain(item);
    const sku = plain(task.sku);
    const location = plain(task.sourceLocation);
    return {
      ...task,
      line_id: task.pick_task_id,
      pick_task_id: task.pick_task_id,
      line_no: index + 1,
      location_id: task.from_location_id,
      location_code: location?.location_code || null,
      qty_required: number(task.qty),
      qty_picked: number(task.picked_qty),
      scan_count: number(task.picked_qty),
      sku_name: sku?.description || null,
      product_name: sku?.description || null,
      description: sku?.description || null,
      sku_description: sku?.description || null,
      category: sku?.category || null,
      status: ["done", "completed"].includes(task.status) ? "picked" : task.status,
    };
  });
  const assigned = tasks.find((task) => task.assigned_to_user_id);
  const assignedUser = plain(assigned?.assignedUser);
  const assignedUserId = assigned?.assigned_to_user_id || null;
  const assignedUserName = assignedUser?.user_name || null;
  const assignedUserDisplay = assignedUserName && assignedUserId
    ? `${assignedUserName} (${assignedUserId})`
    : assignedUserName || assignedUserId;
  const statuses = new Set(tasks.map((task) => String(task.status)));
  let status = ["released", "pending", "draft"].includes(String(wave.status || "").toLowerCase())
    ? "open"
    : wave.status;
  if (statuses.size && [...statuses].every((value) => ["done", "completed"].includes(value))) status = "completed";
  else if (statuses.has("in_progress") || statuses.has("picking")) status = "in_progress";
  else if (statuses.has("assigned")) status = "assigned";
  return {
    ...wave,
    pick_list_id: wave.wave_id,
    wave_id: wave.wave_id,
    order_id: tasks[0]?.so_id || order?.so_id || null,
    order_ref: tasks[0]?.so_id || order?.so_id || null,
    so_id: tasks[0]?.so_id || order?.so_id || null,
    pick_task_ids: tasks.map((task) => task.pick_task_id),
    assigned_to_user_id: assignedUserId,
    assigned_to: assignedUserId,
    assigned_to_user_name: assignedUserName,
    assigned_user_name: assignedUserName,
    assigned_to_user_display: assignedUserDisplay,
    assigned_user_display: assignedUserDisplay,
    status,
    started_at: tasks.find((task) => task.started_at)?.started_at || null,
    completed_at: tasks.find((task) => task.completed_at)?.completed_at || null,
    lines: mappedTasks,
    lines_count: mappedTasks.length,
    customer_name: order?.customer?.customer_name || null,
  };
}

function mapPacking(row, tasks = []) {
  const pack = plain(row);
  const order = plain(pack.order);
  const customer = plain(order?.customer);
  const packedByUser = plain(pack.packedByUser);
  const packedByUserId = packedByUser?.user_id || pack.packed_by || null;
  const packedByUserName = packedByUser?.user_name || null;
  const packedByUserDisplay = packedByUserName && packedByUserId
    ? `${packedByUserName} (${packedByUserId})`
    : packedByUserName || packedByUserId;
  const assigned = tasks.find((task) => task.assigned_to_user_id);
  const assignedUser = plain(assigned?.assignedUser);
  const assignedUserId = assigned?.assigned_to_user_id || null;
  const assignedUserName = assignedUser?.user_name || null;
  const assignedUserDisplay = assignedUserName && assignedUserId
    ? `${assignedUserName} (${assignedUserId})`
    : assignedUserName || assignedUserId;
  return {
    ...pack,
    pack_id: pack.pack_task_id,
    order_id: pack.so_id,
    order_ref: pack.so_id,
    sales_order_id: pack.so_id,
    customer_id: order?.customer_id || null,
    customer_name: customer?.customer_name || null,
    packed_by_user_id: packedByUserId,
    packed_by_user_name: packedByUserName,
    packed_by_user_display: packedByUserDisplay,
    packed_by_display: packedByUserDisplay,
    assigned_to_user_id: assignedUserId,
    assigned_to: assignedUserId,
    assigned_to_user_name: assignedUserName,
    assigned_user_name: assignedUserName,
    assigned_to_user_display: assignedUserDisplay,
    assigned_user_display: assignedUserDisplay,
    pick_list_id: pack.wave_id,
    pick_list_status: tasks.length && tasks.every((task) => ["done", "completed"].includes(task.status))
      ? "completed"
      : tasks.some((task) => ["in_progress", "picking"].includes(task.status))
        ? "picking"
        : "open",
    lines: tasks.map((item, index) => {
      const task = plain(item);
      const sku = plain(task.sku);
      const location = plain(task.sourceLocation);
      return {
        line_id: task.pick_task_id,
        line_no: index + 1,
        sku_id: task.sku_id,
        sku_name: sku?.description || null,
        product_name: sku?.description || null,
        description: sku?.description || null,
        sku_description: sku?.description || null,
        location_id: task.from_location_id,
        location_code: location?.location_code || null,
        qty: number(task.qty),
        qty_required: number(task.qty),
        qty_picked: number(task.picked_qty),
      };
    }),
  };
}

function mapShipment(row, order = null, pack = null, tasks = [], dispatcher = null) {
  const shipment = plain(row);
  return {
    ...shipment,
    order_id: shipment.so_id,
    sales_order_id: shipment.so_id,
    customer_id: order?.customer_id || null,
    customer_name: order?.customer?.customer_name || null,
    shipment_date: shipment.ship_date || shipment.dispatched_at || shipment.created_at || null,
    ship_by: order?.ship_by_date || null,
    required_ship_by: order?.ship_by_date || null,
    dispatch_due_at: order?.ship_by_date || null,
    dispatched_by_name: dispatcher?.user_name || null,
    pack_ids: pack ? [pack.pack_task_id] : [],
    items: tasks.map((item) => {
      const task = plain(item);
      const sku = plain(task.sku);
      const location = plain(task.sourceLocation);
      return {
        sku_id: task.sku_id,
        sku_name: sku?.description || null,
        product_name: sku?.description || null,
        description: sku?.description || null,
        sku_description: sku?.description || null,
        location_id: task.from_location_id,
        location_code: location?.location_code || null,
        qty: number(task.qty),
        pack_id: pack?.pack_task_id || null,
      };
    }),
  };
}

function returnTotalsByShipmentSku(returnRows = []) {
  const totals = new Map();
  for (const row of returnRows) {
    const item = plain(row);
    if (!item?.shipment_id || !item?.sku_id || String(item.status || "").toLowerCase() === "cancelled") continue;
    const key = `${item.shipment_id}:${item.sku_id}`;
    totals.set(key, (totals.get(key) || 0) + number(item.qty));
  }
  return totals;
}

function withReturnAvailability(shipment, totalsByShipmentSku) {
  const shipmentId = shipment?.shipment_id;
  const items = (shipment?.items || []).map((item) => {
    const deliveredQty = number(item.delivered_qty ?? item.shipped_qty ?? item.qty ?? item.qty_picked ?? item.qty_required);
    const previouslyReturnedQty = totalsByShipmentSku.get(`${shipmentId}:${item.sku_id}`) || 0;
    const availableToReturn = Math.max(0, deliveredQty - previouslyReturnedQty);
    return {
      ...item,
      delivered_qty: deliveredQty,
      previously_returned_qty: previouslyReturnedQty,
      available_to_return: availableToReturn,
      available_return_qty: availableToReturn,
    };
  });
  return { ...shipment, items };
}

function shippingStatusWhere(status) {
  if (!status) return null;
  const value = String(status || "").toLowerCase();
  if (value === "pending") return { [Op.in]: ["planned", "pending"] };
  if (value === "packed") return { [Op.in]: ["packed", "carton_generated"] };
  if (value === "return_eligible") return { [Op.in]: ["closed", "completed", "delivered", "shipped"] };
  if (value === "dispatched") return "dispatched";
  if (value === "closed") return "closed";
  if (value === "cancelled") return "cancelled";
  return value;
}

function buildShipmentListWhere({ tenantId, warehouseId, search, status, dateFrom, dateTo, includeStatus = true }) {
  const where = { tenant_id: tenantId, warehouse_id: warehouseId };
  if (includeStatus) {
    const statusWhere = shippingStatusWhere(status);
    if (statusWhere) where.status = statusWhere;
  }
  if (dateFrom || dateTo) {
    where.created_at = {};
    if (dateFrom) where.created_at[Op.gte] = dateFrom;
    if (dateTo) where.created_at[Op.lte] = dateTo;
  }
  if (search) {
    where[Op.or] = [
      { shipment_id: { [Op.iLike]: `%${search}%` } },
      { so_id: { [Op.iLike]: `%${search}%` } },
      { carrier: { [Op.iLike]: `%${search}%` } },
      { tracking_no: { [Op.iLike]: `%${search}%` } },
      Sequelize.where(Sequelize.col("order.so_id"), { [Op.iLike]: `%${search}%` }),
      Sequelize.where(Sequelize.col("order->customer.customer_name"), { [Op.iLike]: `%${search}%` }),
    ];
  }
  return where;
}

function summarizeShipmentStatuses(rows) {
  const summary = { pending: 0, packed: 0, dispatched: 0, closed: 0, cancelled: 0 };
  for (const row of rows) {
    const status = String(row?.status || "").toLowerCase();
    if (["planned", "pending"].includes(status)) summary.pending += 1;
    else if (["packed", "carton_generated"].includes(status)) summary.packed += 1;
    else if (status === "dispatched") summary.dispatched += 1;
    else if (status === "closed") summary.closed += 1;
    else if (status === "cancelled") summary.cancelled += 1;
  }
  return summary;
}

async function listOrders({ tenantId, warehouseId, page, pageSize, search, status, dateFrom, dateTo }) {
  requiredScope(tenantId, warehouseId);
  const where = { tenant_id: tenantId, warehouse_id: warehouseId };
  if (status) where.status = String(status).toLowerCase();
  if (dateFrom || dateTo) {
    where.created_at = {};
    if (dateFrom) where.created_at[Op.gte] = dateFrom;
    if (dateTo) where.created_at[Op.lte] = dateTo;
  }
  if (search) {
    where[Op.or] = [
      { so_id: { [Op.iLike]: `%${search}%` } },
      { "$customer.customer_name$": { [Op.iLike]: `%${search}%` } },
    ];
  }
  const result = await SalesOrder.findAndCountAll({
    where,
    include: [
      { model: Customer, as: "customer", attributes: ["customer_id", "customer_name"] },
      {
        model: SalesOrderLine,
        as: "lines",
        include: [{ model: Sku, as: "sku", attributes: ["sku_id", "description", "category"] }],
      },
    ],
    order: [["created_at", "DESC"]],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true,
  });
  const soIds = result.rows.map((row) => row.so_id);
  const [tasks, packingTasks, shipments] = await Promise.all([
    soIds.length ? PickTask.findAll({
      where: { tenant_id: tenantId, warehouse_id: warehouseId, so_id: { [Op.in]: soIds } },
      attributes: ["so_id", "so_line_id", "picked_qty", "status"],
      raw: true,
    }) : [],
    soIds.length ? PackingTask.findAll({
      where: { tenant_id: tenantId, warehouse_id: warehouseId, so_id: { [Op.in]: soIds } },
      attributes: ["so_id", "status", "pack_task_id"],
      raw: true,
    }) : [],
    soIds.length ? Shipment.findAll({
      where: { tenant_id: tenantId, warehouse_id: warehouseId, so_id: { [Op.in]: soIds } },
      attributes: ["so_id", "status", "shipment_id"],
      raw: true,
    }) : [],
  ]);
  const tasksBySo = groupBy(tasks, "so_id");
  const packingBySo = new Map(packingTasks.map((row) => [row.so_id, row]));
  const shipmentBySo = new Map(shipments.map((row) => [row.so_id, row]));
  const taskQtyBySoAndLine = new Map();
  for (const task of tasks) {
    const key = `${task.so_id}:${task.so_line_id}`;
    taskQtyBySoAndLine.set(key, number(taskQtyBySoAndLine.get(key)) + number(task.picked_qty));
  }
  return {
    items: result.rows.map((row) => {
      const soId = row.so_id;
      const lineQtyMap = new Map();
      for (const line of row.lines || []) {
        lineQtyMap.set(line.so_line_id, taskQtyBySoAndLine.get(`${soId}:${line.so_line_id}`) || 0);
      }
      return mapOrder(row, {
        tasks: tasksBySo.get(soId) || [],
        packingTask: packingBySo.get(soId) || null,
        shipment: shipmentBySo.get(soId) || null,
        pickedQtyByLine: lineQtyMap,
      });
    }),
    total: result.count,
    page,
    pageSize,
  };
}

async function getOrder(tenantId, warehouseId, orderId, transaction = null, lock = null) {
  requiredScope(tenantId, warehouseId);
  const row = await SalesOrder.findOne({
    where: { tenant_id: tenantId, warehouse_id: warehouseId, so_id: orderId },
    include: [
      { model: Customer, as: "customer", attributes: ["customer_id", "customer_name"] },
      {
        model: SalesOrderLine,
        as: "lines",
        include: [{ model: Sku, as: "sku", attributes: ["sku_id", "description", "category"] }],
      },
    ],
    transaction,
    lock,
  });
  if (!row) return null;
  const [tasks, packingTask, shipment] = await Promise.all([
    PickTask.findAll({
      where: { tenant_id: tenantId, warehouse_id: warehouseId, so_id: orderId },
      attributes: ["so_id", "so_line_id", "picked_qty", "status"],
      transaction,
      raw: true,
    }),
    PackingTask.findOne({
      where: { tenant_id: tenantId, warehouse_id: warehouseId, so_id: orderId },
      attributes: ["so_id", "status", "pack_task_id"],
      transaction,
      raw: true,
    }),
    Shipment.findOne({
      where: { tenant_id: tenantId, warehouse_id: warehouseId, so_id: orderId },
      attributes: ["so_id", "status", "shipment_id"],
      transaction,
      raw: true,
    }),
  ]);
  const pickedQtyByLine = new Map();
  for (const task of tasks) {
    const key = task.so_line_id;
    pickedQtyByLine.set(key, number(pickedQtyByLine.get(key)) + number(task.picked_qty));
  }
  return mapOrder(row, {
    tasks,
    packingTask,
    shipment,
    pickedQtyByLine,
  });
}

function matchesPickListStatus(mappedStatus, filterStatus) {
  if (!filterStatus) return true;
  if (filterStatus === "picked") return ["completed", "done", "picked"].includes(mappedStatus);
  if (filterStatus === "in_progress") return ["in_progress", "picking"].includes(mappedStatus);
  if (filterStatus === "open") return ["open", "released", "pending", "draft"].includes(mappedStatus);
  return mappedStatus === filterStatus;
}

async function listPickLists({ tenantId, warehouseId, page, pageSize, search, status, assignedUser, operatorUserId = null, dateFrom, dateTo }) {
  requiredScope(tenantId, warehouseId);
  const where = { tenant_id: tenantId, warehouse_id: warehouseId };
  if (search) where.wave_id = { [Op.iLike]: `%${search}%` };
  if (dateFrom || dateTo) {
    where.created_at = {};
    if (dateFrom) where.created_at[Op.gte] = dateFrom;
    if (dateTo) where.created_at[Op.lte] = dateTo;
  }
  const waves = await PickWave.findAll({ where, order: [["created_at", "DESC"]] });
  const hydrated = [];
  for (const wave of waves) {
    const taskWhere = {
      tenant_id: tenantId,
      warehouse_id: warehouseId,
      wave_id: wave.wave_id,
    };
    if (operatorUserId) taskWhere.assigned_to_user_id = operatorUserId;
    else if (assignedUser) taskWhere.assigned_to_user_id = assignedUser;
    const tasks = await PickTask.findAll({
      where: taskWhere,
      include: [
        { model: Sku, as: "sku", attributes: ["sku_id", "description", "category"] },
        { model: Location, as: "sourceLocation", attributes: ["location_id", "location_code"] },
        { model: User, as: "assignedUser", attributes: ["user_id", "user_name"] },
      ],
      order: [["pick_task_id", "ASC"]],
    });
    // A wave without tasks is seed/incomplete data, not an operational pick list.
    if (!tasks.length) continue;
    const order = tasks[0] ? await getOrder(tenantId, warehouseId, tasks[0].so_id) : null;
    const mapped = mapPickList(wave, tasks, order);
    if (!matchesPickListStatus(mapped.status, status)) continue;
    hydrated.push(mapped);
  }
  const total = hydrated.length;
  return {
    items: hydrated.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pageSize,
  };
}

async function getPickList(tenantId, warehouseId, waveId, transaction = null, lock = null, operatorUserId = null) {
  requiredScope(tenantId, warehouseId);
  const wave = await PickWave.findOne({
    where: { tenant_id: tenantId, warehouse_id: warehouseId, wave_id: waveId },
    transaction,
    lock,
  });
  if (!wave) return null;
  const taskWhere = { tenant_id: tenantId, warehouse_id: warehouseId, wave_id: waveId };
  if (operatorUserId) taskWhere.assigned_to_user_id = operatorUserId;
  const tasks = await PickTask.findAll({
    where: taskWhere,
    include: [
      { model: Sku, as: "sku", attributes: ["sku_id", "description", "category"] },
      { model: Location, as: "sourceLocation", attributes: ["location_id", "location_code"] },
      { model: User, as: "assignedUser", attributes: ["user_id", "user_name"] },
    ],
    order: [["pick_task_id", "ASC"]],
    transaction,
    lock,
  });
  if (!tasks.length) return null;
  const order = tasks[0] ? await getOrder(tenantId, warehouseId, tasks[0].so_id, transaction) : null;
  return mapPickList(wave, tasks, order);
}

async function listOperators(tenantId, warehouseId) {
  requiredScope(tenantId, warehouseId);
  const rows = await User.findAll({
    where: { tenant_id: tenantId, is_active: true },
    include: [
      {
        model: UserRole,
        required: true,
        where: { tenant_id: tenantId, role_id: { [Op.in]: ["storeoperator", "warehouseoperator", "warehouseclerk", "storekeeper"] } },
        attributes: ["role_id"],
      },
      {
        model: UserWarehouse,
        required: true,
        where: { tenant_id: tenantId, warehouse_id: warehouseId },
        attributes: ["warehouse_id"],
      },
    ],
    order: [["user_name", "ASC"]],
  });
  return rows.map((row) => {
    const user = plain(row);
    return {
      user_id: user.user_id,
      user_name: user.user_name,
      role_id: user.UserRoles?.[0]?.role_id || null,
    };
  });
}

async function listPackingTasks({ tenantId, warehouseId, page, pageSize, search, status, dateFrom, dateTo, assignedUser, operatorUserId = null }) {
  requiredScope(tenantId, warehouseId);
  const where = { tenant_id: tenantId, warehouse_id: warehouseId };
  const normalizedStatus = String(status || "").toLowerCase();
  if (normalizedStatus) {
    if (normalizedStatus === "draft" || normalizedStatus === "pending") where.status = { [Op.in]: ["draft", "pending"] };
    else if (normalizedStatus === "in_progress") where.status = { [Op.in]: ["in_progress", "carton_generated"] };
    else if (normalizedStatus === "carton" || normalizedStatus === "carton_generated") where.status = { [Op.in]: ["in_progress", "carton_generated"] };
    else if (normalizedStatus === "packed" || normalizedStatus === "completed") where.status = { [Op.in]: ["packed", "completed"] };
    else where.status = normalizedStatus;
  }
  if (search) {
    where[Op.or] = [
      { pack_task_id: { [Op.iLike]: `%${search}%` } },
      { wave_id: { [Op.iLike]: `%${search}%` } },
      { carton_id: { [Op.iLike]: `%${search}%` } },
      { so_id: { [Op.iLike]: `%${search}%` } },
      Sequelize.where(Sequelize.col("order.so_id"), { [Op.iLike]: `%${search}%` }),
      Sequelize.where(Sequelize.col("order->customer.customer_name"), { [Op.iLike]: `%${search}%` }),
    ];
  }
  if (dateFrom || dateTo) {
    where.created_at = {};
    if (dateFrom) where.created_at[Op.gte] = dateFrom;
    if (dateTo) where.created_at[Op.lte] = dateTo;
  }
  const shouldFilterByOperator = Boolean(operatorUserId || assignedUser);
  const result = await PackingTask.findAndCountAll({
    where,
    include: [
      {
        model: SalesOrder,
        as: "order",
        attributes: ["so_id", "customer_id"],
        required: false,
        include: [{ model: Customer, as: "customer", attributes: ["customer_id", "customer_name"], required: false }],
      },
      { model: User, as: "packedByUser", attributes: ["user_id", "user_name"], required: false },
    ],
    order: [["created_at", "DESC"]],
    ...(shouldFilterByOperator ? {} : { limit: pageSize, offset: (page - 1) * pageSize }),
  });
  const items = [];
  for (const row of result.rows) {
    const allTasks = await PickTask.findAll({
      where: { tenant_id: tenantId, warehouse_id: warehouseId, wave_id: row.wave_id },
      include: [
        { model: Sku, as: "sku", attributes: ["sku_id", "description"] },
        { model: Location, as: "sourceLocation", attributes: ["location_id", "location_code"] },
        { model: User, as: "assignedUser", attributes: ["user_id", "user_name"], required: false },
      ],
      order: [["pick_task_id", "ASC"]],
    });
    const tasks = operatorUserId || assignedUser
      ? allTasks.filter((task) => String(task.assigned_to_user_id || "") === String(operatorUserId || assignedUser || ""))
      : allTasks;
    const visible = operatorUserId
      ? tasks.length > 0 || String(row.packed_by || "") === String(operatorUserId)
      : assignedUser
        ? tasks.length > 0
        : true;
    if (!visible) continue;
    items.push(mapPacking(row, (tasks.length ? tasks : allTasks).map(plain)));
  }
  if (shouldFilterByOperator) {
    return {
      items: items.slice((page - 1) * pageSize, page * pageSize),
      total: items.length,
      page,
      pageSize,
    };
  }
  return { items, total: result.count, page, pageSize };
}

async function getPackingTask(tenantId, warehouseId, packId, transaction = null, lock = null, operatorUserId = null) {
  requiredScope(tenantId, warehouseId);
  const row = await PackingTask.findOne({
    where: { tenant_id: tenantId, warehouse_id: warehouseId, pack_task_id: packId },
    include: [
      { model: SalesOrder, as: "order", attributes: ["so_id", "customer_id"], include: [{ model: Customer, as: "customer", attributes: ["customer_id", "customer_name"] }] },
      { model: User, as: "packedByUser", attributes: ["user_id", "user_name"], required: false },
    ],
    transaction,
    lock,
  });
  if (!row) return null;
  const allTasks = await PickTask.findAll({
    where: { tenant_id: tenantId, warehouse_id: warehouseId, wave_id: row.wave_id },
    include: [
      { model: Sku, as: "sku", attributes: ["sku_id", "description"] },
      { model: Location, as: "sourceLocation", attributes: ["location_id", "location_code"] },
      { model: User, as: "assignedUser", attributes: ["user_id", "user_name"], required: false },
    ],
    order: [["pick_task_id", "ASC"]],
    transaction,
  });
  const tasks = operatorUserId ? allTasks.filter((task) => String(task.assigned_to_user_id || "") === String(operatorUserId)) : allTasks;
  if (operatorUserId && !tasks.length && String(row.packed_by || "") !== String(operatorUserId)) {
    return null;
  }
  return mapPacking(row, (tasks.length ? tasks : allTasks).map(plain));
}

async function listShipments({ tenantId, warehouseId, page, pageSize, search, status, dateFrom, dateTo, returnEligible = false }) {
  requiredScope(tenantId, warehouseId);
  const where = buildShipmentListWhere({ tenantId, warehouseId, search, status: returnEligible ? "return_eligible" : status, dateFrom, dateTo });
  const include = [
    {
      model: SalesOrder,
      as: "order",
      attributes: ["so_id", "customer_id", "ship_by_date"],
      include: [{ model: Customer, as: "customer", attributes: ["customer_id", "customer_name"] }],
    },
  ];
  const result = await Shipment.findAndCountAll({
    where,
    include,
    order: [["created_at", "DESC"]],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true,
  });
  const shipmentRows = result.rows.map(plain);
  const soIds = [...new Set(shipmentRows.map((shipment) => shipment.so_id).filter(Boolean))];
  const packIds = [...new Set(shipmentRows.map((shipment) => shipment.pack_task_id).filter(Boolean))];
  const dispatcherIds = [...new Set(shipmentRows.map((shipment) => shipment.dispatched_by).filter(Boolean))];

  const [packs, tasks, dispatchers, summaryRows, returnRows] = await Promise.all([
    packIds.length
      ? PackingTask.findAll({
          where: { tenant_id: tenantId, warehouse_id: warehouseId, pack_task_id: { [Op.in]: packIds } },
          raw: true,
        })
      : [],
    soIds.length
      ? PickTask.findAll({
          where: { tenant_id: tenantId, warehouse_id: warehouseId, so_id: { [Op.in]: soIds } },
          include: [
            { model: Sku, as: "sku", attributes: ["sku_id", "description"] },
            { model: Location, as: "sourceLocation", attributes: ["location_id", "location_code"] },
          ],
          order: [["pick_task_id", "ASC"]],
        })
      : [],
    dispatcherIds.length
      ? User.findAll({
          where: { tenant_id: tenantId, user_id: { [Op.in]: dispatcherIds } },
          attributes: ["user_id", "user_name"],
          raw: true,
        })
      : [],
    Shipment.findAll({
      where: buildShipmentListWhere({ tenantId, warehouseId, search, dateFrom, dateTo, includeStatus: false }),
      include,
      attributes: ["status"],
      raw: true,
    }),
    returnEligible
      ? sequelize.query(
          `SELECT shipment_id, sku_id, qty, status
             FROM public.returns
            WHERE tenant_id = :tenantId
              AND warehouse_id = :warehouseId
              AND shipment_id IS NOT NULL
              AND sku_id IS NOT NULL`,
          { replacements: { tenantId, warehouseId }, type: QueryTypes.SELECT }
        ).catch(() => [])
      : [],
  ]);

  const packsById = new Map(packs.map((pack) => [pack.pack_task_id, pack]));
  const tasksByOrder = groupBy(tasks, "so_id");
  const dispatchersById = new Map(dispatchers.map((dispatcher) => [dispatcher.user_id, dispatcher]));
  const returnTotals = returnTotalsByShipmentSku(returnRows);
  const items = shipmentRows
    .map((shipment) => mapShipment(
      shipment,
      shipment.order,
      packsById.get(shipment.pack_task_id) || null,
      tasksByOrder.get(shipment.so_id) || [],
      dispatchersById.get(shipment.dispatched_by) || null
    ))
    .map((shipment) => returnEligible ? withReturnAvailability(shipment, returnTotals) : shipment)
    .map((shipment) => returnEligible
      ? { ...shipment, items: shipment.items.filter((item) => number(item.available_to_return) > 0) }
      : shipment)
    .filter((shipment) => !returnEligible || shipment.items.length > 0);
  return {
    items,
    total: returnEligible ? items.length : result.count,
    page,
    pageSize,
    summary: summarizeShipmentStatuses(summaryRows),
  };
}

async function getShipment(tenantId, warehouseId, shipmentId, transaction = null, lock = null) {
  requiredScope(tenantId, warehouseId);
  const shipment = await Shipment.findOne({
    where: { tenant_id: tenantId, warehouse_id: warehouseId, shipment_id: shipmentId },
    transaction,
    lock,
  });
  if (!shipment) return null;
  const order = await getOrder(tenantId, warehouseId, shipment.so_id, transaction);
  const pack = shipment.pack_task_id
    ? await PackingTask.findOne({ where: { tenant_id: tenantId, warehouse_id: warehouseId, pack_task_id: shipment.pack_task_id }, transaction, raw: true })
    : null;
  const tasks = await PickTask.findAll({
    where: { tenant_id: tenantId, warehouse_id: warehouseId, so_id: shipment.so_id },
    include: [
      { model: Sku, as: "sku", attributes: ["sku_id", "description"] },
      { model: Location, as: "sourceLocation", attributes: ["location_id", "location_code"] },
    ],
    transaction,
  });
  const dispatcher = shipment.dispatched_by
    ? await User.findOne({ where: { tenant_id: tenantId, user_id: shipment.dispatched_by }, attributes: ["user_id", "user_name"], transaction, raw: true })
    : null;
  return mapShipment(plain(shipment), order, pack, tasks, dispatcher);
}

export {
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
  getOrder,
  getPackingTask,
  getPickList,
  getShipment,
  listOperators,
  listOrders,
  listPackingTasks,
  listPickLists,
  listShipments,
  mapOrder,
  nextId,
  number,
  packingActiveStatusSql,
  pickListStatusScopeCte,
  requiredScope,
  sequelize,
  shippingReadyToDispatchStatusSql,
};
